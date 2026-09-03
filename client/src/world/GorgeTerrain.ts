import { BANK_WALL, GORGE } from '@obby/shared';
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

    this.buildWater(textures, length, centerZ);
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
  private buildWater(textures: WorldTextures, length: number, centerZ: number): void {
    const map = textures.tiles(
      WORLD_COLORS.waterTile,
      WORLD_COLORS.waterLine,
      WORLD_COLORS.waterTileAlt,
    );
    map.repeat.set(GORGE.bankInnerX * 2 * 0.14, length * 0.14);

    const material = new MeshLambertMaterial({ map });
    this.materials.push(material);

    const water = new Mesh(this.boxGeometry, material);
    water.scale.set(GORGE.bankInnerX * 2, 2, length);
    water.position.set(0, GORGE.pitFloorY, centerZ);
    water.receiveShadow = true;
    this.root.add(water);
  }

  /** Steep tiled slopes rising out of the water, capped by a green rim. */
  private buildWalls(textures: WorldTextures, length: number, centerZ: number): void {
    const wallMap = textures.tiles(
      WORLD_COLORS.wallTile,
      WORLD_COLORS.wallLine,
      WORLD_COLORS.wallTileAlt,
    );
    const rise = BANK_WALL.rimY - BANK_WALL.footY;
    const run = BANK_WALL.rimX - BANK_WALL.footX;
    const slopeLength = Math.hypot(rise, run);
    wallMap.repeat.set(length * 0.1, slopeLength * 0.14);

    const wallMaterial = new MeshLambertMaterial({ map: wallMap });
    this.materials.push(wallMaterial);

    const rimMap = textures.grassStuds(WORLD_COLORS.rimGrass, WORLD_COLORS.rimGrassStud);
    rimMap.repeat.set(BANK_WALL.rimWidth * 0.22, length * 0.22);
    const rimMaterial = new MeshLambertMaterial({ map: rimMap });
    this.materials.push(rimMaterial);

    // Thickness of the slab whose TOP face forms the visible slope.
    const slabDepth = 26;

    for (const side of [-1, 1] as const) {
      const slope = new Mesh(this.boxGeometry, wallMaterial);
      slope.scale.set(slopeLength, slabDepth, length);
      slope.position.set(
        side * ((BANK_WALL.footX + BANK_WALL.rimX) / 2),
        (BANK_WALL.footY + BANK_WALL.rimY) / 2 - slabDepth / 2 + 0.001,
        centerZ,
      );
      // Tilt about Z so the slab's top face becomes the canyon slope.
      slope.rotation.z = side * -Math.atan2(rise, run);
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
