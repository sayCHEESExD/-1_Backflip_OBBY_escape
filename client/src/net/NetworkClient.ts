import {
  CLIENT_SEND_MS,
  MessageType,
  ROOM_NAME,
  type BuyBootMessage,
  type ClaimTrophyMessage,
  type RebirthMessage,
  type HazardHitMessage,
  type MoveMessage,
  type RespawnMessage,
} from '@obby/shared';
import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import { clientConfig } from '../config/clientConfig.js';
import { logger } from '../util/logger.js';
import type { ConnectionStatus, NetGorgeState, NetPlayerState } from './netTypes.js';

const SCOPE = 'NetworkClient';

/** Key under which this browser's stable player id is kept. */
const PLAYER_ID_KEY = 'obby.playerId';

/**
 * Backoff between join attempts, in milliseconds. One entry per RETRY.
 *
 * A free managed host suspends an idle service and takes the better part of a
 * minute to wake it, so the first visitor after a quiet spell always meets a
 * server that is not listening yet. A single attempt turns that into a session
 * that is permanently offline - it renders and it moves, so it looks healthy,
 * but nothing is server-authoritative and therefore nothing progresses. These
 * retries turn a cold start into a slow start instead.
 */
const JOIN_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 20000] as const;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * A stable id for this browser, so progression survives a reload.
 *
 * Falls back to a throwaway id when storage is unavailable (private windows,
 * blocked site data) - the session still works, it just will not be restored.
 */
