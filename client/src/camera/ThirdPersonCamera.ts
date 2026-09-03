import { CAMERA } from '@obby/shared';
import { PerspectiveCamera, Vector3 } from 'three';

const FORWARD = new Vector3();
const DESIRED = new Vector3();
const LOOK_TARGET = new Vector3();

/**
 * Fixed-offset third-person follow camera.
 *
 * It trails directly behind the player's yaw with exponential smoothing. Free
 * orbit / touch look is intentionally out of scope for this milestone.
 */
export class ThirdPersonCamera {
  readonly camera: PerspectiveCamera;

  private readonly target = new Vector3();
  private targetYaw = 0;
  private initialised = false;

  constructor() {
    this.camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
    this.camera.position.set(0, CAMERA.height, -CAMERA.distance);
  }

  /** Called by RendererManager whenever the drawing buffer changes size. */
  setViewport(width: number, height: number): void {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  /** Point the camera at a player position + yaw. */
  setTarget(position: Vector3, yaw: number): void {
    this.target.copy(position);
    this.targetYaw = yaw;
  }

  update(delta: number): void {
    FORWARD.set(Math.sin(this.targetYaw), 0, Math.cos(this.targetYaw));

    DESIRED.copy(this.target)
      .addScaledVector(FORWARD, -CAMERA.distance)
      .add(new Vector3(0, CAMERA.height, 0));

    if (!this.initialised) {
      this.camera.position.copy(DESIRED);
      this.initialised = true;
    } else {
      // Frame-rate independent exponential smoothing.
      const alpha = 1 - Math.exp(-CAMERA.followLerp * delta);
      this.camera.position.lerp(DESIRED, alpha);
    }

    LOOK_TARGET.copy(this.target).add(new Vector3(0, CAMERA.lookAtHeight, 0));
    this.camera.lookAt(LOOK_TARGET);
  }
}
