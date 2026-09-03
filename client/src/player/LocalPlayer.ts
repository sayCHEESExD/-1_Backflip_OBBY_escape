import {
  BACKFLIP,
  MOVEMENT,
  SPAWN_POSITION,
  SPAWN_ROTATION_Y,
  type PlayerAnimationState,
  type PlayerMotionState,
} from '@obby/shared';
import { Vector3 } from 'three';
import { createAnimationInput, type AnimationInput } from '../animation/AnimationInput.js';
import type { InputState } from '../input/InputState.js';
import { PlayerCharacter } from './PlayerCharacter.js';

/** Ground height for the temporary test floor. Replaced by real collision later. */
const GROUND_Y = 0;

const MOVE_DIRECTION = new Vector3();

/**
 * The locally controlled player.
 *
 * Movement is simulated here and reported to the server. Animation is derived
 * from this simulation but never feeds back into it: the animator receives a
 * read-only snapshot, and nothing in the animation pipeline can change
 * position or velocity. A backflip in particular leaves horizontal velocity
 * completely untouched - the jump arc is identical whether or not the player
 * flips.
 */
export class LocalPlayer {
  readonly character: PlayerCharacter;

  readonly position = new Vector3(SPAWN_POSITION.x, SPAWN_POSITION.y, SPAWN_POSITION.z);
  readonly velocity = new Vector3();

  private yaw = SPAWN_ROTATION_Y;
  private grounded = true;
  private jumpLatched = false;

  /** Server-authoritative allowance of flips per airborne window. */
  private backflipCapacity = BACKFLIP.defaultCapacity;
  /** Flips still available before touching the ground again. */
  private backflipsRemaining = BACKFLIP.defaultCapacity;
  /** Monotonic count of flips STARTED; replicated so remotes can mirror them. */
  private flipCount = 0;

  private readonly animationInput: AnimationInput = createAnimationInput();

  constructor() {
    this.character = new PlayerCharacter();
    this.syncCharacter();
  }

