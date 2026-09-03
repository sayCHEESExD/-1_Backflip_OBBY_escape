import { SPAWN_POSITION, SPAWN_ROTATION_Y, type RespawnReason } from '@obby/shared';
import type { LocalPlayer } from '../player/LocalPlayer.js';
import { logger } from '../util/logger.js';
import type { GorgeCollision } from '../world/GorgeCollision.js';

const SCOPE = 'RunController';

/**
 * Seconds after a respawn during which triggers are ignored.
 *
 * Without this, a single event fires on several consecutive frames (the player
 * stays inside the zone, or stays below the death plane, until the teleport
 * settles) and would respawn or claim repeatedly.
 */
const RESPAWN_GRACE = 0.4;

/** What the controller needs from the network layer. */
export interface RunNetwork {
  claimTrophy(platformIndex: number): void;
  reportHazard(): void;
}

/**
 * Drives one run: watches the world triggers under the local player and turns
 * them into server requests plus an immediate local respawn.
 *
 * Authority split: the client detects and PREDICTS the respawn so it feels
 * instant, but never awards anything. Wins come back from the server, which
 * validates the claim and re-issues its own authoritative respawn.
 */
export class RunController {
  private readonly collision: GorgeCollision;
  private readonly network: RunNetwork;

  /** Platforms already claimed this run - prevents re-sending on later frames. */
  private readonly claimed = new Set<number>();

  private graceTimer = 0;

  constructor(collision: GorgeCollision, network: RunNetwork) {
    this.collision = collision;
    this.network = network;
  }

  /** Evaluate triggers for this frame. Call after the player has moved. */
  update(delta: number, player: LocalPlayer): void {
    if (this.graceTimer > 0) {
      this.graceTimer -= delta;
      return;
    }

    const triggers = this.collision.sampleTriggers(
      player.position.x,
      player.position.y,
      player.position.z,
    );

    // Order matters: a hazard or a fall ends the run before any reward.
    if (triggers.fell) {
      this.respawn(player, 'fell');
      return;
    }

    if (triggers.redline) {
      this.network.reportHazard();
      this.respawn(player, 'redline');
      return;
    }

    if (triggers.trophyIndex !== null && !this.claimed.has(triggers.trophyIndex)) {
      // Claim once per run; the server decides whether it is actually awarded.
      this.claimed.add(triggers.trophyIndex);
      this.network.claimTrophy(triggers.trophyIndex);
      this.respawn(player, 'trophy');
    }
  }

  /**
   * Apply a respawn. Used both for local prediction and for the server's
   * authoritative Respawn message, so a duplicate is harmless.
   */
  respawn(player: LocalPlayer, reason: RespawnReason): void {
    player.teleport(
      SPAWN_POSITION.x,
      SPAWN_POSITION.y,
      SPAWN_POSITION.z,
      SPAWN_ROTATION_Y,
    );
    this.claimed.clear();
    this.graceTimer = RESPAWN_GRACE;
    logger.info(SCOPE, `respawn: ${reason}`);
  }
}
