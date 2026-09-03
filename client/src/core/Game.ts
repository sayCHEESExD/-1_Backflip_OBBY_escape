import type { MoveMessage } from '@obby/shared';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { clientConfig } from '../config/clientConfig.js';
import { InputManager } from '../input/InputManager.js';
import { NetworkClient } from '../net/NetworkClient.js';
import type { ConnectionStatus, NetPlayerState } from '../net/netTypes.js';
import { LocalPlayer } from '../player/LocalPlayer.js';
import { playerModelLoader, type PlayerModelReport } from '../player/PlayerModelLoader.js';
import { RemotePlayerManager } from '../player/RemotePlayerManager.js';
import { ProgressionStore } from '../progression/ProgressionStore.js';
import { RendererManager } from '../rendering/RendererManager.js';
import { SceneManager } from '../rendering/SceneManager.js';
import { DebugOverlay } from '../ui/DebugOverlay.js';
import { logger } from '../util/logger.js';
import { TestFloor } from '../world/TestFloor.js';

const SCOPE = 'Game';

/** Seconds between debug overlay repaints. */
const OVERLAY_INTERVAL = 0.25;

/**
 * Composition root. Owns every subsystem and defines the per-frame update
 * order. Deliberately holds no gameplay rules of its own.
 */
export class Game {
  private readonly renderer: RendererManager;
  private readonly sceneManager = new SceneManager();
  private readonly camera = new ThirdPersonCamera();
  private readonly input = new InputManager();
  private readonly remotePlayers: RemotePlayerManager;
  private readonly progression = new ProgressionStore();
  private readonly overlay: DebugOverlay | null;
  private readonly network: NetworkClient;

  private localPlayer: LocalPlayer | null = null;
  private localSessionId: string | null = null;
  private modelReport: PlayerModelReport | null = null;

  private overlayTimer = 0;
  private frameCount = 0;
  private fpsTimer = 0;
  private fps = 0;

  constructor(container: HTMLElement) {
    this.renderer = new RendererManager(container);
    this.remotePlayers = new RemotePlayerManager(this.sceneManager.scene);
    this.overlay = clientConfig.debug ? new DebugOverlay(container) : null;

    this.renderer.onResize((width, height) => this.camera.setViewport(width, height));

    this.network = new NetworkClient({
      onStatusChange: (status) => this.onStatusChange(status),
      onSelfJoined: (sessionId) => this.onSelfJoined(sessionId),
      onPlayerAdded: (sessionId, player) => this.onPlayerAdded(sessionId, player),
      onPlayerChanged: (sessionId, player) => this.onPlayerChanged(sessionId, player),
      onPlayerRemoved: (sessionId) => this.remotePlayers.remove(sessionId),
      onRespawn: (message) =>
        this.localPlayer?.teleport(message.x, message.y, message.z, message.rotationY),
    });
  }

  /** Load assets and build the world. Networking is started separately. */
  async initialise(): Promise<PlayerModelReport> {
    new TestFloor().addTo(this.sceneManager.scene);

    this.modelReport = await playerModelLoader.load();
    this.overlay?.setModelReport(this.modelReport);

    this.localPlayer = new LocalPlayer();
    this.sceneManager.scene.add(this.localPlayer.character.root);

    logger.info(SCOPE, 'world ready');
    return this.modelReport;
  }

  /** Join the Colyseus room. Rendering continues even if this fails. */
  async connect(): Promise<void> {
    await this.network.connect();
  }

  /** One simulation + render step. Called by GameLoop. */
  update(delta: number, now: number): void {
    const input = this.input.sample();
    const player = this.localPlayer;

    if (player) {
      const cameraYaw = Math.atan2(
        this.camera.camera.position.x - player.position.x,
        this.camera.camera.position.z - player.position.z,
      );
      // Camera-relative movement: forward is away from the camera.
      player.update(delta, input, cameraYaw + Math.PI);

      this.camera.setTarget(player.position, player.rotationY);
      this.sendTransform(now, player);
    }

    this.camera.update(delta);
    this.remotePlayers.update(delta);

    this.renderer.renderer.render(this.sceneManager.scene, this.camera.camera);

    this.updateDiagnostics(delta);
  }

  start(): void {
    this.input.attach();
  }

  dispose(): void {
    this.input.detach();
    this.remotePlayers.dispose();
    void this.network.disconnect();
    this.renderer.dispose();
  }

  private sendTransform(now: number, player: LocalPlayer): void {
    const motion = player.motionState;
    const message: MoveMessage = {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      rotationY: player.rotationY,
      speed: motion.speed,
      verticalVelocity: motion.verticalVelocity,
      grounded: motion.grounded,
      flipCount: motion.flipCount,
      animation: player.animationState,
    };
    this.network.sendTransform(now, message);
  }

  private onStatusChange(status: ConnectionStatus): void {
    this.overlay?.setStatus(status);
  }

  private onSelfJoined(sessionId: string): void {
    this.localSessionId = sessionId;
    this.remotePlayers.setLocalSessionId(sessionId);
    this.overlay?.setSessionId(sessionId);
  }

  private onPlayerAdded(sessionId: string, player: NetPlayerState): void {
    if (sessionId === this.localSessionId) {
      this.progression.applyFromNetwork(player);
      this.localPlayer?.setBackflipCapacity(player.backflipCapacity);
      return;
    }
    this.remotePlayers.add(sessionId, player);
    this.overlay?.setRemoteCount(this.remotePlayers.count);
  }

  private onPlayerChanged(sessionId: string, player: NetPlayerState): void {
    if (sessionId === this.localSessionId) {
      this.progression.applyFromNetwork(player);
      this.localPlayer?.setBackflipCapacity(player.backflipCapacity);
      return;
    }
    this.remotePlayers.apply(sessionId, player);
    this.overlay?.setRemoteCount(this.remotePlayers.count);
  }

  private updateDiagnostics(delta: number): void {
    if (!this.overlay) return;

    this.frameCount += 1;
    this.fpsTimer += delta;
    if (this.fpsTimer >= 0.5) {
      this.fps = this.frameCount / this.fpsTimer;
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    this.overlayTimer += delta;
    if (this.overlayTimer < OVERLAY_INTERVAL) return;
    this.overlayTimer = 0;

    const player = this.localPlayer;
    if (player) {
      this.overlay.setPlayer(
        player.position.x,
        player.position.y,
        player.position.z,
        player.horizontalSpeed,
      );
      this.overlay.setAnimation(
        player.animationState,
        player.flipsRemaining,
        player.flipsInProgress,
        player.isGrounded,
      );
    }
    this.overlay.setFps(this.fps);
    this.overlay.setRemoteCount(this.remotePlayers.count);
    this.overlay.render();
  }
}
