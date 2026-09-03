import { Client, Room } from '@colyseus/core';
import {
  DEATH_PLANE_Y,
  MessageType,
  PlayerAnimationState,
  SPAWN_POSITION,
  SPAWN_ROTATION_Y,
  type MoveMessage,
  type RespawnMessage,
} from '@obby/shared';
import { serverConfig } from '../config/serverConfig.js';
import { BackflipService } from '../progression/BackflipService.js';
import { ProgressionService } from '../progression/ProgressionService.js';
import { logger } from '../util/logger.js';
import { GorgeState } from './state/GorgeState.js';
import { PlayerState } from './state/PlayerState.js';

const SCOPE = 'GorgeRoom';

/** Maximum concurrent players in one gorge instance. */
const MAX_CLIENTS = 24;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isAnimationState = (value: unknown): value is PlayerAnimationState =>
  typeof value === 'string' &&
  (Object.values(PlayerAnimationState) as string[]).includes(value);

export class GorgeRoom extends Room<GorgeState> {
  override maxClients = MAX_CLIENTS;

  private readonly progression = new ProgressionService();
  private readonly backflips = new BackflipService();

  override onCreate(): void {
    this.state = new GorgeState();
    this.setPatchRate(serverConfig.patchRateMs);

    this.onMessage(MessageType.Move, (client, message: MoveMessage) => {
      this.handleMove(client, message);
    });

    this.setSimulationInterval((deltaMs) => this.update(deltaMs), serverConfig.patchRateMs);

    logger.info(SCOPE, `created roomId=${this.roomId} patchRate=${serverConfig.patchRateMs}ms`);
  }

  override onJoin(client: Client): void {
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    this.progression.initialise(player);
    this.backflips.initialise(player);
    this.state.players.set(client.sessionId, player);

    logger.info(
      SCOPE,
      `join sessionId=${client.sessionId} players=${this.state.players.size}`,
    );
  }

  override onLeave(client: Client, consented: boolean): void {
    this.state.players.delete(client.sessionId);
    this.backflips.forget(client.sessionId);
    logger.info(
      SCOPE,
      `leave sessionId=${client.sessionId} consented=${consented} players=${this.state.players.size}`,
    );
  }

  override onDispose(): void {
    logger.info(SCOPE, `disposed roomId=${this.roomId}`);
  }

  /**
   * Milestone 1 accepts the client-reported transform and motion state after
   * shape validation. Movement is not yet server-simulated; that lands with
   * the gorge collision pass.
   *
   * The backflip COUNT is validated here rather than trusted, because how many
   * flips a player may perform is gameplay, and gameplay is server-owned.
   */
  private handleMove(client: Client, message: MoveMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (
      !isFiniteNumber(message?.x) ||
      !isFiniteNumber(message?.y) ||
      !isFiniteNumber(message?.z) ||
      !isFiniteNumber(message?.rotationY)
    ) {
      return;
    }

    player.x = message.x;
    player.y = message.y;
    player.z = message.z;
    player.rotationY = message.rotationY;

    player.speed = isFiniteNumber(message.speed) ? Math.max(0, message.speed) : 0;
    player.verticalVelocity = isFiniteNumber(message.verticalVelocity)
      ? message.verticalVelocity
      : 0;

    const grounded = message.grounded === true;
    player.grounded = grounded;

    player.flipCount = this.backflips.resolveFlipCount(
      client.sessionId,
      player,
      grounded,
      message.flipCount,
    );

    player.animation = isAnimationState(message.animation)
      ? message.animation
      : PlayerAnimationState.Idle;
    player.ready = true;
  }

  private update(deltaMs: number): void {
    this.state.elapsed += deltaMs / 1000;

    // The blue gorge floor is a death zone: falling respawns at spawn.
    // The server owns this decision even while movement is client-reported.
    this.state.players.forEach((player, sessionId) => {
      if (player.y > DEATH_PLANE_Y) return;
      this.respawn(sessionId, player, 'fell');
    });
  }

  private respawn(
    sessionId: string,
    player: PlayerState,
    reason: RespawnMessage['reason'],
  ): void {
    player.x = SPAWN_POSITION.x;
    player.y = SPAWN_POSITION.y;
    player.z = SPAWN_POSITION.z;
    player.rotationY = SPAWN_ROTATION_Y;
    player.speed = 0;
    player.verticalVelocity = 0;
    player.grounded = true;
    player.animation = PlayerAnimationState.Idle;
    this.backflips.reset(sessionId, player);

    const payload: RespawnMessage = {
      x: SPAWN_POSITION.x,
      y: SPAWN_POSITION.y,
      z: SPAWN_POSITION.z,
      rotationY: SPAWN_ROTATION_Y,
      reason,
    };

    const client = this.clients.find((c) => c.sessionId === sessionId);
    client?.send(MessageType.Respawn, payload);
    logger.info(SCOPE, `respawn sessionId=${sessionId} reason=${reason}`);
  }
}
