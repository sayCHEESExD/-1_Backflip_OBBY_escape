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

/** Server -> client authoritative respawn (MessageType.Respawn). */
export interface RespawnMessage {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  reason: 'fell' | 'manual';
}
