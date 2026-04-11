import { describe, it, expect } from 'vitest';
import {
  getDeviceClass,
  getOrientation,
  getLayoutConfig,
  LAYOUT_CONFIGS,
} from './responsive-layout';

// ---------------------------------------------------------------------------
// getDeviceClass
// ---------------------------------------------------------------------------

describe('getDeviceClass', () => {
  it('returns mobile for widths below 768', () => {
    expect(getDeviceClass(0)).toBe('mobile');
    expect(getDeviceClass(320)).toBe('mobile');
    expect(getDeviceClass(767)).toBe('mobile');
  });

  it('returns tablet for widths 768-1023', () => {
    expect(getDeviceClass(768)).toBe('tablet');
    expect(getDeviceClass(900)).toBe('tablet');
    expect(getDeviceClass(1023)).toBe('tablet');
  });

  it('returns desktop for widths >= 1024', () => {
    expect(getDeviceClass(1024)).toBe('desktop');
    expect(getDeviceClass(1920)).toBe('desktop');
  });
});

// ---------------------------------------------------------------------------
// getOrientation (server-side fallback)
// ---------------------------------------------------------------------------

describe('getOrientation', () => {
  it('returns a valid orientation string', () => {
    const result = getOrientation();
    expect(['portrait', 'landscape']).toContain(result);
  });
});

// ---------------------------------------------------------------------------
// getLayoutConfig
// ---------------------------------------------------------------------------

describe('getLayoutConfig', () => {
  it('returns mobile-portrait config for narrow portrait viewport', () => {
    const config = getLayoutConfig(375, 'portrait');
    expect(config).toEqual(LAYOUT_CONFIGS['mobile-portrait']);
    expect(config.canvasScale).toBe(0.6);
    expect(config.controlsPosition).toBe('bottom');
  });

  it('returns mobile-landscape config for narrow landscape viewport', () => {
    const config = getLayoutConfig(667, 'landscape');
    expect(config).toEqual(LAYOUT_CONFIGS['mobile-landscape']);
    expect(config.controlsPosition).toBe('sides');
  });

  it('returns tablet-portrait config for medium portrait viewport', () => {
    const config = getLayoutConfig(768, 'portrait');
    expect(config).toEqual(LAYOUT_CONFIGS['tablet-portrait']);
    expect(config.canvasScale).toBe(0.5);
  });

  it('returns tablet-landscape config for medium landscape viewport', () => {
    const config = getLayoutConfig(900, 'landscape');
    expect(config).toEqual(LAYOUT_CONFIGS['tablet-landscape']);
    expect(config.chatPosition).toBe('side');
  });

  it('returns desktop-landscape config for wide landscape viewport', () => {
    const config = getLayoutConfig(1920, 'landscape');
    expect(config).toEqual(LAYOUT_CONFIGS['desktop-landscape']);
    expect(config.controlsPosition).toBe('hidden');
  });

  it('returns desktop-portrait config for wide portrait viewport', () => {
    const config = getLayoutConfig(1200, 'portrait');
    expect(config).toEqual(LAYOUT_CONFIGS['desktop-portrait']);
  });
});

// ---------------------------------------------------------------------------
// LAYOUT_CONFIGS completeness
// ---------------------------------------------------------------------------

describe('LAYOUT_CONFIGS', () => {
  it('has entries for all 6 device-orientation combos', () => {
    const keys = Object.keys(LAYOUT_CONFIGS);
    expect(keys).toHaveLength(6);
    expect(keys).toContain('mobile-portrait');
    expect(keys).toContain('mobile-landscape');
    expect(keys).toContain('tablet-portrait');
    expect(keys).toContain('tablet-landscape');
    expect(keys).toContain('desktop-portrait');
    expect(keys).toContain('desktop-landscape');
  });

  it('all configs have required fields', () => {
    for (const config of Object.values(LAYOUT_CONFIGS)) {
      expect(config).toHaveProperty('canvasScale');
      expect(config).toHaveProperty('controlsPosition');
      expect(config).toHaveProperty('chatPosition');
      expect(config).toHaveProperty('toolbarPosition');
      expect(config.canvasScale).toBeGreaterThan(0);
      expect(config.canvasScale).toBeLessThanOrEqual(1);
    }
  });
});
