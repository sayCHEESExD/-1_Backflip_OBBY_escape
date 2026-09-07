/**
 * Visual tuning for the player character. Data-driven so the model can be
 * re-authored without touching gameplay code.
 */

/**
 * Yaw correction applied to the FBX model inside its container, in radians.
 *
 * player.fbx already faces +Z after FBXLoader applies the export's -90 deg X
 * correction, and the game also treats +Z as "forward" (down the gorge), so no
 * correction is needed. Verified visually against the running client.
 */
export const PLAYER_MODEL_YAW_OFFSET = 0;

/**
 * Tint palette for remote players, chosen by a hash of the session id so the
 * same player looks consistent to everyone in the room.
 */
export const REMOTE_PLAYER_TINTS: readonly number[] = [
  0x7dd3fc, 0xfca5a5, 0xfcd34d, 0x86efac, 0xc4b5fd, 0xf9a8d4,
];

/** Deterministic tint for a session id. */
export const tintForSession = (sessionId: string): number => {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i += 1) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % REMOTE_PLAYER_TINTS.length;
  return REMOTE_PLAYER_TINTS[index] ?? 0xffffff;
};
