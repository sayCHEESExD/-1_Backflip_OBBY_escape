/**
 * The persistence boundary.
 *
 * Everything above this interface deals in whole profiles and never knows how
 * or where they are stored. Two adapters exist: Bloxity's managed MongoDB in
 * production (`MONGODB_URI`), and a JSON file for local development.
 *
 * The container's own disk is NOT durable on Bloxity Hosting - a deploy
 * replaces the container and an idle game scales to zero - which is why a
 * JSON file there lost every player's progress on each update.
 *
 * Reads that DECIDE a player's progress go through `get`, fresh from the
 * store, at join time: several server instances can run at once, so a copy
 * cached at boot may be older than what another instance has since saved.
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
  /**
   * The player's Bloxity display name and avatar.
   *
   * Stored, not just replicated, because the global leaderboards rank every
   * profile this server has ever seen - including players who are OFFLINE and
   * have no live state to read a name from. Absent in saves written before
   * identities existed, so both default to empty on read.
   */
  legionName: string;
  legionPfp: string;
}

export interface PersistenceAdapter {
  /** Identifies the backing store in logs. */
  readonly name: string;

  /**
   * Prepare the store and return everything it holds.
   *
   * Used to seed the global leaderboards, which rank players who are offline.
   * REJECTS when the store is unreachable - the caller retries rather than
   * starting from an empty map that saves would then write over.
   */
  open(): Promise<ReadonlyMap<string, StoredProfile>>;

  /**
   * One player's stored profile, read fresh. Null when they have none.
   * REJECTS when the store is unreachable, so a join can be refused rather
   * than starting that player from zero and saving the zero over their save.
   */
  get(playerId: string): Promise<StoredProfile | null>;

  /**
   * Record one profile. Written behind and retried until it lands; callers
   * rely on `flush` for durability at shutdown.
   */
  put(playerId: string, profile: StoredProfile): void;

  /** Write everything pending. Resolves once it is durable (or gives up). */
  flush(): Promise<void>;

  /**
   * Best-effort synchronous flush for the process `exit` hook, where nothing
   * asynchronous can run. Only a local file can honour it.
   */
  flushSync?(): void;

  /** Release connections at shutdown. */
  close?(): Promise<void>;
}

const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * Coerce a stored record into a valid profile.
 *
 * Every adapter reads through this, so a field added later simply defaults on
 * old records, and a hand-edited or partial record cannot put an unbounded
 * string on another player's scoreboard or a negative count into a wallet.
 */
export const sanitiseProfile = (raw: Partial<Record<keyof StoredProfile, unknown>> | null | undefined): StoredProfile => ({
  totalSpeed: Math.max(0, finite(raw?.totalSpeed, 0)),
  wins: Math.max(0, Math.floor(finite(raw?.wins, 0))),
  rebirths: Math.max(0, Math.floor(finite(raw?.rebirths, 0))),
  ownedBoots: Math.max(0, Math.floor(finite(raw?.ownedBoots, 1))),
  ownedTrails: Math.max(0, Math.floor(finite(raw?.ownedTrails, 0))),
  trailSlot: Math.max(0, Math.floor(finite(raw?.trailSlot, 0))),
  ownedAuras: Math.max(0, Math.floor(finite(raw?.ownedAuras, 0))),
  auraSlot: Math.max(0, Math.floor(finite(raw?.auraSlot, 0))),
  legionName: typeof raw?.legionName === 'string' ? raw.legionName.slice(0, 32) : '',
  legionPfp: typeof raw?.legionPfp === 'string' ? raw.legionPfp.slice(0, 300) : '',
});
