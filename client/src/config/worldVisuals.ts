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
  /** Capping course along the top of the spawn walls, and the corner posts. */
  spawnCoping: 0x8fb7d9,
  /** Rock ledge where the starting headland meets the canyon. */
  headlandLedge: 0x6f7f95,
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
  /** Fog colour, matched to the sky's bright band just above the horizon. */
  sky: 0xbfe8ff,
} as const;

/** Deck colour and icon for one themed island. */
export interface AreaTheme {
  /** Colour of the island's top surface only. */
  readonly deck: number;
  /** Emoji shown above the area name. */
  readonly icon: string;
  /**
   * Optional procedural texture for the deck, instead of the shared tiling.
   *
   * Presentation only, and only on the thin deck laid over the island - the
   * island BODY keeps the shared geometry and the shared material, so the
   * "every island is identical" rule is untouched.
   */
  readonly deckTexture?: 'stars';
}

/**
 * Per-area theme, keyed by the shared area name.
 *
 * Only the island's TOP surface takes this colour — the body stays slate, so
 * the themed decks read as a stripe down the gorge without breaking the
 * "every island is identical" silhouette the geometry rule protects.
 */
export const AREA_THEMES: Readonly<Record<string, AreaTheme>> = {
  'Starter Area': { deck: 0x9fb0c0, icon: '😊' },
  'Cloud Area': { deck: 0xdaf0ff, icon: '☁️' },
  'Volcano Area': { deck: 0xe8502e, icon: '🌋' },
  'Tsunami Area': { deck: 0x1f9be8, icon: '🌊' },
  'Hot Area': { deck: 0xff9421, icon: '🔥' },
  'Nature Area': { deck: 0x4fc23a, icon: '🌲' },
  'Crystal Area': { deck: 0x9d7bff, icon: '💎' },
  'Thunder Area': { deck: 0xffd83d, icon: '⚡' },
  'Ancient Area': { deck: 0xc9a227, icon: '🏛️' },
  'Space Island': { deck: 0x8f7bff, icon: '🪐', deckTexture: 'stars' },
  // The deep-space run. Every one keeps the starfield deck, tinted per area,
  // so the whole endgame reads as one stretch without needing 20 textures.
  'Nebula Area': { deck: 0xff6fd8, icon: '🌫️', deckTexture: 'stars' },
  'Comet Area': { deck: 0x7fe6ff, icon: '☄️', deckTexture: 'stars' },
  'Meteor Area': { deck: 0xc98a5a, icon: '🌠', deckTexture: 'stars' },
  'Orbit Area': { deck: 0x5ad2ff, icon: '🛰️', deckTexture: 'stars' },
  'Galaxy Area': { deck: 0x9a6bff, icon: '🌌', deckTexture: 'stars' },
  'Quasar Area': { deck: 0x63f5d0, icon: '💫', deckTexture: 'stars' },
  'Pulsar Area': { deck: 0xffe14d, icon: '🔆', deckTexture: 'stars' },
  'Vortex Area': { deck: 0x4d6bff, icon: '🌀', deckTexture: 'stars' },
  'Eclipse Area': { deck: 0x53527a, icon: '🌑', deckTexture: 'stars' },
  'Aurora Area': { deck: 0x4dffa8, icon: '🌈', deckTexture: 'stars' },
  'Supernova Area': { deck: 0xff8a3d, icon: '💥', deckTexture: 'stars' },
  'Blackhole Area': { deck: 0x241a3a, icon: '🕳️', deckTexture: 'stars' },
  'Wormhole Area': { deck: 0x00e0c6, icon: '🌐', deckTexture: 'stars' },
  'Andromeda Area': { deck: 0xb98cff, icon: '✨', deckTexture: 'stars' },
  'Titan Area': { deck: 0xd9a441, icon: '🪨', deckTexture: 'stars' },
  'Cosmos Area': { deck: 0x6ea8ff, icon: '🔭', deckTexture: 'stars' },
  'Singularity Area': { deck: 0x1b1030, icon: '⚫', deckTexture: 'stars' },
  'Infinity Area': { deck: 0xff4df0, icon: '♾️', deckTexture: 'stars' },
  'Oblivion Area': { deck: 0x3a1030, icon: '🌘', deckTexture: 'stars' },
  'Eternity Area': { deck: 0xffd23d, icon: '👑', deckTexture: 'stars' },
  // The second endgame run. Same starfield deck as the rest of deep space -
  // only the colour and the icon separate them, exactly as above.
  'Zenith Area': { deck: 0x7ce8ff, icon: '🔺', deckTexture: 'stars' },
  'Abyss Area': { deck: 0x0b1b3a, icon: '🕳️', deckTexture: 'stars' },
  'Radiance Area': { deck: 0xfff1a8, icon: '✨', deckTexture: 'stars' },
  'Chronos Area': { deck: 0xb08adf, icon: '⏳', deckTexture: 'stars' },
  'Elysium Area': { deck: 0x9dffcb, icon: '🕊️', deckTexture: 'stars' },
  'Genesis Area': { deck: 0xff9a5c, icon: '🌱', deckTexture: 'stars' },
  'Paragon Area': { deck: 0xe6e6ff, icon: '🏅', deckTexture: 'stars' },
  'Empyrean Area': { deck: 0xff6bd6, icon: '🔥', deckTexture: 'stars' },
  'Everlast Area': { deck: 0x4de0b0, icon: '💠', deckTexture: 'stars' },
  'Apex Area': { deck: 0xffb300, icon: '🏆', deckTexture: 'stars' },
};

