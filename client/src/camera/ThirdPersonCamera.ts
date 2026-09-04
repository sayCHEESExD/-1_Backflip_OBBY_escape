import { CAMERA } from '@obby/shared';
import { PerspectiveCamera, Vector3 } from 'three';

const FORWARD = new Vector3();
const DESIRED = new Vector3();
const LOOK_TARGET = new Vector3();
const OFFSET = new Vector3();

/**
 * Third-person orbit camera.
 *
 * The camera owns its OWN yaw and pitch, supplied by the mouse, and the player
 * supplies only a position to orbit. That separation is the whole point: it
 * used to trail the player's facing, so pressing A turned the character, which
 * turned the camera, which turned what "forward" meant - the classic feedback
 * loop where WASD ends up steering the view.
 *
 * The movement controller rotates its stick input by `yaw`, so the camera is
 * the single source of "which way is forward" and the character's own facing
 * follows where it is actually going.
 */
export class ThirdPersonCamera {
  readonly camera: PerspectiveCamera;

  private readonly target = new Vector3();
  /** Orbit angles, written by the mouse. */
  private orbitYaw = 0;
  private orbitPitch = 0.22;
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

  /** The direction the camera faces. This is what "forward" means. */
  get yaw(): number {
    return this.orbitYaw;
  }

  /** Follow this player position. The camera's own angles are unchanged. */
  setTarget(position: Vector3): void {
    this.target.copy(position);
  }

  /** Aim the orbit. Called every frame from the mouse look source. */
  setOrbit(yaw: number, pitch: number): void {
    this.orbitYaw = yaw;
    this.orbitPitch = pitch;
  }

  update(delta: number): void {
    // Where the camera sits: back along its own yaw, lifted by its pitch. The
    // pitch shortens the horizontal reach as it rises, so the camera swings
    // over the player rather than sliding away from them.
    const cosPitch = Math.cos(this.orbitPitch);
    const sinPitch = Math.sin(this.orbitPitch);

    FORWARD.set(Math.sin(this.orbitYaw) * cosPitch, 0, Math.cos(this.orbitYaw) * cosPitch);

    DESIRED.copy(this.target)
      .addScaledVector(FORWARD, -CAMERA.distance)
      .add(OFFSET.set(0, CAMERA.height + sinPitch * CAMERA.distance, 0));

    if (!this.initialised) {
      this.camera.position.copy(DESIRED);
      this.initialised = true;
    } else {
      // Frame-rate independent exponential smoothing. Only the POSITION is
      // smoothed - the look angles are applied immediately, so the view never
      // lags the mouse.
      const alpha = 1 - Math.exp(-CAMERA.followLerp * delta);
      this.camera.position.lerp(DESIRED, alpha);
    }

    LOOK_TARGET.copy(this.target).add(OFFSET.set(0, CAMERA.lookAtHeight, 0));
    this.camera.lookAt(LOOK_TARGET);
  }
}
