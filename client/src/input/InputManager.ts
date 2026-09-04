import { createInputState, type InputState } from './InputState.js';
import { KeyboardSource } from './KeyboardSource.js';
import { MouseLook } from './MouseLook.js';

/**
 * Aggregates every input source into a single normalised InputState.
 *
 * Only the keyboard source exists at this milestone. Touch controls plug in
 * here later without the player controller changing at all.
 */
export class InputManager {
  private readonly state: InputState = createInputState();
  private readonly keyboard = new KeyboardSource();
  /** Camera look. Feeds the camera, never the character's movement. */
  readonly look = new MouseLook();

  /** True while a full-screen panel owns the input. */
  private suppressed = false;

  /**
   * Stop feeding movement to the player without detaching the sources.
   *
   * Used while a shop or the rebirth panel is up, so the character does not
   * run off behind the popup. The keyboard keeps listening, so releasing a key
   * while a panel is open is still noticed and the player does not inherit a
   * stuck key the moment it closes.
   */
  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    // Looking around is suppressed with the same call, and the pointer lock is
    // released so the panel's own buttons can be clicked.
    this.look.setSuppressed(suppressed);
  }

  attach(canvas: HTMLElement): void {
    this.keyboard.attach();
    this.look.attach(canvas);
  }

  detach(): void {
    this.keyboard.detach();
    this.look.detach();
  }

  /** Recompute the snapshot for this frame. */
  sample(): Readonly<InputState> {
    this.state.moveX = 0;
    this.state.moveZ = 0;
    this.state.jump = false;
    this.state.sprint = false;

    this.keyboard.apply(this.state);

    // A panel is up: keep sampling (so held keys are tracked) but hand the
    // player a neutral snapshot. Closing the panel restores control on the
    // very next frame, with no latch to clear.
    if (this.suppressed) {
      this.state.moveX = 0;
      this.state.moveZ = 0;
      this.state.jump = false;
      this.state.sprint = false;
      return this.state;
    }

    // Normalise so diagonals are not faster than cardinals.
    const magnitude = Math.hypot(this.state.moveX, this.state.moveZ);
    if (magnitude > 1) {
      this.state.moveX /= magnitude;
      this.state.moveZ /= magnitude;
    }

    return this.state;
  }
}
