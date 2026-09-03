/**
 * Visual palette and tuning for the gorge.
 *
 * Saturated, toy-like colours in the established Roblox-inspired style. Colour
 * only - all layout data lives in `@obby/shared`'s gorge config.
 */
export const WORLD_COLORS = {
  /** Blue channel running the gorge. Reads as a river; it is not water. */
  waterTile: '#1f8ff0',
  waterTileAlt: '#2ea0ff',
  waterLine: 'rgba(255,255,255,0.16)',
  /** Steep canyon walls, a deeper blue than the channel. */
  wallTile: '#1d5fb0',
  wallTileAlt: '#226cc4',
  wallLine: 'rgba(255,255,255,0.10)',
  /** Studded grass rim capping the walls. */
  rimGrass: '#4cc22e',
  rimGrassStud: '#63d642',
  /** Studded grass for the starting area. */
  spawnGrass: '#57cc33',
  spawnGrassStud: '#6ee047',
  /** Slate trophy islands. */
  platformTile: '#b6c3ce',
  platformTileAlt: '#c3ced8',
  platformLine: 'rgba(90,110,130,0.35)',
  /** Gold trophy collection pad. */
  collectionPad: 0xffc233,
  /** Hazard lines. */
  redline: 0xff2b2b,
  /** Tree trunks. */
  trunk: 0x7a5230,
  /** Tree canopy, two tones for variety. */
  canopyA: 0x2f9f36,
  canopyB: 0x45bf49,
  /** Fog colour, matched to the sky near the horizon. */
  sky: 0xa8dcff,
} as const;

/** Fog distances, widened so the gorge fades toward a visible horizon. */
export const WORLD_FOG = {
  near: 140,
  far: 620,
} as const;

/** Tree scattering. Deterministic, so every client renders the same world. */
export const FOLIAGE = {
  /** Trees along each gorge rim. */
  perSide: 150,
  /** How far in from the rim edge trees may stand. */
  innerInset: 1.5,
  outerInset: 20,
  /** Seed for the deterministic scatter. */
  seed: 20260903,
  minScale: 1.0,
  maxScale: 2.2,
} as const;
