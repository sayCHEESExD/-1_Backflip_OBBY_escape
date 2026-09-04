/**
 * Trails: the MOVEMENT SPEED cosmetic ladder, bought with trophy Wins.
 *
 * A trail multiplies how fast the player actually moves. It feeds the ONE
 * movement formula (`resolveMovementProfile`) through its `extraMultiplier`
 * parameter - never a second calculation of its own.
 *
 * Deliberately NOT a progression-per-step modifier: boots and treadmills own
 * that axis, and auras own trophy rewards. Keeping the three separate is what
 * stops a cosmetic quietly multiplying the wrong system.
 *
 * Ownership and the equipped slot are server state. The client asks to buy and
 * to equip, and renders whatever comes back.
 */

/** How the client draws a trail. Presentation only; never gameplay. */
export type TrailStyle = 'solid' | 'rainbow' | 'void' | 'lunar' | 'cosmic';

export interface TrailTier {
  /** 1-based slot, matching the shop rows top to bottom. */
  readonly slot: number;
  readonly name: string;
  /** Trophy Wins deducted on purchase. */
  readonly cost: number;
  /** Multiplier applied to actual movement speed while equipped. */
  readonly multiplier: number;
  /** Base colour, as a hex integer. */
  readonly color: number;
  readonly style: TrailStyle;
}

export const TRAIL_TIERS: readonly TrailTier[] = [
  { slot: 1, name: 'Orange Trail', cost: 150, multiplier: 1.5, color: 0xff8a1f, style: 'solid' },
  { slot: 2, name: 'Blue Trail', cost: 250, multiplier: 1.75, color: 0x3aa8ff, style: 'solid' },
  { slot: 3, name: 'Green Trail', cost: 350, multiplier: 2, color: 0x3ce06a, style: 'solid' },
  { slot: 4, name: 'Purple Trail', cost: 850, multiplier: 3, color: 0xa855f7, style: 'solid' },
  { slot: 5, name: 'Rainbow Trail', cost: 3500, multiplier: 4, color: 0xff3b6b, style: 'rainbow' },
  { slot: 6, name: 'White Trail', cost: 10000, multiplier: 5, color: 0xffffff, style: 'solid' },
  { slot: 7, name: 'Black Trail', cost: 25000, multiplier: 6, color: 0x14161c, style: 'void' },
  { slot: 8, name: 'Moon Trail', cost: 75000, multiplier: 7, color: 0xc9d8ff, style: 'lunar' },
  { slot: 9, name: 'Nova Trail', cost: 150000, multiplier: 8, color: 0x7b5bff, style: 'cosmic' },
  { slot: 10, name: 'Golden Trail', cost: 300000, multiplier: 10, color: 0xffc733, style: 'solid' },
];

/** Nothing equipped. */
export const NO_TRAIL = 0;

/** Look up a tier by its slot. */
export const trailBySlot = (slot: number): TrailTier | undefined =>
  TRAIL_TIERS.find((tier) => tier.slot === slot);

/** One bit per slot, so the whole inventory is a single replicated integer. */
export const trailMask = (slot: number): number => 1 << (slot - 1);

/** True when the player has bought this tier. */
export const isTrailOwned = (owned: number, slot: number): boolean =>
  (owned & trailMask(slot)) !== 0;

/**
 * Movement multiplier from the equipped trail.
 *
 * Returns 1 for "none equipped" and for any slot that is not owned, so an
 * unowned or forged slot can only ever mean "no bonus" - never a bonus.
 */
export const trailMultiplier = (slot: number, owned: number): number => {
  const tier = trailBySlot(slot);
  if (!tier) return 1;
  return isTrailOwned(owned, tier.slot) ? tier.multiplier : 1;
};
