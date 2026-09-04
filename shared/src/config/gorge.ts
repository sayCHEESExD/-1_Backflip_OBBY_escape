/**
 * The linear gorge layout. Pure data, shared by the renderer and the
 * authoritative server so both agree on where everything is.
 *
 * GEOMETRY RULE (see CLAUDE.md): every trophy platform is identical in width,
 * length, thickness, Y, X and rotation. ONLY Z changes. Islands do carry a
 * themed deck COLOUR and name, which is presentation, not geometry. The route is one
 * perfectly straight line down +Z - never offset, zig-zagged, rotated or
 * curved. `TROPHY_PLATFORMS` is generated from a gap list precisely so a
 * per-platform X or rotation cannot be introduced by accident.
 */

/** Identical geometry shared by every trophy platform. */
export const PLATFORM = {
  /** Extent along X. Islands are deliberately WIDE across the gorge. */
  width: 22,
  /**
   * Extent along Z: exactly half the width, so each island reads as a broad
   * rectangular slab the player crosses quickly.
   *
   * The floor on this number is hazard spacing, not looks. A walk-speed jump
   * covers 6.5 units, and a player may not launch within ~0.9 of a line, so an
   * island must fit: land, clear a hazard, then reach a clean launch point for
   * the next gap. Below 11 that sequence stops fitting.
   */
  length: 11,
  /** Extent along Y. Thick enough to read as a solid island from the side. */
  thickness: 2.5,
  /** Walkable surface height. Identical for every platform. */
  topY: 0,
  /** Centre on X. Identical for every platform. */
  x: 0,
  /** Yaw. Identical for every platform. */
  rotationY: 0,
} as const;

/** The starting area at the mouth of the gorge. */
export const SPAWN_PLATFORM = {
  /**
   * The starting area spans the canyon from rim to rim.
   *
   * Half of this is exactly `BANK_WALL.rimX`, so the left wall lands against
   * the canyon rim instead of stopping in mid air, and the headland beneath
   * fills the gorge rather than floating over it. It also opens the left-hand
   * side well past the treadmill row.
   */
  width: 66,
  /** Long enough for the boot shop AND a clear run in front of the treadmills. */
  length: 56,
  thickness: 2.5,
  topY: 0,
  x: 0,
  centerZ: 0,
} as const;

/**
 * Walls closing the starting area on three sides.
 *
 * Left (+X) and back (-Z) are solid walls; the right (-X) is closed by the Win
 * Shop's own backdrop. Only the front (+Z), toward the gorge, is open, so the
 * only way out of the start is to run the obby.
 */
export const SPAWN_WALLS = {
  height: 8,
  thickness: 1.6,
  /** Inner face of the left wall - the largest X a player can reach. */
  get leftInnerX(): number {
    return SPAWN_PLATFORM.width / 2 - this.thickness;
  },
  /** Inner face of the back wall - the smallest Z a player can reach. */
  get backInnerZ(): number {
    return SPAWN_PLATFORM.centerZ - SPAWN_PLATFORM.length / 2 + this.thickness;
  },
} as const;

/**
 * Gap (empty space along Z) before each trophy island, in world units.
 *
 * These gaps are what tie the route to progression. Reach grows with BOTH
 * halves of levelling - one more backflip and a faster run - so measured reach
 * at each level is:
 *
 *   level  1    2    3    4    5    6    7    8    10
 *   reach  17   26   37   49   64   78   93   107  135
 *
 * The first two islands stay easy: 7 needs no flip at all and 13 is inside the
 * single flip every level-1 player already has. After that each gap sits above
 * the previous level's reach and comfortably inside its own, so island N
 * demands a specific level - and the last one lands exactly on level 10, the
 * rebirth-0 cap. Clearing the route and unlocking rebirth are the same moment.
 */
const AUTHORED_GAPS = [7, 13, 32, 43, 57, 70, 84, 98, 122, 140] as const;

/** Trophy award for each authored platform, in run order. */
const AUTHORED_VALUES = [1, 3, 5, 10, 15, 25, 35, 45, 100, 200] as const;

/**
 * Islands generated past the authored opening.
 *
 * The hand-tuned run above ends exactly at the rebirth-0 level cap, so
 * everything from here on is endgame: it exists to give levels, movement speed
 * and long backflip chains somewhere to matter. Rather than authoring another
 * twenty rows of numbers by hand, the curve the opening already follows is
 * simply continued.
 */
const EXTENDED_ISLANDS = 20;

