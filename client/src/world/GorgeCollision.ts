import {
  COLLECTION_ZONE,
  collectionZoneX,
  collectionZoneZ,
  DEATH_PLANE_Y,
  GORGE,
  PLATFORM,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  REDLINE_RADIUS,
  REDLINES,
  SPAWN_PLATFORM,
  TROPHY_PLATFORMS,
} from '@obby/shared';

/**
 * Anything the player can stand on: an axis-aligned rectangle in XZ with a
 * flat top. Every platform in the gorge is one of these.
 */
interface Surface {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly topY: number;
}

/**
 * What the player walked into this frame. All fields are independent - a
 * player can land in a trophy zone and be over the pit on the same frame.
 */
export interface GorgeTriggers {
  /** Index of the trophy platform whose collection zone was entered. */
  trophyIndex: number | null;
  /** True if the player's body intersects a red hazard line. */
  redline: boolean;
  /** True if the player has fallen past the death plane. */
  fell: boolean;
}

/**
 * The gameplay shape of the gorge: what you can stand on, where you cannot go,
 * and what hurts.
 *
 * Deliberately separate from the meshes that render it - GorgeWorld builds
 * visuals from the same shared config, so the two cannot drift.
 */
export class GorgeCollision {
  private readonly surfaces: Surface[] = [];

  /** Maximum drop below a surface that still counts as landing on it. */
  private static readonly LANDING_TOLERANCE = 0.25;

  constructor() {
    this.surfaces.push({
      minX: SPAWN_PLATFORM.x - SPAWN_PLATFORM.width / 2,
      maxX: SPAWN_PLATFORM.x + SPAWN_PLATFORM.width / 2,
      minZ: SPAWN_PLATFORM.centerZ - SPAWN_PLATFORM.length / 2,
      maxZ: SPAWN_PLATFORM.centerZ + SPAWN_PLATFORM.length / 2,
      topY: SPAWN_PLATFORM.topY,
    });

    for (const platform of TROPHY_PLATFORMS) {
      this.surfaces.push({
        minX: PLATFORM.x - PLATFORM.width / 2,
        maxX: PLATFORM.x + PLATFORM.width / 2,
        minZ: platform.centerZ - PLATFORM.length / 2,
        maxZ: platform.centerZ + PLATFORM.length / 2,
        topY: PLATFORM.topY,
      });
    }
  }

  /**
   * Height of the walkable surface under (x, z), or null over empty gorge.
   *
   * The player's radius is honoured so they can stand on a platform edge
   * rather than falling the instant their centre passes it.
   */
  surfaceYAt(x: number, z: number): number | null {
    let best: number | null = null;
    for (const surface of this.surfaces) {
      if (x < surface.minX - PLAYER_RADIUS || x > surface.maxX + PLAYER_RADIUS) continue;
      if (z < surface.minZ - PLAYER_RADIUS || z > surface.maxZ + PLAYER_RADIUS) continue;
      if (best === null || surface.topY > best) best = surface.topY;
    }
    return best;
  }

  /** True when the player may snap down onto `surfaceY` from `previousY`. */
  canLandOn(previousY: number, surfaceY: number): boolean {
    return previousY >= surfaceY - GorgeCollision.LANDING_TOLERANCE;
  }

  /**
   * Invisible boundary keeping players off the banks.
   *
   * The banks start well outside this, so the clamp is a hard guarantee rather
   * than a surface the player can slide along.
   */
  clampToChannel(x: number): number {
    const limit = GORGE.channelHalfWidth;
    return x < -limit ? -limit : x > limit ? limit : x;
  }

  /** Sample every trigger volume at the player's current position. */
  sampleTriggers(x: number, y: number, z: number): GorgeTriggers {
    return {
      trophyIndex: this.trophyZoneAt(x, y, z),
      redline: this.touchesRedline(x, y, z),
      fell: y <= DEATH_PLANE_Y,
    };
  }

  /** Index of the collection zone containing the player, if any. */
  private trophyZoneAt(x: number, y: number, z: number): number | null {
    if (y < PLATFORM.topY - 1 || y > PLATFORM.topY + COLLECTION_ZONE.height) return null;

    const halfWidth = COLLECTION_ZONE.width / 2;
    const halfDepth = COLLECTION_ZONE.depth / 2;

    const padX = collectionZoneX();
    if (Math.abs(x - padX) > halfWidth) return null;

    for (const platform of TROPHY_PLATFORMS) {
      if (Math.abs(z - collectionZoneZ(platform.centerZ)) > halfDepth) continue;
      return platform.index;
    }
    return null;
  }

  /**
   * Red lines span the whole gorge, so only the Z and Y bands matter: the
   * player is treated as a box PLAYER_HEIGHT tall and PLAYER_RADIUS deep.
   */
  private touchesRedline(x: number, y: number, z: number): boolean {
    const feet = y;
    const head = y + PLAYER_HEIGHT;

    for (const line of REDLINES) {
      if (Math.abs(z - line.z) > PLAYER_RADIUS + REDLINE_RADIUS) continue;

      // A tilted line is lower on one side; sample its height at the player's X.
      const lineY = PLATFORM.topY + line.y + Math.tan(line.tilt) * x;
      if (head < lineY - REDLINE_RADIUS) continue;
      if (feet > lineY + REDLINE_RADIUS) continue;
      return true;
    }
    return false;
  }
}
