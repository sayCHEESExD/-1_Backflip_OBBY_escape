import {
  COLLECTION_ZONE,
  PLATFORM,
  TROPHY_PLATFORMS,
  collectionZoneX,
  collectionZoneZ,
} from '@obby/shared';
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldTextures } from './WorldTextures.js';

/** Height of the pad's walkable top above the island surface. */
const PAD_HEIGHT = 0.34;

/** How far the dark frame extends past the chequered top, per side. */
const FRAME_INSET = 0.45;

/**
 * Where the trophies stand on the strip, as a fraction of its length.
 *
 * Spread along Z now the pad runs the island end to end, so the whole strip
 * reads as the Win lane rather than one clump at its middle.
 */
const TROPHY_SPREAD = [-0.32, 0, 0.32] as const;

/** Slight side-to-side stagger, so the three do not form a straight line. */
const TROPHY_STAGGER = [-0.85, 0.75, -0.35] as const;

/** Height the trophies hover at, and how far they bob. */
const TROPHY_Y = 1.15;
const TROPHY_BOB = 0.16;

/**
 * The Win collection pad on every island.
 *
 * A raised chequered slab in a dark frame with gold trophies stood on it -
 * the point being that the place you bank a reward should read as a built
 * object from across the gap, not as a flat decal on the deck.
 *
 * Geometry is shared across all thirty islands: one frame box, one top box,
 * and a single InstancedMesh carrying every trophy on the route. What the pad
 * is WORTH, and whether a claim is honoured, is server state - this only marks
 * the spot.
 */
export class WinPads {
  readonly root = new Group();

  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly trophies: InstancedMesh;
  private readonly dummy = new Object3D();
  private time = 0;

  constructor(textures: WorldTextures) {
    const zone = COLLECTION_ZONE;

    // --- The frame: a dark slab a little larger than the pad it holds. ---
    // The frame widens the strip across X only. Widening it along Z too would
    // hang it over both ends of the island, since the strip already runs the
    // island's full length.
    const frameGeometry = new BoxGeometry(
      zone.width + FRAME_INSET * 2,
      PAD_HEIGHT,
      zone.depth,
    );
    const frameMaterial = new MeshLambertMaterial({ color: 0x1b2130 });

    // --- The top: chequered orange, sat just proud of the frame. ---
    const topGeometry = new BoxGeometry(zone.width, PAD_HEIGHT * 0.55, zone.depth);
    const checkMap = textures.winCheck();
    checkMap.repeat.set(zone.width * 0.4, zone.depth * 0.4);
    const topMaterial = new MeshLambertMaterial({ map: checkMap });

    this.geometries.push(frameGeometry, topGeometry);
    this.materials.push(frameMaterial, topMaterial);

    for (const platform of TROPHY_PLATFORMS) {
      const x = collectionZoneX();
      const z = collectionZoneZ(platform.centerZ);

      const frame = new Mesh(frameGeometry, frameMaterial);
      frame.position.set(x, PLATFORM.topY + PAD_HEIGHT / 2, z);
      frame.receiveShadow = true;
      this.root.add(frame);

      const top = new Mesh(topGeometry, topMaterial);
      top.position.set(x, PLATFORM.topY + PAD_HEIGHT * 0.86, z);
      top.receiveShadow = true;
      this.root.add(top);
    }

    // --- One InstancedMesh for every trophy on the route. ---
    const trophyGeometry = buildTrophy();
    const trophyMaterial = new MeshBasicMaterial({ color: 0xffc733 });
    this.geometries.push(trophyGeometry);
    this.materials.push(trophyMaterial);

    this.trophies = new InstancedMesh(
      trophyGeometry,
      trophyMaterial,
      TROPHY_PLATFORMS.length * TROPHY_SPREAD.length,
    );
    this.trophies.frustumCulled = false;
    this.root.add(this.trophies);
    this.placeTrophies();
  }

  /** Bob and turn the trophies so the pad reads as live, not scenery. */
  update(delta: number): void {
    this.time += delta;
    this.placeTrophies();
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private placeTrophies(): void {
    let i = 0;
    for (const platform of TROPHY_PLATFORMS) {
      const x = collectionZoneX();
      const z = collectionZoneZ(platform.centerZ);

      TROPHY_SPREAD.forEach((spread, slot) => {
        const phase = this.time * 1.6 + slot * 1.1 + platform.index;
        this.dummy.position.set(
          x + (TROPHY_STAGGER[slot] ?? 0),
          PLATFORM.topY + PAD_HEIGHT + TROPHY_Y + Math.sin(phase) * TROPHY_BOB,
          z + spread * COLLECTION_ZONE.depth,
        );
        this.dummy.rotation.set(0, this.time * 0.9 + slot, 0);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        this.trophies.setMatrixAt(i, this.dummy.matrix);
        i += 1;
      });
    }
    this.trophies.instanceMatrix.needsUpdate = true;
  }
}

/**
 * A low-poly trophy: cup, stem, base and two handles, merged into one buffer.
 *
 * Merging means every trophy on the route is a single instanced draw rather
 * than five meshes per pad.
 */
const buildTrophy = (): BufferGeometry => {
  const parts: BufferGeometry[] = [];

  const cup = new CylinderGeometry(0.42, 0.26, 0.55, 8);
  cup.translate(0, 0.5, 0);
  parts.push(cup);

  const stem = new CylinderGeometry(0.09, 0.09, 0.24, 6);
  stem.translate(0, 0.1, 0);
  parts.push(stem);

  const base = new BoxGeometry(0.46, 0.14, 0.46);
  base.translate(0, -0.05, 0);
  parts.push(base);

  for (const side of [-1, 1]) {
    const handle = new BoxGeometry(0.1, 0.3, 0.1);
    handle.translate(side * 0.45, 0.52, 0);
    parts.push(handle);
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged ?? new BoxGeometry(0.4, 0.8, 0.4);
};
