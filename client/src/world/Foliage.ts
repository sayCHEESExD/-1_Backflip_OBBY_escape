import { BANK_WALL, GORGE } from '@obby/shared';
import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FOLIAGE, WORLD_COLORS } from '../config/worldVisuals.js';

/**
 * Layered low-poly conifers along both gorge rims.
 *
 * The canopy is three stacked cones merged into ONE geometry, so a whole tree
 * is two instanced draw calls no matter how many trees there are. The scatter
 * is seeded, so every client renders an identical forest without replicating
 * a single position.
 */
export class Foliage {
  readonly root = new Group();

  private readonly trunkGeometry: CylinderGeometry;
  private readonly canopyGeometry: BufferGeometry;
  private readonly materials: MeshLambertMaterial[] = [];

  constructor() {
    this.trunkGeometry = new CylinderGeometry(0.3, 0.42, 2.2, 5);
    this.canopyGeometry = buildLayeredCanopy();

    const placements = this.scatter();
    this.buildTrunks(placements);
    this.buildCanopies(placements);
  }

  dispose(): void {
    this.trunkGeometry.dispose();
    this.canopyGeometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  /** Deterministic positions along the flat green rims, both sides. */
  private scatter(): Placement[] {
    const random = mulberry32(FOLIAGE.seed);
    const placements: Placement[] = [];
    const minZ = GORGE.startZ;
    const maxZ = GORGE.horizonZ;
    const span = Math.max(BANK_WALL.rimWidth - FOLIAGE.innerInset - FOLIAGE.outerInset, 2);

    for (const side of [-1, 1] as const) {
      for (let i = 0; i < FOLIAGE.perSide; i += 1) {
        const x = side * (BANK_WALL.rimX + FOLIAGE.innerInset + random() * span);
        const z = minZ + random() * (maxZ - minZ);
        const scale = FOLIAGE.minScale + random() * (FOLIAGE.maxScale - FOLIAGE.minScale);
        placements.push({ x, y: BANK_WALL.rimY, z, scale, tone: random() < 0.5 ? 0 : 1 });
      }
    }
    return placements;
  }

  private buildTrunks(placements: Placement[]): void {
    const material = new MeshLambertMaterial({ color: WORLD_COLORS.trunk });
    this.materials.push(material);

    const mesh = new InstancedMesh(this.trunkGeometry, material, placements.length);
    const dummy = new Object3D();

    placements.forEach((placement, i) => {
      dummy.position.set(placement.x, placement.y + 1.1 * placement.scale, placement.z);
      dummy.scale.setScalar(placement.scale);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    this.root.add(mesh);
  }

  private buildCanopies(placements: Placement[]): void {
    for (const tone of [0, 1] as const) {
      const subset = placements.filter((placement) => placement.tone === tone);
      if (subset.length === 0) continue;

      const material = new MeshLambertMaterial({
        color: tone === 0 ? WORLD_COLORS.canopyA : WORLD_COLORS.canopyB,
      });
      this.materials.push(material);

      const mesh = new InstancedMesh(this.canopyGeometry, material, subset.length);
      const dummy = new Object3D();

      subset.forEach((placement, i) => {
        dummy.position.set(placement.x, placement.y + 2.0 * placement.scale, placement.z);
        dummy.scale.setScalar(placement.scale);
        // Yaw variety costs nothing and breaks up the repetition.
        dummy.rotation.set(0, placement.x * 1.7 + placement.z * 0.3, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });

      mesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
    }
  }
}

interface Placement {
  x: number;
  y: number;
  z: number;
  scale: number;
  tone: 0 | 1;
}

/** Three stacked cones merged into a single geometry: one classic conifer. */
const buildLayeredCanopy = (): BufferGeometry => {
  const layers = [
    { radius: 1.9, height: 2.6, y: 0.0 },
    { radius: 1.5, height: 2.4, y: 1.5 },
    { radius: 1.05, height: 2.2, y: 2.9 },
  ];

  const cones = layers.map((layer) => {
    const cone = new ConeGeometry(layer.radius, layer.height, 7);
    cone.translate(0, layer.y, 0);
    return cone;
  });

  const merged = mergeGeometries(cones, false);
  for (const cone of cones) cone.dispose();

  if (!merged) throw new Error('Failed to merge conifer canopy geometry');
  return merged;
};

/** Small deterministic PRNG - identical output on every client. */
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
