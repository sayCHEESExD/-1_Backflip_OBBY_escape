/**
 * Network-level constants. Must stay identical on client and server.
 */

/** Colyseus room registered by the server and joined by the client. */
export const ROOM_NAME = 'gorge';

/** Default server port. Override with the PORT env var on the server. */
export const DEFAULT_SERVER_PORT = 2567;

/** Server simulation / state broadcast rate, in Hz. */
export const SERVER_TICK_RATE = 20;

/** Milliseconds between server ticks. */
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;

/** How often the client pushes its input/transform to the server, in Hz. */
export const CLIENT_SEND_RATE = 20;

/** Milliseconds between client transform sends. */
export const CLIENT_SEND_MS = 1000 / CLIENT_SEND_RATE;

/**
 * Client->server and server->client message identifiers.
 * Kept as a const object (not an enum) so it survives `verbatimModuleSyntax`
 * and erases cleanly in both build pipelines.
 */
export const MessageType = {
  /** Client -> server: local player transform update. */
  Move: 'move',
  /** Server -> client: authoritative respawn instruction. */
  Respawn: 'respawn',
  /** Client -> server: request to collect a trophy platform's reward. */
  ClaimTrophy: 'claimTrophy',
  /** Client -> server: report touching a hazard. */
  HazardHit: 'hazardHit',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];
