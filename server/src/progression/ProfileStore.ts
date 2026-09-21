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
 * Earned progression, keyed by a stable client id and backed by a durable
 * store.
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
          for (const [playerId, profile] of stored) this.profiles.set(playerId, { ...profile });
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
    if (stored) this.profiles.set(playerId, stored);
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
        if (!this.live.has(playerId)) this.profiles.set(playerId, { ...profile });
      }
    } catch {
      // The boards simply stay as they were until the next attempt.
    }
  }

  /** Load a profile into a fresh PlayerState, or seed a new one. */
  restore(playerId: string, player: PlayerState): Profile {
    const existing = this.profiles.get(playerId);
    const profile = existing ?? emptyProfile();

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
    const profile: Profile = {
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
    };
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