/**
 * Growth per generated island.
 *
 * Both are read off the authored tail rather than invented: its last gap steps
 * are x1.24 and x1.15, and its last reward steps are x2.22 and x2.0. Gaps
 * compound gently because reach compounds gently; rewards compound harder so a
 * deep run is worth the trip.
 */
const GAP_GROWTH = 1.15;
const REWARD_GROWTH = 1.7;

/** Round to two significant figures, so generated rewards read as round numbers. */
const roundReward = (value: number): number => {
  if (value < 100) return Math.round(value / 5) * 5;
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.round(value / magnitude) * magnitude;
};

/** Continue a curve for `count` more entries, compounding by `growth`. */
const extend = (
  authored: readonly number[],
  count: number,
  growth: number,
  round: (value: number) => number,
): number[] => {
  const out = [...authored];
  for (let i = 0; i < count; i += 1) {
    const previous = out[out.length - 1] ?? 1;
    out.push(round(previous * growth));
  }
  return out;
};

const PLATFORM_GAPS = extend(AUTHORED_GAPS, EXTENDED_ISLANDS, GAP_GROWTH, Math.round);
const TROPHY_VALUES = extend(AUTHORED_VALUES, EXTENDED_ISLANDS, REWARD_GROWTH, roundReward);

/**
 * Themed name for each island, in run order. Shown floating above the island
 * and used to colour its deck. Lives in shared because it is the island's
 * identity, not a purely visual choice.
 */
const AREA_NAMES = [
  'Starter Area',
  'Cloud Area',
  'Volcano Area',
  'Tsunami Area',
  'Hot Area',
  'Nature Area',
  'Crystal Area',
  'Thunder Area',
  'Ancient Area',
  'Space Island',
  // Past Space Island the route is deep space, and the names carry that.
  'Nebula Area',
  'Comet Area',
  'Meteor Area',
  'Orbit Area',
  'Galaxy Area',
  'Quasar Area',
  'Pulsar Area',
  'Vortex Area',
  'Eclipse Area',
  'Aurora Area',
  'Supernova Area',
  'Blackhole Area',
  'Wormhole Area',
  'Andromeda Area',
  'Titan Area',
  'Cosmos Area',
  'Singularity Area',
  'Infinity Area',
  'Oblivion Area',
  'Eternity Area',
] as const;

export type AreaName = (typeof AREA_NAMES)[number];

/** One trophy platform. Only `centerZ` differs between entries. */
export interface TrophyPlatform {
  /** Index in run order; also the id used in claim messages. */
  readonly index: number;
  /** Wins awarded for reaching this platform. */
  readonly value: number;
  /** Themed name floating above the island. */
  readonly area: AreaName;
  /** The ONLY varying GEOMETRY field. */
  readonly centerZ: number;
}

/** The rectangular trophy-collection area sitting on each platform. */
export const COLLECTION_ZONE = {
  /** Extent along X. */
  width: 5,
  /** Extent along Z. */
  depth: 5,
  /**
   * Offset from the island centre along X.
   *
   * The pad sits at the FAR LEFT of every island. Because it occupies only a
   * corner of a wide slab, a player who wants a bigger trophy simply runs down
   * the right-hand side - banking a reward stays a choice, never a forced stop.
   *
   * Positive X is the player's left when travelling down the gorge.
   */
  offsetX: 8,
  /**
   * Offset from the island centre along Z, slightly forward of centre so a
   * player who has just cleared a hazard lands on the pad rather than past it.
   */
  offsetZ: 2,
  /** Height of the trigger volume above the platform surface. */
  height: 4,
  /** Height of the floating label above the platform surface. */
  labelY: 4.6,
} as const;

/** Centre of a platform's collection pad along X. */
export const collectionZoneX = (): number => PLATFORM.x + COLLECTION_ZONE.offsetX;

/** Z of the starting platform's front edge - where the route begins. */
export const SPAWN_FRONT_Z = SPAWN_PLATFORM.centerZ + SPAWN_PLATFORM.length / 2;

/**
 * The head of the gorge: solid ground the starting area stands on.
 *
 * The start used to be a slab hanging in empty space with the river running
 * underneath it. Instead the world is SOLID behind the front edge and the blue
 * channel begins exactly there, so the river reads as flowing out from under
 * the starting platform rather than past it.
 *
 * The mouth is only as wide as the gorge channel. Everything either side of it
 * is wall, because the starting area is far wider than what it feeds into -
 * see `WorldCollision.clampToBounds`.
 */
