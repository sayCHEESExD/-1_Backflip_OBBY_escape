import {
  Group,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Bone,
  type Texture,
} from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { BoneName } from '../animation/rig/boneNames.js';
import type { PlayerCharacter } from '../player/PlayerCharacter.js';
import { logger } from '../util/logger.js';
import { avatarUrls, isEquipped } from './bloxityConfig.js';
import type { LegionEquipped, LegionProportions } from './sdkTypes.js';

const SCOPE = 'BloxityAvatar';

/** Which bone an accessory slot hangs from. */
const HAT_BONE: BoneName = 'Neck1';
const BACK_BONE: BoneName = 'Spine2';

/** Bones whose rest transform the proportion layer rewrites. */
const SHAPED_BONES: readonly BoneName[] = [
  'ArmL1',
  'ArmR1',
  'LegL1',
  'LegR1',
  'Neck1',
];

interface BoneRest {
  bone: Bone;
  position: Vector3;
  /** Unit vector from this bone toward its first child, in the bone's space. */
  lengthAxis: Vector3;
  /** Index (0/1/2) of the largest component of the rest position. */
  outwardAxis: 0 | 1 | 2;
}

/**
 * Puts a player's Bloxity avatar onto the game's own character.
 *
 * The canonical rig is a twelve-bone FBX driven entirely by procedural
 * animation, so this layer is deliberately ADDITIVE: it re-skins materials,
 * hangs accessories off bones and rewrites bone POSITION and SCALE. It never
 * writes a bone's rotation - that belongs to `PlayerRig.applyPose`, which
 * rebuilds every rotation from the bind pose each frame and would overwrite
 * anything written here anyway.
 *
 * The design invariant is that DEFAULTS ARE IDENTITY. Every proportion is a
 * multiplier around 1 and every formula is `rest * value`, so a player who has
 * never opened the customizer gets a character that is byte-for-byte the one
 * this game already shipped. That is what makes it safe to run this on every
 * character unconditionally.
 *
 * Body-part meshes (`/parts/...glb`) are NOT swapped in - see `applyEquipped`.
 */
export class AvatarAppearance {
  private readonly character: PlayerCharacter;
  private readonly rests = new Map<BoneName, BoneRest>();

  private readonly hatSlot = new Group();
  private readonly backSlot = new Group();

  /** This character's own material, cloned so a skin cannot leak to others. */
  private material: MeshStandardMaterial | null = null;
  private baseMap: Texture | null = null;
  private skinTexture: Texture | null = null;
  private skinId = '';

  private hatId = '';
  private backId = '';
  private readonly loadedTextures: Texture[] = [];
  private disposed = false;

  constructor(character: PlayerCharacter) {
    this.character = character;
    this.captureRests();
    this.attachSlots();
  }

  /**
   * Apply equipped cosmetics.
   *
   * Only the slots this game can honour are read. The portal also carries
   * head/torso/arm/leg part meshes, and those are deliberately left alone:
   * this game's body is ONE skinned FBX mesh bound to twelve bones, so there
   * is no head to hide and no socket to put a replacement in. Swapping them
   * would mean replacing the character and its whole procedural animation
   * system, which is a different feature, not a setting.
   */
  applyEquipped(equipped: LegionEquipped): void {
    if (this.disposed) return;
    this.applySkin(equipped.skinId);
    void this.applyAccessory('hat', equipped.hatId);
    void this.applyAccessory('back', equipped.backId);
  }

