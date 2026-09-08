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
  build(profiles: ReadonlyMap<string, Profile>): Map<LeaderboardMetric, RankedEntry[]> {
    const result = new Map<LeaderboardMetric, RankedEntry[]>();

    for (const board of LEADERBOARD_BOARDS) {
      const ranked: RankedEntry[] = [];

      for (const [playerId, profile] of profiles) {
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

/** The stored figure a board ranks by. */
const readMetric = (profile: Profile, metric: LeaderboardMetric): number => {
  switch (metric) {
    case 'rebirths':
      return profile.rebirths;
    case 'totalSpeed':
      return profile.totalSpeed;
    case 'wins':
      return profile.wins;
  }
};
