import {
  COLLECTION_ZONE,
  collectionZoneX,
  collectionZoneZ,
  PLATFORM,
  GORGE,
  GORGE_HEAD,
  SPAWN_PLATFORM,
  TROPHY_PLATFORMS,
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
  type Material,
  type Texture,
} from 'three';
import {
  AREA_DECK_THICKNESS,
  AREA_LABEL_HEIGHT,
  AREA_THEMES,
  DEFAULT_AREA_THEME,
  WORLD_COLORS,
} from '../config/worldVisuals.js';
import type { WorldTextures } from './WorldTextures.js';

/**
 * The starting area, the trophy islands, their themed decks, the collection
 * pads and the floating labels.
 *
 * Every island shares ONE body geometry and ONE body material, so the geometry
 * rule is untouched. What varies per island is presentation only: a thin
 * coloured deck laid on top, and the area name floating above it.
 */
export class TrophyPlatforms {
  readonly root = new Group();

  private readonly geometries: BoxGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly textures: Texture[] = [];
  private padGeometry: PlaneGeometry | null = null;
  private padLabelGeometry: PlaneGeometry | null = null;
  private areaLabelGeometry: PlaneGeometry | null = null;

  constructor(textures: WorldTextures) {
    this.buildSpawnPlatform(textures);
    this.buildTrophyPlatforms(textures);
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.padGeometry?.dispose();
    this.padLabelGeometry?.dispose();
    this.areaLabelGeometry?.dispose();
  }

  /**
   * The head of the gorge: solid ground, not a floating slab.
   *
   * The starting area used to be a thin platform hanging in mid air with the
   * river visible underneath it. It is now the TOP of a headland that fills
   * the canyon from rim to rim and runs down past the river floor, so the
   * start reads as the ground the gorge is cut into. The blue channel begins
   * at its front face, which is why the river appears to flow out from under
   * the player rather than past them.
   *
   * One box, one geometry. The top face takes the spawn grass and every other
   * face the canyon wall tile, so the sides and the front read as rock.
   */
  private buildSpawnPlatform(textures: WorldTextures): void {
    const width = GORGE_HEAD.halfWidth * 2;
    const backZ = GORGE.startZ;
    const length = GORGE_HEAD.riverStartZ - backZ;
    const height = SPAWN_PLATFORM.topY - GORGE_HEAD.baseY;

    const geometry = new BoxGeometry(width, height, length);
    this.geometries.push(geometry);

    const grassMap = textures.grassStuds(
      WORLD_COLORS.spawnGrass,
      WORLD_COLORS.spawnGrassStud,
    );
    grassMap.repeat.set(width * 0.22, length * 0.22);
    const grass = new MeshLambertMaterial({ map: grassMap });

    const rockMap = textures.tiles(
      WORLD_COLORS.wallTile,
      WORLD_COLORS.wallLine,
      WORLD_COLORS.wallTileAlt,
    );
    rockMap.repeat.set(length * 0.12, height * 0.12);
    const rock = new MeshLambertMaterial({ map: rockMap });
    this.materials.push(grass, rock);

    // Box material order: +X, -X, +Y, -Y, +Z, -Z. Only the top is grass.
    const mesh = new Mesh(geometry, [rock, rock, grass, rock, rock, rock]);
    mesh.position.set(
      SPAWN_PLATFORM.x,
      SPAWN_PLATFORM.topY - height / 2,
      backZ + length / 2,
    );
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }

  private buildTrophyPlatforms(textures: WorldTextures): void {
    // Shared across every island: identical width, length and thickness.
    const bodyGeometry = new BoxGeometry(
      PLATFORM.width,
      PLATFORM.thickness,
      PLATFORM.length,
    );
    const tileMap = textures.tiles(
      WORLD_COLORS.platformTile,
      WORLD_COLORS.platformLine,
      WORLD_COLORS.platformTileAlt,
    );
    tileMap.repeat.set(PLATFORM.width * 0.2, PLATFORM.length * 0.2);
    const bodyMaterial = new MeshLambertMaterial({ map: tileMap });
    this.geometries.push(bodyGeometry);
    this.materials.push(bodyMaterial);

    // One shared deck geometry; only its material colour differs per area.
    const deckGeometry = new BoxGeometry(
      PLATFORM.width,
      AREA_DECK_THICKNESS,
      PLATFORM.length,
    );
    this.geometries.push(deckGeometry);

    this.padGeometry = new PlaneGeometry(COLLECTION_ZONE.width, COLLECTION_ZONE.depth);
    this.padLabelGeometry = new PlaneGeometry(5.6, 3.4);
    this.areaLabelGeometry = new PlaneGeometry(13, 4.3);

    const padMaterial = new MeshBasicMaterial({
      color: WORLD_COLORS.collectionPad,
      transparent: true,
      opacity: 0.85,
    });
    this.materials.push(padMaterial);

    for (const platform of TROPHY_PLATFORMS) {
      const theme = AREA_THEMES[platform.area] ?? DEFAULT_AREA_THEME;

      const body = new Mesh(bodyGeometry, bodyMaterial);
      // Identical X, Y and rotation for every island - only Z varies.
      body.position.set(
        PLATFORM.x,
        PLATFORM.topY - PLATFORM.thickness / 2,
        platform.centerZ,
      );
      body.rotation.y = PLATFORM.rotationY;
      body.receiveShadow = true;
      body.castShadow = true;
      this.root.add(body);

      // Themed deck, tinted by the area. Almost every island shares the one
      // tiling; Space Island swaps in a starfield instead.
      const deckMap = theme.deckTexture === 'stars' ? textures.starfield() : tileMap;
      const deckMaterial = new MeshLambertMaterial({
        map: deckMap,
        color: new Color(theme.deck),
      });
      this.materials.push(deckMaterial);

      const deck = new Mesh(deckGeometry, deckMaterial);
      deck.position.set(
        PLATFORM.x,
        PLATFORM.topY - AREA_DECK_THICKNESS / 2 + 0.01,
        platform.centerZ,
      );
      deck.receiveShadow = true;
      this.root.add(deck);

      const padX = collectionZoneX();
      const padZ = collectionZoneZ(platform.centerZ);
      this.addCollectionPad(padX, padZ, padMaterial);
      this.addPadLabel(padX, padZ, platform.value);
      this.addAreaLabel(platform.centerZ, platform.area, theme.icon);
    }
  }

  /** Flat gold rectangle marking the collection area, flush with the deck. */
  private addCollectionPad(centerX: number, centerZ: number, material: Material): void {
    if (!this.padGeometry) return;
    const pad = new Mesh(this.padGeometry, material);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(centerX, PLATFORM.topY + 0.03, centerZ);
    this.root.add(pad);
  }

  /**
   * "Return" over "+N Wins", floating above the pad. Faces -Z, the direction
   * players approach from, so it reads without per-frame billboarding.
   */
  private addPadLabel(centerX: number, centerZ: number, value: number): void {
    if (!this.padLabelGeometry) return;
    const label = this.makeLabelMesh(this.padLabelGeometry, drawPadLabel(value));
    label.position.set(centerX, PLATFORM.topY + COLLECTION_ZONE.labelY, centerZ);
    this.root.add(label);
  }

  /** The area's icon and name, floating high above the island centre. */
  private addAreaLabel(centerZ: number, area: string, icon: string): void {
    if (!this.areaLabelGeometry) return;
    const label = this.makeLabelMesh(this.areaLabelGeometry, drawAreaLabel(area, icon));
    label.position.set(PLATFORM.x, PLATFORM.topY + AREA_LABEL_HEIGHT, centerZ);
    this.root.add(label);
  }

  private makeLabelMesh(geometry: PlaneGeometry, canvas: HTMLCanvasElement): Mesh {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    this.textures.push(texture);

    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
      fog: false,
    });
    this.materials.push(material);

    const mesh = new Mesh(geometry, material);
    mesh.rotation.y = Math.PI;
    return mesh;
  }
}

const canvasOf = (width: number, height: number): CanvasRenderingContext2D => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  return ctx;
};

/** Outlined text, drawn the same way everywhere for a consistent look. */
const outlined = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  fill: string,
  outline = 10,
): void => {
  ctx.font = font;
  ctx.lineWidth = outline;
  ctx.strokeStyle = '#121b28';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
};

/** "Return" above a dark plaque reading "+N Wins". */
const drawPadLabel = (value: number): HTMLCanvasElement => {
  const width = 320;
  const height = 192;
  const ctx = canvasOf(width, height);

  outlined(ctx, 'Return', width / 2, 34, 'bold 40px system-ui, sans-serif', '#ffffff', 9);

  // Plaque behind the reward, as in the reference.
  const plaqueW = 264;
  const plaqueH = 84;
  const x = (width - plaqueW) / 2;
  const y = 76;
  ctx.fillStyle = 'rgba(14,22,34,0.82)';
  ctx.strokeStyle = '#0b111b';
  ctx.lineWidth = 5;
  roundedRect(ctx, x, y, plaqueW, plaqueH, 14);
  ctx.fill();
  ctx.stroke();

  outlined(
    ctx,
    `+${value} Wins`,
    width / 2,
    y + plaqueH / 2 + 2,
    'bold 54px system-ui, sans-serif',
    '#ffd75e',
    8,
  );
  return ctx.canvas;
};

/** The area icon above its name. */
const drawAreaLabel = (area: string, icon: string): HTMLCanvasElement => {
  const width = 512;
  const height = 170;
  const ctx = canvasOf(width, height);

  ctx.font = '64px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(icon, width / 2, 46);

  outlined(ctx, area, width / 2, 124, 'bold 52px system-ui, sans-serif', '#ffffff', 11);
  return ctx.canvas;
};

const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};
