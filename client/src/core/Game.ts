
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { clientConfig } from '../config/clientConfig.js';
import { InputManager } from '../input/InputManager.js';
import { NetworkClient } from '../net/NetworkClient.js';
import type { ConnectionStatus, NetPlayerState } from '../net/netTypes.js';
import { LocalPlayer } from '../player/LocalPlayer.js';
import { playerModelLoader, type PlayerModelReport } from '../player/PlayerModelLoader.js';
import { RemotePlayerManager } from '../player/RemotePlayerManager.js';
import { ProgressionStore } from '../progression/ProgressionStore.js';
import { RunController } from '../progression/RunController.js';
import { ShopController } from '../progression/ShopController.js';
import { RendererManager } from '../rendering/RendererManager.js';
import { SceneManager } from '../rendering/SceneManager.js';
import { DebugOverlay } from '../ui/DebugOverlay.js';
import { ProgressHud } from '../ui/ProgressHud.js';
import { AURA_TIERS, TRAIL_TIERS } from '@obby/shared';
import { CosmeticShop } from '../ui/CosmeticShop.js';
import { modalLayer } from '../ui/ModalLayer.js';
import { RebirthPanel } from '../ui/RebirthPanel.js';
import { SpeedPopups } from '../ui/SpeedPopups.js';
import { TreadmillHud } from '../ui/TreadmillHud.js';
import { WinsCounter } from '../ui/WinsCounter.js';
import { logger } from '../util/logger.js';
import { GorgeWorld } from '../world/GorgeWorld.js';

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
  private readonly hud: ProgressHud;
  private readonly winsCounter: WinsCounter;
  private readonly rebirthPanel: RebirthPanel;
  private readonly speedPopups: SpeedPopups;
  private readonly treadmillHud: TreadmillHud;
  private readonly trailShop: CosmeticShop;
  private readonly auraShop: CosmeticShop;
  private readonly network: NetworkClient;
  private readonly world = new GorgeWorld();
  private readonly run: RunController;
  private readonly shop: ShopController;

  private localPlayer: LocalPlayer | null = null;
  private localSessionId: string | null = null;
  private modelReport: PlayerModelReport | null = null;

  /** Last replicated Speed total, used to derive gain popups. */
  private lastTotalSpeed = -1;

  private overlayTimer = 0;
  private frameCount = 0;
  private fpsTimer = 0;
  private fps = 0;

  constructor(container: HTMLElement) {
    this.renderer = new RendererManager(container);
    this.remotePlayers = new RemotePlayerManager(this.sceneManager.scene);
    this.overlay = clientConfig.debug ? new DebugOverlay(container) : null;
    this.hud = new ProgressHud(container);
    this.winsCounter = new WinsCounter(container);
    this.rebirthPanel = new RebirthPanel(container, () => this.network.requestRebirth());
    this.speedPopups = new SpeedPopups(container);
    this.treadmillHud = new TreadmillHud(container);

    // Two shops, one panel: trails multiply movement speed, auras multiply
    // trophy rewards. Both only ever ASK - the server owns both ledgers.
    this.trailShop = new CosmeticShop(
      container,
      {
        title: 'Trails',
        icon: '💫',
        effect: 'Speed',
        buttonTop: 146,
        accent: '#d05bd8',
        rows: TRAIL_TIERS.map((tier) => ({
          slot: tier.slot,
          name: tier.name,
          cost: tier.cost,
          multiplier: tier.multiplier,
          swatch: hex(tier.color),
          ...(tier.style === 'rainbow' ? { swatchAccent: '#3ad2ff' } : {}),
        })),
      },
      {
        buy: (slot) => this.network.buyTrail(slot),
        equip: (slot) => this.network.equipTrail(slot),
      },
    );

    this.auraShop = new CosmeticShop(
      container,
      {
        title: 'Aura',
        icon: '🌀',
        effect: 'Wins',
        buttonTop: 222,
        accent: '#3aa8ff',
        rows: AURA_TIERS.map((tier) => ({
          slot: tier.slot,
          name: tier.name,
          cost: tier.cost,
          multiplier: tier.multiplier,
          swatch: hex(tier.color),
          swatchAccent: hex(tier.accent),
        })),
      },
      {
        buy: (slot) => this.network.buyAura(slot),
        equip: (slot) => this.network.equipAura(slot),
      },
    );

    this.renderer.onResize((width, height) => this.camera.setViewport(width, height));

    this.network = new NetworkClient({
      onStatusChange: (status) => this.onStatusChange(status),
      onSelfJoined: (sessionId) => this.onSelfJoined(sessionId),
      onPlayerAdded: (sessionId, player) => this.onPlayerAdded(sessionId, player),
      onPlayerChanged: (sessionId, player) => this.onPlayerChanged(sessionId, player),
      onPlayerRemoved: (sessionId) => this.remotePlayers.remove(sessionId),
      onRespawn: (message) => {
        // The server's authoritative respawn. The client usually predicted it
        // already, so applying it again is intentionally idempotent.
        if (this.localPlayer) this.run.respawn(this.localPlayer, message.reason);
      },
    });

    this.run = new RunController(this.world.collision, {
      claimTrophy: (index) => {
        // Flush the transform first so the server can see the player standing
        // in the zone when it validates the claim.
        this.flushTransform();
        this.network.claimTrophy(index);
      },
      reportHazard: () => this.network.reportHazard(),
    });

    this.shop = new ShopController(this.world.collision, {
      buyBoot: (slot) => {
        // Flush the transform first: the server validates the purchase against
        // the last position it received, so at 20Hz the request would
        // otherwise overtake the position that justifies it.
        this.flushTransform();
        this.network.buyBoot(slot);
      },
    });
  }

  /** Load assets and build the world. Networking is started separately. */
  async initialise(): Promise<PlayerModelReport> {
    this.world.addTo(this.sceneManager.scene);

    this.modelReport = await playerModelLoader.load();
    this.overlay?.setModelReport(this.modelReport);

    this.localPlayer = new LocalPlayer(this.world.collision);
    this.sceneManager.scene.add(this.localPlayer.character.root);
    this.sceneManager.scene.add(this.localPlayer.character.worldRoot);

    logger.info(SCOPE, 'world ready');
    return this.modelReport;
  }

  /** Join the Colyseus room. Rendering continues even if this fails. */
  async connect(): Promise<void> {
    await this.network.connect();
  }

  /** One simulation + render step. Called by GameLoop. */
  update(delta: number, now: number): void {
    // A shop or the rebirth panel owns the input while it is up; closing it
    // hands control straight back on the next frame.
    this.input.setSuppressed(modalLayer.anyOpen);
    const input = this.input.sample();
    const player = this.localPlayer;

    // The MOUSE aims the camera, and the camera defines forward. Nothing the
    // player presses rotates the view.
    this.camera.setOrbit(this.input.look.yaw, this.input.look.pitch);

    if (player) {
      // Camera-relative movement: W is whichever way the camera is facing.
      // The character's own facing then follows where it actually moves,
      // which the shared simulation does for both sides.
      player.update(delta, input, this.input.look.yaw);

      // Triggers are sampled after the player has moved, so a trophy pad or a
      // redline is detected at the position actually reached this frame.
      this.run.update(delta, player);
      this.shop.update(delta, player);

      this.camera.setTarget(player.position);
      this.sendTransform(now, player);
    }

    if (player) {
      this.hud.setJumps(!player.isGrounded, player.flipsRemaining, player.flipCapacity);
    }

    this.world.bootShop.update(delta);
    this.world.treadmills.update(delta);
    this.speedPopups.update(delta);
    this.camera.update(delta);
    this.remotePlayers.update(delta);

    this.renderer.renderer.render(this.sceneManager.scene, this.camera.camera);

    this.updateDiagnostics(delta);
  }

  start(): void {
    this.input.attach(this.renderer.renderer.domElement);
  }

  dispose(): void {
    this.input.detach();
    this.remotePlayers.dispose();
    this.hud.dispose();
    this.winsCounter.dispose();
    this.rebirthPanel.dispose();
    this.speedPopups.dispose();
    this.treadmillHud.dispose();
    this.trailShop.dispose();
    this.auraShop.dispose();
    this.world.dispose();
    void this.network.disconnect();
    this.renderer.dispose();
  }

  /**
   * Push any buffered input immediately.
   *
   * Used before a request the server validates against position - a trophy
   * claim or a boot purchase - so the movement that justifies it is simulated
   * first. The server's own position is the one checked either way.
   */
  private flushTransform(): void {
    const player = this.localPlayer;
    if (!player) return;
    for (const message of player.drainOutgoing()) {
      this.network.sendInputNow(performance.now(), message);
    }
  }

  /**
   * Send this frame's INPUT. Never a transform - the server simulates movement
   * and owns the result.
   */
  private sendTransform(now: number, player: LocalPlayer): void {
    // Every simulated step must reach the server - it advances only by the
    // inputs it receives, so dropping one loses authoritative movement.
    for (const message of player.drainOutgoing()) {
      this.network.sendInput(now, message);
    }
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
      this.applyLocalProgression(player);
      return;
    }
    this.remotePlayers.add(sessionId, player);
    this.overlay?.setRemoteCount(this.remotePlayers.count);
  }

  private onPlayerChanged(sessionId: string, player: NetPlayerState): void {
    if (sessionId === this.localSessionId) {
      this.applyLocalProgression(player);
      // The server has simulated further; snap prediction to it and replay
      // whatever it has not acknowledged yet.
      this.localPlayer?.reconcile(player);
      return;
    }
    this.remotePlayers.apply(sessionId, player);
    this.overlay?.setRemoteCount(this.remotePlayers.count);
  }

  /**
   * Mirror the local player's server-authoritative progression: flip capacity
   * follows level, and the HUD shows the replicated Speed total. Nothing here
   * computes progress - the popups only visualise a gain the server granted.
   */
  private applyLocalProgression(player: NetPlayerState): void {
    if (this.lastTotalSpeed >= 0 && player.totalSpeed > this.lastTotalSpeed) {
      this.speedPopups.add(player.totalSpeed - this.lastTotalSpeed);
    }
    this.lastTotalSpeed = player.totalSpeed;

    this.progression.applyFromNetwork(player);
    this.winsCounter.update(player.wins);
    // Movement speed is the server's number, applied verbatim.
    this.localPlayer?.setMoveMultiplier(player.moveMultiplier);
    this.localPlayer?.setBackflipCapacity(player.backflipCapacity);
    this.localPlayer?.setMaxTreadmillTier(player.maxTreadmillTier);
    this.rebirthPanel.update({
      level: player.level,
      maxLevel: player.maxLevel,
      rebirths: player.rebirths,
    });
    this.world.bootShop.setState(player.wins, player.ownedBoots, player.bootSlot);
    // Treadmill state is entirely the server's; the HUD and the row only
    // mirror what it replicated.
    this.world.treadmills.setRebirths(player.rebirths);
    this.treadmillHud.update({
      standing: player.treadmillStanding,
      active: player.treadmillTier,
      maxTier: player.maxTreadmillTier,
      multiplier: player.treadmillMultiplier,
      speedPerStep: player.speedPerStep,
      rebirths: player.rebirths,
    });
    this.shop.setState(player.wins, player.ownedBoots);
    this.localPlayer?.setBootSlot(player.bootSlot);
    this.localPlayer?.setCosmetics(player.trailSlot, player.auraSlot);
    this.trailShop.setState(player.wins, player.ownedTrails, player.trailSlot);
    this.auraShop.setState(player.wins, player.ownedAuras, player.auraSlot);
    this.hud.update(
      player.totalSpeed,
      player.maxLevel,
      player.rebirths,
    );
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
      this.overlay.setWins(this.progression.value.wins);
    }
    this.overlay.setFps(this.fps);
    this.overlay.setRemoteCount(this.remotePlayers.count);
    this.overlay.render();
  }
}

/** Hex integer -> CSS colour, for the shop swatches. */
const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
