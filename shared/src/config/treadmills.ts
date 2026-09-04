import { SPAWN_PLATFORM } from './gorge.js';

/**
 * Treadmills: the progression-per-step multiplier, gated by rebirth.
 *
 * A treadmill does NOT make the player move faster. It multiplies the
 * progression each step is worth, so the existing loop is unchanged:
 *
 *   step -> progression gain -> level -> movement speed + backflips
 *
 * The multiplier is applied by the one shared formula in `progressionGain.ts`
 * alongside boots and rebirth, so no system invents its own maths.
 *
 * Access is decided by the SERVER from its own authoritative position and its
 * own rebirth count. There is no message a client can send to claim a
 * treadmill, which is why nothing here needs to guard against spoofing.
 */
export interface TreadmillTier {
  /** 1-based tier, matching the row left to right. */
  readonly tier: number;
  readonly name: string;
  /** Multiplier applied to progression gained per step. */
  readonly multiplier: number;
  /** Rebirths needed before this treadmill may be used. */
  readonly requiredRebirth: number;
}

/**
 * Eight tiers. The first four multipliers and every rebirth gate are fixed by
 * design; tiers 5-8 ramp geometrically toward the 200-rebirth machine so each
 * unlock is a visible jump rather than a rounding difference.
 */
export const TREADMILL_TIERS: readonly TreadmillTier[] = [
  { tier: 1, name: 'Starter', multiplier: 1, requiredRebirth: 0 },
  { tier: 2, name: 'Bronze', multiplier: 1.5, requiredRebirth: 1 },
  { tier: 3, name: 'Silver', multiplier: 2, requiredRebirth: 3 },
  { tier: 4, name: 'Gold', multiplier: 3, requiredRebirth: 9 },
  { tier: 5, name: 'Diamond', multiplier: 5, requiredRebirth: 18 },
  { tier: 6, name: 'Emerald', multiplier: 8, requiredRebirth: 36 },
  { tier: 7, name: 'Void', multiplier: 14, requiredRebirth: 100 },
  { tier: 8, name: 'Mythic', multiplier: 25, requiredRebirth: 200 },
];

/** Tier that is being used by nobody - "not on a treadmill". */
export const NO_TREADMILL = 0;

/**
 * The treadmill array along the BACK WALL of the starting platform.
 *
 * The decks face outward into the spawn area (the player walks on from +Z),
 * and the row sits entirely behind the boot shop, so the obby route down the
 * gorge is never crossed by it.
 *
 * The deck is a shallow step rather than a raised stage on purpose: a step of
 * 0.2 is inside the simulation's landing tolerance, so a player walks straight
 * on and off without the movement rules needing a step-up case.
 */
export const TREADMILL_ROW = {
  /** Z of the deck centre. */
  centerZ: -22.5,
  /** X of the first (tier 1) deck, and the spacing between decks. */
  firstX: -10.5,
  spacingX: 4.8,
  /** Deck footprint. Wider across X than deep, matching the row. */
  beltWidth: 3.4,
  beltLength: 6,
  /** Walkable height of the deck above the platform surface. */
  deckHeight: 0.2,
  /** Height of the side rails, visual only. */
  railHeight: 1,
  /** Height of the console at the back of each deck. */
  consoleHeight: 2.8,
  /** Depth of that console along Z. */
  consoleDepth: 0.8,
  /** Height of the floating label above the deck. */
  labelY: 4.2,
} as const;

/** Centre of a treadmill deck along X. */
export const treadmillX = (tier: number): number =>
  TREADMILL_ROW.firstX + (tier - 1) * TREADMILL_ROW.spacingX;

/** Walkable height of every treadmill deck. */
export const TREADMILL_DECK_Y = SPAWN_PLATFORM.topY + TREADMILL_ROW.deckHeight;

/** Z of the console row, hard against the back wall. */
export const TREADMILL_CONSOLE_Z =
  TREADMILL_ROW.centerZ - TREADMILL_ROW.beltLength / 2 - TREADMILL_ROW.consoleDepth / 2;

/**
 * Footprint of the treadmill bay's dedicated floor.
 *
 * Lives in shared config so the bay floor and the spawn grass are cut from the
 * SAME rectangle. They meet edge to edge and neither covers the other, which
 * is the only way to keep one owner per visible surface.
 */
export const TREADMILL_BAY = {
  marginX: 2.6,
  marginZ: 2.2,
  get minX(): number {
    return treadmillX(1) - TREADMILL_ROW.beltWidth / 2 - this.marginX;
  },
  get maxX(): number {
    return (
      treadmillX(TREADMILL_TIERS.length) + TREADMILL_ROW.beltWidth / 2 + this.marginX
    );
  },
  get minZ(): number {
    return TREADMILL_CONSOLE_Z - TREADMILL_ROW.consoleDepth / 2 - 0.8;
  },
  get maxZ(): number {
    return TREADMILL_ROW.centerZ + TREADMILL_ROW.beltLength / 2 + this.marginZ;
  },
} as const;

