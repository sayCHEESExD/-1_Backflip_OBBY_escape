import { Group, type Scene } from 'three';
import { logger } from '../util/logger.js';
import { Foliage } from './Foliage.js';
import { GorgeCollision } from './GorgeCollision.js';
import { GorgeTerrain } from './GorgeTerrain.js';
import { Redlines } from './Redlines.js';
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
  readonly collision = new GorgeCollision();

  private readonly textures = new WorldTextures();
  private readonly terrain: GorgeTerrain;
  private readonly platforms: TrophyPlatforms;
  private readonly redlines = new Redlines();
  private readonly foliage = new Foliage();

  constructor() {
    this.terrain = new GorgeTerrain(this.textures);
    this.platforms = new TrophyPlatforms(this.textures);

    this.root.add(this.terrain.root);
    this.root.add(this.platforms.root);
    this.root.add(this.redlines.root);
    this.root.add(this.foliage.root);
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
    this.textures.dispose();
    this.root.removeFromParent();
  }
}
