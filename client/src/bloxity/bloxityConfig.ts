/**
 * Bloxity integration configuration.
 *
 * Data only, like every other config in this project. The slug, the CDN layout
 * and the settings this game actually honours are declared once here so the
 * bridge reads them instead of hard-coding strings at each call site.
 */

import type { LegionProportions } from './sdkTypes.js';

/**
 * The slug this game is registered under on bloxity.io.
 *
 * Always passed to `init`, even embedded, where the portal would supply it -
 * standalone hosting and every Bux purchase resolve their catalog by it.
 */
export const GAME_SLUG = '1-backflip-obby-escape';

/**
 * Optional portal and API overrides, for local development only.
 *
 * The SDK normally resolves both itself, and that is what ships: unset, it
 * uses bloxity.io and api.bloxity.io. There is one exception it makes on its
 * own - served from localhost with neither URL given, it points BOTH at the
 * local origin, on the assumption that a developer running the game locally is
 * running the portal locally too. This game is not, so login on a dev machine
 * would open `http://localhost:5173/auth`, which does not exist.
 *
 * Setting `VITE_BLOXITY_PORTAL_URL=https://bloxity.io` (and the API to match)
 * makes the real portal reachable from a dev build. Leave both unset for
 * production, where the SDK's own defaults are correct.
 */
export const PORTAL_URL = (import.meta.env['VITE_BLOXITY_PORTAL_URL'] as string | undefined) ?? '';
export const API_URL = (import.meta.env['VITE_BLOXITY_API_URL'] as string | undefined) ?? '';

/** Avatar asset CDN root. */
export const AVATAR_CDN = 'https://static.bloxity.io/avatars';

/** Where each avatar slot's mesh and texture live under {@link AVATAR_CDN}. */
export const avatarUrls = {
  hatMesh: (id: string) => `${AVATAR_CDN}/items/hats/${id}.obj`,
  hatTexture: (id: string) => `${AVATAR_CDN}/textures/hats/${id}.png`,
  backMesh: (id: string) => `${AVATAR_CDN}/items/back/${id}.obj`,
  backTexture: (id: string) => `${AVATAR_CDN}/textures/back/${id}.png`,
  skinTexture: (id: string) => `${AVATAR_CDN}/skins/${id}.png`,
  icon: (id: string) => `${AVATAR_CDN}/icons/${id}.png`,
} as const;

/**
 * Whether an id means "something is equipped here".
 *
 * The SDK uses several spellings for empty across slots and environments, and
 * every one of them would otherwise be fetched from the CDN as a real id.
 */
export const isEquipped = (id: string | null | undefined): id is string =>
  typeof id === 'string' && id !== '' && id !== '-1' && id !== 'undefined' && id !== 'null';

/** Proportion defaults, applied to anything the portal has not set. */
export const DEFAULT_PROPORTIONS: Required<LegionProportions> = {
  height: 1,
  shoulderWidth: 1,
  armLength: 1,
  legOffsetX: 1,
  torsoScaleX: 1,
  neckHeight: 1,
  headScale: 1,
};

/** The portal's own limits, mirrored so a local write is clamped identically. */
const PROPORTION_RANGE: Record<keyof LegionProportions, readonly [number, number]> = {
  height: [0.5, 1.6],
  shoulderWidth: [0.5, 1.5],
  armLength: [0.05, 3],
  legOffsetX: [-0.7, 5],
  torsoScaleX: [0.3, 2],
  neckHeight: [0.94, 1.2],
  headScale: [0.3, 2.6],
};

/**
 * Fill in and clamp a partial proportions object.
 *
 * The SDK returns `{}` for a player who has never opened the customizer, so
 * every consumer would otherwise have to spell out seven fallbacks - and one
 * missed fallback multiplies a bone scale by `undefined`.
 */
export const resolveProportions = (
  raw: LegionProportions | null | undefined,
): Required<LegionProportions> => {
  const out = { ...DEFAULT_PROPORTIONS };
  if (!raw) return out;
  for (const key of Object.keys(DEFAULT_PROPORTIONS) as (keyof LegionProportions)[]) {
    const value = raw[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const range = PROPORTION_RANGE[key];
    out[key] = Math.min(Math.max(value, range[0]), range[1]);
  }
  return out;
};

/**
 * The portal settings this game honours.
 *
 * Registering a listener is also what makes a control APPEAR in the portal
 * menu, so this list is the game's advertised settings surface - not just the
 * ones it reads. Only keys with a real effect below are listed; advertising a
 * control the game ignores is worse than not offering it.
 */
export const SETTING_KEYS = [
  'master_volume',
  'music_volume',
  'graphics_quality',
  'show_fps',
  'camera_sensitivity',
  'enable_chat',
  'fullscreen',
  'background_transparency',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/** Parse a "true"/"false" setting. Every portal setting arrives as a string. */
export const settingBool = (value: string, fallback = false): boolean => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
};

/** Parse a numeric setting, falling back when the portal sends nonsense. */
export const settingNumber = (value: string, fallback: number): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
