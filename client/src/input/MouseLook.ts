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
 * Pointer lock follows the PANEL state, not clicks:
 *
 *   gameplay        -> cursor hidden, mouse steers the camera
 *   a panel opens   -> lock released, cursor free for its buttons
 *   the panel closes-> lock retaken, camera resumes at once
 *   Escape, panel up-> the panel closes and the lock comes straight back
 *   Escape, playing -> the browser releases; a click on the world resumes
 *
 * The two Escapes are deliberately different, and telling them apart is the
 * whole job: one is "put me back in the game", the other is "let me out". The
 * only thing that separates them is whether a panel was up, which is exactly
 * what `suppressed` already records.
 *
 * The lock is taken on the player's FIRST gesture rather than waiting for a
 * deliberate click on the world. A browser will not grant it without one, so
 * "automatic" can only mean "on the first thing the player does" - and since a
 * keypress counts, pressing W to walk is enough. There is no click-to-play
 * step.
 *
 * Shops are opened by key, not by clicking the world, so nothing here needs to
 * distinguish a click on a panel from a click on the game: while a panel is up
 * this source is suppressed outright.
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

  /**
   * Whether the player has done anything yet.
   *
   * A page cannot lock the pointer before its first user gesture, so this
   * records that the gesture has happened and the lock may be taken - and
   * retaken - from then on.
   */
  private armed = false;

  /**
   * A re-lock that is owed but has not been granted.
   *
   * Closing a panel with Escape asks for the lock back, but a browser will not
   * grant it from that keystroke: the HTML spec excludes Esc from the input
   * events that count as user activation, precisely so a page cannot re-trap a
   * cursor the user just escaped. The request is still made - some browsers
   * and embeddings honour it - and when it is refused the debt is remembered
   * and paid off on the player's very next real gesture, which is the W press
   * or click they were about to make anyway.
   *
   * Set ONLY by a panel closing. An Escape during gameplay must never set it,
   * or the first movement key would drag the player back into a lock they just
   * asked to leave.
   */
  private pendingLock = false;

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
    window.addEventListener('keydown', this.onFirstGesture);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  detach(): void {
    this.canvas?.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('keydown', this.onFirstGesture);
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
    const wasSuppressed = this.suppressed;
    this.suppressed = suppressed;

    if (suppressed) {
      this.dragging = false;
      this.pendingLock = false;
      if (this.locked) document.exitPointerLock();
      return;
    }

    // The panel closed. Take the lock straight back so the camera resumes
    // without the player having to click the world first - closing a menu IS
    // the request to go back to playing. If the browser refuses, `pendingLock`
    // keeps the request alive; it is cleared the moment the lock arrives.
    if (wasSuppressed && this.armed) {
      this.pendingLock = true;
      this.requestLock();
    }
  }

  /**
   * Arm the lock and take it as soon as the browser allows.
   *
   * Called from the first real user gesture. Kept separate from the gesture
   * handlers so an embedding host - a portal SDK owning its own menu and
   * pointer-lock lifecycle - has one method to drive instead of having to
   * synthesise clicks.
   */
  engage(): void {
    this.armed = true;
    if (!this.suppressed) this.requestLock();
  }

  /** Release the lock and stop looking, without suppressing the source. */
  release(): void {
    this.dragging = false;
    this.pendingLock = false;
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
  /**
   * Any keypress is a user gesture, and the first one arms the lock.
   *
   * This is what removes the click-to-play step: the player presses W to walk
   * and the cursor disappears on the same keystroke. Escape is excluded - it
   * is how the player asks to be LET OUT, so it must never be the thing that
   * puts them back in.
   */
  private readonly onFirstGesture = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      // Two very different Escapes arrive here, and `ModalLayer` has already
      // told them apart: it consumes the one that closed a panel by preventing
      // the default, and leaves the gameplay one alone for the browser. A
      // consumed Escape means "put me back in the game", so the re-lock it
      // just asked for stands. An unconsumed one means "let me out", and any
      // re-lock still owed is written off so no movement key can quietly take
      // the cursor back.
      if (!event.defaultPrevented) this.pendingLock = false;
      return;
    }
    if (!this.armed) {
      this.engage();
      return;
    }
    // A re-lock the browser refused during a panel close, paid off by the
    // first keystroke that DOES carry user activation.
    if (this.pendingLock && !this.locked && !this.suppressed) this.requestLock();
  };

  /** A click on the world resumes play after Escape released the lock. */
  private readonly onMouseDown = (event: MouseEvent): void => {
    if (this.suppressed || event.button !== 0) return;
    this.armed = true;
    if (this.locked) return;

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
      this.pendingLock = false;
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
