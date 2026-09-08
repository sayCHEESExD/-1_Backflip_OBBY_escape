import {
  LEADERBOARD_BOARDS,
  LEADERBOARD_SIZE,
  leaderboardName,
  type LeaderboardMetric,
} from '@obby/shared';
import type { Profile } from './ProfileStore.js';

/** One ranked row, ready to be replicated. */
export interface RankedEntry {
  readonly name: string;
  readonly value: number;
}

/**
 * The three figures a board can rank by.
 *
 * A stored `Profile` satisfies this, and so does a live `PlayerState`, which
 * is the point: a player who is online right now can be ranked on what they
 * have actually earned instead of on their last save.
 */
export interface RankedSource {
  readonly totalSpeed: number;
  readonly wins: number;
  readonly rebirths: number;
}

/**
 * Global rankings, read from the profile store.
 *
 * GLOBAL is the point. A room only ever knows its own fifteen players, but the
 * `ProfileStore` is process-wide - it has to be, because a room dies with its
 * last client and progression must outlive that - so it already holds every
 * player this server has seen, across every room. Ranking off the store is
 * therefore the whole population, and it needs no cross-room messaging.
 *
 * Nothing here reads client input. The figures are the same ones the server
 * writes when it grants Speed, awards Wins or performs a rebirth, so a client
 * cannot submit a score any more than it can submit a position.
 */
export class LeaderboardService {
  /**
   * Rank every profile and take the top nine per board.
   *
   * One pass per board over the profile map. At the scale this game runs at
   * that is a handful of microseconds, and it is called on a slow interval
   * rather than per tick.
   */
  build(
    profiles: ReadonlyMap<string, Profile>,
    live: Iterable<readonly [string, RankedSource]> = [],
  ): Map<LeaderboardMetric, RankedEntry[]> {
    const result = new Map<LeaderboardMetric, RankedEntry[]>();

    // Stored progression first, then whoever is online on top of it. A profile
    // is only written on an autosave or a disconnect, so ranking the store
    // alone leaves a player missing from the board for as long as fifteen
    // seconds after they earn something - invisible on a server with a history
    // behind it, and the entire board on a freshly started one, where the only
    // players who have scored are the ones currently playing.
    const current = new Map<string, RankedSource>(profiles);
    for (const [playerId, source] of live) current.set(playerId, source);

    for (const board of LEADERBOARD_BOARDS) {
      const ranked: RankedEntry[] = [];

      for (const [playerId, profile] of current) {
        const value = readMetric(profile, board.metric);
        // A player who has not scored on this board yet is not a rank - an
        // empty row reads better than nine zeroes.
        if (!Number.isFinite(value) || value <= 0) continue;
        ranked.push({ name: leaderboardName(playerId), value });
      }

      // Highest first; ties broken by name so the order is STABLE. Without a
      // tiebreak, two equal scores could swap places every refresh and the
      // board would flicker for no reason.
      ranked.sort((a, b) => (b.value - a.value) || a.name.localeCompare(b.name));
      result.set(board.metric, ranked.slice(0, LEADERBOARD_SIZE));
    }

    return result;
  }
}

/** The figure a board ranks by. */
const readMetric = (profile: RankedSource, metric: LeaderboardMetric): number => {
  switch (metric) {
    case 'rebirths':
      return profile.rebirths;
    case 'totalSpeed':
      return profile.totalSpeed;
    case 'wins':
      return profile.wins;
  }
};
