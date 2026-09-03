import type { PlayerMotionState } from '@obby/shared';
import { Vector3 } from 'three';
import { createAnimationInput, type AnimationInput } from '../animation/AnimationInput.js';
import { GHOST_OPACITY, tintForSession } from '../config/playerVisuals.js';
import { PlayerCharacter } from './PlayerCharacter.js';

/** Seconds to converge on a newly received network transform. */
const INTERPOLATION_RATE = 12;

/**
 * A replicated player owned by the server.
 *
 * Its animation is RECONSTRUCTED locally from the compact motion state
 * (speed, vertical velocity, grounded, flip counter) using the same
 * PlayerAnimator the local player runs. No bone transforms cross the network.
 *
 * Remote players are GHOSTED: translucent and non-colliding, so they can never
 * block another player's run through the obby.
 */
export class RemotePlayer {
  readonly sessionId: string;
  readonly character: PlayerCharacter;

  private readonly current = new Vector3();
  private readonly target = new Vector3();
  private currentYaw = 0;
  private targetYaw = 0;
  private hasSnapped = false;

  private readonly animationInput: AnimationInput = createAnimationInput();

  /** Last flip counter seen, so an increase can be replayed as a flip. */
  private lastFlipCount = 0;
  private flipsToPlay = 0;
  private wasGrounded = true;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.character = new PlayerCharacter({
      tint: tintForSession(sessionId),
      opacity: GHOST_OPACITY,
    });
  }

  /** Feed the latest authoritative transform. Applied smoothly, not instantly. */
  setNetworkTransform(x: number, y: number, z: number, rotationY: number): void {
    this.target.set(x, y, z);
    this.targetYaw = rotationY;

    if (!this.hasSnapped) {
      this.hasSnapped = true;
      this.current.copy(this.target);
      this.currentYaw = this.targetYaw;
      this.applyToCharacter();
    }
  }

  /**
   * Feed the replicated motion signals.
   *
   * A rise in `flipCount` means the remote player started a flip; each
   * increment is queued so a burst of chained flips replays as several
   * rotations rather than one.
   */
  setMotionState(motion: PlayerMotionState): void {
    this.animationInput.horizontalSpeed = motion.speed;
    this.animationInput.verticalVelocity = motion.verticalVelocity;
    this.animationInput.grounded = motion.grounded;

    const flipCount = motion.flipCount;
    if (flipCount > this.lastFlipCount) {
      this.flipsToPlay += flipCount - this.lastFlipCount;
    }
    // Counters only ever reset downward on respawn.
    this.lastFlipCount = flipCount;
  }

  update(delta: number): void {
    const alpha = 1 - Math.exp(-INTERPOLATION_RATE * delta);
    this.current.lerp(this.target, alpha);
    this.currentYaw = interpolateAngle(this.currentYaw, this.targetYaw, alpha);
    this.applyToCharacter();

    this.animationInput.jumpStarted =
      this.wasGrounded && !this.animationInput.grounded;
    this.animationInput.landed = !this.wasGrounded && this.animationInput.grounded;
    this.wasGrounded = this.animationInput.grounded;

    // Play at most one queued flip per frame so chained flips stay sequential.
    this.animationInput.backflipRequested = this.flipsToPlay > 0;
    if (this.flipsToPlay > 0) this.flipsToPlay -= 1;

    this.character.update(delta, this.animationInput);
  }

  dispose(): void {
    this.character.dispose();
  }

  private applyToCharacter(): void {
    this.character.setPosition(this.current.x, this.current.y, this.current.z);
    this.character.setYaw(this.currentYaw);
  }
}

/** Lerp between two angles along the shortest arc. */
const interpolateAngle = (from: number, to: number, alpha: number): number => {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * alpha;
};
