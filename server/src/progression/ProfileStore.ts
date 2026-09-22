import { STARTER_BOOT_MASK, creditWins } from '@obby/shared';
import { createPersistence, type PersistenceAdapter, type StoredProfile } from '../persistence/index.js';
import { logger } from '../util/logger.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';

const SCOPE = 'ProfileStore';

/** Wait between attempts to reach an unavailable store at startup. */
const OPEN_RETRY_MS = 5_000;

/**
 * How often profiles of players NOT on this server are re-read, so the global
 * scoreboards see progress saved by other server instances.
 */
const RELOAD_INTERVAL_MS = 60_000;

/** The progression worth carrying across a reconnect or a server restart. */
export type Profile = StoredProfile;

/**
 * The key a Bloxity ACCOUNT's profile is stored under.
 *
 * Namespaced so it can never collide with a guest key, and the namespace is
 * RESERVED: `guestKeyFrom` refuses any browser-supplied id that starts with
 * it. Without that, a guest could name their browser id `bloxity:<someone's
 * account id>` and be handed that account's progress with no login at all.
 */
export const ACCOUNT_PREFIX = 'bloxity:';

/** Storage key for an account id THE SERVER VERIFIED with Bloxity. */
export const accountKey = (accountId: string): string => `${ACCOUNT_PREFIX}${accountId}`;

/**
 * The guest key a browser asked for, or '' if it cannot have one.
 *
 * The same rule as before - whatever id this browser generated - with the
 * account namespace carved out of it.
 */
export const guestKeyFrom = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  const id = raw.slice(0, 64);
  if (!id || id.startsWith(ACCOUNT_PREFIX)) return '';
  return id;
};

/** Which profile a session plays on, and what was stored there. */
export interface Resolution {
  /** The storage key progression is saved under, or '' for "do not save". */
  readonly key: string;
  /** The stored profile, or undefined for a fresh start. */
  readonly profile: Profile | undefined;
  /** True when this call just moved a guest's progress onto the account. */
  readonly migrated: boolean;
}

/** The earned progression of a live player, as a profile. */
const snapshot = (player: PlayerState): Profile => ({
  totalSpeed: player.totalSpeed,
  wins: player.wins,
  rebirths: player.rebirths,
  ownedBoots: player.ownedBoots,
  ownedTrails: player.ownedTrails,
  trailSlot: player.trailSlot,
  ownedAuras: player.ownedAuras,
  auraSlot: player.auraSlot,
  // Carried so the leaderboards can name and picture this player while
  // they are offline. Already cleaned by the room before it reached the
  // replicated state, so it is stored as-is.
  legionName: player.legionName,
  legionPfp: player.legionPfp,
});

const emptyProfile = (): Profile => ({
  totalSpeed: 0,
  wins: 0,
  rebirths: 0,
  ownedBoots: STARTER_BOOT_MASK,
  ownedTrails: 0,
  trailSlot: 0,
  ownedAuras: 0,
  auraSlot: 0,
  legionName: '',
  legionPfp: '',
});

/**
 * Earned progression, backed by a durable store.
 *
 * TWO KINDS OF KEY, and the difference is the point:
 *  - a GUEST key is the id this browser generated and keeps in localStorage.
 *    It follows one browser, not a person, and it is what a player who is
 *    not signed in plays on;
 *  - an ACCOUNT key (`bloxity:<id>`) is a Bloxity account id that the SERVER
 *    verified with Bloxity. It is never taken from the client, and it is the
 *    same on every browser and device the account signs in from.
 *
 * The in-memory map is a CACHE in front of a `PersistenceAdapter`; the adapter
 * decides where the bytes actually live - Bloxity's managed MongoDB in
 * production, a JSON file in development.
 *
 * Two rules keep progress from ever being written over:
 *   - no join is admitted until the store has been read (`whenReady`), so a
 *     store that is briefly down cannot hand anyone an empty profile that
 *     their next save would then persist;
 *   - each joining player's profile is read FRESH (`refresh`), because with
 *     several server instances the copy cached at boot may be older than
 *     what another instance has saved since.
 *
 * Must outlive any single room. Colyseus disposes a room once its last client
 * leaves, so a store owned by the room would be destroyed by exactly the
 * disconnect it is supposed to survive - hence the process-wide singleton
 * below.
 *
 * Only earned progression is stored. Transient state - position, velocity,
 * animation, the current run's trophy claims - is deliberately not, so a
 * reconnecting player always starts a fresh run at spawn.
 */
