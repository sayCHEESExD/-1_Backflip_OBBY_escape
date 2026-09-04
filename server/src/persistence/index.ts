import { serverConfig } from '../config/serverConfig.js';
import { JsonFilePersistence } from './JsonFilePersistence.js';
import type { PersistenceAdapter } from './PersistenceAdapter.js';

export type { PersistenceAdapter, StoredProfile } from './PersistenceAdapter.js';
export { JsonFilePersistence } from './JsonFilePersistence.js';

/**
 * Choose the backing store.
 *
 * The ONLY place that names a concrete adapter. Adding Postgres or Redis later
 * means writing an adapter and extending this switch - nothing above the
 * persistence boundary changes.
 */
export const createPersistence = (): PersistenceAdapter =>
  new JsonFilePersistence(serverConfig.dataDir);
