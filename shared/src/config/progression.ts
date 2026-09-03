/**
 * Progression tuning. Progression, rewards and level are SERVER-AUTHORITATIVE;
 * the client may predict for UI feel but never decides these values.
 *
 * Only the shape and baseline numbers exist at this milestone - the systems
 * that consume them (boots, rebirth, treadmills, trophies) are not built yet.
 */
export interface ProgressionConfig {
  /** Progression points granted per step taken, before multipliers. */
  readonly baseProgressionPerStep: number;
  /** Level cap at rebirth 0. */
  readonly baseLevelCap: number;
  /** Extra level cap granted per rebirth. */
  readonly levelCapPerRebirth: number;
  /** Progression multiplier added per rebirth (1.0 = +100%). */
  readonly progressionMultiplierPerRebirth: number;
  /** Backflips granted each time the player levels up. */
  readonly backflipsPerLevel: number;
  /** Progression points per second while parked on a treadmill (AFK gain). */
  readonly treadmillProgressionPerSecond: number;
}

export const PROGRESSION: ProgressionConfig = {
  baseProgressionPerStep: 1,
  baseLevelCap: 25,
  levelCapPerRebirth: 25,
  progressionMultiplierPerRebirth: 1,
  backflipsPerLevel: 1,
  treadmillProgressionPerSecond: 0.5,
};

/**
 * Boots multiply progression gained per step. Data-driven so tiers can be
 * added without touching gameplay code.
 */
export interface BootTier {
  readonly id: string;
  readonly name: string;
  /** Multiplier applied to baseProgressionPerStep. */
  readonly progressionMultiplier: number;
}

export const BOOT_TIERS: readonly BootTier[] = [
  { id: 'default', name: 'Bare Feet', progressionMultiplier: 1 },
];
