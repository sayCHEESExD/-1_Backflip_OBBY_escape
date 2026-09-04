import { BANK_WALL, GORGE, GORGE_HEAD } from '@obby/shared';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  type Material,
  type Scene,
} from 'three';
import { WORLD_COLORS } from '../config/worldVisuals.js';
import type { WorldTextures } from './WorldTextures.js';

/**
 * The gorge shell: the blue channel floor, the steep tiled canyon walls, the
 * green rims that cap them, and the cloudy sky dome.
 *
 * Everything is a scaled instance of ONE unit box (plus the sky sphere), so
 * the entire environment is a handful of draw calls.
 */
export class GorgeTerrain {
  readonly root = new Group();

  private readonly boxGeometry = new BoxGeometry(1, 1, 1);
  private readonly materials: Material[] = [];
  private readonly textures: WorldTextures;

  constructor(textures: WorldTextures) {
    this.textures = textures;
    const length = GORGE.horizonZ - GORGE.startZ;
    const centerZ = (GORGE.horizonZ + GORGE.startZ) / 2;

    this.buildWater(textures);
    this.buildWalls(textures, length, centerZ);
  }

  /** Paint the sky. Called once the terrain is attached to a scene. */
  applySky(scene: Scene): void {
    scene.background = this.textures.sky();
  }

  dispose(): void {
    this.boxGeometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  /**
   * The blue channel running the length of the gorge.
   *
   * It reads as a river but is NOT water: a flat lit tiled surface with no
   * transparency, no reflection and no animation. It is a death zone.
   */
  private buildWater(textures: WorldTextures): void {
    // The river BEGINS at the starting platform's front edge. Behind that the
    // world is solid headland, so the channel reads as running out from under
    // the start rather than passing beneath a slab floating over it.
    const length = GORGE.horizonZ - GORGE_HEAD.riverStartZ;
    const centerZ = (GORGE.horizonZ + GORGE_HEAD.riverStartZ) / 2;

    // Wider than the visible channel and thick, so it tucks under the canyon
    // slopes instead of ending in a hairline crack against them.
    const width = (GORGE.bankInnerX + 4) * 2;
    const depth = 8;

    const map = textures.tiles(
      WORLD_COLORS.waterTile,
      WORLD_COLORS.waterLine,
      WORLD_COLORS.waterTileAlt,
    );
    map.repeat.set(width * 0.14, length * 0.14);

    const material = new MeshLambertMaterial({ map });
    this.materials.push(material);

    const water = new Mesh(this.boxGeometry, material);
    water.scale.set(width, depth, length);
    // Top face exactly at the pit floor, which is also the foot of the slopes.
    water.position.set(0, GORGE.pitFloorY - depth / 2, centerZ);
    water.receiveShadow = true;
    this.root.add(water);
  }

  /**
   * Steep tiled slopes rising out of the water, capped by a green rim.
   *
   * The SLOPES start at the gorge mouth. They used to run the whole world, and
   * a slope crosses platform height at x = 27.9 while the starting headland
   * reaches x = 33 - so the last five units of bank rose straight up through
   * the spawn grass as blue shards on both sides. Behind the mouth the
   * headland IS the terrain, and nothing else belongs there.
   *
   * The RIMS still run the full length: they sit at x >= 33, outboard of the
   * headland, so they flank the start without intersecting it.
   */
  private buildWalls(textures: WorldTextures, length: number, centerZ: number): void {
    const wallMap = textures.tiles(
      WORLD_COLORS.wallTile,
      WORLD_COLORS.wallLine,
      WORLD_COLORS.wallTileAlt,
    );
    const rise = BANK_WALL.rimY - BANK_WALL.footY;
    const run = BANK_WALL.rimX - BANK_WALL.footX;
    const slopeFaceLength = Math.hypot(rise, run);
    wallMap.repeat.set(length * 0.1, slopeFaceLength * 0.14);

    const wallMaterial = new MeshLambertMaterial({ map: wallMap });
    this.materials.push(wallMaterial);

    const rimMap = textures.grassStuds(WORLD_COLORS.rimGrass, WORLD_COLORS.rimGrassStud);
    rimMap.repeat.set(BANK_WALL.rimWidth * 0.22, length * 0.22);
    const rimMaterial = new MeshLambertMaterial({ map: rimMap });
    this.materials.push(rimMaterial);

    // Thickness of the slab whose TOP face forms the visible slope.
    const slabDepth = 26;

    // Pitch of the slope, and the midpoint its top face must pass through.
    const angle = Math.atan2(rise, run);
    const midX = (BANK_WALL.footX + BANK_WALL.rimX) / 2;
    const midY = (BANK_WALL.footY + BANK_WALL.rimY) / 2;

    // Only the part of the world that actually has a river in it.
    const slopeLength = GORGE.horizonZ - GORGE_HEAD.riverStartZ;
    const slopeCenterZ = (GORGE.horizonZ + GORGE_HEAD.riverStartZ) / 2;

    for (const side of [-1, 1] as const) {
      const slope = new Mesh(this.boxGeometry, wallMaterial);
      slope.scale.set(slopeFaceLength, slabDepth, slopeLength);
      // Tilt about Z so the slab's TOP face becomes the canyon slope, rising
      // from the waterline out to the rim.
      slope.rotation.z = side * angle;
      // The slab hangs below that face, so its centre is offset along the
      // face's own normal - NOT straight down in world Y. Offsetting in Y was
      // the bug behind the seam: it slid the face sideways and down, so the
      // slope started inside the channel and its top never reached the rim,
      // leaving the green bank visibly disconnected from the blue wall.
      slope.position.set(
        side * (midX + Math.sin(angle) * (slabDepth / 2)),
        midY - Math.cos(angle) * (slabDepth / 2),
        slopeCenterZ,
      );
      slope.receiveShadow = true;
      this.root.add(slope);

      const rim = new Mesh(this.boxGeometry, rimMaterial);
      rim.scale.set(BANK_WALL.rimWidth, slabDepth, length);
      rim.position.set(
        side * (BANK_WALL.rimX + BANK_WALL.rimWidth / 2),
        BANK_WALL.rimY - slabDepth / 2,
        centerZ,
      );
      rim.receiveShadow = true;
      this.root.add(rim);
    }
  }
}
