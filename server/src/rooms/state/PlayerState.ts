import { Schema, type } from '@colyseus/schema';
import {
  BACKFLIP,
  PlayerAnimationState,
  SPAWN_POSITION,
  SPAWN_ROTATION_Y,
  type PlayerAnimationState as AnimationState,
} from '@obby/shared';

/**
 * Replicated per-player state.
 *
 * Transform and motion fields are client-reported for now (see GorgeRoom).
 * Progression and the backflip allowance are written ONLY by the server and
 * are never accepted from a client.
 *
 * Note what is NOT here: bone rotations, pose data, animation timers. Clients
 * reconstruct the full animation from the compact motion fields below.
 */
export class PlayerState extends Schema {
  @type('string') sessionId = '';

  @type('float32') x: number = SPAWN_POSITION.x;
  @type('float32') y: number = SPAWN_POSITION.y;
  @type('float32') z: number = SPAWN_POSITION.z;
  @type('float32') rotationY: number = SPAWN_ROTATION_Y;

  /** Horizontal speed, drives remote walk/run blending. */
  @type('float32') speed = 0;
  /** Vertical velocity, distinguishes the rising and falling poses. */
  @type('float32') verticalVelocity = 0;
  @type('boolean') grounded = true;

  /**
   * Monotonic count of flips this player has STARTED. Remote clients replay a
   * flip whenever it increases - one integer instead of a rotation stream.
   */
  @type('uint32') flipCount = 0;

  /** Server-authoritative: flips allowed per airborne window. */
  @type('uint16') backflipCapacity: number = BACKFLIP.defaultCapacity;

  @type('string') animation: AnimationState = PlayerAnimationState.Idle;

  /** Server-authoritative progression. Not driven by gameplay yet. */
  @type('uint32') level = 1;
  @type('float32') progression = 0;
  @type('uint16') rebirths = 0;
  @type('uint32') backflips = 0;

  /** True once the client has reported at least one transform. */
  @type('boolean') ready = false;
}
