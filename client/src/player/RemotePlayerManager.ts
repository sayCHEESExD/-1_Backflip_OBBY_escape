import type { Scene } from 'three';
import type { NetPlayerState } from '../net/netTypes.js';
import { logger } from '../util/logger.js';
import { RemotePlayer } from './RemotePlayer.js';

const SCOPE = 'RemotePlayerManager';

/**
 * Creates, updates and destroys the ghosted characters for every player in the
 * room except the local one.
 */
export class RemotePlayerManager {
  private readonly scene: Scene;
  private readonly players = new Map<string, RemotePlayer>();

  private localSessionId: string | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  setLocalSessionId(sessionId: string): void {
    this.localSessionId = sessionId;
    // The local player may have been added before we learned our own id.
    this.remove(sessionId);
  }

  get count(): number {
    return this.players.size;
  }

  add(sessionId: string, state: NetPlayerState): void {
    if (sessionId === this.localSessionId) return;
    if (this.players.has(sessionId)) return;

    const player = new RemotePlayer(sessionId);
    player.setNetworkTransform(state.x, state.y, state.z, state.rotationY);
    player.setMotionState(state);
    this.scene.add(player.character.root);
    this.players.set(sessionId, player);

    logger.info(SCOPE, `remote player added: ${sessionId} (total ${this.players.size})`);
  }

  apply(sessionId: string, state: NetPlayerState): void {
    if (sessionId === this.localSessionId) return;

    const player = this.players.get(sessionId);
    if (!player) {
      this.add(sessionId, state);
      return;
    }

    player.setNetworkTransform(state.x, state.y, state.z, state.rotationY);
    player.setMotionState(state);
  }

  remove(sessionId: string): void {
    const player = this.players.get(sessionId);
    if (!player) return;
    player.dispose();
    this.players.delete(sessionId);
    logger.info(SCOPE, `remote player removed: ${sessionId} (total ${this.players.size})`);
  }

  update(delta: number): void {
    for (const player of this.players.values()) player.update(delta);
  }

  dispose(): void {
    for (const player of this.players.values()) player.dispose();
    this.players.clear();
  }
}
