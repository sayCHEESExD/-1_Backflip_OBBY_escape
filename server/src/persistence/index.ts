import { serverConfig } from '../config/serverConfig.js';
import { logger } from '../util/logger.js';
import { JsonFilePersistence } from './JsonFilePersistence.js';
import { MongoPersistence } from './MongoPersistence.js';
import type { PersistenceAdapter } from './PersistenceAdapter.js';

export type { PersistenceAdapter, StoredProfile } from './PersistenceAdapter.js';
export { JsonFilePersistence } from './JsonFilePersistence.js';

/**
 * Choose the backing store.
 *
 * The ONLY place that names a concrete adapter. Bloxity Hosting injects
 * `MONGODB_URI`, and there the database is used: the container's disk is
 * replaced on every deploy, which is exactly how saved progress used to
 * vanish after an update. Without it (local development) a JSON file is used.
 */
export const createPersistence = (): PersistenceAdapter => {
  if (serverConfig.mongoUri) {
    logger.info('persistence', 'using Bloxity managed MongoDB (MONGODB_URI)');
    return new MongoPersistence(serverConfig.mongoUri);
  }
  logger.warn(
    'persistence',
    `MONGODB_URI not set - using a local JSON file in ${serverConfig.dataDir}. ` +
      'Fine for development; on a host whose disk is replaced per deploy, progress will not survive.',
  );
  return new JsonFilePersistence(serverConfig.dataDir);
};
