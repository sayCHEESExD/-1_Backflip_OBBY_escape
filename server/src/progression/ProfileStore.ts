import { STARTER_BOOT_MASK } from '@obby/shared';
import { createPersistence, type PersistenceAdapter, type StoredProfile } from '../persistence/index.js';
import { logger } from '../util/logger.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';

const SCOPE = 'ProfileStore';

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
});

/**
 * Earned progression, keyed by a stable client id and backed by a durable
 * store.
 *
 * The in-memory map is a CACHE in front of a `PersistenceAdapter`; the adapter
 * decides where the bytes actually live, so this class never knows about files
 * or databases. Today that is a JSON file on the server's disk, which is why a
 * restart no longer wipes progress.
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
  private opened = false;

  constructor(adapter: PersistenceAdapter) {
    this.adapter = adapter;
  }

  /**
   * Read everything the backing store holds.
   *
   * Called once during startup, before the server listens, so the first player
   * to join already finds their profile in memory.
   */
  open(): void {
    if (this.opened) return;
    this.opened = true;
    for (const [playerId, profile] of this.adapter.open()) {
      this.profiles.set(playerId, { ...profile });
    }
    logger.info(SCOPE, `store="${this.adapter.name}" profiles=${this.profiles.size}`);
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
    };
    this.profiles.set(playerId, profile);
    // The adapter coalesces these; durability is guaranteed by `flush`.
    this.adapter.put(playerId, profile);
  }

  /** Force everything to durable storage. Called on shutdown. */
  flush(): void {
    this.adapter.flush();
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
