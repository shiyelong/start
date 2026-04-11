import { describe, it, expect } from 'vitest';
import {
  checkFeature,
  isFeatureBlocked,
  type SessionMode,
  type Feature,
} from './feature-guard';

const ALL_FEATURES: Feature[] = ['saveState', 'loadState', 'cheats', 'speedControl', 'rewind'];
const BLOCKED_MODES: SessionMode[] = ['multiplayer', 'race'];

const EXPECTED_MESSAGES: Record<Feature, string> = {
  saveState: '多人模式下无法保存存档',
  loadState: '多人模式下无法读取存档',
  cheats: '多人模式下无法使用作弊码',
  speedControl: '多人模式下无法调整速度',
  rewind: '多人模式下无法使用回退功能',
};

describe('checkFeature', () => {
  describe('single mode — all features allowed', () => {
    it.each(ALL_FEATURES)('allows %s', (feature) => {
      const result = checkFeature('single', feature);
      expect(result.allowed).toBe(true);
      expect(result.message).toBeUndefined();
    });
  });

  describe.each(BLOCKED_MODES)('%s mode — all features blocked', (mode) => {
    it.each(ALL_FEATURES)('blocks %s with correct message', (feature) => {
      const result = checkFeature(mode, feature);
      expect(result.allowed).toBe(false);
      expect(result.message).toBe(EXPECTED_MESSAGES[feature]);
    });
  });
});

describe('isFeatureBlocked', () => {
  it.each(ALL_FEATURES)('returns false for %s in single mode', (feature) => {
    expect(isFeatureBlocked('single', feature)).toBe(false);
  });

  it.each(BLOCKED_MODES)('returns true for all features in %s mode', (mode) => {
    for (const feature of ALL_FEATURES) {
      expect(isFeatureBlocked(mode, feature)).toBe(true);
    }
  });
});
