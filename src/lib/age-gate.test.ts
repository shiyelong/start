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
  it('returns true without PIN when switching to lower privilege (adult→child)', async () => {
    // Default mode is adult; switching to child is going down — no PIN needed
    const gate = new AgeGate();
    const ok = await gate.switchMode('child', '');
    expect(ok).toBe(true);
    expect(gate.getMode()).toBe('child');
  });

  it('returns false when going up and no PIN has been set', async () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'child');
    const gate = new AgeGate();
    const ok = await gate.switchMode('adult', '123456');
    expect(ok).toBe(false);
    expect(gate.getMode()).toBe('child'); // unchanged
  });

  it('returns false for wrong PIN when going up', async () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'child');
    const gate = new AgeGate();
    await gate.setPin('123456');
    const ok = await gate.switchMode('adult', '000000');
    expect(ok).toBe(false);
    expect(gate.getMode()).toBe('child');
  });

  it('returns true and changes mode for correct PIN when going up', async () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'child');
    const gate = new AgeGate();
    await gate.setPin('123456');
    const ok = await gate.switchMode('adult', '123456');
    expect(ok).toBe(true);
    expect(gate.getMode()).toBe('adult');
  });

  it('persists the new mode to localStorage', async () => {
    const gate = new AgeGate();
    await gate.setPin('999999');
    await gate.switchMode('teen', '999999');
    expect(localStorageMock.getItem('starhub_age_gate_mode')).toBe('teen');
  });

  it('logs mode switch on successful switch', async () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'child');
    const gate = new AgeGate();
    await gate.setPin('123456');
    await gate.switchMode('adult', '123456');
    const raw = localStorageMock.getItem('starhub_mode_switch_log');
    expect(raw).not.toBeNull();
    const log = JSON.parse(raw!);
    expect(log).toHaveLength(1);
    expect(log[0].fromMode).toBe('child');
    expect(log[0].toMode).toBe('adult');
    expect(log[0].switchedAt).toBeDefined();
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

// ---------------------------------------------------------------------------
// AgeGate.getNavConfig
// ---------------------------------------------------------------------------

describe('AgeGate.getNavConfig', () => {
  it('returns child config with child-friendly sections', () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'child');
    const gate = new AgeGate();
    const config = gate.getNavConfig();
    expect(config.mode).toBe('child');
    expect(config.visibleSections).toEqual(['动画片', '儿歌', '益智游戏']);
    expect(config.hiddenRatings).toEqual(['PG', 'PG-13', 'R', 'NC-17']);
    expect(config.searchBlacklist.length).toBeGreaterThan(0);
    expect(config.uiStyle).toBe('child');
  });

  it('returns teen config with standard sections minus adult', () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'teen');
    const gate = new AgeGate();
    const config = gate.getNavConfig();
    expect(config.mode).toBe('teen');
    expect(config.visibleSections).toContain('视频');
    expect(config.visibleSections).not.toContain('成人专区');
    expect(config.hiddenRatings).toEqual(['R', 'NC-17']);
    expect(config.uiStyle).toBe('teen');
  });

  it('returns mature config hiding only NC-17', () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'mature');
    const gate = new AgeGate();
    const config = gate.getNavConfig();
    expect(config.mode).toBe('mature');
    expect(config.hiddenRatings).toEqual(['NC-17']);
    expect(config.visibleSections).not.toContain('成人专区');
    expect(config.uiStyle).toBe('standard');
  });

  it('returns adult config with all sections including adult zone', () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'adult');
    const gate = new AgeGate();
    const config = gate.getNavConfig();
    expect(config.mode).toBe('adult');
    expect(config.visibleSections).toContain('成人专区');
    expect(config.hiddenRatings).toEqual([]);
    expect(config.uiStyle).toBe('adult');
  });

  it('returns elder config with simplified sections', () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'elder');
    const gate = new AgeGate();
    const config = gate.getNavConfig();
    expect(config.mode).toBe('elder');
    expect(config.visibleSections).toEqual(['看电视', '听音乐', '听戏曲', '看新闻']);
    expect(config.hiddenRatings).toEqual(['PG-13', 'R', 'NC-17']);
    expect(config.uiStyle).toBe('elder');
  });
});

