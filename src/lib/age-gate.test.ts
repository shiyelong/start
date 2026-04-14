import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgeGate, hashPin } from './age-gate';
import type { ContentRating, UserMode } from './types';
import { RATING_ORDER, MODE_MAX_RATING } from './types';

// ---------------------------------------------------------------------------
// Mock localStorage + crypto.subtle for Node test environment
// ---------------------------------------------------------------------------

const store: Record<string, string> = {};

const localStorageMock: Storage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    for (const key of Object.keys(store)) delete store[key];
  },
  get length() {
    return Object.keys(store).length;
  },
  key: (index: number) => Object.keys(store)[index] ?? null,
};

// Provide globals so isBrowser() returns true
beforeEach(() => {
  localStorageMock.clear();
  vi.stubGlobal('localStorage', localStorageMock);
});

// ---------------------------------------------------------------------------
// hashPin
// ---------------------------------------------------------------------------

describe('hashPin', () => {
  it('returns a 64-char hex string (SHA-256)', async () => {
    const hash = await hashPin('123456');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same hash for the same input', async () => {
    const a = await hashPin('654321');
    const b = await hashPin('654321');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', async () => {
    const a = await hashPin('111111');
    const b = await hashPin('222222');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// AgeGate.getMode
// ---------------------------------------------------------------------------

describe('AgeGate.getMode', () => {
  it('defaults to "adult" when nothing is stored', () => {
    const gate = new AgeGate();
    expect(gate.getMode()).toBe('adult');
  });

  it('reads the stored mode from localStorage', () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'child');
    const gate = new AgeGate();
    expect(gate.getMode()).toBe('child');
  });

  it('falls back to "adult" for invalid stored values', () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'invalid_mode');
    const gate = new AgeGate();
    expect(gate.getMode()).toBe('adult');
  });
});

// ---------------------------------------------------------------------------
// AgeGate.canAccess
// ---------------------------------------------------------------------------

