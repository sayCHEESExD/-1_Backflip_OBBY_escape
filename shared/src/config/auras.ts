/**
 * Auras: the TROPHY REWARD cosmetic ladder, bought with trophy Wins.
 *
 * An aura multiplies the Wins a trophy pays out, and nothing else. It has no
 * effect on movement speed and none on progression per step - those belong to
 * trails, and to boots and treadmills, respectively.
 *
 * The multiplier is applied in exactly one place: `resolveTrophyReward`, which
 * `TrophyService` calls after it has already validated the platform, the run's
 * claim history, the player's position and the claim cooldown. There is no
 * path that pays a reward without passing those checks first.
 */

/** How the client draws an aura. Presentation only; never gameplay. */
export type AuraStyle =
  | 'flame'
  | 'disco'
  | 'sparkle'
  | 'shine'
  | 'rich'
  | 'lightning'
  | 'devil'
  | 'toxic'
  | 'darkmatter'
  | 'crimson'
  | 'royal';

export interface AuraTier {
  /** 1-based slot, matching the shop rows top to bottom. */
  readonly slot: number;
  readonly name: string;
  /** Trophy Wins deducted on purchase. */
  readonly cost: number;
  /** Multiplier applied to trophy rewards while equipped. */
  readonly multiplier: number;
  /** Base colour, as a hex integer. */
  readonly color: number;
  /** Secondary colour, used by the animated styles. */
  readonly accent: number;
  readonly style: AuraStyle;
}

export const AURA_TIERS: readonly AuraTier[] = [
  { slot: 1, name: 'Flame Aura', cost: 250, multiplier: 1.25, color: 0xff6a1f, accent: 0xffd23d, style: 'flame' },
  { slot: 2, name: 'Disco Aura', cost: 350, multiplier: 1.5, color: 0xff3bd0, accent: 0x3ad2ff, style: 'disco' },
  { slot: 3, name: 'Sparkle Aura', cost: 500, multiplier: 1.75, color: 0xfff6b0, accent: 0xffffff, style: 'sparkle' },
  { slot: 4, name: 'Purple Shine Aura', cost: 850, multiplier: 2, color: 0xa855f7, accent: 0xe0b3ff, style: 'shine' },
  { slot: 5, name: 'Rich Aura', cost: 2500, multiplier: 2.5, color: 0xffc733, accent: 0xfff2ba, style: 'rich' },
  { slot: 6, name: 'Lightning Aura', cost: 3500, multiplier: 3, color: 0x9ee7ff, accent: 0xffffff, style: 'lightning' },
  { slot: 7, name: 'Devil Aura', cost: 5000, multiplier: 3.5, color: 0xd11a1a, accent: 0x2b0808, style: 'devil' },
  { slot: 8, name: 'Toxic Aura', cost: 10000, multiplier: 4, color: 0x5cff3a, accent: 0xc8ff8a, style: 'toxic' },
  { slot: 9, name: 'Dark Matter Aura', cost: 20000, multiplier: 4.5, color: 0x2a1a4d, accent: 0x9b6bff, style: 'darkmatter' },
  { slot: 10, name: 'Crimson', cost: 50000, multiplier: 5, color: 0xff1236, accent: 0x6b0212, style: 'crimson' },
  { slot: 11, name: 'The Last King', cost: 100000, multiplier: 5.5, color: 0xffd54a, accent: 0xa855f7, style: 'royal' },
];

/** Nothing equipped. */
export const NO_AURA = 0;

/** Look up a tier by its slot. */
export const auraBySlot = (slot: number): AuraTier | undefined =>
  AURA_TIERS.find((tier) => tier.slot === slot);

/** One bit per slot, so the whole inventory is a single replicated integer. */
export const auraMask = (slot: number): number => 1 << (slot - 1);

/** True when the player has bought this tier. */
export const isAuraOwned = (owned: number, slot: number): boolean =>
  (owned & auraMask(slot)) !== 0;

/**
 * Reward multiplier from the equipped aura.
 *
 * Returns 1 for "none equipped" and for any slot that is not owned, so an
 * unowned or forged slot can only ever mean "no bonus".
 */
export const auraMultiplier = (slot: number, owned: number): number => {
  const tier = auraBySlot(slot);
  if (!tier) return 1;
  return isAuraOwned(owned, tier.slot) ? tier.multiplier : 1;
};

/**
 * THE trophy reward calculation.
 *
 * The only place an aura touches Wins. Rounded down so a reward is always a
 * whole number of Wins and can never be inflated by repeated fractional
 * rounding across many claims.
 */
export const resolveTrophyReward = (
  baseValue: number,
  auraSlot: number,
  ownedAuras: number,
): number => {
  const base = Number.isFinite(baseValue) ? Math.max(0, Math.floor(baseValue)) : 0;
  return Math.floor(base * auraMultiplier(auraSlot, ownedAuras));
};
