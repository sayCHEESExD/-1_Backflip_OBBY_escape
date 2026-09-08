import { Client, Room } from '@colyseus/core';
import type { ArraySchema } from '@colyseus/schema';
import {
  DEATH_PLANE_Y,
  MessageType,
  PlayerAnimationState,
  SPAWN_POSITION,
  SPAWN_ROTATION_Y,
  type ClaimTrophyMessage,
  type BuyAuraMessage,
  type BuyBootMessage,
  type BuyTrailMessage,
  type EquipAuraMessage,
  type EquipTrailMessage,
  type RebirthMessage,
  type HazardHitMessage,
  type MoveMessage,
  type RespawnMessage,
  type RespawnReason,
} from '@obby/shared';
import { serverConfig } from '../config/serverConfig.js';
import { MovementService } from '../movement/MovementService.js';
import { BootService } from '../progression/BootService.js';
import { CosmeticService } from '../progression/CosmeticService.js';
import { AURA_BINDING, TRAIL_BINDING } from '../progression/cosmeticBindings.js';
import { profileStore } from '../progression/ProfileStore.js';
import { LeaderboardService } from '../progression/LeaderboardService.js';
import { ProgressionService } from '../progression/ProgressionService.js';
import { RebirthService } from '../progression/RebirthService.js';
import { SpeedService } from '../progression/SpeedService.js';
import { TreadmillService } from '../progression/TreadmillService.js';
import { TrophyService } from '../progression/TrophyService.js';
import { logger } from '../util/logger.js';
import { GorgeState, LeaderboardEntry } from './state/GorgeState.js';
import { PlayerState } from './state/PlayerState.js';

const SCOPE = 'GorgeRoom';

/**
 * Maximum concurrent players in one gorge instance.
 *
 * Colyseus enforces this itself: the room LOCKS the moment it fills, so the
 * matchmaker stops offering it and `joinOrCreate` gives the next player a new
 * one. There is deliberately nothing here that counts players or picks rooms -
 * a hand-rolled matchmaker would be a second source of truth for something the
 * framework already owns, and the two would eventually disagree.
 */
const MAX_CLIENTS = 15;

/**
 * Seconds between background saves of every connected player.
 *
 * Progression is written whenever something discrete happens - a level, a
 * trophy, a boot, a rebirth - but Speed accrues continuously between those, so
 * an unclean shutdown would otherwise lose the farming since the last level.
 */
const AUTOSAVE_SECONDS = 15;

/**
 * Seconds between leaderboard rebuilds.
 *
 * Slow on purpose. The boards rank persisted progression, which only moves
 * when a profile is saved - on a level, a trophy, a purchase, a rebirth, or
 * the 15s autosave - so refreshing faster would re-sort the same numbers and
 * push patches nobody can see. Colyseus only sends rows that actually
 * changed, so a quiet server costs nothing at all.
 */
const LEADERBOARD_SECONDS = 5;


const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isAnimationState = (value: unknown): value is PlayerAnimationState =>
  typeof value === 'string' &&
  (Object.values(PlayerAnimationState) as string[]).includes(value);

export class GorgeRoom extends Room<GorgeState> {
  override maxClients = MAX_CLIENTS;

  private readonly progression = new ProgressionService();
  private readonly movement = new MovementService();
  private readonly trophies = new TrophyService();
  private readonly speed = new SpeedService();
  private readonly boots = new BootService();
  private readonly treadmills = new TreadmillService();
  private readonly trails = new CosmeticService(TRAIL_BINDING);
  private readonly auras = new CosmeticService(AURA_BINDING);
  private readonly rebirths = new RebirthService();
  /** Global rankings, read from the process-wide profile store. */
  private readonly leaderboards = new LeaderboardService();
  /** Shared across rooms - a room dies with its last client, profiles must not. */
  private readonly profiles = profileStore;
  /** Stable client id per session, used to restore progression on reconnect. */
  private readonly playerIds = new Map<string, string>();
  /** Seconds since the last background save of every connected player. */
  private autosaveTimer = 0;
  /** Seconds since the boards were last rebuilt. */
  private leaderboardTimer = 0;

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

    this.onMessage(MessageType.BuyBoot, (client, message: BuyBootMessage) => {
      this.handleBuyBoot(client, message);
    });

    this.onMessage(MessageType.Rebirth, (client, _message: RebirthMessage) => {
      this.handleRebirth(client);
    });

    this.onMessage(MessageType.BuyTrail, (client, message: BuyTrailMessage) => {
      this.handleBuyCosmetic(client, this.trails, message?.slot);
    });

