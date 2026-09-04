/** Radians of rotation per pixel of mouse movement. */
const SENSITIVITY = 0.0026;

/** Pitch limits, so the camera can never flip over the player. */
const MIN_PITCH = -0.55;
const MAX_PITCH = 1.15;

/**
 * Mouse look for the third-person camera.
 *
 * Accumulates yaw and pitch from raw pointer deltas. It owns NOTHING else -
 * the camera reads these two angles and the player controller rotates its
 * movement input by the yaw, so looking around never moves the character and
 * moving never turns the camera.
 *
 * Pointer lock is requested by clicking the canvas, which is the only gesture
 * a browser accepts. While a UI panel is up the source is suppressed and the
 * lock is released, so the cursor is available for the shop buttons.
 */
export class MouseLook {
  private canvas: HTMLElement | null = null;

  private yawValue = 0;
  private pitchValue = 0.22;
  private suppressed = false;
  /** True while the left button is down and the pointer is NOT locked. */
  private dragging = false;

  get yaw(): number {
    return this.yawValue;
  }

  get pitch(): number {
    return this.pitchValue;
  }

  /** True while the browser has the pointer captured. */
  get locked(): boolean {
    return !!this.canvas && document.pointerLockElement === this.canvas;
  }

  attach(canvas: HTMLElement): void {
    this.canvas = canvas;
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    this.canvas?.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('blur', this.onBlur);
    this.canvas = null;
  }

  /**
   * Stop looking while a panel owns the screen, and hand the cursor back.
   *
   * Releasing the lock is what makes the shop buttons clickable; re-locking is
   * left to the player's next click on the canvas rather than done silently.
   */
  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    if (!suppressed) return;
    this.dragging = false;
    if (this.locked) document.exitPointerLock();
  }

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (this.suppressed || event.button !== 0) return;
    if (this.locked) return;
    // Dragging works immediately; the lock request may be refused (or delayed
    // by the browser's own cooldown), and look must not break when it is.
    this.dragging = true;
    // The request rejects on its own promise in sandboxed frames and during
    // the browser's own lock cooldown. Neither is a fault - drag-to-look is
    // already active - so it is caught rather than left to surface as an
    // unhandled rejection.
    const request = this.canvas?.requestPointerLock?.() as unknown;
    if (request instanceof Promise) request.catch(() => undefined);
  };

  private readonly onMouseUp = (): void => {
    this.dragging = false;
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (this.suppressed) return;
    if (!this.locked && !this.dragging) return;

    this.yawValue -= event.movementX * SENSITIVITY;
    this.pitchValue += event.movementY * SENSITIVITY;

    // Wrapping keeps the accumulated yaw finite over a long session.
    if (this.yawValue > Math.PI) this.yawValue -= Math.PI * 2;
    else if (this.yawValue < -Math.PI) this.yawValue += Math.PI * 2;

    this.pitchValue =
      this.pitchValue < MIN_PITCH
        ? MIN_PITCH
        : this.pitchValue > MAX_PITCH
          ? MAX_PITCH
          : this.pitchValue;
  };

  private readonly onBlur = (): void => {
    this.dragging = false;
  };
}