// ---------------------------------------------------------------------------
// AgeGate.getPinLockStatus
// ---------------------------------------------------------------------------

describe('AgeGate.getPinLockStatus', () => {
  it('returns unlocked when no failures recorded', () => {
    const gate = new AgeGate();
    const status = gate.getPinLockStatus();
    expect(status.locked).toBe(false);
    expect(status.remainingSeconds).toBe(0);
  });

  it('returns locked after 3 consecutive PIN failures', async () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'child');
    const gate = new AgeGate();
    await gate.setPin('123456');

    // 3 wrong attempts
    await gate.switchMode('adult', 'wrong1');
    await gate.switchMode('adult', 'wrong2');
    await gate.switchMode('adult', 'wrong3');

    const status = gate.getPinLockStatus();
    expect(status.locked).toBe(true);
    expect(status.remainingSeconds).toBeGreaterThan(0);
    expect(status.remainingSeconds).toBeLessThanOrEqual(1800);
  });

  it('blocks switchMode when locked', async () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'child');
    const gate = new AgeGate();
    await gate.setPin('123456');

    // Trigger lockout
    await gate.switchMode('adult', 'wrong1');
    await gate.switchMode('adult', 'wrong2');
    await gate.switchMode('adult', 'wrong3');

    // Even correct PIN should fail while locked
    const ok = await gate.switchMode('adult', '123456');
    expect(ok).toBe(false);
    expect(gate.getMode()).toBe('child');
  });

  it('returns unlocked after lock expires', () => {
    const gate = new AgeGate();
    // Set a lock that already expired
    localStorageMock.setItem('starhub_pin_locked_until', String(Date.now() - 1000));
    localStorageMock.setItem('starhub_pin_fail_count', '3');

    const status = gate.getPinLockStatus();
    expect(status.locked).toBe(false);
    expect(status.remainingSeconds).toBe(0);
    // Should have cleaned up
    expect(localStorageMock.getItem('starhub_pin_locked_until')).toBeNull();
    expect(localStorageMock.getItem('starhub_pin_fail_count')).toBeNull();
  });

  it('resets failure count on successful PIN', async () => {
    localStorageMock.setItem('starhub_age_gate_mode', 'child');
    const gate = new AgeGate();
    await gate.setPin('123456');

    // 2 wrong attempts (not yet locked)
    await gate.switchMode('adult', 'wrong1');
    await gate.switchMode('adult', 'wrong2');
    expect(localStorageMock.getItem('starhub_pin_fail_count')).toBe('2');

    // Correct PIN resets counter
    await gate.switchMode('adult', '123456');
    expect(localStorageMock.getItem('starhub_pin_fail_count')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AgeGate.logModeSwitch
// ---------------------------------------------------------------------------

describe('AgeGate.logModeSwitch', () => {
  it('stores a mode switch entry in localStorage', () => {
    const gate = new AgeGate();
    gate.logModeSwitch('adult', 'child');

    const raw = localStorageMock.getItem('starhub_mode_switch_log');
    expect(raw).not.toBeNull();
    const log = JSON.parse(raw!);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ fromMode: 'adult', toMode: 'child' });
    expect(log[0].switchedAt).toBeDefined();
  });

  it('appends multiple entries', () => {
    const gate = new AgeGate();
    gate.logModeSwitch('adult', 'child');
    gate.logModeSwitch('child', 'teen');

    const log = JSON.parse(localStorageMock.getItem('starhub_mode_switch_log')!);
    expect(log).toHaveLength(2);
    expect(log[0].toMode).toBe('child');
    expect(log[1].toMode).toBe('teen');
  });

  it('keeps only the last 100 entries', () => {
    const gate = new AgeGate();
    // Write 105 entries
    for (let i = 0; i < 105; i++) {
      gate.logModeSwitch('adult', 'child');
    }

    const log = JSON.parse(localStorageMock.getItem('starhub_mode_switch_log')!);
    expect(log).toHaveLength(100);
  });

  it('handles corrupted log data gracefully', () => {
    localStorageMock.setItem('starhub_mode_switch_log', 'not-json');
    const gate = new AgeGate();
    gate.logModeSwitch('adult', 'child');

    const log = JSON.parse(localStorageMock.getItem('starhub_mode_switch_log')!);
    expect(log).toHaveLength(1);
  });
});