describe('AgeGate.canAccess', () => {
  it.each<[UserMode, ContentRating, boolean]>([
    // child mode — max G
    ['child', 'G', true],
    ['child', 'PG', false],
    ['child', 'PG-13', false],
    ['child', 'R', false],
    ['child', 'NC-17', false],
    // teen mode — max PG-13
    ['teen', 'G', true],
    ['teen', 'PG', true],
    ['teen', 'PG-13', true],
    ['teen', 'R', false],
    ['teen', 'NC-17', false],
    // mature mode — max R
    ['mature', 'G', true],
    ['mature', 'PG', true],
    ['mature', 'PG-13', true],
    ['mature', 'R', true],
    ['mature', 'NC-17', false],
    // adult mode — max NC-17 (everything)
    ['adult', 'G', true],
    ['adult', 'PG', true],
    ['adult', 'PG-13', true],
    ['adult', 'R', true],
    ['adult', 'NC-17', true],
    // elder mode — max PG
    ['elder', 'G', true],
    ['elder', 'PG', true],
    ['elder', 'PG-13', false],
    ['elder', 'R', false],
    ['elder', 'NC-17', false],
  ])('mode=%s, rating=%s → %s', (mode, rating, expected) => {
    localStorageMock.setItem('starhub_age_gate_mode', mode);
    const gate = new AgeGate();
    expect(gate.canAccess(rating)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// AgeGate.filterContent
// ---------------------------------------------------------------------------

describe('AgeGate.filterContent', () => {
  const allItems = RATING_ORDER.map((r) => ({ id: r, rating: r }));

  it('child mode keeps only G items', () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'child');
    const gate = new AgeGate();
    const result = gate.filterContent(allItems);
    expect(result.map((i) => i.rating)).toEqual(['G']);
  });

  it('teen mode keeps G, PG, PG-13', () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'teen');
    const gate = new AgeGate();
    const result = gate.filterContent(allItems);
    expect(result.map((i) => i.rating)).toEqual(['G', 'PG', 'PG-13']);
  });

  it('adult mode keeps everything', () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'adult');
    const gate = new AgeGate();
    const result = gate.filterContent(allItems);
    expect(result.map((i) => i.rating)).toEqual(['G', 'PG', 'PG-13', 'R', 'NC-17']);
  });

  it('preserves extra properties on items', () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'child');
    const gate = new AgeGate();
    const items = [
      { id: '1', title: 'Kids Show', rating: 'G' as ContentRating },
      { id: '2', title: 'Action Movie', rating: 'R' as ContentRating },
    ];
    const result = gate.filterContent(items);
    expect(result).toEqual([{ id: '1', title: 'Kids Show', rating: 'G' }]);
  });

  it('returns empty array when no items pass', () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'child');
    const gate = new AgeGate();
    const items = [{ rating: 'R' as ContentRating }, { rating: 'NC-17' as ContentRating }];
    expect(gate.filterContent(items)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AgeGate.switchMode (PIN verification)
// ---------------------------------------------------------------------------

describe('AgeGate.switchMode', () => {
  it('returns false when no PIN has been set', async () => {
    const gate = new AgeGate();
    const ok = await gate.switchMode('child', '123456');
    expect(ok).toBe(false);
    expect(gate.getMode()).toBe('adult'); // unchanged
  });

  it('returns false for wrong PIN', async () => {
    const gate = new AgeGate();
    await gate.setPin('123456');
    const ok = await gate.switchMode('child', '000000');
    expect(ok).toBe(false);
    expect(gate.getMode()).toBe('adult');
  });

  it('returns true and changes mode for correct PIN', async () => {
    const gate = new AgeGate();
    await gate.setPin('123456');
    const ok = await gate.switchMode('child', '123456');
    expect(ok).toBe(true);
    expect(gate.getMode()).toBe('child');
  });

  it('persists the new mode to localStorage', async () => {
    const gate = new AgeGate();
    await gate.setPin('999999');
    await gate.switchMode('teen', '999999');
    expect(localStorageMock.getItem('starhub_age_gate_mode')).toBe('teen');
  });
});

// ---------------------------------------------------------------------------
// AgeGate.checkDailyLimit
// ---------------------------------------------------------------------------

describe('AgeGate.checkDailyLimit', () => {
  it('returns allowed=true with Infinity remaining when no limit is set', () => {
    const gate = new AgeGate();
    const result = gate.checkDailyLimit();
    expect(result.allowed).toBe(true);
    expect(result.remainingMinutes).toBe(Infinity);
  });

  it('tracks usage and reduces remaining minutes', () => {
    const gate = new AgeGate();
    gate.setDailyLimit(60);
    gate.recordUsage(20);
    const result = gate.checkDailyLimit();
    expect(result.allowed).toBe(true);
    expect(result.remainingMinutes).toBe(40);
  });

  it('returns allowed=false when limit is exceeded', () => {
    const gate = new AgeGate();
    gate.setDailyLimit(30);
    gate.recordUsage(30);
    const result = gate.checkDailyLimit();
    expect(result.allowed).toBe(false);
    expect(result.remainingMinutes).toBe(0);
  });

  it('resets usage on a new day', () => {
    const gate = new AgeGate();
    gate.setDailyLimit(60);
    gate.recordUsage(60);

    // Simulate yesterday's date in the config
    const raw = localStorageMock.getItem('starhub_age_gate_config');
    expect(raw).not.toBeNull();
    const config = JSON.parse(raw!);
    config.lastResetDate = '2020-01-01';
    localStorageMock.setItem('starhub_age_gate_config', JSON.stringify(config));

    const result = gate.checkDailyLimit();
    expect(result.allowed).toBe(true);
    expect(result.remainingMinutes).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// AgeGate.setPin stores a SHA-256 hash
// ---------------------------------------------------------------------------

describe('AgeGate.setPin', () => {
  it('stores a hex hash in localStorage', async () => {
    const gate = new AgeGate();
    await gate.setPin('123456');
    const stored = localStorageMock.getItem('starhub_age_gate_pin');
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
  });
});