export const GORGE_HEAD = {
  /** Z where the blue channel starts. Also the platform's front edge. */
  riverStartZ: SPAWN_FRONT_Z,
  /** Half-width of the solid headland. Meets the canyon rim on both sides. */
  get halfWidth(): number {
    return BANK_WALL.rimX;
  },
  /** How far below the river floor the headland's base reaches. */
  get baseY(): number {
    return GORGE.pitFloorY - 8;
  },
  /** Half-width of the opening the route runs out through. */
  get mouthHalfWidth(): number {
    return GORGE.channelHalfWidth;
  },
} as const;

/** Centre of a platform's collection pad along Z. */
export const collectionZoneZ = (platformCenterZ: number): number =>
  platformCenterZ + COLLECTION_ZONE.offsetZ;

const buildPlatforms = (): readonly TrophyPlatform[] => {
  const platforms: TrophyPlatform[] = [];
  // Start from the far edge of the spawn platform.
  let edgeZ = SPAWN_PLATFORM.centerZ + SPAWN_PLATFORM.length / 2;

  for (let i = 0; i < TROPHY_VALUES.length; i += 1) {
    const gap = PLATFORM_GAPS[i] ?? PLATFORM_GAPS[PLATFORM_GAPS.length - 1] ?? 10;
    const nearEdge = edgeZ + gap;
    platforms.push({
      index: i,
      value: TROPHY_VALUES[i] ?? 0,
      area: AREA_NAMES[i] ?? 'Starter Area',
      centerZ: nearEdge + PLATFORM.length / 2,
    });
    edgeZ = nearEdge + PLATFORM.length;
  }
  return platforms;
};

export const TROPHY_PLATFORMS: readonly TrophyPlatform[] = buildPlatforms();

/** Z of the far edge of the last platform - where the route currently ends. */
export const ROUTE_END_Z =
  (TROPHY_PLATFORMS[TROPHY_PLATFORMS.length - 1]?.centerZ ?? 0) + PLATFORM.length / 2;

/** Look up a platform by its claim index. */
export const platformByIndex = (index: number): TrophyPlatform | undefined =>
  TROPHY_PLATFORMS[index];

/**
 * The gorge itself. The playable channel is narrow; the banks are scenery and
 * are pushed far enough out that the player can never stand on them.
 */
export const GORGE = {
  /** Players are clamped to +/- this X. Nothing outside is playable. */
  channelHalfWidth: 13,
  /** Inner X edge of the gorge walls, at the waterline. */
  bankInnerX: 16,
  /**
   * Y of the blue pit floor. Visual only - the death plane sits above it.
   * Shallow enough that the river reads clearly from the route above.
   */
  pitFloorY: -14,
  /** How far the gorge visually extends behind the spawn. */
  startZ: -80,
  /**
   * How far the gorge visually extends past the route.
   *
   * DERIVED from the route rather than a fixed number: the terrain is a
   * handful of scaled boxes, so it costs nothing to be long, but stopping
   * short would leave the last islands floating over open sky.
   */
  horizonZ: ROUTE_END_Z + 800,
} as const;

/**
 * The gorge walls: a steep slope rising from the waterline to a flat green rim.
 *
 * Mirrored on both sides. The slope is a single angled face rather than a
 * staircase, which is what gives the canyon its clean, steep silhouette.
 */
/**
 * The boot shop, along the RIGHT-hand side of the starting platform.
 *
 * Right is negative X: the player travels down +Z and the trophy pads sit at
 * positive X ("far left"), so the shop faces them from the opposite side.
 */
export const BOOT_SHOP = {
  /** X of the pedestal row. */
  x: -10,
  /** X of the backing wall and sign, just outside the walkable channel. */
  wallX: -14.5,
  /** Z of the first pedestal, and the spacing between them. */
  firstZ: -15,
  spacingZ: 5,
  /** How close the player must get to a pedestal to buy its boot. */
  pickupRadius: 2.4,
  /** Height of the "Win Shop" sign above the platform. */
  signY: 9,
} as const;

export const BANK_WALL = {
  /** X where the slope meets the water. */
  footX: 16,
  /** Y where the slope meets the water. */
  footY: -14,
  /** X where the slope reaches the rim. */
  rimX: 33,
  /**
   * Y of the flat green rim on top. Kept low relative to the route so the
   * walls frame the gorge without walling off the sky.
   */
  rimY: 6,
  /** How far the green rim extends outward before the world ends. */
  rimWidth: 34,
} as const;

/** A red hazard line strung across the gorge from bank to bank. */
export interface Redline {
  /** Position along the route. */
  readonly z: number;
  /** Height of the line above platform level. */
  readonly y: number;
  /**
   * Half-width of the line, measured to where it meets the bank.
   *
   * Derived from the height, so every line ENDS INSIDE the canyon wall rather
   * than stopping in mid air. The bank slopes outward as it rises, so a high
   * line is a longer line.
   */
  readonly halfSpan: number;
}

