import {
  SPAWN_PLATFORM,
  TREADMILL_BAY,
  TREADMILL_CONSOLE_Z,
  TREADMILL_ROW,
  TREADMILL_TIERS,
  treadmillX,
} from '@obby/shared';
import {
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
} from 'three';
import { SIGN_FRAME_COLOR, SIGN_FRAME_MARGIN, drawSign } from './SignPanel.js';

/** Height of the kerb that frames the floor on three sides. */
const KERB_HEIGHT = 0.55;
const KERB_THICKNESS = 0.5;

/** Banner geometry, above the machines and in FRONT of the back wall. */
const BANNER_WIDTH = 26;
const BANNER_HEIGHT = 5;
const BANNER_Y = 9.4;

/**
 * How far in front of the console row the banner hangs.
 *
 * It has to clear the back wall's COPING, which oversails the wall by a
 * quarter on each side and sits at exactly the height the banner spans - that
 * overhang was cutting a grey bar straight across the sign.
 */
const BANNER_STANDOFF = 0.6;

/**
 * The room the treadmills stand in.
 *
 * Purely structural: an inlaid floor, a kerb framing it on three sides, a
 * divider post between each machine and a banner over the row. The machines
 * themselves, their tiers, colours and effects are `Treadmills` and are not
 * touched here.
 *
 * The floor is INLAID - its top sits exactly at platform level rather than
 * raised - so the area reads as a dedicated bay without adding a step the
 * movement simulation would have to know about. The machines keep their own
 * 0.2 deck step, which is what the player actually walks onto.
 */
export class TreadmillArea {
  readonly root = new Group();

  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private texture: CanvasTexture | null = null;

  constructor() {
    // The footprint is shared config, so the grass around it is cut from the
    // exact same rectangle and neither surface overlaps the other.
    const frontZ = TREADMILL_BAY.maxZ;
    const backZ = TREADMILL_BAY.minZ;
    const centreX = (TREADMILL_BAY.minX + TREADMILL_BAY.maxX) / 2;
    const width = TREADMILL_BAY.maxX - TREADMILL_BAY.minX;
    const depth = frontZ - backZ;
    const centreZ = (frontZ + backZ) / 2;

    this.buildFloor(centreX, centreZ, width, depth);
    this.buildKerb(centreX, centreZ, width, depth);
    this.buildDividers(frontZ, backZ);
    this.buildBanner(centreX);
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.texture?.dispose();
  }

  /** A dark tiled bay inlaid into the spawn grass. Top face at platform level. */
  private buildFloor(x: number, z: number, width: number, depth: number): void {
    const thickness = 0.6;
    const geometry = new BoxGeometry(width, thickness, depth);
    const material = new MeshLambertMaterial({ color: 0x2b3446 });
    this.geometries.push(geometry);
    this.materials.push(material);

    const floor = new Mesh(geometry, material);
    // TOP exactly at platform level - no step, no collision change, and no
    // second surface at the same height now the grass is cut around it.
    floor.position.set(x, SPAWN_PLATFORM.topY - thickness / 2, z);
    floor.receiveShadow = true;
    this.root.add(floor);
  }

  /**
   * A low kerb along the back and both ends.
   *
   * The front is deliberately left open - that is the side players walk in
   * from, and a lip there would be a step into the bay.
   */
  private buildKerb(x: number, z: number, width: number, depth: number): void {
    const material = new MeshLambertMaterial({ color: 0x4a5872 });
    this.materials.push(material);

    const sideGeometry = new BoxGeometry(KERB_THICKNESS, KERB_HEIGHT, depth);
    const backGeometry = new BoxGeometry(width, KERB_HEIGHT, KERB_THICKNESS);
    this.geometries.push(sideGeometry, backGeometry);

    const y = SPAWN_PLATFORM.topY + KERB_HEIGHT / 2;

    for (const side of [-1, 1] as const) {
      const kerb = new Mesh(sideGeometry, material);
      kerb.position.set(x + (side * width) / 2, y, z);
      kerb.castShadow = true;
      this.root.add(kerb);
    }

    const back = new Mesh(backGeometry, material);
    back.position.set(x, y, z - depth / 2);
    back.castShadow = true;
    this.root.add(back);
  }

  /** A post between neighbouring machines, so the row reads as bays. */
  private buildDividers(frontZ: number, backZ: number): void {
    const geometry = new BoxGeometry(0.45, 2.1, 0.45);
    const material = new MeshLambertMaterial({ color: 0x4a5872 });
    this.geometries.push(geometry);
    this.materials.push(material);

    const y = SPAWN_PLATFORM.topY + 1.05;
    for (let tier = 0; tier <= TREADMILL_TIERS.length; tier += 1) {
      const left = tier === 0 ? treadmillX(1) - TREADMILL_ROW.spacingX : treadmillX(tier);
      const right =
        tier === TREADMILL_TIERS.length
          ? treadmillX(tier) + TREADMILL_ROW.spacingX
          : treadmillX(tier + 1);
      const x = (left + right) / 2;

      for (const z of [frontZ - 0.6, backZ + 0.6]) {
        const post = new Mesh(geometry, material);
        post.position.set(x, y, z);
        post.castShadow = true;
        this.root.add(post);
      }
    }
  }

  /** The "Train Speed" banner over the row, as in the reference. */
  private buildBanner(x: number): void {
    const frameGeometry = new BoxGeometry(
      BANNER_WIDTH + SIGN_FRAME_MARGIN,
      BANNER_HEIGHT + SIGN_FRAME_MARGIN,
      0.4,
    );
    const frameMaterial = new MeshLambertMaterial({ color: SIGN_FRAME_COLOR });
    this.geometries.push(frameGeometry);
    this.materials.push(frameMaterial);

    const frame = new Mesh(frameGeometry, frameMaterial);
    frame.position.set(x, SPAWN_PLATFORM.topY + BANNER_Y, TREADMILL_CONSOLE_Z + BANNER_STANDOFF);
    this.root.add(frame);

    const texture = new CanvasTexture(drawSign('Train Speed', { icon: '👟' }));
    texture.colorSpace = SRGBColorSpace;
    this.texture = texture;

    const panelGeometry = new PlaneGeometry(BANNER_WIDTH, BANNER_HEIGHT);
    const panelMaterial = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
      fog: false,
    });
    this.geometries.push(panelGeometry);
    this.materials.push(panelMaterial);

    const panel = new Mesh(panelGeometry, panelMaterial);
    // Faces +Z, into the spawn area, so it reads on approach.
    panel.position.set(x, SPAWN_PLATFORM.topY + BANNER_Y, TREADMILL_CONSOLE_Z + BANNER_STANDOFF + 0.25);
    this.root.add(panel);
  }
}