    this.onMessage(MessageType.EquipTrail, (client, message: EquipTrailMessage) => {
      this.handleEquipCosmetic(client, this.trails, message?.slot);
    });

    this.onMessage(MessageType.BuyAura, (client, message: BuyAuraMessage) => {
      this.handleBuyCosmetic(client, this.auras, message?.slot);
    });

    this.onMessage(MessageType.EquipAura, (client, message: EquipAuraMessage) => {
      this.handleEquipCosmetic(client, this.auras, message?.slot);
    });

    // Populate the boards before the first player can look at them.
    this.refreshLeaderboards();

    this.setSimulationInterval((deltaMs) => this.update(deltaMs), serverConfig.patchRateMs);

    logger.info(SCOPE, `created roomId=${this.roomId} patchRate=${serverConfig.patchRateMs}ms`);
  }

  override onJoin(client: Client, options?: { playerId?: string }): void {
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    this.progression.initialise(player);
    this.trophies.initialise(player);
    this.speed.initialise(player);
    this.boots.initialise(player);
    this.treadmills.initialise(player);
    this.trails.initialise(player);
    this.auras.initialise(player);

    // Restore earned progression for a returning client, then let the derived
    // fields (cap, backflips, movement speed) follow from it.
    const playerId = typeof options?.playerId === 'string' ? options.playerId : '';
    logger.info(SCOPE, `join options playerId=${playerId || '(none)'}`);
    if (playerId) {
      this.playerIds.set(client.sessionId, playerId);
      this.profiles.restore(playerId, player);
      this.boots.equipBest(player);
      // A restored profile could name an item it does not own if the save were
      // hand-edited; the multipliers already ignore that, this keeps the
      // replicated state honest too.
      this.trails.sanitise(player);
      this.auras.sanitise(player);
    }
    this.rebirths.sync(player);
    // LAST of the progression services, because it is the one that resolves
    // movement speed - and it can only do that once the restored rebirth
    // count, boots and cosmetics are all in place.
    this.speed.applyRestoredProgress(player);
    this.treadmills.syncGate(player);
    // Movement is initialised last: it seeds the flip allowance from the
    // capacity the progression services just resolved.
    this.movement.initialise(player);

    this.state.players.set(client.sessionId, player);

    logger.info(
      SCOPE,
      `join sessionId=${client.sessionId} players=${this.state.players.size} ` +
        `level=${player.level} rebirths=${player.rebirths} wins=${player.wins}`,
    );
  }

  override onLeave(client: Client, consented: boolean): void {
    const leaving = this.state.players.get(client.sessionId);
    const playerId = this.playerIds.get(client.sessionId);
    if (leaving && playerId) this.profiles.save(playerId, leaving);
    this.playerIds.delete(client.sessionId);

    this.state.players.delete(client.sessionId);
    this.movement.forget(client.sessionId);
    this.trophies.forget(client.sessionId);
    this.speed.forget(client.sessionId);
    this.treadmills.forget(client.sessionId);
    this.boots.forget(client.sessionId);
    this.trails.forget(client.sessionId);
    this.auras.forget(client.sessionId);
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
  /**
   * Consume one client INPUT and advance the authoritative simulation.
   *
   * The message carries no transform, so there is nothing here that lets a
   * client assert where it is. Position, velocity, rotation, grounded and
   * backflip state are all produced by `MovementService` from the shared
   * simulation and then replicated back.
   */
  /**
   * Consume one client INPUT and advance the authoritative simulation.
   *
   * The message carries no transform, so there is nothing here that lets a
   * client assert where it is. Position, velocity, rotation, grounded and
   * backflip state are all produced by `MovementService` from the shared
   * simulation and then replicated back.
   */
  private handleMove(client: Client, message: MoveMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (!this.movement.applyInput(client.sessionId, player, message)) {
      const reason = this.movement.rejectReason;
      // Stale sequences are ordinary packet reordering, not abuse.
      if (reason && reason !== 'stale-seq') {
        logger.warn(
          SCOPE,
          `input rejected sessionId=${client.sessionId} reason=${reason}`,
        );
      }
      return;
    }

    player.animation = this.deriveAnimation(player);

    // Which treadmill is in force is decided from the position the server just
    // simulated and the rebirth count the server owns - the client says
    // nothing about either, so there is no treadmill claim to validate.
    const treadmill = this.treadmills.resolve(client.sessionId, player);
    if (treadmill.changed) {
      logger.info(
        SCOPE,
        treadmill.active > 0
          ? `treadmill on sessionId=${client.sessionId} tier=${treadmill.active} ` +
            `x${treadmill.multiplier} rebirths=${player.rebirths}`
          : `treadmill off sessionId=${client.sessionId}`,
      );
    }
    if (treadmill.locked && treadmill.changed) {
      logger.info(
        SCOPE,
        `treadmill locked sessionId=${client.sessionId} tier=${treadmill.standing} ` +
          `needs=${this.treadmills.requiredRebirth(treadmill.standing)} ` +
          `has=${player.rebirths}`,
      );
    }

    // Speed is credited from the movement the SERVER simulated, so a client
    // cannot farm by reporting distance it never travelled.
    const gain = this.speed.credit(client.sessionId, player, this.movement.lastStep);
    if (gain.levelsGained > 0) {
      this.movement.syncCapacity(client.sessionId, player);
      this.persist(client.sessionId, player);
      logger.info(
        SCOPE,
        `level up sessionId=${client.sessionId} level=${player.level} ` +
          `backflips=${gain.capacity} totalSpeed=${Math.floor(player.totalSpeed)}`,
      );
    }
  }

  /** Coarse visual state derived from the authoritative simulation. */
  private deriveAnimation(player: PlayerState): PlayerAnimationState {
    if (!player.grounded) {
      return player.verticalVelocity > 0
        ? PlayerAnimationState.JumpStart
        : PlayerAnimationState.Airborne;
    }
    if (player.speed < 0.35) return PlayerAnimationState.Idle;
    return player.speed >= 9 ? PlayerAnimationState.Run : PlayerAnimationState.Walk;
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

    this.persist(client.sessionId, player);
    logger.info(
      SCOPE,
      `trophy awarded sessionId=${client.sessionId} base=+${result.base} ` +
        `paid=+${result.value} aura=${player.auraSlot} wins=${player.wins}`,
    );
    this.respawn(client.sessionId, player, 'trophy');
  }

  /**
   * A boot purchase is a REQUEST. BootService checks the slot, the player's
   * Wins and that they are standing at that pedestal before granting it.
   */
  private handleBuyBoot(client: Client, message: BuyBootMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const result = this.boots.buy(player, message?.slot);
    if (!result.ok) {
      // 'already-owned' is the normal case for walking back over a pedestal.
      if (result.reason !== 'already-owned') {
        logger.warn(
          SCOPE,
          `boot purchase rejected sessionId=${client.sessionId} ` +
            `slot=${String(message?.slot)} reason=${result.reason}`,
        );
      }
      return;
    }

    // A better boot changes Speed per step immediately, not on the next input.
    this.speed.refreshRate(player);
    this.persist(client.sessionId, player);
    logger.info(
      SCOPE,
      `boot bought sessionId=${client.sessionId} slot=${result.tier.slot} ` +
        `"${result.tier.name}" +${result.tier.speedPerStep}/step ` +
        `spent=${result.spent} wins=${result.winsAfter}`,
    );
  }

  /**
   * Rebirth is entirely the server's decision: the client asks, and this
   * checks the level requirement before resetting anything.
   */
  private handleRebirth(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const before = { level: player.level, rebirths: player.rebirths };
    const result = this.rebirths.rebirth(player);

    if (!result.ok) {
      logger.warn(
        SCOPE,
        `rebirth rejected sessionId=${client.sessionId} level=${before.level}/` +
          `${player.maxLevel} reason=${result.reason}`,
      );
      return;
    }

    // The level curve restarted, so the movement baseline must too - and a
    // rebirth is exactly what unlocks the next treadmill.
    this.speed.reset(client.sessionId, player);
    // Re-resolves level, flip allowance, movement speed and the gain rate from
    // the reset curve - including the equipped trail.
    this.speed.applyRestoredProgress(player);
    this.treadmills.syncGate(player);
    this.persist(client.sessionId, player);

    logger.info(
      SCOPE,
      `rebirth sessionId=${client.sessionId} rebirths=${before.rebirths}->` +
        `${result.rebirths} maxLevel=${player.maxLevel} ` +
        `multiplier=x${result.multiplier.toFixed(2)} wins kept=${player.wins}`,
    );
  }

  /**
   * A cosmetic purchase is a REQUEST carrying only a slot number.
   *
   * `CosmeticService` checks the slot, whether it is already owned, the Wins
   * and a cooldown, then takes payment through the one wallet. Nothing in the
   * message names a price or a multiplier, so there is no figure to forge.
   */
  private handleBuyCosmetic(
    client: Client,
    shop: CosmeticService,
    slot: unknown,
  ): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const result = shop.buy(player, slot);
    if (!result.ok) {
      if (result.reason !== 'already-owned') {
        logger.warn(
          SCOPE,
          `${shop.label} purchase rejected sessionId=${client.sessionId} ` +
            `slot=${String(slot)} reason=${result.reason}`,
        );
      }
      return;
    }

    // A trail changes movement speed, so the replicated multiplier has to
    // follow immediately rather than on the next input.
    this.speed.applyRestoredProgress(player);
    this.persist(client.sessionId, player);
    logger.info(
      SCOPE,
      `${shop.label} bought sessionId=${client.sessionId} "${result.tier.name}" ` +
        `x${result.tier.multiplier} spent=${result.spent} wins=${result.winsAfter}`,
    );
  }

  /** Equipping is refused outright for anything the player does not own. */
  private handleEquipCosmetic(
    client: Client,
    shop: CosmeticService,
    slot: unknown,
  ): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const result = shop.equip(player, slot);
    if (!result.ok) {
      logger.warn(
        SCOPE,
        `${shop.label} equip rejected sessionId=${client.sessionId} ` +
          `slot=${String(slot)} reason=${result.reason}`,
      );
      return;
    }

    this.speed.applyRestoredProgress(player);
    this.persist(client.sessionId, player);
    logger.info(
      SCOPE,
      `${shop.label} equipped sessionId=${client.sessionId} ` +
        `slot=${result.slot} "${result.tier?.name ?? 'none'}"`,
    );
  }

  /** Capture earned progression so a reconnect restores it. */
  private persist(sessionId: string, player: PlayerState): void {
    const playerId = this.playerIds.get(sessionId);
    if (playerId) this.profiles.save(playerId, player);
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

    this.autosaveTimer += deltaMs / 1000;
    if (this.autosaveTimer >= AUTOSAVE_SECONDS) {
      this.autosaveTimer = 0;
      this.state.players.forEach((player, sessionId) => this.persist(sessionId, player));
    }

    this.leaderboardTimer += deltaMs / 1000;
    if (this.leaderboardTimer >= LEADERBOARD_SECONDS) {
      this.leaderboardTimer = 0;
      this.refreshLeaderboards();
    }

    // The blue gorge floor is a death zone: falling respawns at spawn.
    // The server owns this decision even while movement is client-reported.
    this.state.players.forEach((player, sessionId) => {
      if (player.y > DEATH_PLANE_Y) return;
      this.respawn(sessionId, player, 'fell');
    });
  }

  /**
   * Rebuild the three boards from the global profile store.
   *
   * Rows are only rewritten when they actually differ, so an unchanged board
   * produces no patch at all - which is what keeps a slow-moving scoreboard
   * off the wire entirely.
   */
  private refreshLeaderboards(): void {
    const ranked = this.leaderboards.build(this.profiles.all);
    let changed = false;
    changed = this.applyBoard(this.state.topRebirths, ranked.get('rebirths')) || changed;
    changed = this.applyBoard(this.state.topSpeed, ranked.get('totalSpeed')) || changed;
    changed = this.applyBoard(this.state.topWins, ranked.get('wins')) || changed;
    if (changed) this.state.leaderboardVersion += 1;
  }

  /** Copy ranked rows into a replicated array. @returns true if anything moved. */
  private applyBoard(
    target: ArraySchema<LeaderboardEntry>,
    rows: readonly { name: string; value: number }[] | undefined,
  ): boolean {
    const next = rows ?? [];
    let changed = target.length !== next.length;

    for (let i = 0; i < next.length; i += 1) {
      const row = next[i] as { name: string; value: number };
      const existing = target[i];
      if (!existing) {
        const entry = new LeaderboardEntry();
        entry.name = row.name;
        entry.value = row.value;
        target.push(entry);
        changed = true;
        continue;
      }
      if (existing.name !== row.name) {
        existing.name = row.name;
        changed = true;
      }
      if (existing.value !== row.value) {
        existing.value = row.value;
        changed = true;
      }
    }

    while (target.length > next.length) {
      target.pop();
      changed = true;
    }
    return changed;
  }

  private respawn(sessionId: string, player: PlayerState, reason: RespawnReason): void {
    // The simulation owns the transform, so respawning means telling it to
    // move - not writing the replicated fields directly.
    this.movement.teleport(
      sessionId,
      player,
      SPAWN_POSITION.x,
      SPAWN_POSITION.y,
      SPAWN_POSITION.z,
      SPAWN_ROTATION_Y,
    );
    player.speed = 0;
    player.animation = PlayerAnimationState.Idle;
    // A new run: every platform becomes collectable again.
    this.trophies.resetRun(sessionId);
    // Drop the movement baseline so the teleport is not credited as travel,
    // and re-resolve the treadmill: spawn is not a deck.
    this.speed.reset(sessionId, player);
    this.treadmills.resolve(sessionId, player);

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
