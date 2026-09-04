import type { PlayerAnimationState } from '@obby/shared';
import { Group, Object3D } from 'three';
import type { AnimationInput } from '../animation/AnimationInput.js';
import { PlayerAnimator } from '../animation/PlayerAnimator.js';
import { AuraEffect } from './AuraEffect.js';
import { TrailEffect } from './TrailEffect.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import { BootModel } from './BootModel.js';
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

  /**
   * World-space effects that must NOT follow the character.
   *
   * A trail is what the player has already passed through, so it cannot be
   * parented to a moving root. Whoever adds `root` to the scene adds this too.
   */
  readonly worldRoot = new Group();

  readonly animator: PlayerAnimator;
  readonly rig: PlayerRig;
  readonly boots: BootModel;
  /** Worn glow. Parented to the character, so it follows the animation. */
  readonly aura = new AuraEffect();
  /** Ribbon left behind. Lives in `worldRoot`, not on the character. */
  readonly trail = new TrailEffect();

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
    // Cosmetic only - parented to the leg bones so they follow the animation.
    this.boots = new BootModel([this.rig.getBone('LegL2'), this.rig.getBone('LegR2')]);

    this.root.add(this.aura.root);
    this.worldRoot.add(this.trail.root);
  }

  /** Show the cosmetics the server says this player has equipped. */
  setCosmetics(trailSlot: number, auraSlot: number): void {
    this.trail.setSlot(trailSlot);
    this.aura.setSlot(auraSlot);
  }

  /**
   * Advance the cosmetic effects.
   *
   * Separate from `update` because the trail needs the player's world position
   * and speed, which the animation input does not carry.
   */
  updateEffects(delta: number, x: number, y: number, z: number, speed: number): void {
    this.aura.update(delta);
    this.trail.update(delta, x, y, z, speed);
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
    // The ribbon describes a run that no longer exists; keeping it would draw
    // a line from the old position to the spawn point.
    this.trail.clear();
  }

  dispose(): void {
    this.boots.dispose();
    this.aura.dispose();
    this.trail.dispose();
    this.root.removeFromParent();
    this.worldRoot.removeFromParent();
  }
}
