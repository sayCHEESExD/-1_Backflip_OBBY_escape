import { GORGE, PLATFORM, REDLINE_RADIUS, REDLINES } from '@obby/shared';
import {
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
} from 'three';
import { WORLD_COLORS } from '../config/worldVisuals.js';

/** Extra length so each line visibly bites into both banks. */
const BANK_OVERLAP = 3;

/**
 * Red hazard lines strung bank to bank across the gorge.
 *
 * One InstancedMesh for every line plus one for the anchor caps: two draw
 * calls for the whole hazard set, however many lines the config defines.
 */
export class Redlines {
  readonly root = new Group();

  private readonly lineGeometry: CylinderGeometry;
  private readonly capGeometry: SphereGeometry;
  private readonly material: MeshBasicMaterial;

  constructor() {
    const span = (GORGE.bankInnerX + BANK_OVERLAP) * 2;

    // A unit-length cylinder laid along X, scaled to span the gorge.
    this.lineGeometry = new CylinderGeometry(REDLINE_RADIUS, REDLINE_RADIUS, 1, 6);
    this.lineGeometry.rotateZ(Math.PI / 2);

    this.capGeometry = new SphereGeometry(REDLINE_RADIUS * 2.2, 8, 6);

    // Unlit, so the lines stay a flat vivid red and read clearly in midair
    // against both the bright banks and the dark pit.
    this.material = new MeshBasicMaterial({ color: WORLD_COLORS.redline });

    this.buildLines(span);
    this.buildCaps(span);
  }

  dispose(): void {
    this.lineGeometry.dispose();
    this.capGeometry.dispose();
    this.material.dispose();
  }

  private buildLines(span: number): void {
    const mesh = new InstancedMesh(this.lineGeometry, this.material, REDLINES.length);
    const dummy = new Object3D();

    REDLINES.forEach((line, i) => {
      dummy.position.set(0, PLATFORM.topY + line.y, line.z);
      dummy.rotation.set(0, 0, line.tilt);
      dummy.scale.set(span, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.root.add(mesh);
  }

  /** Small spheres where each line meets the banks, so anchors read clearly. */
  private buildCaps(span: number): void {
    const mesh = new InstancedMesh(this.capGeometry, this.material, REDLINES.length * 2);
    const dummy = new Object3D();
    const matrix = new Matrix4();
    let i = 0;

    for (const line of REDLINES) {
      for (const side of [-1, 1] as const) {
        const x = (side * span) / 2;
        dummy.position.set(x, PLATFORM.topY + line.y + Math.tan(line.tilt) * x, line.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        matrix.copy(dummy.matrix);
        mesh.setMatrixAt(i, matrix);
        i += 1;
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.root.add(mesh);
  }
}