export class ProfileStore {
  private readonly profiles = new Map<string, Profile>();
  private readonly adapter: PersistenceAdapter;
  private readonly creditListeners = new Set<(playerId: string, amount: number) => void>();
  /** Players currently in a room on THIS server; their live state is authoritative. */
  private readonly live = new Set<string>();
  private opening: Promise<void> | null = null;
  private ready = false;
  private readonly readyWaiters: (() => void)[] = [];
  private reloadTimer: NodeJS.Timeout | null = null;

  constructor(adapter: PersistenceAdapter) {
    this.adapter = adapter;
  }

  /**
   * Read everything the backing store holds, retrying until it answers.
   *
   * Runs in the background from startup: the server listens (and answers its
   * health check) at once, and joins wait on `whenReady` until this is done.
   */
  open(): Promise<void> {
    this.opening ??= (async () => {
      for (let attempt = 1; ; attempt += 1) {
        try {
          const stored = await this.adapter.open();
          // A moved guest profile is the same progress as its account's row.
          for (const [playerId, profile] of stored) {
            if (!profile.migratedTo) this.profiles.set(playerId, { ...profile });
          }
          break;
        } catch (error: unknown) {
          logger.error(
            SCOPE,
            `store "${this.adapter.name}" unavailable (attempt ${attempt}) - joins wait until it answers`,
            error instanceof Error ? error.message : error,
          );
          await new Promise((resolve) => setTimeout(resolve, OPEN_RETRY_MS));
        }
      }
      this.ready = true;
      for (const resolve of this.readyWaiters.splice(0)) resolve();
      logger.info(SCOPE, `store="${this.adapter.name}" profiles=${this.profiles.size}`);
      this.reloadTimer = setInterval(() => void this.reloadOthers(), RELOAD_INTERVAL_MS);
      this.reloadTimer.unref?.();
    })();
    return this.opening;
  }

  /** True once the store has been read. */
  get isReady(): boolean {
    return this.ready;
  }