  /**
   * Apply body proportions.
   *
   * `height` is a whole-body scale and lives on the character's own avatar
   * node; the rest are bone-local and are written as multiples of the rest
   * pose captured at construction, so they compose rather than accumulate -
   * calling this twice with the same values changes nothing.
   */
  applyProportions(p: Required<LegionProportions>): void {
    if (this.disposed) return;

    // Whole-body: height stretches vertically, torsoScaleX across. Both on the
    // dedicated node so the death squash and the FBX unit scale are untouched.
    this.character.avatarRoot.scale.set(p.torsoScaleX, p.height, 1);

    // Arms out from the spine, and longer or shorter along their own axis.
    this.shiftOutward('ArmL1', p.shoulderWidth);
    this.shiftOutward('ArmR1', p.shoulderWidth);
    this.stretchAlongLength('ArmL1', p.armLength);
    this.stretchAlongLength('ArmR1', p.armLength);

    // Legs apart. The portal's range runs negative, which crosses the legs
    // over - that is the customizer's business, not something to clamp here.
    this.shiftOutward('LegL1', p.legOffsetX);
    this.shiftOutward('LegR1', p.legOffsetX);

    // Neck raises the head; headScale sizes it. The neck is the last bone in
    // its chain, so scaling it takes the head and anything hung off it - the
    // hat included, which is exactly what a bigger head needs.
    this.shiftAlongLength('Neck1', p.neckHeight);
    this.setBoneScale('Neck1', p.headScale);

    // The torso got wider, so undo that on the arms and the head, which are
    // its children and would otherwise be squashed with it.
    const inverse = p.torsoScaleX === 0 ? 1 : 1 / p.torsoScaleX;
    this.counterScaleX('ArmL1', inverse);
    this.counterScaleX('ArmR1', inverse);
    this.counterScaleX('Neck1', inverse * p.headScale);
  }

  dispose(): void {
    this.disposed = true;
    this.hatSlot.removeFromParent();
    this.backSlot.removeFromParent();
    disposeChildren(this.hatSlot);
    disposeChildren(this.backSlot);
    for (const texture of this.loadedTextures) texture.dispose();
    this.loadedTextures.length = 0;
    this.material?.dispose();
    this.material = null;
  }

  // --- setup ------------------------------------------------------------

  /**
   * Record each shaped bone's bind transform once.
   *
   * Everything below is expressed against these, which is what makes the
   * layer idempotent: without a rest to multiply, repeated writes would
   * compound and a customizer slider would run away.
   */
  private captureRests(): void {
    for (const name of SHAPED_BONES) {
      const bone = this.character.rig.getBone(name);
      if (!bone) continue;

      const position = bone.position.clone();
      const child = bone.children.find((c) => (c as Bone).isBone) ?? bone.children[0];
      const lengthAxis =
        child instanceof Object3D && child.position.lengthSq() > 1e-8
          ? child.position.clone().normalize()
          : new Vector3(0, 1, 0);

      const abs = [Math.abs(position.x), Math.abs(position.y), Math.abs(position.z)];
      const largest = abs[0] ?? 0;
      let outwardAxis: 0 | 1 | 2 = 0;
      if ((abs[1] ?? 0) > largest) outwardAxis = 1;
      if ((abs[2] ?? 0) > Math.max(largest, abs[1] ?? 0)) outwardAxis = 2;

      this.rests.set(name, { bone, position, lengthAxis, outwardAxis });
    }
  }

  /** Empty groups on the head and back bones, ready for a mesh to drop into. */
  private attachSlots(): void {
    const hatBone = this.character.rig.getBone(HAT_BONE);
    const backBone = this.character.rig.getBone(BACK_BONE);
    hatBone?.add(this.hatSlot);
    backBone?.add(this.backSlot);
  }

  // --- skin -------------------------------------------------------------

  /**
   * Swap the body texture.
   *
   * The model loader hands every character ONE shared material on purpose, so
   * writing a skin into it would put this player's avatar on everybody in the
   * room. The first skin change clones it for this character alone.
   */
  private applySkin(id: string | null | undefined): void {
    const next = isEquipped(id) ? id : '';
    if (next === this.skinId) return;
    this.skinId = next;

    if (!this.material && !this.cloneMaterial()) return;
    const material = this.material;
    if (!material) return;

    if (!next) {
      material.map = this.baseMap;
      material.needsUpdate = true;
      return;
    }

    new TextureLoader().load(
      avatarUrls.skinTexture(next),
      (texture) => {
        if (this.disposed || this.skinId !== next) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        texture.flipY = false;
        // Match the game's own player atlas: this is a blocky, low-res style
        // and smoothing the skin would make it the one soft thing on screen.
        texture.magFilter = NearestFilter;
        texture.needsUpdate = true;
        this.skinTexture?.dispose();
        this.skinTexture = texture;
        this.loadedTextures.push(texture);
        material.map = texture;
        material.needsUpdate = true;
        logger.info(SCOPE, `skin applied id=${next}`);
      },
      undefined,
      () => logger.warn(SCOPE, `skin texture missing id=${next}`),
    );
  }