/** Fallback for an area with no theme entry. */
export const DEFAULT_AREA_THEME: AreaTheme = { deck: 0xb8c4cf, icon: '⭐' };

/** Thickness of the coloured deck laid over each island. */
export const AREA_DECK_THICKNESS = 0.18;

/** Height of the floating area name above the island surface. */
export const AREA_LABEL_HEIGHT = 11;

/** How one treadmill tier looks. Colour only - layout lives in shared. */
export interface TreadmillTheme {
  /** Frame, rails and rollers. */
  readonly accent: number;
  /** Belt tint. */
  readonly belt: number;
  /** 0..1 glow strength; drives emissive and the lit halo bar. */
  readonly intensity: number;
}

/**
 * Eight tiers, deliberately reading as a ladder rather than eight variations.
 *
 * Colour, glow and belt speed all climb together, so the Mythic deck at the
 * far end is obviously a different class of machine from the grey Starter one
 * next to the shop. Everything above `intensity` 0.45 also gets a lit halo,
 * and the top three get orbiting energy cubes.
 */
export const TREADMILL_THEMES: readonly TreadmillTheme[] = [
  { accent: 0x9aa7b4, belt: 0x2c3138, intensity: 0 },
  { accent: 0xcd7f32, belt: 0x33291d, intensity: 0.12 },
  { accent: 0xd8e3ec, belt: 0x2b3239, intensity: 0.25 },
  { accent: 0xffc233, belt: 0x3a2f16, intensity: 0.45 },
  { accent: 0x4fe3ff, belt: 0x11313b, intensity: 0.62 },
  { accent: 0x35e07a, belt: 0x123423, intensity: 0.76 },
  { accent: 0xa855f7, belt: 0x241338, intensity: 0.88 },
  { accent: 0xff3d6e, belt: 0x3a1020, intensity: 1 },
];

/** Theme for a tier, falling back to the starter look. */
export const treadmillTheme = (tier: number): TreadmillTheme =>
  TREADMILL_THEMES[tier - 1] ?? (TREADMILL_THEMES[0] as TreadmillTheme);

/** Colour of a deck the player has not unlocked yet. */
export const TREADMILL_LOCKED_COLOR = 0x39414d;

/** Fog distances, widened so the gorge fades toward a visible horizon. */
export const WORLD_FOG = {
  near: 180,
  far: 900,
} as const;

/** Tree scattering. Deterministic, so every client renders the same world. */
export const FOLIAGE = {
  /**
   * Trees per 1000 units of rim, per side.
   *
   * A density rather than a count: the route now runs to z ~17,500, and a
   * fixed count spread over that would leave the banks bare. The total is
   * capped so a long world cannot cost an unbounded number of instances.
   */
  perThousandUnits: 220,
  /** Hard ceiling on trees per side, for performance on a long route. */
  maxPerSide: 1400,
  /** How far in from the rim edge trees may stand. */
  innerInset: 1.5,
  outerInset: 20,
  /** Seed for the deterministic scatter. */
  seed: 20260903,
  minScale: 1.0,
  maxScale: 2.2,
} as const;
