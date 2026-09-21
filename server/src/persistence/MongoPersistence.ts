import { MongoClient, type AnyBulkWriteOperation, type Collection } from 'mongodb';
import { logger } from '../util/logger.js';
import { sanitiseProfile, type PersistenceAdapter, type StoredProfile } from './PersistenceAdapter.js';

const SCOPE = 'MongoPersistence';

/** How often queued saves are written, and the longest a retry waits. */
const WRITE_INTERVAL_MS = 500;
const MAX_RETRY_MS = 15_000;

/** How long a shutdown waits for pending saves before giving up. */
const FLUSH_TIMEOUT_MS = 8_000;

/** One stored profile. `_id` is the player's id. */
interface ProfileDocument extends StoredProfile {
  _id: string;
  updatedAt: Date;
}

/**
 * Profiles in Bloxity's managed MongoDB - the production store.
 *
 * Bloxity Hosting injects `MONGODB_URI` into every backend pod: an isolated
 * database for this game and channel that survives deploys, restarts and
 * scale-to-zero, which the container's own disk does not. That is the whole
 * reason this adapter exists.
 *
 * Writes are queued per player (only the newest snapshot matters) and flushed
 * in one bulk write every half second. Each is an idempotent upsert of the
 * whole profile, so a batch that fails is simply retried with backoff - a
 * brief database outage delays saves, it never drops them. Reads throw when
 * the database is unreachable, so the caller can refuse a join instead of
 * starting someone from zero and later saving that zero over their progress.
 */
export class MongoPersistence implements PersistenceAdapter {
  readonly name = 'mongodb';

  private readonly client: MongoClient;
  private collection: Collection<ProfileDocument> | null = null;
  private connecting: Promise<Collection<ProfileDocument>> | null = null;

  /** Newest unsaved snapshot per player. */
  private readonly pending = new Map<string, StoredProfile>();
  /**
   * The batch being written right now. Out of `pending` but not yet in the
   * database, so reads must see it too - a join landing mid-write would
   * otherwise restore the older stored copy.
   */
  private inFlight = new Map<string, StoredProfile>();
  private timer: NodeJS.Timeout | null = null;
  private writing: Promise<void> | null = null;
  private retryMs = WRITE_INTERVAL_MS;

  constructor(uri: string) {
    this.client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 5_000,
      appName: 'speed-backflip-escape',
    });
  }

  async open(): Promise<ReadonlyMap<string, StoredProfile>> {
    const collection = await this.connect();
    const profiles = new Map<string, StoredProfile>();
    for await (const doc of collection.find({})) {
      profiles.set(doc._id, sanitiseProfile(doc));
    }
    // Saves still queued are newer than anything in the database; a periodic
    // reload must never show (or hand back) the older stored copy instead.
    for (const [playerId, profile] of this.inFlight) profiles.set(playerId, { ...profile });
    for (const [playerId, profile] of this.pending) profiles.set(playerId, { ...profile });
    logger.info(SCOPE, `loaded ${profiles.size} profiles`);
    return profiles;
  }

  async get(playerId: string): Promise<StoredProfile | null> {
    // A save still queued here is newer than anything in the database.
    const queued = this.pending.get(playerId) ?? this.inFlight.get(playerId);
    if (queued) return { ...queued };
    const collection = await this.connect();
    const doc = await collection.findOne({ _id: playerId });
    return doc ? sanitiseProfile(doc) : null;
  }

  put(playerId: string, profile: StoredProfile): void {
    if (!playerId) return;
    this.pending.set(playerId, { ...profile });
    this.schedule(WRITE_INTERVAL_MS);
  }

  async flush(): Promise<void> {
    const deadline = Date.now() + FLUSH_TIMEOUT_MS;
    while (this.pending.size > 0 || this.writing) {
      if (Date.now() > deadline) {
        logger.error(SCOPE, `flush timed out with ${this.pending.size} profile(s) unsaved`);
        return;
      }
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      await (this.writing ?? this.write());
      if (this.pending.size > 0) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  async close(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.client.close().catch(() => undefined);
  }

  // --- internals --------------------------------------------------------

  /** Connect once; a failed attempt is forgotten so the next call retries. */
  private connect(): Promise<Collection<ProfileDocument>> {
    if (this.collection) return Promise.resolve(this.collection);
    this.connecting ??= this.client
      .connect()
      .then(async (client) => {
        // The URI names this game's own database; `db()` with no argument
        // uses exactly that one.
        const db = client.db();
        const collection = db.collection<ProfileDocument>('profiles');
        this.collection = collection;
        logger.info(SCOPE, `connected to database "${db.databaseName}"`);
        return collection;
      })
      .catch((error: unknown) => {
        this.connecting = null;
        throw error;
      });
    return this.connecting;
  }

  private schedule(delayMs: number): void {
    if (this.timer || this.writing) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.write();
    }, delayMs);
    // Queued saves must never hold the process open on their own.
    this.timer.unref?.();
  }

  /** Write every queued snapshot in one bulk upsert. */
  private write(): Promise<void> {
    if (this.writing) return this.writing;
    if (this.pending.size === 0) return Promise.resolve();

    const batch = new Map(this.pending);
    this.pending.clear();
    this.inFlight = batch;

    this.writing = (async () => {
      try {
        const collection = await this.connect();
        const now = new Date();
        const operations: AnyBulkWriteOperation<ProfileDocument>[] = [...batch].map(
          ([playerId, profile]) => ({
            updateOne: {
              filter: { _id: playerId },
              update: { $set: { ...sanitiseProfile(profile), updatedAt: now } },
              upsert: true,
            },
          }),
        );
        await collection.bulkWrite(operations, { ordered: false });
        this.retryMs = WRITE_INTERVAL_MS;
      } catch (error: unknown) {
        // Put the batch back UNDER anything newer queued meanwhile, then retry.
        for (const [playerId, profile] of batch) {
          if (!this.pending.has(playerId)) this.pending.set(playerId, profile);
        }
        this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
        logger.warn(
          SCOPE,
          `save of ${batch.size} profile(s) failed - retrying in ${this.retryMs}ms`,
          error instanceof Error ? error.message : error,
        );
      } finally {
        this.inFlight = new Map();
        this.writing = null;
        if (this.pending.size > 0) this.schedule(this.retryMs);
      }
    })();
    return this.writing;
  }
}
