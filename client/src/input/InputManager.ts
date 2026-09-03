import { createInputState, type InputState } from './InputState.js';
import { KeyboardSource } from './KeyboardSource.js';

/**
 * Aggregates every input source into a single normalised InputState.
 *
 * Only the keyboard source exists at this milestone. Touch controls plug in
 * here later without the player controller changing at all.
 */
export class InputManager {
  private readonly state: InputState = createInputState();
  private readonly keyboard = new KeyboardSource();

  attach(): void {
    this.keyboard.attach();
  }

  detach(): void {
    this.keyboard.detach();
  }

  /** Recompute the snapshot for this frame. */
  sample(): Readonly<InputState> {
    this.state.moveX = 0;
    this.state.moveZ = 0;
    this.state.jump = false;
    this.state.sprint = false;

    this.keyboard.apply(this.state);

    // Normalise so diagonals are not faster than cardinals.
    const magnitude = Math.hypot(this.state.moveX, this.state.moveZ);
    if (magnitude > 1) {
      this.state.moveX /= magnitude;
      this.state.moveZ /= magnitude;
    }

    return this.state;
  }
}
