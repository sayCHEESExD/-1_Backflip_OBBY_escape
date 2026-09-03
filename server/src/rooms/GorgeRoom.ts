import { Client, Room } from '@colyseus/core';
import {
  DEATH_PLANE_Y,
  MessageType,
  PlayerAnimationState,
  SPAWN_POSITION,
  SPAWN_ROTATION_Y,
  type ClaimTrophyMessage,
  type HazardHitMessage,
  type MoveMessage,
  type RespawnMessage,
  type RespawnReason,
} from '@obby/shared';
import { serverConfig } from '../config/serverConfig.js';
import { BackflipService } from '../progression/BackflipService.js';
import { ProgressionService } from '../progression/ProgressionService.js';
import { TrophyService } from '../progression/TrophyService.js';
import { logger } from '../util/logger.js';
import { GorgeState } from './state/GorgeState.js';
import { PlayerState } from './state/PlayerState.js';

const SCOPE = 'GorgeRoom';

/** Maximum concurrent players in one gorge instance. */
const MAX_CLIENTS = 24;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isAnimationState = (value: unknown): value is PlayerAnimationState =>
  typeof value === 'string' &&
  (Object.values(PlayerAnimationState) as string[]).includes(value);

export class GorgeRoom extends Room<GorgeState> {
  override maxClients = MAX_CLIENTS;

  private readonly progression = new ProgressionService();
  private readonly backflips = new BackflipService();
  private readonly trophies = new TrophyService();

  override onCreate(): void {
    this.state = new GorgeState();
    this.setPatchRate(serverConfig.patchRateMs);

    this.onMessage(MessageType.Move, (client, message: MoveMessage) => {
      this.handleMove(client, message);
    });

    this.onMessage(MessageType.ClaimTrophy, (client, message: ClaimTrophyMessage) => {
      this.handleClaimTrophy(client, message);
    });

    this.onMessage(MessageType.HazardHit, (client, message: HazardHitMessage) => {
      this.handleHazardHit(client, message);
    });

    this.setSimulationInterval((deltaMs) => this.update(deltaMs), serverConfig.patchRateMs);

    logger.info(SCOPE, `created roomId=${this.roomId} patchRate=${serverConfig.patchRateMs}ms`);
  }

  override onJoin(client: Client): void {
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    this.progression.initialise(player);
    this.backflips.initialise(player);
    this.trophies.initialise(player);
    this.state.players.set(client.sessionId, player);

    logger.info(
      SCOPE,
      `join sessionId=${client.sessionId} players=${this.state.players.size}`,
    );
  }

  override onLeave(client: Client, consented: boolean): void {
    this.state.players.delete(client.sessionId);
    this.backflips.forget(client.sessionId);
    this.trophies.forget(client.sessionId);
    logger.info(
      SCOPE,
      `leave sessionId=${client.sessionId} consented=${consented} players=${this.state.players.size}`,
    );
  }

  override onDispose(): void {
    logger.info(SCOPE, `disposed roomId=${this.roomId}`);
  }

  /**
   * Milestone 1 accepts the client-reported transform and motion state after
   * shape validation. Movement is not yet server-simulated; that lands with
   * the gorge collision pass.
   *
   * The backflip COUNT is validated here rather than trusted, because how many
   * flips a player may perform is gameplay, and gameplay is server-owned.
   */
  private handleMove(client: Client, message: MoveMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (
      !isFiniteNumber(message?.x) ||
      !isFiniteNumber(message?.y) ||
      !isFiniteNumber(message?.z) ||
      !isFiniteNumber(message?.rotationY)
    ) {
      return;
    }

    player.x = message.x;
    player.y = message.y;
    player.z = message.z;
    player.rotationY = message.rotationY;

    player.speed = isFiniteNumber(message.speed) ? Math.max(0, message.speed) : 0;
    player.verticalVelocity = isFiniteNumber(message.verticalVelocity)
      ? message.verticalVelocity
      : 0;

    const grounded = message.grounded === true;
    player.grounded = grounded;

    player.flipCount = this.backflips.resolveFlipCount(
      client.sessionId,
      player,
      grounded,
      message.flipCount,
    );

    player.animation = isAnimationState(message.animation)
      ? message.animation
      : PlayerAnimationState.Idle;
    player.ready = true;
  }

  /**
   * A trophy claim is a REQUEST. TrophyService checks the platform, the run's
   * claim history and the player's reported position before awarding anything,
   * and the award is scoped to this session alone.
   */
  private handleClaimTrophy(client: Client, message: ClaimTrophyMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const result = this.trophies.claim(client.sessionId, player, message?.platformIndex);

    if (!result.ok) {
      logger.warn(
        SCOPE,
        `claim rejected sessionId=${client.sessionId} index=${String(
          message?.platformIndex,
        )} reason=${result.reason}`,
      );
      return;
    }

    logger.info(
      SCOPE,
      `trophy awarded sessionId=${client.sessionId} +${result.value} wins=${player.wins}`,
    );
    this.respawn(client.sessionId, player, 'trophy');
  }

  /** A reported hazard only ever affects the player who reported it. */
  private handleHazardHit(client: Client, message: HazardHitMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (message?.kind !== 'redline') return;
    this.respawn(client.sessionId, player, 'redline');
  }

  private update(deltaMs: number): void {
    this.state.elapsed += deltaMs / 1000;

    // The blue gorge floor is a death zone: falling respawns at spawn.
    // The server owns this decision even while movement is client-reported.
    this.state.players.forEach((player, sessionId) => {
      if (player.y > DEATH_PLANE_Y) return;
      this.respawn(sessionId, player, 'fell');
    });
  }

  private respawn(sessionId: string, player: PlayerState, reason: RespawnReason): void {
    player.x = SPAWN_POSITION.x;
    player.y = SPAWN_POSITION.y;
    player.z = SPAWN_POSITION.z;
    player.rotationY = SPAWN_ROTATION_Y;
    player.speed = 0;
    player.verticalVelocity = 0;
    player.grounded = true;
    player.animation = PlayerAnimationState.Idle;
    this.backflips.reset(sessionId, player);
    // A new run: every platform becomes collectable again.
    this.trophies.resetRun(sessionId);

    const payload: RespawnMessage = {
      x: SPAWN_POSITION.x,
      y: SPAWN_POSITION.y,
      z: SPAWN_POSITION.z,
      rotationY: SPAWN_ROTATION_Y,
      reason,
    };

    const client = this.clients.find((c) => c.sessionId === sessionId);
    client?.send(MessageType.Respawn, payload);
    logger.info(SCOPE, `respawn sessionId=${sessionId} reason=${reason}`);
  }
}