  /** Give this character its own material. @returns false if there is none. */
  private cloneMaterial(): boolean {
    let found: MeshStandardMaterial | null = null;
    this.character.modelRoot.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const material = child.material;
      if (Array.isArray(material) || !(material instanceof MeshStandardMaterial)) return;
      found ??= material.clone();
      child.material = found;
    });
    if (!found) return false;
    this.material = found;
    this.baseMap = (found as MeshStandardMaterial).map;
    return true;
  }

  // --- accessories ------------------------------------------------------

  /** Load and hang a hat or a back item, or clear the slot when unequipped. */
  private async applyAccessory(
    kind: 'hat' | 'back',
    id: string | null | undefined,
  ): Promise<void> {
    const slot = kind === 'hat' ? this.hatSlot : this.backSlot;
    const next = isEquipped(id) ? id : '';
    if (kind === 'hat' ? next === this.hatId : next === this.backId) return;
    if (kind === 'hat') this.hatId = next;
    else this.backId = next;

    disposeChildren(slot);
    if (!next) return;

    const meshUrl = kind === 'hat' ? avatarUrls.hatMesh(next) : avatarUrls.backMesh(next);
    const textureUrl =
      kind === 'hat' ? avatarUrls.hatTexture(next) : avatarUrls.backTexture(next);

    try {
      const object = await new OBJLoader().loadAsync(meshUrl);
      // Equipped again while this was in flight - the newer request wins.
      if (this.disposed || (kind === 'hat' ? this.hatId : this.backId) !== next) return;

      const texture = await loadTextureOrNull(textureUrl);
      if (texture) this.loadedTextures.push(texture);

      const material = new MeshStandardMaterial({
        map: texture,
        roughness: 0.85,
        metalness: 0,
      });
      object.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        child.material = material;
        child.castShadow = true;
        // Skinned-parent bounds are unreliable, exactly as for the body.
        child.frustumCulled = false;
      });

      slot.add(object);
      logger.info(SCOPE, `${kind} applied id=${next}`);
    } catch {
      logger.warn(SCOPE, `${kind} mesh missing id=${next}`);
    }
  }

  // --- bone shaping -----------------------------------------------------

  /** Move a bone further from or closer to the body's centre line. */
  private shiftOutward(name: BoneName, factor: number): void {
    const rest = this.rests.get(name);
    if (!rest) return;
    rest.bone.position.copy(rest.position);
    const axis = rest.outwardAxis;
    const component = axis === 0 ? rest.position.x : axis === 1 ? rest.position.y : rest.position.z;
    const shifted = component * factor;
    if (axis === 0) rest.bone.position.x = shifted;
    else if (axis === 1) rest.bone.position.y = shifted;
    else rest.bone.position.z = shifted;
  }

  /** Move a bone along the axis pointing at its child - a longer neck. */
  private shiftAlongLength(name: BoneName, factor: number): void {
    const rest = this.rests.get(name);
    if (!rest) return;
    const extra = rest.lengthAxis.clone().multiplyScalar((factor - 1) * rest.position.length());
    rest.bone.position.copy(rest.position).add(extra);
  }

  /** Stretch a limb along its own length without thickening it. */
  private stretchAlongLength(name: BoneName, factor: number): void {
    const rest = this.rests.get(name);
    if (!rest) return;
    const a = rest.lengthAxis;
    rest.bone.scale.set(
      1 + (factor - 1) * Math.abs(a.x),
      1 + (factor - 1) * Math.abs(a.y),
      1 + (factor - 1) * Math.abs(a.z),
    );
  }

  private setBoneScale(name: BoneName, factor: number): void {
    this.rests.get(name)?.bone.scale.setScalar(factor);
  }

  /** Cancel a parent's X scale on one child, so only the parent widens. */
  private counterScaleX(name: BoneName, factor: number): void {
    const rest = this.rests.get(name);
    if (!rest) return;
    rest.bone.scale.x *= factor;
  }
}

const disposeChildren = (group: Group): void => {
  for (const child of [...group.children]) {
    child.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      node.geometry.dispose();
      const material = node.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    });
    group.remove(child);
  }
};

/** A missing accessory texture is normal - the mesh still renders untextured. */
const loadTextureOrNull = (url: string): Promise<Texture | null> =>
  new Promise((resolve) => {
    new TextureLoader().load(
      url,
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        texture.flipY = false;
        texture.magFilter = NearestFilter;
        resolve(texture);
      },
      undefined,
      () => resolve(null),
    );
  });
