import {
  BOOT_SHOP,
  BOOT_TIERS,
  SPAWN_PLATFORM,
  canAffordBoot,
  formatSpeed,
  isBootOwned,
  type BootTier,
} from '@obby/shared';
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
} from 'three';
import { WORLD_COLORS } from '../config/worldVisuals.js';
import { createSneakerGeometry } from '../rendering/SneakerGeometry.js';

/** One pedestal's label, kept so it can be redrawn as Wins change. */
interface PedestalLabel {
  readonly tier: BootTier;
  readonly texture: CanvasTexture;
  readonly canvas: HTMLCanvasElement;
}

/**
 * The Win Shop: a row of sneaker pedestals along the right-hand side of the
 * starting platform, with a lit sign behind them.
 *
 * Display only. What is owned and equipped is decided by the server; this
 * redraws the labels and highlights to match.
 */
export class BootShop {
  readonly root = new Group();

  private readonly geometries: BoxGeometry[] = [];
  private readonly planes: PlaneGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly labels: PedestalLabel[] = [];
  /** Holder per slot, carrying the sneaker's upper and sole. */
  private readonly bootNodes = new Map<number, Group>();
  private readonly bootMaterials = new Map<number, MeshLambertMaterial>();

  private sneakerUpper: BufferGeometry | null = null;
  private sneakerSole: BufferGeometry | null = null;
  private signTexture: CanvasTexture | null = null;
  private spinTime = 0;

  private lastWins = -1;
  private lastOwned = -1;
  private lastEquipped = -1;

  constructor() {
    this.buildBackdrop();
    this.buildSign();
    this.buildPedestals();
  }

  /** Slowly turn the display sneakers so they read as items, not scenery. */
  update(delta: number): void {
    this.spinTime += delta;
    for (const node of this.bootNodes.values()) {
      node.rotation.y = Math.sin(this.spinTime * 0.5 + node.position.z) * 0.55;
    }
  }

  /** Redraw for the player's Wins, owned boots and equipped slot. */
  setState(wins: number, ownedMask: number, equippedSlot: number): void {
    if (
      wins === this.lastWins &&
      ownedMask === this.lastOwned &&
      equippedSlot === this.lastEquipped
    ) {
      return;
    }
    this.lastWins = wins;
    this.lastOwned = ownedMask;
    this.lastEquipped = equippedSlot;

    for (const label of this.labels) {
      drawPedestalLabel(label.canvas, label.tier, wins, ownedMask, equippedSlot);
      label.texture.needsUpdate = true;

      const node = this.bootNodes.get(label.tier.slot);
      const material = this.bootMaterials.get(label.tier.slot);
      if (!node || !material) continue;

      const owned = isBootOwned(ownedMask, label.tier.slot);
      const affordable = canAffordBoot(label.tier, wins);

      // Owned boots sit proud in full colour; affordable ones glow to invite a
      // purchase; the rest stay dark and low.
      node.position.y = SPAWN_PLATFORM.topY + (owned || affordable ? 1.15 : 0.85);
      material.color.set(owned || affordable ? label.tier.color : 0x39414d);
      material.emissive.set(
        affordable && !owned ? new Color(label.tier.color) : new Color(0x000000),
      );
      material.emissiveIntensity = affordable && !owned ? 0.5 : 0;
    }
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const plane of this.planes) plane.dispose();
    for (const material of this.materials) material.dispose();
    for (const label of this.labels) label.texture.dispose();
    this.signTexture?.dispose();
    this.sneakerUpper?.dispose();
    this.sneakerSole?.dispose();
  }

  /**
   * Dark backing wall. It also closes the RIGHT side of the starting area -
   * the left and back are walled separately in SpawnArea.
   */
  private buildBackdrop(): void {
    const geometry = new BoxGeometry(1.6, 15, SPAWN_PLATFORM.length);
    const material = new MeshLambertMaterial({ color: 0x2f4a63 });
    this.geometries.push(geometry);
    this.materials.push(material);

    const wall = new Mesh(geometry, material);
    wall.position.set(BOOT_SHOP.wallX, SPAWN_PLATFORM.topY + 7.5, SPAWN_PLATFORM.centerZ);
    wall.receiveShadow = true;
    this.root.add(wall);
  }

  /** The glowing green "Win Shop" sign. */
  private buildSign(): void {
    const rowLength = (BOOT_TIERS.length - 1) * BOOT_SHOP.spacingZ;
    const centerZ = BOOT_SHOP.firstZ + rowLength / 2;

    const panelGeometry = new BoxGeometry(0.5, 5, rowLength * 0.8);
    const panelMaterial = new MeshBasicMaterial({ color: 0x3ddc4a });
    this.geometries.push(panelGeometry);
    this.materials.push(panelMaterial);

    const panel = new Mesh(panelGeometry, panelMaterial);
    panel.position.set(BOOT_SHOP.wallX + 1.0, SPAWN_PLATFORM.topY + BOOT_SHOP.signY, centerZ);
    this.root.add(panel);

    const textGeometry = new PlaneGeometry(rowLength * 0.76, 4.0);
    this.planes.push(textGeometry);

    const texture = new CanvasTexture(drawSign());
    texture.colorSpace = SRGBColorSpace;
    const textMaterial = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
      fog: false,
    });
    this.materials.push(textMaterial);
    // The sign never changes, so it is not registered for redraws - but its
    // texture still needs disposing.
    this.signTexture = texture;

    const text = new Mesh(textGeometry, textMaterial);
    text.position.set(BOOT_SHOP.wallX + 1.35, SPAWN_PLATFORM.topY + BOOT_SHOP.signY, centerZ);
    // Face +X, into the walkable side of the platform.
    text.rotation.y = Math.PI / 2;
    this.root.add(text);
  }

  private buildPedestals(): void {
    const padGeometry = new BoxGeometry(3.6, 0.4, 3.6);
    const labelGeometry = new PlaneGeometry(6.4, 3.2);
    this.geometries.push(padGeometry);
    this.planes.push(labelGeometry);

    const padMaterial = new MeshLambertMaterial({ color: WORLD_COLORS.collectionPad });
    this.materials.push(padMaterial);

    // The same sneaker the player wears, shown larger on the stands.
    const sneaker = createSneakerGeometry();
    this.sneakerUpper = sneaker.upper;
    this.sneakerSole = sneaker.sole;
    const soleMaterial = new MeshLambertMaterial({ color: 0xf2f5f7 });
    this.materials.push(soleMaterial);

    BOOT_TIERS.forEach((tier, index) => {
      const z = BOOT_SHOP.firstZ + index * BOOT_SHOP.spacingZ;

      const pad = new Mesh(padGeometry, padMaterial);
      pad.position.set(BOOT_SHOP.x, SPAWN_PLATFORM.topY + 0.2, z);
      pad.receiveShadow = true;
      this.root.add(pad);

      const bootMaterial = new MeshLambertMaterial({ color: tier.color });
      this.materials.push(bootMaterial);

      const holder = new Group();
      holder.position.set(BOOT_SHOP.x, SPAWN_PLATFORM.topY + 1.15, z);
      for (const [geometry, material] of [
        [sneaker.upper, bootMaterial],
        [sneaker.sole, soleMaterial],
      ] as const) {
        const mesh = new Mesh(geometry, material);
        mesh.scale.set(1.9, 1.9, 2.6);
        mesh.castShadow = true;
        holder.add(mesh);
      }
      this.root.add(holder);
      this.bootNodes.set(tier.slot, holder);
      this.bootMaterials.set(tier.slot, bootMaterial);

      const canvas = drawPedestalLabel(createLabelCanvas(), tier, 0, 1, 1);
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const labelMaterial = new MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        fog: false,
      });
      this.materials.push(labelMaterial);

      const label = new Mesh(labelGeometry, labelMaterial);
      label.position.set(BOOT_SHOP.x - 0.3, SPAWN_PLATFORM.topY + 4.4, z);
      label.rotation.y = Math.PI / 2;
      this.root.add(label);

      this.labels.push({ tier, texture, canvas });
    });
  }
}

const createLabelCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 192;
  return canvas;
};

const outlined = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  fill: string,
  outline = 9,
): void => {
  ctx.font = font;
  ctx.lineJoin = 'round';
  ctx.lineWidth = outline;
  ctx.strokeStyle = '#121b28';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
};

/** "+N/Step" over EQUIPPED / OWNED / a buy prompt / the Wins still required. */
const drawPedestalLabel = (
  canvas: HTMLCanvasElement,
  tier: BootTier,
  wins: number,
  ownedMask: number,
  equippedSlot: number,
): HTMLCanvasElement => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const w = canvas.width;
  ctx.clearRect(0, 0, w, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const owned = isBootOwned(ownedMask, tier.slot);
  outlined(
    ctx,
    `+${tier.speedPerStep}/Step`,
    w / 2,
    44,
    'bold 54px system-ui, sans-serif',
    '#ffffff',
  );

  if (equippedSlot === tier.slot) {
    outlined(ctx, 'EQUIPPED', w / 2, 120, 'bold 46px system-ui, sans-serif', '#5dff7a');
  } else if (owned) {
    outlined(ctx, 'OWNED', w / 2, 120, 'bold 46px system-ui, sans-serif', '#ffd75e');
  } else if (canAffordBoot(tier, wins)) {
    // Affordable but not bought - tell the player the price and to stand on it.
    outlined(
      ctx,
      `WALK OVER: ${formatSpeed(tier.winsRequired)}`,
      w / 2,
      112,
      'bold 34px system-ui, sans-serif',
      '#7dffa8',
    );
    outlined(ctx, 'WINS', w / 2, 158, 'bold 36px system-ui, sans-serif', '#c8ffd9', 7);
  } else {
    outlined(
      ctx,
      `${formatSpeed(tier.winsRequired)} Wins`,
      w / 2,
      110,
      'bold 40px system-ui, sans-serif',
      '#ff8f8f',
    );
    outlined(ctx, 'To Buy', w / 2, 156, 'bold 32px system-ui, sans-serif', '#ffbcbc', 7);
  }
  return canvas;
};

/** The trophy + "Win Shop" sign face. */
const drawSign = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = '120px "Segoe UI Emoji", "Apple Color Emoji", system-ui, sans-serif';
  ctx.fillText('🏆', 250, 128);

  outlined(ctx, 'Win Shop', 590, 128, 'bold 130px system-ui, sans-serif', '#ffffff', 14);
  return canvas;
};