  /** Resolves true once the store is ready, or false after `timeoutMs`. */
  whenReady(timeoutMs: number): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      this.readyWaiters.push(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  /**
   * Re-read one player's profile from the store, just before they join.
   *
   * REJECTS if the store cannot be read, and the join is refused: starting
   * the player from a stale or empty copy would save it over their progress.
   */
  async refresh(playerId: string): Promise<void> {
    if (!playerId || this.live.has(playerId)) return;
    const stored = await this.adapter.get(playerId);
    if (stored && !stored.migratedTo) this.profiles.set(playerId, stored);
  }

  /**
   * Decide which profile a session plays on, and read it FRESH.
   *
   * THROWS if storage cannot answer. The caller must refuse rather than start
   * the player from nothing, which the next save would write over their
   * progress.
   *
   * @param guestKey  this browser's guest key, from `guestKeyFrom`, or ''.
   * @param accountId a Bloxity account id THE SERVER VERIFIED, or null.
   * @param live      the player's current state when a session already in a
   *                  room signs in - newer than anything saved, so it is what
   *                  a first login moves onto the account.
   */
  async resolve(guestKey: string, accountId: string | null, live?: PlayerState): Promise<Resolution> {
    if (!accountId) {
      if (!guestKey) return { key: '', profile: undefined, migrated: false };
      const stored = await this.read(guestKey);
      // A guest profile that moved to an account is NOT restored: its progress
      // belongs to the account now, and restoring it as well would let one
      // browser's progress be played - and moved again - twice.
      const profile = stored && !stored.migratedTo ? stored : undefined;
      return { key: guestKey, profile, migrated: false };
    }

    const key = accountKey(accountId);
    const existing = await this.read(key);
    // THE ACCOUNT WINS. Whatever this browser holds, an account that already
    // has progress is never touched by it.
    if (existing) return { key, profile: existing, migrated: false };

    // The account's first login. Is there browser progress to bring over?
    const source = await this.migrationSource(guestKey, live);
    if (!source) return { key, profile: undefined, migrated: false };

    const moved: Profile = { ...source, migratedFrom: guestKey };
    delete moved.migratedTo;
    // Create-if-absent is the guarantee: if another session or server created
    // this account's profile a moment ago, this refuses rather than replacing
    // it, and the session plays on theirs.
    if (!(await this.adapter.insertIfAbsent(key, moved))) {
      const winner = await this.read(key);
      return { key, profile: winner, migrated: false };
    }
    this.profiles.set(key, moved);

    // Only AFTER the account's copy exists is the guest copy marked as moved.
    // If the process dies between the two, both hold the progress -
    // duplicated, never lost.
    const tombstone: Profile = { ...source, migratedTo: key };
    delete tombstone.migratedFrom;
    this.adapter.put(guestKey, tombstone);
    // Off the boards: the account's row is the same progress.
    this.profiles.delete(guestKey);

    logger.info(
      SCOPE,
      `first login: moved guest ${guestKey} -> ${key} ` +
        `(wins=${moved.wins} speed=${Math.floor(moved.totalSpeed)} rebirths=${moved.rebirths})`,
    );
    return { key, profile: moved, migrated: true };
  }

  /**
   * Where a Bux purchase made by this Bloxity account is credited.
   *
   * The account's profile when it has one. Otherwise the browser profile the
   * purchase named, which the account's first login then carries over - and
   * if that browser profile has already moved, wherever it moved to.
   */
  async purchaseTarget(accountId: string, guestKey: string): Promise<string> {
    if (accountId) {
      const key = accountKey(accountId);
      if (this.live.has(key) || (await this.adapter.get(key))) return key;
    }
    if (!guestKey) return '';
    const stored = await this.adapter.get(guestKey);
    return stored?.migratedTo ?? guestKey;
  }

  /**
   * One profile, fresh from the store - unless the player is live on THIS
   * server, whose in-memory state is newer than anything stored.
   */
  private async read(key: string): Promise<Profile | undefined> {
    if (this.live.has(key)) return this.profiles.get(key);
    const stored = await this.adapter.get(key);
    if (stored && !stored.migratedTo) this.profiles.set(key, stored);
    return stored ?? undefined;
  }

  /** The browser progress a first login would move, or null for none. */
  private async migrationSource(guestKey: string, live: PlayerState | undefined): Promise<Profile | null> {
    if (!guestKey) return null;
    const stored = this.live.has(guestKey)
      ? this.profiles.get(guestKey)
      : await this.adapter.get(guestKey);
    // Already moved to an account once: never a second time.
    if (stored?.migratedTo) return null;
    // A session signing in holds its progress in memory, newer than the last
    // autosave - that is what moves.
    if (live) return snapshot(live);
    return stored ?? null;
  }

  /** The player left this server; their stored copy is authoritative again. */
  release(playerId: string): void {
    this.live.delete(playerId);
  }

  /** Pick up what other server instances have saved, for the scoreboards. */
  private async reloadOthers(): Promise<void> {
    try {
      const stored = await this.adapter.open();
      for (const [playerId, profile] of stored) {
        if (this.live.has(playerId)) continue;
        if (profile.migratedTo) this.profiles.delete(playerId);
        else this.profiles.set(playerId, { ...profile });
      }
    } catch {
      // The boards simply stay as they were until the next attempt.
    }
  }

  /**
   * Load a RESOLVED profile onto a player, or seed a new one.
   *
   * `undefined` is a fresh start, written out explicitly - which matters for
   * a session switching profiles, where "whatever the state held" is the
   * other profile's progress.
   */
  restore(playerId: string, player: PlayerState, existing: Profile | undefined): Profile {
    const profile: Profile = existing ? { ...existing } : emptyProfile();
    delete profile.migratedTo;

    player.totalSpeed = profile.totalSpeed;
    player.wins = profile.wins;
    player.rebirths = profile.rebirths;
    player.ownedBoots = profile.ownedBoots;
    player.ownedTrails = profile.ownedTrails ?? 0;
    player.trailSlot = profile.trailSlot ?? 0;
    player.ownedAuras = profile.ownedAuras ?? 0;
    player.auraSlot = profile.auraSlot ?? 0;

    this.profiles.set(playerId, profile);
    this.live.add(playerId);
    logger.info(
      SCOPE,
      `${existing ? 'restored' : 'new profile'} playerId=${playerId} ` +
        `speed=${Math.floor(profile.totalSpeed)} wins=${profile.wins} ` +
        `rebirths=${profile.rebirths} boots=${profile.ownedBoots}`,
    );
    return profile;
  }

  /** Capture the player's earned progression. Safe to call often. */
  save(playerId: string, player: PlayerState): void {
    if (!playerId) return;
    const profile = snapshot(player);
    // Where an account's first progress came from stays on it. `migratedTo`
    // is deliberately NOT carried: a guest profile being saved is being
    // PLAYED, which makes it somebody's live profile again.
    const from = this.profiles.get(playerId)?.migratedFrom;
    if (from) profile.migratedFrom = from;
    this.profiles.set(playerId, profile);
    // The adapter coalesces these; durability is guaranteed by `flush`.
    this.adapter.put(playerId, profile);
  }

  /**
   * Add purchased Wins to a profile, online or not.
   *
   * The only writer here that is not a save of observed play, and it exists
   * for exactly one caller - `BuxFulfilmentService`. It credits the STORED
   * profile, which is what a player who has logged off will find waiting; a
   * player who is online also has a live `PlayerState` whose Wins would
   * overwrite this at the next autosave, so listeners are notified and the
   * room applies the same credit there. Both halves or neither.
   *
   * @returns the profile's new balance, already guarded against the uint32
   * wallet wrapping.
   */
  async creditWins(playerId: string, amount: number): Promise<number> {
    if (!playerId || amount <= 0) return this.profiles.get(playerId)?.wins ?? 0;

    // Credit the STORED profile as it is now - another server instance may
    // have saved progress since this one cached it, and a credit written onto
    // a stale copy would take that progress away. Throws if the store cannot
    // be read, which the webhook turns into a retry rather than a refund.
    await this.refresh(playerId);
    const profile = this.profiles.get(playerId) ?? emptyProfile();
    profile.wins = creditWins(profile.wins, amount);
    this.profiles.set(playerId, profile);
    this.adapter.put(playerId, profile);
    // Durable before the sale is confirmed: a purchase is real money.
    await this.adapter.flush();

    for (const listener of this.creditListeners) listener(playerId, amount);
    return profile.wins;
  }

  /**
   * Be told when a profile is credited, so a live player can be credited too.
   *
   * @returns a function that stops listening.
   */
  onCredit(listener: (playerId: string, amount: number) => void): () => void {
    this.creditListeners.add(listener);
    return () => {
      this.creditListeners.delete(listener);
    };
  }

  /** Write everything pending to durable storage. Called on shutdown. */
  flush(): Promise<void> {
    return this.adapter.flush();
  }

  /** Synchronous last resort for the process `exit` hook (local file only). */
  flushSync(): void {
    this.adapter.flushSync?.();
  }

  /** Release the store's connections at shutdown. */
  async close(): Promise<void> {
    if (this.reloadTimer) clearInterval(this.reloadTimer);
    await this.adapter.close?.();
  }

  /** Number of profiles held, for diagnostics. */
  /**
   * Every profile the process holds, for ranking.
   *
   * Read-only on purpose: the leaderboard observes progression, it never
   * writes it. Returning the live map avoids copying the whole population on
   * every refresh; the caller only iterates.
   */
  get all(): ReadonlyMap<string, Profile> {
    return this.profiles;
  }

  get size(): number {
    return this.profiles.size;
  }
}

/**
 * Process-wide store, shared by every room instance.
 *
 * Deliberately module scope: rooms come and go with their occupants, and
 * progression has to outlive them.
 */
export const profileStore = new ProfileStore(createPersistence());
