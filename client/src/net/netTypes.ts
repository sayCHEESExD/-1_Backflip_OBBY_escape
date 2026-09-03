import type { PlayerAnimationState, PlayerMotionState } from '@obby/shared';
import type { MapSchema } from '@colyseus/schema';

/**
 * Client-side TYPE mirror of the server's Colyseus schema.
 *
 * These are types only - colyseus.js builds the concrete schema instances at
 * runtime from the handshake reflection, so there is no duplicated schema
 * class to keep in sync, only this shape.
 */
export interface NetPlayerState extends PlayerMotionState {
  sessionId: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  animation: PlayerAnimationState;
  /** Server-authoritative flips allowed per airborne window. */
  backflipCapacity: number;
  level: number;
  progression: number;
  rebirths: number;
  backflips: number;
  ready: boolean;
}

export interface NetGorgeState {
  players: MapSchema<NetPlayerState>;
  elapsed: number;
}

/** Connection lifecycle, surfaced to the UI. */
export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';