const resolvePlayerId = (): string => {
  const fresh = `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  try {
    const existing = window.localStorage.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    window.localStorage.setItem(PLAYER_ID_KEY, fresh);
  } catch {
    return fresh;
  }
  return fresh;
};

/** The three boards, copied out of the replicated state. */
export interface LeaderboardSnapshot {
  readonly version: number;
  readonly rebirths: readonly { name: string; value: number }[];
  readonly totalSpeed: readonly { name: string; value: number }[];
  readonly wins: readonly { name: string; value: number }[];
}

/** Everything the game needs to react to. Kept deliberately small. */
export interface NetworkHandlers {
  onStatusChange?(status: ConnectionStatus, detail?: string): void;
  onSelfJoined?(sessionId: string): void;
  onPlayerAdded?(sessionId: string, player: NetPlayerState): void;
  onPlayerChanged?(sessionId: string, player: NetPlayerState): void;
  onPlayerRemoved?(sessionId: string): void;
  onRespawn?(message: RespawnMessage): void;
}

/**
 * Thin wrapper over colyseus.js.
 *
 * The rest of the client never imports colyseus.js directly - swapping the
 * transport or the room name only touches this file and @obby/shared.
 */
export class NetworkClient {
  private readonly client: Client;
  private readonly handlers: NetworkHandlers;

  private room: Room<NetGorgeState> | null = null;
  private status: ConnectionStatus = 'idle';
  private lastSendAt = 0;
  /** So a server too old to send boards is reported once, not every frame. */
  private missingBoardsLogged = false;

  constructor(handlers: NetworkHandlers = {}) {
    this.client = new Client(clientConfig.serverUrl);
    this.handlers = handlers;
  }

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * The replicated leaderboards, as plain data.
   *
   * Copied out rather than handing the room's schema objects to the rest of
   * the client: colyseus.js stays inside this module, and the world layer gets
   * something it can draw without knowing where it came from.
   *
   * Returns null until the first state arrives, and a `version` that only
   * changes when the server actually reordered a board.
   */
  get leaderboards(): LeaderboardSnapshot | null {
    const state = this.room?.state;
    if (!state) return null;
    // A server built before the boards existed replicates no such field, and
    // the boards would then draw empty forever with nothing to say why. That
    // is indistinguishable from "nobody has scored yet" on screen, so it is
    // called out once here instead - the difference between a deployment that
    // is behind and a scoreboard that is simply new.
    if (!state.topRebirths && !this.missingBoardsLogged) {
      this.missingBoardsLogged = true;
      logger.warn(
        SCOPE,
        'server replicates no leaderboard fields - it is older than this ' +
          'client; redeploy the server',
      );
    }
    const rows = (entries: { name: string; value: number }[] | undefined) =>
      entries ? entries.map((e) => ({ name: e.name, value: e.value })) : [];
    return {
      version: state.leaderboardVersion,
      rebirths: rows(state.topRebirths),
      totalSpeed: rows(state.topSpeed),
      wins: rows(state.topWins),
    };
  }

  async connect(): Promise<void> {
    this.setStatus('connecting');
    logger.info(SCOPE, `joining "${ROOM_NAME}" at ${clientConfig.serverUrl}`);

    const playerId = resolvePlayerId();
    const attempts = JOIN_BACKOFF_MS.length + 1;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        this.room = await this.client.joinOrCreate<NetGorgeState>(ROOM_NAME, {
          playerId,
        });
        break;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        logger.warn(SCOPE, `join attempt ${attempt}/${attempts} failed: ${detail}`);

        if (attempt === attempts) {
          this.setStatus('error', detail);
          logger.error(SCOPE, 'join failed:', detail);
          throw error;
        }

        // Kept in 'connecting' with the attempt as the detail, so the status
        // listener sees a wake-up in progress rather than a dead connection.
        this.setStatus('connecting', `attempt ${attempt + 1}/${attempts}`);
        await sleep(JOIN_BACKOFF_MS[attempt - 1] ?? 0);
      }
    }

    if (!this.room) throw new Error('join produced no room');

    this.bindRoom(this.room);
    this.setStatus('connected');
    logger.info(SCOPE, `joined roomId=${this.room.roomId} sessionId=${this.room.sessionId}`);
    this.handlers.onSelfJoined?.(this.room.sessionId);
  }

  /**
   * Report the local INPUT, throttled to CLIENT_SEND_RATE.
   * @param now high-resolution timestamp in milliseconds
   */
  sendInput(now: number, message: MoveMessage): void {
    if (!this.room) return;
    // Deliberately NOT rate limited. The client simulates on a fixed 60Hz
    // step and the server advances only by the inputs it receives, so
    // throttling here would leave the authoritative position permanently
    // behind the player. The message is seven small fields.
    this.lastSendAt = now;
    this.room.send(MessageType.Move, message);
  }

  /**
   * Send an input immediately, bypassing the rate limit.
   *
   * Used right before a trophy claim or boot purchase: the server validates
   * those against the position it has simulated, so the movement that gets the
   * player there must be consumed before the request arrives.
   */
  sendInputNow(now: number, message: MoveMessage): void {
    if (!this.room) return;
    this.lastSendAt = now;
    this.room.send(MessageType.Move, message);
  }

  /** Ask the server to award a trophy. The server decides; this never grants. */
  claimTrophy(platformIndex: number): void {
    const message: ClaimTrophyMessage = { platformIndex };
    this.room?.send(MessageType.ClaimTrophy, message);
  }

  /** Ask the server to grant a boot. The server decides; this never grants. */
  buyBoot(slot: number): void {
    const message: BuyBootMessage = { slot };
    this.room?.send(MessageType.BuyBoot, message);
  }

  /** Ask the server to rebirth. The server checks the requirement. */
  requestRebirth(): void {
    const message: RebirthMessage = {};
    this.room?.send(MessageType.Rebirth, message);
  }

  /** Report touching a hazard. Only ever affects this player. */
  reportHazard(): void {
    const message: HazardHitMessage = { kind: 'redline' };
    this.room?.send(MessageType.HazardHit, message);
  }

  async disconnect(): Promise<void> {
    await this.room?.leave(true);
    this.room = null;
    this.setStatus('disconnected');
  }

  /** Ask to buy a trail. The server decides and replicates the result. */
  buyTrail(slot: number): void {
    this.room?.send(MessageType.BuyTrail, { slot });
  }

  /** Ask to wear an owned trail, or 0 to remove it. */
  equipTrail(slot: number): void {
    this.room?.send(MessageType.EquipTrail, { slot });
  }

  /** Ask to buy an aura. */
  buyAura(slot: number): void {
    this.room?.send(MessageType.BuyAura, { slot });
  }

  /** Ask to wear an owned aura, or 0 to remove it. */
  equipAura(slot: number): void {
    this.room?.send(MessageType.EquipAura, { slot });
  }

  private bindRoom(room: Room<NetGorgeState>): void {
    const $ = getStateCallbacks(room);

    $(room.state).players.onAdd((player, sessionId) => {
      this.handlers.onPlayerAdded?.(sessionId, player);
      $(player).onChange(() => {
        this.handlers.onPlayerChanged?.(sessionId, player);
      });
    });

    $(room.state).players.onRemove((_player, sessionId) => {
      this.handlers.onPlayerRemoved?.(sessionId);
    });

    room.onMessage<RespawnMessage>(MessageType.Respawn, (message) => {
      logger.info(SCOPE, 'server respawn:', message.reason);
      this.handlers.onRespawn?.(message);
    });

    room.onError((code, message) => {
      logger.error(SCOPE, `room error ${code}: ${message ?? ''}`);
      this.setStatus('error', message);
    });

    room.onLeave((code) => {
      logger.warn(SCOPE, `left room (code ${code})`);
      this.setStatus('disconnected', `code ${code}`);
    });
  }

  private setStatus(status: ConnectionStatus, detail?: string): void {
    this.status = status;
    this.handlers.onStatusChange?.(status, detail);
  }
}
