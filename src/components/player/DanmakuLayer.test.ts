import { describe, it, expect } from 'vitest';

/**
 * Unit tests for DanmakuLayer logic.
 *
 * Since the test environment is node (no DOM), we test the pure logic
 * that drives the component: time-window filtering, density limits,
 * font size mapping, and danmaku type classification.
 */

// Re-declare the constants and types from the component to test them
// (they are not exported, so we replicate the logic here)

type DanmakuPosition = 'scroll' | 'top' | 'bottom';
type DanmakuSize = 'small' | 'normal' | 'large';
type DensityLevel = 'off' | 'low' | 'medium' | 'high';

interface DanmakuItem {
  id: string;
  text: string;
  time: number;
  color: string;
  position: DanmakuPosition;
  size: DanmakuSize;
}

const FONT_SIZES: Record<DanmakuSize, number> = {
  small: 14,
  normal: 18,
  large: 24,
};

const DENSITY_LIMITS: Record<DensityLevel, number> = {
  off: 0,
  low: 5,
  medium: 15,
  high: 30,
};

const TIME_WINDOW = 0.5;

/** Filters danmaku within the time window of currentTime */
function filterByTimeWindow(list: DanmakuItem[], currentTime: number): DanmakuItem[] {
  const windowStart = currentTime - TIME_WINDOW;
  const windowEnd = currentTime + TIME_WINDOW;
  return list.filter((d) => d.time >= windowStart && d.time <= windowEnd);
}

/** Applies density limit, keeping the most recent items */
function applyDensityLimit(items: DanmakuItem[], density: DensityLevel): DanmakuItem[] {
  if (density === 'off') return [];
  const max = DENSITY_LIMITS[density];
  if (items.length <= max) return items;
  return items.slice(items.length - max);
}

function makeDanmaku(overrides: Partial<DanmakuItem> & { id: string; time: number }): DanmakuItem {
  return {
    text: 'test',
    color: '#FFFFFF',
    position: 'scroll',
    size: 'normal',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DanmakuLayer logic', () => {
  describe('time window filtering', () => {
    it('includes danmaku within +-0.5s of currentTime', () => {
      const list: DanmakuItem[] = [
        makeDanmaku({ id: '1', time: 10.0 }),
        makeDanmaku({ id: '2', time: 10.3 }),
        makeDanmaku({ id: '3', time: 10.5 }),
        makeDanmaku({ id: '4', time: 11.0 }),
      ];

      const result = filterByTimeWindow(list, 10.2);
      expect(result.map((d) => d.id)).toEqual(['1', '2', '3']);
    });

    it('excludes danmaku outside the window', () => {
      const list: DanmakuItem[] = [
        makeDanmaku({ id: '1', time: 5.0 }),
        makeDanmaku({ id: '2', time: 20.0 }),
      ];

      const result = filterByTimeWindow(list, 10.0);
      expect(result).toHaveLength(0);
    });

    it('returns empty for empty list', () => {
      expect(filterByTimeWindow([], 10.0)).toEqual([]);
    });

    it('includes danmaku exactly at window boundaries', () => {
      const list: DanmakuItem[] = [
        makeDanmaku({ id: '1', time: 9.5 }),  // exactly at windowStart
        makeDanmaku({ id: '2', time: 10.5 }), // exactly at windowEnd
      ];

      const result = filterByTimeWindow(list, 10.0);
      expect(result.map((d) => d.id)).toEqual(['1', '2']);
    });
  });

  describe('density limits', () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      makeDanmaku({ id: String(i), time: 10 }),
    );

    it('off density returns empty', () => {
      expect(applyDensityLimit(items, 'off')).toEqual([]);
    });

    it('low density caps at 5', () => {
      const result = applyDensityLimit(items, 'low');
      expect(result).toHaveLength(5);
    });

    it('medium density caps at 15', () => {
      const result = applyDensityLimit(items, 'medium');
      expect(result).toHaveLength(15);
    });

    it('high density caps at 30 (returns all 20 since under limit)', () => {
      const result = applyDensityLimit(items, 'high');
      expect(result).toHaveLength(20);
    });

    it('keeps the most recent items when capping', () => {
      const result = applyDensityLimit(items, 'low');
      // Should keep the last 5 items (ids 15-19)
      expect(result.map((d) => d.id)).toEqual(['15', '16', '17', '18', '19']);
    });
  });

  describe('font sizes', () => {
    it('small maps to 14px', () => {
      expect(FONT_SIZES.small).toBe(14);
    });

    it('normal maps to 18px', () => {
      expect(FONT_SIZES.normal).toBe(18);
    });

    it('large maps to 24px', () => {
      expect(FONT_SIZES.large).toBe(24);
    });
  });

  describe('danmaku types', () => {
    it('supports all three position types', () => {
      const positions: DanmakuPosition[] = ['scroll', 'top', 'bottom'];
      for (const pos of positions) {
        const d = makeDanmaku({ id: '1', time: 0, position: pos });
        expect(d.position).toBe(pos);
      }
    });

    it('supports all three size types', () => {
      const sizes: DanmakuSize[] = ['small', 'normal', 'large'];
      for (const sz of sizes) {
        const d = makeDanmaku({ id: '1', time: 0, size: sz });
        expect(d.size).toBe(sz);
        expect(FONT_SIZES[sz]).toBeGreaterThan(0);
      }
    });
  });

  describe('density level cycling', () => {
    it('cycles through all density levels in order', () => {
      const order: DensityLevel[] = ['off', 'low', 'medium', 'high'];
      function cycleDensity(current: DensityLevel): DensityLevel {
        const idx = order.indexOf(current);
        return order[(idx + 1) % order.length];
      }

      expect(cycleDensity('off')).toBe('low');
      expect(cycleDensity('low')).toBe('medium');
      expect(cycleDensity('medium')).toBe('high');
      expect(cycleDensity('high')).toBe('off');
    });
  });
});
