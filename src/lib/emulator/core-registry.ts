import type { ConsolePlatform, CoreConfig, ButtonMap } from '@/lib/types';

// ---------------------------------------------------------------------------
// Default keyboard button maps per platform
// ---------------------------------------------------------------------------

const NES_BUTTON_MAP: ButtonMap = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  a: 'KeyX',
  b: 'KeyZ',
  x: '',
  y: '',
  l: '',
  r: '',
  start: 'Enter',
  select: 'ShiftRight',
};

const SNES_BUTTON_MAP: ButtonMap = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  a: 'KeyX',
  b: 'KeyZ',
  x: 'KeyS',
  y: 'KeyA',
  l: 'KeyQ',
  r: 'KeyW',
  start: 'Enter',
  select: 'ShiftRight',
};

const GB_BUTTON_MAP: ButtonMap = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  a: 'KeyX',
  b: 'KeyZ',
  x: '',
  y: '',
  l: '',
  r: '',
  start: 'Enter',
  select: 'ShiftRight',
};

const GBA_BUTTON_MAP: ButtonMap = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  a: 'KeyX',
  b: 'KeyZ',
  x: '',
  y: '',
  l: 'KeyQ',
  r: 'KeyW',
  start: 'Enter',
  select: 'ShiftRight',
};

const GENESIS_BUTTON_MAP: ButtonMap = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  a: 'KeyZ',
  b: 'KeyX',
  x: 'KeyA',
  y: 'KeyS',
  l: '',
  r: '',
  start: 'Enter',
  select: 'ShiftRight',
};

const SMS_BUTTON_MAP: ButtonMap = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  a: 'KeyZ',
  b: 'KeyX',
  x: '',
  y: '',
  l: '',
  r: '',
  start: 'Enter',
  select: 'ShiftRight',
};

const ARCADE_BUTTON_MAP: ButtonMap = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  a: 'KeyZ',
  b: 'KeyX',
  x: 'KeyA',
  y: 'KeyS',
  l: 'KeyQ',
  r: 'KeyW',
  start: 'Enter',
  select: 'ShiftRight',
};

const PCE_BUTTON_MAP: ButtonMap = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  a: 'KeyX',
  b: 'KeyZ',
  x: '',
  y: '',
  l: '',
  r: '',
  start: 'Enter',
  select: 'ShiftRight',
};

const ATARI_BUTTON_MAP: ButtonMap = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  a: 'KeyZ',
  b: '',
  x: '',
  y: '',
  l: '',
  r: '',
  start: 'Enter',
  select: 'ShiftRight',
};

// ---------------------------------------------------------------------------
// Helper to build WASM / JS URLs from a core ID
// ---------------------------------------------------------------------------

function coreUrls(coreId: string) {
  return {
    wasmUrl: `/cores/${coreId}/${coreId}_libretro.wasm`,
    jsUrl: `/cores/${coreId}/${coreId}_libretro.js`,
  };
}

// ---------------------------------------------------------------------------
// Core Registry — maps every ConsolePlatform to its CoreConfig
// ---------------------------------------------------------------------------

export const CORE_REGISTRY: Record<ConsolePlatform, CoreConfig> = {
  NES: {
    coreId: 'fceumm',
    coreName: 'FCEUmm',
    extensions: ['.nes'],
    platform: 'NES',
    ...coreUrls('fceumm'),
    defaultButtonMap: NES_BUTTON_MAP,
    audioChannels: ['pulse1', 'pulse2', 'triangle', 'noise', 'dmc'],
  },
  SNES: {
    coreId: 'snes9x',
    coreName: 'Snes9x',
    extensions: ['.sfc', '.smc'],
    platform: 'SNES',
    ...coreUrls('snes9x'),
    defaultButtonMap: SNES_BUTTON_MAP,
  },
  Game_Boy: {
    coreId: 'gambatte',
    coreName: 'Gambatte',
    extensions: ['.gb'],
    platform: 'Game_Boy',
    ...coreUrls('gambatte'),
    defaultButtonMap: GB_BUTTON_MAP,
  },
  Game_Boy_Color: {
    coreId: 'gambatte',
    coreName: 'Gambatte',
    extensions: ['.gbc'],
    platform: 'Game_Boy_Color',
    ...coreUrls('gambatte'),
    defaultButtonMap: GB_BUTTON_MAP,
  },
  Game_Boy_Advance: {
    coreId: 'mgba',
    coreName: 'mGBA',
    extensions: ['.gba'],
    platform: 'Game_Boy_Advance',
    ...coreUrls('mgba'),
    defaultButtonMap: GBA_BUTTON_MAP,
  },
  Genesis: {
    coreId: 'genesis_plus_gx',
    coreName: 'Genesis Plus GX',
    extensions: ['.md', '.bin', '.gen'],
    platform: 'Genesis',
    ...coreUrls('genesis_plus_gx'),
    defaultButtonMap: GENESIS_BUTTON_MAP,
    audioChannels: ['fm', 'psg'],
  },
  Master_System: {
    coreId: 'genesis_plus_gx',
    coreName: 'Genesis Plus GX',
    extensions: ['.sms'],
    platform: 'Master_System',
    ...coreUrls('genesis_plus_gx'),
    defaultButtonMap: SMS_BUTTON_MAP,
  },
  Arcade: {
    coreId: 'fbneo',
    coreName: 'FBNeo',
    extensions: ['.zip'],
    platform: 'Arcade',
    ...coreUrls('fbneo'),
    defaultButtonMap: ARCADE_BUTTON_MAP,
  },
  Neo_Geo: {
    coreId: 'fbneo',
    coreName: 'FBNeo',
    extensions: ['.zip'],
    platform: 'Neo_Geo',
    ...coreUrls('fbneo'),
    defaultButtonMap: ARCADE_BUTTON_MAP,
  },
  PC_Engine: {
    coreId: 'mednafen_pce_fast',
    coreName: 'Beetle PCE Fast',
    extensions: ['.pce'],
    platform: 'PC_Engine',
    ...coreUrls('mednafen_pce_fast'),
    defaultButtonMap: PCE_BUTTON_MAP,
  },
  Atari_2600: {
    coreId: 'stella2014',
    coreName: 'Stella 2014',
    extensions: ['.a26'],
    platform: 'Atari_2600',
    ...coreUrls('stella2014'),
    defaultButtonMap: ATARI_BUTTON_MAP,
  },
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Return the CoreConfig for a given ConsolePlatform.
 */
export function getCoreForPlatform(platform: ConsolePlatform): CoreConfig {
  return CORE_REGISTRY[platform];
}

/**
 * Find the CoreConfig whose extensions list contains the given extension.
 *
 * Returns `null` when the extension is ambiguous (e.g. `.zip` maps to both
 * Arcade and Neo_Geo) or when no platform matches.
 */
export function getCoreForExtension(ext: string): CoreConfig | null {
  const normalised = ext.toLowerCase().startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;

  const matches: CoreConfig[] = [];

  for (const config of Object.values(CORE_REGISTRY)) {
    if (config.extensions.includes(normalised)) {
      matches.push(config);
    }
  }

  // Ambiguous (e.g. .zip → Arcade + Neo_Geo) or no match
  if (matches.length !== 1) {
    return null;
  }

  return matches[0];
}
