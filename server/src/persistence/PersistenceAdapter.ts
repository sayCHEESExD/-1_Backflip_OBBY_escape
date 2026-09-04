/**
 * The persistence boundary.
 *
 * Everything above this interface deals in whole profiles and never knows how
 * or where they are stored, so swapping the JSON file for a real database is a
 * matter of writing one more adapter and changing `createPersistence`.
 *
 * The read side is deliberately SYNCHRONOUS and whole-store: profiles are tiny,
 * a room joins players on the hot path, and loading everything once at boot
 * keeps `onJoin` free of awaits. A database adapter satisfies this by
 * populating its cache during `open()` and writing behind in `put`.
 */

/** The earned progression that outlives a session. */
export interface StoredProfile {
  totalSpeed: number;
  wins: number;
  rebirths: number;
  ownedBoots: number;
  /** Cosmetics. Added after v1 shipped, so they default when absent. */
  ownedTrails: number;
  trailSlot: number;
  ownedAuras: number;
  auraSlot: number;
}

export interface PersistenceAdapter {
  /** Identifies the backing store in logs. */
  readonly name: string;

  /**
   * Prepare the store and return everything it holds.
   *
   * Called once at startup, before any client can join. A store that cannot be
   * read must return an empty map rather than throwing: losing saved progress
   * is bad, refusing to start the game is worse.
   */
  open(): ReadonlyMap<string, StoredProfile>;

  /**
   * Record one profile. May be batched or written behind; callers treat it as
   * fire-and-forget and rely on `flush` for durability at shutdown.
   */
  put(playerId: string, profile: StoredProfile): void;

  /** Force everything pending to durable storage. Safe to call repeatedly. */
  flush(): void;
}
