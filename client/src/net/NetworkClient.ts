import {
  CLIENT_SEND_MS,
  MessageType,
  ROOM_NAME,
  type ClaimTrophyMessage,
  type HazardHitMessage,
  type MoveMessage,
  type RespawnMessage,
} from '@obby/shared';
import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import { clientConfig } from '../config/clientConfig.js';
import { logger } from '../util/logger.js';
import type { ConnectionStatus, NetGorgeState, NetPlayerState } from './netTypes.js';

const SCOPE = 'NetworkClient';

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

  async connect(): Promise<void> {
    this.setStatus('connecting');
    logger.info(SCOPE, `joining "${ROOM_NAME}" at ${clientConfig.serverUrl}`);

    try {
      this.room = await this.client.joinOrCreate<NetGorgeState>(ROOM_NAME);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.setStatus('error', detail);
      logger.error(SCOPE, 'join failed:', detail);
      throw error;
    }

    this.bindRoom(this.room);
    this.setStatus('connected');
    logger.info(SCOPE, `joined roomId=${this.room.roomId} sessionId=${this.room.sessionId}`);
    this.handlers.onSelfJoined?.(this.room.sessionId);
  }

  /**
   * Report the local transform, throttled to CLIENT_SEND_RATE.
   * @param now high-resolution timestamp in milliseconds
   */
  sendTransform(now: number, message: MoveMessage): void {
    if (!this.room) return;
    if (now - this.lastSendAt < CLIENT_SEND_MS) return;
    this.lastSendAt = now;
    this.room.send(MessageType.Move, message);
  }

  /**
   * Send a transform immediately, bypassing the rate limit.
   *
   * Used right before a trophy claim: the server validates a claim against the
   * last transform it received, so at 20Hz the claim would otherwise overtake
   * the position that justifies it and be rejected as out of range.
   */
  sendTransformNow(now: number, message: MoveMessage): void {
    if (!this.room) return;
    this.lastSendAt = now;
    this.room.send(MessageType.Move, message);
  }

  /** Ask the server to award a trophy. The server decides; this never grants. */
  claimTrophy(platformIndex: number): void {
    const message: ClaimTrophyMessage = { platformIndex };
    this.room?.send(MessageType.ClaimTrophy, message);
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