/** Look up a tier by number. */
export const treadmillByTier = (tier: number): TreadmillTier | undefined =>
  TREADMILL_TIERS.find((entry) => entry.tier === tier);

/**
 * Which treadmill deck a position is standing on, or `NO_TREADMILL`.
 *
 * Purely geometric: it says where the player IS, not what they may use. The
 * rebirth gate is applied separately so the UI can tell "not on one" apart
 * from "on one you have not unlocked".
 */
export const treadmillTierAt = (x: number, y: number, z: number): number => {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return NO_TREADMILL;
  if (Math.abs(z - TREADMILL_ROW.centerZ) > TREADMILL_ROW.beltLength / 2) return NO_TREADMILL;
  // A small hop on the spot still counts; stepping off the deck does not.
  if (y < TREADMILL_DECK_Y - 0.6 || y > TREADMILL_DECK_Y + 2.5) return NO_TREADMILL;

  const halfWidth = TREADMILL_ROW.beltWidth / 2;
  for (const entry of TREADMILL_TIERS) {
    if (Math.abs(x - treadmillX(entry.tier)) <= halfWidth) return entry.tier;
  }
  return NO_TREADMILL;
};

/**
 * How far outside a deck the player is still taken by it.
 *
 * Slightly larger than the deck itself so walking up to a machine and letting
 * go steps onto it, rather than demanding the player stop on an exact tile.
 */
export const TREADMILL_ENTRY_MARGIN = 0.7;

/**
 * Half the width a runner may stand across the belt.
 *
 * Entering PRESERVES the player's own X inside this band and only snaps Z, so
 * two players who walk up to the same machine from different sides keep
 * distinct positions on it. Treadmills are never single-occupancy.
 */
export const TREADMILL_LANE_HALF_WIDTH = TREADMILL_ROW.beltWidth / 2 - 0.8;

/**
 * Deck the player is close enough to STEP ONTO, or `NO_TREADMILL`.
 *
 * Wider than `treadmillTierAt`, which answers the different question of which
 * deck the player is standing on for the multiplier.
 */
export const treadmillEntryAt = (x: number, y: number, z: number): number => {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return NO_TREADMILL;
  const halfLength = TREADMILL_ROW.beltLength / 2 + TREADMILL_ENTRY_MARGIN;
  if (Math.abs(z - TREADMILL_ROW.centerZ) > halfLength) return NO_TREADMILL;
  if (y < TREADMILL_DECK_Y - 0.6 || y > TREADMILL_DECK_Y + 1.5) return NO_TREADMILL;

  const halfWidth = TREADMILL_ROW.beltWidth / 2 + TREADMILL_ENTRY_MARGIN;
  for (const entry of TREADMILL_TIERS) {
    if (Math.abs(x - treadmillX(entry.tier)) <= halfWidth) return entry.tier;
  }
  return NO_TREADMILL;
};

/** Where on the belt a player entering at `x` ends up running. */
export const treadmillRunX = (tier: number, x: number): number => {
  const centre = treadmillX(tier);
  const lane = TREADMILL_LANE_HALF_WIDTH;
  const offset = Number.isFinite(x) ? x - centre : 0;
  return centre + (offset < -lane ? -lane : offset > lane ? lane : offset);
};

/**
 * Highest tier this rebirth count may use. 0 means none at all.
 *
 * The server evaluates this and replicates it, so the simulation - which runs
 * on both sides - can gate entry without either side needing to re-derive the
 * ladder from a rebirth count the client could lie about.
 */
export const maxUsableTreadmill = (rebirths: number): number => {
  const count = Number.isFinite(rebirths) ? Math.max(0, Math.floor(rebirths)) : 0;
  let best = NO_TREADMILL;
  for (const entry of TREADMILL_TIERS) {
    if (count >= entry.requiredRebirth) best = entry.tier;
  }
  return best;
};

/** True when this rebirth count has earned the tier. */
export const isTreadmillUnlocked = (tier: number, rebirths: number): boolean => {
  const entry = treadmillByTier(tier);
  if (!entry) return false;
  const count = Number.isFinite(rebirths) ? Math.max(0, Math.floor(rebirths)) : 0;
  return count >= entry.requiredRebirth;
};

/**
 * Multiplier a player actually gets from a tier.
 *
 * Returns 1 for "no treadmill", for an unknown tier, and for one whose rebirth
 * gate has not been met - so a bad or forged tier can only ever mean "no
 * bonus", never a bonus.
 */
export const treadmillMultiplier = (tier: number, rebirths: number): number => {
  const entry = treadmillByTier(tier);
  if (!entry) return 1;
  return isTreadmillUnlocked(tier, rebirths) ? entry.multiplier : 1;
};
