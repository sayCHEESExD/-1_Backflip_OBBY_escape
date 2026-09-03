/**
 * Backflip GAMEPLAY rules. Visual timing lives in the client's animation
 * config; this file holds only what the server must agree on.
 *
 * Two different things are tracked, and they must not be conflated:
 *   - "available backflips": how many flips a player MAY perform before
 *     touching the ground again. Server-authoritative.
 *   - "flips being performed": how many are actually in flight right now.
 *     Purely a consequence of player input.
 * Having availability never causes a flip to happen on its own.
 */
export interface BackflipConfig {
  /**
   * Flips a player may perform per airborne window before progression is
   * wired up. Level progression will grant this instead - see CLAUDE.md.
   */
  readonly defaultCapacity: number;
  /** Hard ceiling the server will accept, regardless of progression. */
  readonly maxCapacity: number;
}

export const BACKFLIP: BackflipConfig = {
  defaultCapacity: 3,
  maxCapacity: 50,
};
