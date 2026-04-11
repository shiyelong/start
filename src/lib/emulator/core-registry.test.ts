import { describe, it, expect } from 'vitest';
import { CORE_REGISTRY, getCoreForPlatform, getCoreForExtension } from './core-registry';
import type { ConsolePlatform } from '@/lib/types';

const ALL_PLATFORMS: ConsolePlatform[] = [
  'NES', 'SNES', 'Game_Boy', 'Game_Boy_Color', 'Game_Boy_Advance',
  'Genesis', 'Master_System', 'Arcade', 'Neo_Geo', 'PC_Engine', 'Atari_2600',
];

describe('CORE_REGISTRY', () => {
  it('contains all 11 platforms', () => {
    expect(Object.keys(CORE_REGISTRY)).toHaveLength(11);
    for (const p of ALL_PLATFORMS) {
      expect(CORE_REGISTRY[p]).toBeDefined();
    }
  });

  it('every entry has valid wasmUrl and jsUrl patterns', () => {
    for (const config of Object.values(CORE_REGISTRY)) {
      expect(config.wasmUrl).toBe(`/cores/${config.coreId}/${config.coreId}_libretro.wasm`);
      expect(config.jsUrl).toBe(`/cores/${config.coreId}/${config.coreId}_libretro.js`);
    }
  });

  it('every entry has at least one extension', () => {
    for (const config of Object.values(CORE_REGISTRY)) {
      expect(config.extensions.length).toBeGreaterThan(0);
    }
  });

  it('NES has expected audio channels', () => {
    expect(CORE_REGISTRY.NES.audioChannels).toEqual(['pulse1', 'pulse2', 'triangle', 'noise', 'dmc']);
  });

  it('Genesis has expected audio channels', () => {
    expect(CORE_REGISTRY.Genesis.audioChannels).toEqual(['fm', 'psg']);
  });
});

describe('getCoreForPlatform', () => {
  it.each(ALL_PLATFORMS)('returns a CoreConfig for %s', (platform) => {
    const config = getCoreForPlatform(platform);
    expect(config).toBeDefined();
    expect(config.platform).toBe(platform);
  });
});

describe('getCoreForExtension', () => {
  it.each([
    ['.nes', 'NES'],
    ['.sfc', 'SNES'],
    ['.smc', 'SNES'],
    ['.gb', 'Game_Boy'],
    ['.gbc', 'Game_Boy_Color'],
    ['.gba', 'Game_Boy_Advance'],
    ['.md', 'Genesis'],
    ['.bin', 'Genesis'],
    ['.gen', 'Genesis'],
    ['.sms', 'Master_System'],
    ['.pce', 'PC_Engine'],
    ['.a26', 'Atari_2600'],
  ] as const)('maps %s to %s', (ext, expectedPlatform) => {
    const config = getCoreForExtension(ext);
    expect(config).not.toBeNull();
    expect(config!.platform).toBe(expectedPlatform);
  });

  it('returns null for .zip (ambiguous: Arcade vs Neo_Geo)', () => {
    expect(getCoreForExtension('.zip')).toBeNull();
  });

  it('returns null for unsupported extensions', () => {
    expect(getCoreForExtension('.exe')).toBeNull();
    expect(getCoreForExtension('.txt')).toBeNull();
  });

  it('handles extensions without leading dot', () => {
    const config = getCoreForExtension('nes');
    expect(config).not.toBeNull();
    expect(config!.platform).toBe('NES');
  });

  it('is case-insensitive', () => {
    const config = getCoreForExtension('.NES');
    expect(config).not.toBeNull();
    expect(config!.platform).toBe('NES');
  });
});
