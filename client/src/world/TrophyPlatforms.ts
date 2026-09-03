import {
  COLLECTION_ZONE,
  collectionZoneX,
  collectionZoneZ,
  PLATFORM,
  SPAWN_PLATFORM,
  TROPHY_PLATFORMS,
} from '@obby/shared';
import {
  BoxGeometry,
  CanvasTexture,
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
import { WORLD_COLORS } from '../config/worldVisuals.js';
import type { WorldTextures } from './WorldTextures.js';

/**
 * The starting area, the trophy platforms, their collection pads and the
 * floating "+N Wins" labels.
 *
 * Every trophy platform shares ONE geometry and ONE material - only the Z of
 * each mesh differs, which is exactly the geometry rule the design requires.
 */
export class TrophyPlatforms {
  readonly root = new Group();

  private readonly geometries: BoxGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly textures: Texture[] = [];
  private padGeometry: PlaneGeometry | null = null;
  private labelGeometry: PlaneGeometry | null = null;

  constructor(textures: WorldTextures) {
    this.buildSpawnPlatform(textures);
    this.buildTrophyPlatforms(textures);
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.padGeometry?.dispose();
    this.labelGeometry?.dispose();
  }

  private buildSpawnPlatform(textures: WorldTextures): void {
    const geometry = new BoxGeometry(
      SPAWN_PLATFORM.width,
      SPAWN_PLATFORM.thickness,
      SPAWN_PLATFORM.length,
    );
    // Studded grass, matching the gorge rims - the start is a green shelf.
    const map = textures.grassStuds(WORLD_COLORS.spawnGrass, WORLD_COLORS.spawnGrassStud);
    map.repeat.set(SPAWN_PLATFORM.width * 0.22, SPAWN_PLATFORM.length * 0.22);
    const material = new MeshLambertMaterial({ map });
    this.geometries.push(geometry);
    this.materials.push(material);

    const mesh = new Mesh(geometry, material);
    mesh.position.set(
      SPAWN_PLATFORM.x,
      SPAWN_PLATFORM.topY - SPAWN_PLATFORM.thickness / 2,
      SPAWN_PLATFORM.centerZ,
    );
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }

  private buildTrophyPlatforms(textures: WorldTextures): void {
    // Shared across every platform: identical width, length and thickness.
    const geometry = new BoxGeometry(PLATFORM.width, PLATFORM.thickness, PLATFORM.length);
    const map = textures.tiles(
      WORLD_COLORS.platformTile,
      WORLD_COLORS.platformLine,
      WORLD_COLORS.platformTileAlt,
    );
    map.repeat.set(PLATFORM.width * 0.2, PLATFORM.length * 0.2);
    const material = new MeshLambertMaterial({ map });
    this.geometries.push(geometry);
    this.materials.push(material);

    this.padGeometry = new PlaneGeometry(COLLECTION_ZONE.width, COLLECTION_ZONE.depth);
    this.labelGeometry = new PlaneGeometry(5.4, 2.7);

    const padMaterial = new MeshBasicMaterial({
      color: WORLD_COLORS.collectionPad,
      transparent: true,
      opacity: 0.85,
    });
    this.materials.push(padMaterial);

    for (const platform of TROPHY_PLATFORMS) {
      const mesh = new Mesh(geometry, material);
      // Identical X, Y and rotation for every platform - only Z varies.
      mesh.position.set(PLATFORM.x, PLATFORM.topY - PLATFORM.thickness / 2, platform.centerZ);
      mesh.rotation.y = PLATFORM.rotationY;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.root.add(mesh);

      // The pad sits at the far LEFT corner of every island.
      const padX = collectionZoneX();
      const padZ = collectionZoneZ(platform.centerZ);
      this.addCollectionPad(padX, padZ, padMaterial);
      this.addLabel(padX, padZ, platform.value);
    }
  }

  /** Flat gold rectangle marking the collection area, flush with the surface. */
  private addCollectionPad(centerX: number, centerZ: number, material: Material): void {
    if (!this.padGeometry) return;
    const pad = new Mesh(this.padGeometry, material);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(centerX, PLATFORM.topY + 0.02, centerZ);
    this.root.add(pad);
  }

  /**
   * Floating label above the pad. Faces -Z, the direction players approach
   * from, so it is readable without per-frame billboarding.
   */
  private addLabel(centerX: number, centerZ: number, value: number): void {
    if (!this.labelGeometry) return;

    const texture = makeLabelTexture(value);
    this.textures.push(texture);

    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    });
    this.materials.push(material);

    const label = new Mesh(this.labelGeometry, material);
    label.position.set(centerX, PLATFORM.topY + COLLECTION_ZONE.labelY, centerZ);
    label.rotation.y = Math.PI;
    this.root.add(label);
  }
}

/** Render "+N" over "Wins" onto a small canvas texture. */
const makeLabelTexture = (value: number): CanvasTexture => {
  const width = 256;
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    ctx.font = 'bold 68px system-ui, sans-serif';
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#1b2536';
    ctx.strokeText(`+${value}`, width / 2, 44);
    ctx.fillStyle = '#ffd75e';
    ctx.fillText(`+${value}`, width / 2, 44);

    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.lineWidth = 8;
    ctx.strokeText('Wins', width / 2, 100);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Wins', width / 2, 100);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};