  /** Horizontal speed in world units per second. Jump distance follows from it. */
  get horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get rotationY(): number {
    return this.yaw;
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  get animationState(): PlayerAnimationState {
    return this.character.animationState;
  }

  /** Flips the player may still perform before landing. */
  get flipsRemaining(): number {
    return this.backflipsRemaining;
  }

  /** Flips currently in flight - distinct from how many are available. */
  get flipsInProgress(): number {
    return this.character.animator.isFlipping ? this.character.animator.flipIndex : 0;
  }

  /** Compact motion state for replication. No bone data is ever sent. */
  get motionState(): PlayerMotionState {
    return {
      speed: this.horizontalSpeed,
      verticalVelocity: this.velocity.y,
      grounded: this.grounded,
      flipCount: this.flipCount,
    };
  }

  /**
   * Apply the server's flip allowance. Availability is gameplay state and is
   * owned by the server; the client only mirrors it.
   */
  setBackflipCapacity(capacity: number): void {
    const clamped = Math.max(0, Math.min(capacity, BACKFLIP.maxCapacity));
    if (clamped === this.backflipCapacity) return;
    this.backflipCapacity = clamped;
    if (this.grounded) this.backflipsRemaining = clamped;
  }

  /** Snap to a transform, e.g. on a server-issued respawn. */
  teleport(x: number, y: number, z: number, rotationY: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.yaw = rotationY;
    this.grounded = true;
    this.backflipsRemaining = this.backflipCapacity;
    this.character.resetAnimation();
    this.syncCharacter();
  }

  /**
   * Advance one frame.
   *
   * @param input     normalised input snapshot
   * @param cameraYaw yaw the camera is facing, so movement is camera-relative
   */
  update(delta: number, input: Readonly<InputState>, cameraYaw: number): void {
    const wasGrounded = this.grounded;

    this.animationInput.jumpStarted = false;
    this.animationInput.landed = false;
    this.animationInput.backflipRequested = false;

    this.applyActions(input);
    this.applyHorizontal(delta, input, cameraYaw);
    this.velocity.y -= MOVEMENT.gravity * delta;

    this.position.addScaledVector(this.velocity, delta);
    this.resolveGround();

    if (!wasGrounded && this.grounded) {
      this.animationInput.landed = true;
      this.backflipsRemaining = this.backflipCapacity;
    }

    this.syncCharacter();
    this.updateAnimation(delta);
  }

  /**
   * Jump and backflip both come from the jump control: pressing it on the
   * ground jumps, pressing it again in the air spends one available flip.
   * Availability is checked here (gameplay), not in the animator.
   */
  private applyActions(input: Readonly<InputState>): void {
    const pressed = input.jump && !this.jumpLatched;
    this.jumpLatched = input.jump;
    if (!pressed) return;

    if (this.grounded) {
      this.velocity.y = MOVEMENT.jumpVelocity;
      this.grounded = false;
      this.animationInput.jumpStarted = true;
      return;
    }

    if (this.backflipsRemaining > 0) {
      // Consume one availability, start one performance. Velocity is
      // deliberately untouched: a flip must not alter the jump arc.
      this.backflipsRemaining -= 1;
      this.flipCount += 1;
      this.animationInput.backflipRequested = true;
    }
  }

  private applyHorizontal(
    delta: number,
    input: Readonly<InputState>,
    cameraYaw: number,
  ): void {
    const hasInput = input.moveX !== 0 || input.moveZ !== 0;

    // Rotate the raw stick input into world space using the camera's yaw.
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    MOVE_DIRECTION.set(
      input.moveX * cos + input.moveZ * sin,
      0,
      input.moveZ * cos - input.moveX * sin,
    );

    const targetSpeed = input.sprint ? MOVEMENT.runSpeed : MOVEMENT.walkSpeed;
    const control = this.grounded ? 1 : MOVEMENT.airControl;

    if (hasInput) {
      const accel = MOVEMENT.acceleration * control * delta;
      const rate = Math.min(accel / targetSpeed, 1);
      this.velocity.x += (MOVE_DIRECTION.x * targetSpeed - this.velocity.x) * rate;
      this.velocity.z += (MOVE_DIRECTION.z * targetSpeed - this.velocity.z) * rate;

      const desiredYaw = Math.atan2(MOVE_DIRECTION.x, MOVE_DIRECTION.z);
      this.yaw = rotateTowards(this.yaw, desiredYaw, MOVEMENT.turnSpeed * delta);
    } else if (this.grounded) {
      const drop = MOVEMENT.deceleration * delta;
      const speed = this.horizontalSpeed;
      // The speed guard matters independently of `drop`: dividing by a zero
      // speed would yield Infinity, and 0 * Infinity is NaN.
      if (speed <= drop || speed < 1e-6) {
        this.velocity.x = 0;
        this.velocity.z = 0;
      } else {
        const scale = (speed - drop) / speed;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }
    }
  }

  private resolveGround(): void {
    // Leaving the ground by ANY means - jumping, walking off an edge, being
    // moved - must clear `grounded`, or the fall animation never plays and a
    // second ground jump stays available in mid-air.
    if (this.position.y > GROUND_Y) {
      this.grounded = false;
      return;
    }
    // Still rising on the frame a jump was launched: not grounded yet.
    if (this.velocity.y > 0) {
      this.grounded = false;
      return;
    }
    this.position.y = GROUND_Y;
    this.velocity.y = 0;
    this.grounded = true;
  }

  private updateAnimation(delta: number): void {
    this.animationInput.grounded = this.grounded;
    this.animationInput.horizontalSpeed = this.horizontalSpeed;
    this.animationInput.verticalVelocity = this.velocity.y;
    this.character.update(delta, this.animationInput);
  }

  private syncCharacter(): void {
    this.character.setPosition(this.position.x, this.position.y, this.position.z);
    this.character.setYaw(this.yaw);
  }
}

/** Shortest-path rotation from `current` toward `target`, capped at `maxDelta`. */
const rotateTowards = (current: number, target: number, maxDelta: number): number => {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
};
