import { Group, type Scene } from 'three';
import { logger } from '../util/logger.js';
import { BootShop } from './BootShop.js';
import { Foliage } from './Foliage.js';
import { WorldCollision } from '@obby/shared';
import { GorgeTerrain } from './GorgeTerrain.js';
import { Redlines } from './Redlines.js';
import { SpawnArea } from './SpawnArea.js';
import { TreadmillArea } from './TreadmillArea.js';
import { Treadmills } from './Treadmills.js';
import { WinPads } from './WinPads.js';
import { TrophyPlatforms } from './TrophyPlatforms.js';
import { WorldTextures } from './WorldTextures.js';

const SCOPE = 'GorgeWorld';

/**
 * The gorge: terrain, platforms, hazards, foliage and the collision model.
 *
 * Assembles the visual pieces and exposes the single `collision` object that
 * gameplay queries. Everything is built from the shared gorge config, so the
 * geometry the player collides with cannot drift from what is rendered.
 */
export class GorgeWorld {
  readonly root = new Group();
  readonly collision = new WorldCollision();

  private readonly textures = new WorldTextures();
  private readonly terrain: GorgeTerrain;
  private readonly platforms: TrophyPlatforms;
  private readonly spawnArea: SpawnArea;
  private readonly redlines = new Redlines();
  private readonly foliage = new Foliage();
  readonly bootShop = new BootShop();
  readonly treadmills = new Treadmills();
  private readonly treadmillArea = new TreadmillArea();
  readonly winPads: WinPads;

  constructor() {
    this.terrain = new GorgeTerrain(this.textures);
    this.platforms = new TrophyPlatforms(this.textures);
    this.spawnArea = new SpawnArea(this.textures);
    this.winPads = new WinPads(this.textures);

    this.root.add(this.terrain.root);
    this.root.add(this.platforms.root);
    this.root.add(this.redlines.root);
    this.root.add(this.foliage.root);
    this.root.add(this.bootShop.root);
    this.root.add(this.treadmillArea.root);
    this.root.add(this.treadmills.root);
    this.root.add(this.winPads.root);
    this.root.add(this.spawnArea.root);
  }

  addTo(scene: Scene): void {
    scene.add(this.root);
    this.terrain.applySky(scene);

    let meshes = 0;
    this.root.traverse((child) => {
      if ((child as { isMesh?: boolean }).isMesh) meshes += 1;
    });
    logger.info(SCOPE, `gorge built: ${meshes} meshes`);
  }

  dispose(): void {
    this.terrain.dispose();
    this.platforms.dispose();
    this.redlines.dispose();
    this.foliage.dispose();
    this.bootShop.dispose();
    this.treadmills.dispose();
    this.treadmillArea.dispose();
    this.winPads.dispose();
    this.spawnArea.dispose();
    this.textures.dispose();
    this.root.removeFromParent();
  }
}
