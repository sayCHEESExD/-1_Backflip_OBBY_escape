import { TEST_FLOOR_SIZE } from '@obby/shared';
import {
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Scene,
} from 'three';

/**
 * TEMPORARY flat floor for milestone 1 only.
 *
 * It exists purely to verify that the player, camera and networking foundation
 * works. It is NOT the gorge and will be deleted when the real linear gorge
 * layout lands - see CLAUDE.md.
 */
export class TestFloor {
  readonly root = new Group();

  constructor() {
    const floor = new Mesh(
      new PlaneGeometry(TEST_FLOOR_SIZE, TEST_FLOOR_SIZE),
      new MeshStandardMaterial({ color: 0x5f7a4f, roughness: 1, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);

    // Grid gives an unmistakable sense of scale and motion while testing.
    const grid = new GridHelper(TEST_FLOOR_SIZE, TEST_FLOOR_SIZE / 4, 0x2f3d28, 0x4a5f3e);
    grid.position.y = 0.01;
    this.root.add(grid);
  }

  addTo(scene: Scene): void {
    scene.add(this.root);
  }
}