/** Line thickness, used for both the mesh and the hit test. */
export const REDLINE_RADIUS = 0.22;

/**
 * X where the canyon wall sits at a given height.
 *
 * The bank rises from (footX, footY) to (rimX, rimY); above the rim it is flat
 * green, so the span stops just past the rim edge. Lines are built from this
 * so both ends are always buried in terrain.
 */
export const bankXAtHeight = (worldY: number): number => {
  const rise = BANK_WALL.rimY - BANK_WALL.footY;
  const run = BANK_WALL.rimX - BANK_WALL.footX;
  if (rise <= 0) return BANK_WALL.rimX;
  const along = (worldY - BANK_WALL.footY) / rise;
  const clamped = along < 0 ? 0 : along > 1 ? 1 : along;
  // A little extra so the line visibly bites into the bank instead of just
  // touching it.
  return BANK_WALL.footX + clamped * run + 1.5;
};

const platformZ = (index: number): number => TROPHY_PLATFORMS[index]?.centerZ ?? 0;

/**
 * Heights of the three rows in a stacked column.
 *
 * The spacing is a hard constraint, not taste. The hit test treats the player
 * as a box PLAYER_HEIGHT (3.2) tall, and each line is REDLINE_RADIUS thick, so
 * threading between two rows needs more than 3.64 units of clear air. 4.8 apart
 * leaves 4.36 - a real but passable window, reachable by the chained-flip arc
 * that crosses these gaps in the first place.
 */
const ROW_HEIGHTS = [1.4, 6.2, 11] as const;

/** Height of a lone line: low enough to jump, high enough to read. */
const SINGLE_ROW_Y = 3.6;

/** Heights used when a gap carries two separate lines. */
const PAIR_HEIGHTS = [2.2, 7] as const;

const line = (z: number, y: number): Redline => ({
  z,
  y,
  halfSpan: bankXAtHeight(PLATFORM.topY + y),
});

/**
 * Hazard placement.
 *
 * Lines live in the GAPS between islands and never over one. An island is
 * where a player lands, re-aims and launches; putting a hazard there punishes
 * the one part of the route that has to be safe. A gap is the opposite - the
 * player is already committed to an arc, so a line there is a shape to fly
 * through.
 *
 * Difficulty ramps by the pattern requested for this pass, one entry per gap
 * from the +10 island onward:
 *
 *   +10 -> +15   a single line, dead centre of the gap
 *   +15 -> +25   two lines at different heights
 *   +25 -> +35   one column of three stacked rows
 *   +35 -> +45   the same again
 *   +45 -> +100  the same again
 *   +100 -> Space  three columns of three rows
 *
 * A "column" is one Z station; its "rows" are the stacked heights there.
 */
const buildRedlines = (): readonly Redline[] => {
  const lines: Redline[] = [];

  /** Midpoint of the empty space between two islands. */
  const gapCentre = (before: number, after: number): number =>
    (platformZ(before) + PLATFORM.length / 2 + (platformZ(after) - PLATFORM.length / 2)) / 2;

  /** Usable length of the empty space between two islands. */
  const gapLength = (before: number, after: number): number =>
    platformZ(after) - PLATFORM.length / 2 - (platformZ(before) + PLATFORM.length / 2);

  const column = (z: number): void => {
    for (const y of ROW_HEIGHTS) lines.push(line(z, y));
  };

  // +10 -> +15: exactly one line, at the dead centre of the gap.
  lines.push(line(gapCentre(3, 4), SINGLE_ROW_Y));

  // +15 -> +25: two lines, spaced a third of the gap apart.
  {
    const centre = gapCentre(4, 5);
    const offset = gapLength(4, 5) / 6;
    PAIR_HEIGHTS.forEach((y, i) => {
      lines.push(line(centre + (i === 0 ? -offset : offset), y));
    });
  }

  // +25 -> +35, +35 -> +45 and +45 -> +100: one three-row column each.
  column(gapCentre(5, 6));
  column(gapCentre(6, 7));
  column(gapCentre(7, 8));

  // +100 -> Space Island: three columns of three rows.
  {
    const centre = gapCentre(8, 9);
    const spacing = gapLength(8, 9) / 4;
    for (const step of [-1, 0, 1]) column(centre + step * spacing);
  }

  return lines;
};

export const REDLINES: readonly Redline[] = buildRedlines();
