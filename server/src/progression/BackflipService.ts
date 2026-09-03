import { BACKFLIP } from '@obby/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';

/** Per-player bookkeeping for the current airborne window. */
interface FlipWindow {
  /** Flips accepted since the player last touched the ground. */
  usedThisAirtime: number;
  /** Last flip count accepted from this client. */
  acceptedCount: number;
}

/**
 * Server authority over backflips.
 *
 * The client predicts flips locally so the animation is responsive, but how
 * many flips a player MAY perform is gameplay, and gameplay is server-owned.
 * A client reporting more flips than its capacity allows has the excess
 * dropped rather than replicated to everyone else.
 *
 * Capacity is a flat default today. Level progression will grant it - see
 * CLAUDE.md - and only this file changes when it does.
 */
export class BackflipService {
  private readonly windows = new Map<string, FlipWindow>();

  initialise(player: PlayerState): void {
    player.backflipCapacity = BACKFLIP.defaultCapacity;
    player.flipCount = 0;
    this.windows.set(player.sessionId, { usedThisAirtime: 0, acceptedCount: 0 });
  }

  forget(sessionId: string): void {
    this.windows.delete(sessionId);
  }

  reset(sessionId: string, player: PlayerState): void {
    player.flipCount = 0;
    this.windows.set(sessionId, { usedThisAirtime: 0, acceptedCount: 0 });
  }

  /**
   * Validate a client-reported flip counter.
   *
   * @returns the flip count that may be replicated to other clients.
   */
  resolveFlipCount(
    sessionId: string,
    player: PlayerState,
    grounded: boolean,
    reported: unknown,
  ): number {
    const window = this.windows.get(sessionId) ?? {
      usedThisAirtime: 0,
      acceptedCount: 0,
    };
    this.windows.set(sessionId, window);

    // Touching the ground refills the allowance.
    if (grounded) window.usedThisAirtime = 0;

    if (typeof reported !== 'number' || !Number.isFinite(reported)) {
      return window.acceptedCount;
    }

    const requested = Math.floor(reported);

    // A counter that goes backwards means a client reload or respawn.
    if (requested < window.acceptedCount) {
      window.acceptedCount = requested;
      window.usedThisAirtime = 0;
      return requested;
    }

    const newFlips = requested - window.acceptedCount;
    if (newFlips === 0) return window.acceptedCount;

    const capacity = Math.min(player.backflipCapacity, BACKFLIP.maxCapacity);
    const allowed = Math.max(0, Math.min(newFlips, capacity - window.usedThisAirtime));

    window.usedThisAirtime += allowed;
    window.acceptedCount += allowed;
    return window.acceptedCount;
  }
}
