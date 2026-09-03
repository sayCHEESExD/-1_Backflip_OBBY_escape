import type { PlayerAnimationState } from '@obby/shared';
import { Group, Object3D } from 'three';
import type { AnimationInput } from '../animation/AnimationInput.js';
import { PlayerAnimator } from '../animation/PlayerAnimator.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import { PLAYER_MODEL_YAW_OFFSET } from '../config/playerVisuals.js';
import { playerModelLoader, type PlayerInstanceOptions } from './PlayerModelLoader.js';

/**
 * The visual half of a player: a cloned FBX instance, its bone rig and its
 * animator, arranged so animation can never move the player.
 *
 * Node hierarchy:
 *   root       physics transform (world position + facing yaw). Gameplay owns
 *              this; the animator never writes to it.
 *     flipPivot  raised to hip height, carries the backflip rotation so the
 *                character spins around its own centre of mass in place.
 *       visual   carries the vertical bob.
 *         model  the cloned FBX (scaled), whose bones the rig poses.
 */
export class PlayerCharacter {
  /** Attach this to the scene. Its transform is the player transform. */
  readonly root = new Group();

  readonly animator: PlayerAnimator;
  readonly rig: PlayerRig;

  private readonly flipPivot = new Group();
  private readonly visual = new Group();
  private readonly model: Object3D;

  constructor(options: PlayerInstanceOptions = {}) {
    this.model = playerModelLoader.createInstance(options);

    // player.fbx already faces +Z; the offset exists so a re-authored model
    // can be corrected without touching gameplay code.
    this.model.rotation.y = PLAYER_MODEL_YAW_OFFSET;

    this.root.add(this.flipPivot);
    this.flipPivot.add(this.visual);
    this.visual.add(this.model);

    // Bind against the model's own space so the rig is independent of where
    // the character stands or which way it faces.
    this.rig = new PlayerRig(this.model, this.model);
    this.animator = new PlayerAnimator(this.rig, this.flipPivot, this.visual);
  }

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  setYaw(yaw: number): void {
    this.root.rotation.y = yaw;
  }

  /** Advance the animation. Never changes `root`. */
  update(delta: number, input: AnimationInput): void {
    this.animator.update(delta, input);
  }

  get animationState(): PlayerAnimationState {
    return this.animator.currentState;
  }

  /** Clear animation state, e.g. after a server-issued respawn. */
  resetAnimation(): void {
    this.animator.reset();
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
