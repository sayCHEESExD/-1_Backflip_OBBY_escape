import type { PlayerAnimationState, PlayerMotionState } from './player.js';

/**
 * Client -> server transform + motion update (MessageType.Move).
 *
 * This is the whole per-frame payload: a transform, four scalars of motion
 * state and the visual state name. No bone data is ever transmitted - every
 * client reconstructs the pose locally from these signals.
 */
export interface MoveMessage extends PlayerMotionState {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  animation: PlayerAnimationState;
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
