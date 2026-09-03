/**
 * Third-person camera tuning. Lives in shared config so gameplay code can
 * reason about camera framing without importing the renderer.
 */
export interface CameraConfig {
  /** Distance behind the player, in world units. */
  readonly distance: number;
  /** Height above the player's feet that the camera sits at. */
  readonly height: number;
  /** Height above the player's feet that the camera looks at. */
  readonly lookAtHeight: number;
  /** Positional smoothing factor per second (higher = snappier). */
  readonly followLerp: number;
  /** Vertical field of view in degrees. */
  readonly fov: number;
  readonly near: number;
  readonly far: number;
}

export const CAMERA: CameraConfig = {
  distance: 11,
  height: 5.5,
  lookAtHeight: 2.2,
  followLerp: 8,
  fov: 60,
  near: 0.1,
  far: 1000,
};
