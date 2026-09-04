import { GORGE_HEAD, SPAWN_PLATFORM, SPAWN_WALLS } from '@obby/shared';
import { BoxGeometry, Group, Mesh, MeshLambertMaterial, type Material } from 'three';
import { WORLD_COLORS } from '../config/worldVisuals.js';
import type { WorldTextures } from './WorldTextures.js';

/**
 * Walls closing the starting area on the left (+X), the back (-Z) and the
 * outer parts of the front.
 *
 * The right side is closed by the Win Shop's own backdrop. The front is open
 * only across the GORGE MOUTH - the starting area is much wider than the
 * channel it feeds into, so the rest of the front edge is walled. Without that
 * the player could walk off the front out at the far left and be snapped
 * sideways to the channel limit in a single step.
 *
 * Collision for all of these lives in `WorldCollision.clampToBounds`.
 */
export class SpawnArea {
  readonly root = new Group();

  private readonly geometries: BoxGeometry[] = [];
  private readonly materials: Material[] = [];

  constructor(textures: WorldTextures) {
    const map = textures.grassStuds(WORLD_COLORS.rimGrass, WORLD_COLORS.rimGrassStud);
    map.repeat.set(SPAWN_PLATFORM.length * 0.18, SPAWN_WALLS.height * 0.18);
    const material = new MeshLambertMaterial({ map });
    this.materials.push(material);

    const halfWidth = SPAWN_PLATFORM.width / 2;
    const halfLength = SPAWN_PLATFORM.length / 2;
    const midY = SPAWN_PLATFORM.topY + SPAWN_WALLS.height / 2;

    // Left wall, running the full length of the platform.
    const leftGeometry = new BoxGeometry(
      SPAWN_WALLS.thickness,
      SPAWN_WALLS.height,
      SPAWN_PLATFORM.length,
    );
    this.geometries.push(leftGeometry);
    const left = new Mesh(leftGeometry, material);
    left.position.set(
      halfWidth - SPAWN_WALLS.thickness / 2,
      midY,
      SPAWN_PLATFORM.centerZ,
    );
    left.receiveShadow = true;
    left.castShadow = true;
    this.root.add(left);

    // Back wall, spanning the full width so the corners meet cleanly.
    const backGeometry = new BoxGeometry(
      SPAWN_PLATFORM.width,
      SPAWN_WALLS.height,
      SPAWN_WALLS.thickness,
    );
    this.geometries.push(backGeometry);
    const back = new Mesh(backGeometry, material);
    back.position.set(
      SPAWN_PLATFORM.x,
      midY,
      SPAWN_PLATFORM.centerZ - halfLength + SPAWN_WALLS.thickness / 2,
    );
    back.receiveShadow = true;
    back.castShadow = true;
    this.root.add(back);

    this.buildMouthWalls(material, halfWidth);
  }

  /**
   * The lip either side of the gorge mouth.
   *
   * Runs from the channel edge out to the canyon rim on both sides, so the
   * route leaves the start through an opening exactly as wide as the gorge.
   */
  private buildMouthWalls(material: Material, halfWidth: number): void {
    const mouth = GORGE_HEAD.mouthHalfWidth;
    const span = halfWidth - mouth;
    if (span <= 0) return;

    const geometry = new BoxGeometry(span, SPAWN_WALLS.height, SPAWN_WALLS.thickness);
    this.geometries.push(geometry);

    const midY = SPAWN_PLATFORM.topY + SPAWN_WALLS.height / 2;
    const z = GORGE_HEAD.riverStartZ - SPAWN_WALLS.thickness / 2;

    for (const side of [-1, 1] as const) {
      const wall = new Mesh(geometry, material);
      wall.position.set(side * (mouth + span / 2), midY, z);
      wall.receiveShadow = true;
      wall.castShadow = true;
      this.root.add(wall);
    }
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}
