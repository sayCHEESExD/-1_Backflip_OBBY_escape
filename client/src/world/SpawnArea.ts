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
    this.buildCoping(halfWidth, halfLength);
    this.buildCornerPosts(halfWidth, halfLength);
  }

  /**
   * A capping strip along the top of every wall.
   *
   * Without it the walls end on a raw cut edge and read as slabs dropped into
   * place. A coping course is what makes a wall look built, and it costs three
   * boxes.
   */
  private buildCoping(halfWidth: number, halfLength: number): void {
    const material = new MeshLambertMaterial({ color: WORLD_COLORS.spawnCoping });
    this.materials.push(material);

    const depth = SPAWN_WALLS.thickness + 0.5;
    const height = 0.55;
    const y = SPAWN_PLATFORM.topY + SPAWN_WALLS.height + height / 2;

    // Left wall.
    const leftGeometry = new BoxGeometry(depth, height, SPAWN_PLATFORM.length);
    this.geometries.push(leftGeometry);
    const left = new Mesh(leftGeometry, material);
    left.position.set(halfWidth - SPAWN_WALLS.thickness / 2, y, SPAWN_PLATFORM.centerZ);
    this.root.add(left);

    // Back wall.
    const backGeometry = new BoxGeometry(SPAWN_PLATFORM.width + 0.5, height, depth);
    this.geometries.push(backGeometry);
    const back = new Mesh(backGeometry, material);
    back.position.set(
      SPAWN_PLATFORM.x,
      y,
      SPAWN_PLATFORM.centerZ - halfLength + SPAWN_WALLS.thickness / 2,
    );
    this.root.add(back);

    // The two mouth walls either side of the gorge entrance. Same extent as
    // the walls they cap, so the copings cannot overlap either.
    const mouth = GORGE_HEAD.mouthHalfWidth;
    const span = SPAWN_WALLS.leftInnerX - mouth;
    if (span <= 0) return;
    const mouthGeometry = new BoxGeometry(span, height, depth);
    this.geometries.push(mouthGeometry);
    for (const side of [-1, 1] as const) {
      const cap = new Mesh(mouthGeometry, material);
      cap.position.set(
        side * (mouth + span / 2),
        y,
        GORGE_HEAD.riverStartZ - SPAWN_WALLS.thickness / 2,
      );
      this.root.add(cap);
    }
  }

  /**
   * Square posts where the walls meet.
   *
   * They tie the runs together at the corners and at the gorge mouth, so the
   * boundary reads as one deliberate enclosure rather than four separate
   * pieces that happen to touch.
   */
  private buildCornerPosts(halfWidth: number, halfLength: number): void {
    const material = new MeshLambertMaterial({ color: WORLD_COLORS.spawnCoping });
    this.materials.push(material);

    const size = SPAWN_WALLS.thickness + 1.1;
    const height = SPAWN_WALLS.height + 1.4;
    const geometry = new BoxGeometry(size, height, size);
    this.geometries.push(geometry);

    const y = SPAWN_PLATFORM.topY + height / 2;
    const backZ = SPAWN_PLATFORM.centerZ - halfLength + SPAWN_WALLS.thickness / 2;
    const frontZ = GORGE_HEAD.riverStartZ - SPAWN_WALLS.thickness / 2;
    const mouth = GORGE_HEAD.mouthHalfWidth;

    const spots: [number, number][] = [
      // Back corners.
      [halfWidth - SPAWN_WALLS.thickness / 2, backZ],
      [-(halfWidth - SPAWN_WALLS.thickness / 2), backZ],
      // Front corners, out at the canyon rim.
      [halfWidth - SPAWN_WALLS.thickness / 2, frontZ],
      [-(halfWidth - SPAWN_WALLS.thickness / 2), frontZ],
      // Either side of the gorge mouth - the gateposts of the route.
      [mouth, frontZ],
      [-mouth, frontZ],
    ];

    for (const [x, z] of spots) {
      const post = new Mesh(geometry, material);
      post.position.set(x, y, z);
      post.castShadow = true;
      post.receiveShadow = true;
      this.root.add(post);
    }
  }

  /**
   * The lip either side of the gorge mouth.
   *
   * Runs from the channel edge out to the canyon rim on both sides, so the
   * route leaves the start through an opening exactly as wide as the gorge.
   */
  private buildMouthWalls(material: Material, halfWidth: number): void {
    const mouth = GORGE_HEAD.mouthHalfWidth;
    // Stop at the SIDE wall's inner face rather than the platform edge. Run to
    // the edge and the last two units of this wall sit inside the left wall,
    // with both tops at the same height - two blue surfaces fighting for the
    // same pixels along the whole front-left corner.
    const span = SPAWN_WALLS.leftInnerX - mouth;
    if (span <= 0) return;
    void halfWidth;

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
