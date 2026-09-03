/**
 * The linear gorge layout. Pure data, shared by the renderer and the
 * authoritative server so both agree on where everything is.
 *
 * GEOMETRY RULE (see CLAUDE.md): every trophy platform is identical in width,
 * length, thickness, Y, X and rotation. ONLY Z changes. The route is one
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
  width: 30,
  /** Deliberately long - leaves clear space for treadmills and UI later. */
  length: 34,
  thickness: 2.5,
  topY: 0,
  x: 0,
  centerZ: 0,
} as const;

/**
 * Gap (empty space along Z) before each trophy platform, in world units.
 *
 * The first gap is ~5 player widths (player is 1.4 wide). Later gaps grow
 * progressively but stay inside the sprint jump range: a full-speed jump
 * covers about 10.9 units (2 * jumpVelocity / gravity * runSpeed), so the
 * final gaps demand a full sprint while still leaving landing margin.
 */
const PLATFORM_GAPS = [7, 7.5, 8, 8.4, 8.8, 9, 9.2, 9.4, 9.5] as const;

/** Trophy award for each platform, in run order. */
const TROPHY_VALUES = [1, 3, 5, 10, 15, 25, 35, 45, 100] as const;

/** One trophy platform. Only `centerZ` differs between entries. */
export interface TrophyPlatform {
  /** Index in run order; also the id used in claim messages. */
  readonly index: number;
  /** Wins awarded for reaching this platform. */
  readonly value: number;
  /** The ONLY per-platform varying field. */
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
  /** How far the gorge visually extends past the route, toward the horizon. */
  horizonZ: 620,
} as const;

/**
 * The gorge walls: a steep slope rising from the waterline to a flat green rim.
 *
 * Mirrored on both sides. The slope is a single angled face rather than a
 * staircase, which is what gives the canyon its clean, steep silhouette.
 */
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
   * Tilt in radians about Z, so a line can slope from one bank to the other.
   * Kept very small: the gorge is 26 units across, so even 0.05 rad shifts the
   * line by half a unit at the island edges. The route must stay readable.
   */
  readonly tilt: number;
}

/** Line thickness, used for both the mesh and the hit test. */
export const REDLINE_RADIUS = 0.22;

const platformZ = (index: number): number => TROPHY_PLATFORMS[index]?.centerZ ?? 0;

/**
 * Hazard placement.
 *
 * The first redlines appear at the +35 platform (index 6); nothing earlier, so
 * the opening run stays clean. Difficulty then grows gradually: spacing
 * tightens, and a slight tilt appears and strengthens toward the end.
 *
 * Lines sit OVER PLATFORMS, never spanning a gap. On a platform the player
 * chooses their answer - jump over a low line, run under a high one. A line
 * strung across a gap has no fair answer: the jump arc is under a metre high
 * at the launch edge (so a low line is unclearable) and peaks above head
 * height mid-gap (so a high line is unavoidable).
 *
 * Player height is 3.2 and a jump peaks near 3.6, so y ~1.3 must be jumped and
 * y ~4.0 must be run under.
 *
 * SPACING. A low line is only cleared once the player's FEET are above it,
 * which needs about 1.9 units of run-up before the line. A high line cannot be
 * launched from within about 0.9 units, because the player's head rises into it
 * almost immediately. Put a high line too close in front of a low one and those
 * two windows exclude each other, leaving no legal launch point at all - so a
 * pair on one island needs roughly 4.5 units between them. Most islands carry a
 * single line for exactly this reason.
 */
const buildRedlines = (): readonly Redline[] => {
  const p6 = platformZ(6);
  const p7 = platformZ(7);
  const p8 = platformZ(8);
  /** Midpoint of the gap between two islands. */
  const gapMid = (a: number, b: number): number => (a + b) / 2;

  return [
    // Section 1: the +35 island. A single high line - run under it.
    { z: p6 - 1.5, y: 4.0, tilt: 0 },

    // Section 2: the +45 island. The other kind of hazard - jump this one.
    { z: p7 - 1.0, y: 1.35, tilt: 0.025 },

    // Section 3: strung high over the gap. A normal jump peaks with the head
    // at 6.8, so this is only ever hit by a player who flips through it -
    // a "do not flip here" hazard that the backflip lift makes meaningful.
    { z: gapMid(p7, p8), y: 7.4, tilt: 0 },

    // Section 4: the +100 island. The only island carrying BOTH kinds, and the
    // strongest tilt. They are far apart on purpose - see the spacing note.
    { z: p8 - 4.5, y: 3.95, tilt: 0.04 },
    { z: p8 - 0.5, y: 1.25, tilt: -0.05 },
  ];
};

export const REDLINES: readonly Redline[] = buildRedlines();
