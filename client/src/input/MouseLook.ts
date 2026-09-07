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
 * Pointer lock is a TOGGLE on the canvas, and the canvas alone:
 *
 *   click the game  -> cursor hidden, mouse steers the camera
 *   click again, or press Escape -> cursor back, mouse steers nothing
 *   click the game  -> hidden again
 *
 * Nothing re-locks on its own. That is the point: the cursor is the only way
 * to use the shops, so taking it back without being asked - on a keypress, on
 * a panel closing, on the tab regaining focus - fights the player the moment
 * they want to click something. The UI panels are DOM above the canvas, so a
 * click on a button or a backdrop never reaches this listener and can never
 * re-lock by accident.
 *
 * Touch look goes through the SAME accumulator via `addLookDelta`, so the
 * pitch limits, the yaw wrap and the suppression rule exist once and cannot
 * drift between the two devices.
 */
export class MouseLook {
  private canvas: HTMLElement | null = null;

  private yawValue = 0;
  private pitchValue = 0.22;
  private suppressed = false;
  /** True while the left button is down and the pointer is NOT locked. */
  private dragging = false;

  /**
   * Whether this browser has ever actually granted the lock.
   *
   * Only used to decide whether drag-to-look is needed. Where pointer lock
   * works, holding the button must NOT steer - the cursor is free for the UI
   * and dragging on the world would be a second, invisible camera control.
   * Where it is refused - a sandboxed frame, an embedded preview - dragging
   * stays as the fallback, because otherwise there is no way to look around
   * at all.
   */
  private lockEverGranted = false;

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
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  detach(): void {
    this.canvas?.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.canvas = null;
  }

  /**
   * Stop looking while a panel owns the screen, and hand the cursor back.
   *
   * Releasing the lock is what makes the shop buttons clickable. Closing the
   * panel deliberately does NOT take it back: the player may well want to open
   * another shop, and re-grabbing the cursor the instant a panel closes is the
   * behaviour that makes a menu feel like it is fighting you. One click on the
   * world resumes play.
   */
  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    if (!suppressed) return;
    this.dragging = false;
    if (this.locked) document.exitPointerLock();
  }

  /**
   * Toggle the lock. This is the ONLY thing that ever acquires it.
   *
   * Bound to the canvas, so it hears clicks on the game world and nothing
   * else: every panel, button and backdrop is DOM above the canvas and stops
   * the event before it arrives. That is what keeps a click on a shop from
   * grabbing the cursor the player is using to click it.
   */
  private readonly onMouseDown = (event: MouseEvent): void => {
    if (this.suppressed || event.button !== 0) return;

    if (this.locked) {
      // Second click: hand the cursor back for the UI.
      document.exitPointerLock();
      return;
    }

    // Only where the lock is refused outright does holding the button steer;
    // see `lockEverGranted`.
    this.dragging = !this.lockEverGranted;
    this.requestLock();
  };

  /**
   * The lock was gained or lost.
   *
   * Nothing is re-acquired here. Escape, a tab switch and the browser's own
   * release all land in the same place - cursor visible, camera still - and
   * the player takes control back by clicking the world.
   */
  private readonly onLockChange = (): void => {
    if (this.locked) {
      this.lockEverGranted = true;
      // A granted lock supersedes drag-to-look; the two must never both steer.
      this.dragging = false;
      return;
    }
    this.dragging = false;
  };

  /**
   * Ask for the lock, tolerating every way a browser can say no.
   *
   * The request rejects on its own promise in sandboxed frames and during the
   * browser's own post-Escape cooldown. Neither is a fault - drag-to-look
   * still works - so it is caught rather than left to surface as an unhandled
   * rejection.
   */
  private requestLock(): void {
    if (!this.canvas || this.locked || this.suppressed) return;
    const request = this.canvas.requestPointerLock?.() as unknown;
    if (request instanceof Promise) request.catch(() => undefined);
  }

  private readonly onMouseUp = (): void => {
    this.dragging = false;
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (this.suppressed) return;
    if (!this.locked && !this.dragging) return;
    this.addLookDelta(event.movementX * SENSITIVITY, event.movementY * SENSITIVITY);
  };

  /**
   * Apply a look delta already scaled to RADIANS.
   *
   * The one place yaw and pitch are written. Mouse movement and touch drags
   * both arrive here, so neither can invent its own pitch clamp.
   */
  addLookDelta(deltaYaw: number, deltaPitch: number): void {
    if (this.suppressed) return;
    if (!Number.isFinite(deltaYaw) || !Number.isFinite(deltaPitch)) return;

    this.yawValue -= deltaYaw;
    this.pitchValue += deltaPitch;

    // Wrapping keeps the accumulated yaw finite over a long session.
    if (this.yawValue > Math.PI) this.yawValue -= Math.PI * 2;
    else if (this.yawValue < -Math.PI) this.yawValue += Math.PI * 2;

    this.pitchValue =
      this.pitchValue < MIN_PITCH
        ? MIN_PITCH
        : this.pitchValue > MAX_PITCH
          ? MAX_PITCH
          : this.pitchValue;
  }

  private readonly onBlur = (): void => {
    this.dragging = false;
  };
}
