

/**
 * Client -> server input (MessageType.Move).
 *
 * INPUT ONLY. There is deliberately no position, velocity or rotation in this
 * message: the server simulates movement from intent and owns the result, so
 * a client has no channel through which to assert where it is.
 *
 * `seq` lets the server tell the client which inputs it has consumed, which is
 * what makes client-side prediction reconcilable.
 */
export interface MoveMessage {
  /** Monotonically increasing input sequence number. */
  seq: number;
  /** Seconds this input covers. Clamped and rate-limited server-side. */
  dt: number;
  /** -1..1, camera-relative. */
  moveX: number;
  /** -1..1, camera-relative. */
  moveZ: number;
  jump: boolean;
  sprint: boolean;
  /** Yaw the camera faced, so movement is camera-relative. */
  cameraYaw: number;
}

/** Why a run ended. */
export type RespawnReason = 'fell' | 'redline' | 'trophy' | 'manual';

/** Server -> client authoritative respawn (MessageType.Respawn). */
export interface RespawnMessage {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  reason: RespawnReason;
}

/**
 * Client -> server: "I walked into the collection zone of this platform."
 *
 * A request, never a grant. The server checks the index, the player's reported
 * position and whether this platform was already claimed in the current run,
 * then awards the wins itself.
 */
export interface ClaimTrophyMessage {
  platformIndex: number;
}

/** Client -> server: "I touched a hazard." The server decides the outcome. */
export interface HazardHitMessage {
  kind: 'redline';
}

/**
 * Client -> server: "I walked onto this boot's pedestal, buy it."
 *
 * A request, never a grant. The server checks the slot, the player's Wins and
 * that they are actually standing at that pedestal.
 */
export interface BuyBootMessage {
  slot: number;
}

/**
 * Client -> server: "rebirth me."
 *
 * Carries nothing: the server already knows the player's level and rebirth
 * count, and it is the only thing allowed to decide whether the requirement
 * is met.
 */
export type RebirthMessage = Record<string, never>;

/** Client -> server: buy the trail in this shop slot. */
export interface BuyTrailMessage {
  slot: number;
}

/** Client -> server: wear an OWNED trail, or 0 to remove it. */
export interface EquipTrailMessage {
  slot: number;
}

/** Client -> server: buy the aura in this shop slot. */
export interface BuyAuraMessage {
  slot: number;
}

/** Client -> server: wear an OWNED aura, or 0 to remove it. */
export interface EquipAuraMessage {
  slot: number;
}
