/**
 * AgeGate — MPAA content rating access control.
 *
 * Implements the IAgeGate interface from the design doc with localStorage
 * persistence, SHA-256 PIN hashing (Web Crypto API), and daily usage limits.
 *
 * Storage keys:
 *   starhub_age_gate_mode   — current UserMode string
 *   starhub_age_gate_pin    — hex-encoded SHA-256 hash of the 6-digit PIN
 *   starhub_age_gate_config — JSON { dailyLimit, usedToday, lastResetDate }
 */

import type { ContentRating, UserMode, NavConfig } from './types';
import { RATING_ORDER, MODE_MAX_RATING } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_MODE_KEY = 'starhub_age_gate_mode';
const STORAGE_PIN_KEY = 'starhub_age_gate_pin';
const STORAGE_CONFIG_KEY = 'starhub_age_gate_config';
const STORAGE_PIN_FAIL_COUNT_KEY = 'starhub_pin_fail_count';
const STORAGE_PIN_LOCKED_UNTIL_KEY = 'starhub_pin_locked_until';
const STORAGE_MODE_SWITCH_LOG_KEY = 'starhub_mode_switch_log';

const DEFAULT_MODE: UserMode = 'adult'; // 默认成人模式

/** Maximum consecutive PIN failures before lockout. */
const MAX_PIN_FAILURES = 3;

/** Lockout duration in seconds after MAX_PIN_FAILURES consecutive failures. */
const PIN_LOCKOUT_SECONDS = 1800; // 30 minutes

/** Maximum number of mode switch log entries to keep. */
const MAX_MODE_SWITCH_LOG_ENTRIES = 100;

/** Default daily limits per mode (minutes). 0 = unlimited. */
const DEFAULT_DAILY_LIMITS: Record<UserMode, number> = {
  child: 90,   // 1.5 hours
  teen: 180,   // 3 hours
  mature: 0,
  adult: 0,
  elder: 0,
};

/**
 * Numeric privilege level per mode. Higher = more permissive.
 * Used to determine if switching requires PIN verification.
 */
const MODE_LEVEL: Record<UserMode, number> = {
  child: 0,
  elder: 1,
  teen: 2,
  mature: 3,
  adult: 4,
};

/** Pre-built NavConfig for each user mode. */
const NAV_CONFIGS: Record<UserMode, NavConfig> = {
  child: {
    mode: 'child',
    visibleSections: ['动画片', '儿歌', '益智游戏'],
    hiddenRatings: ['PG', 'PG-13', 'R', 'NC-17'],
    searchBlacklist: [
      '成人', '色情', '18禁', 'AV', 'porn', 'hentai', 'sex', 'xxx',
      'adult', 'nsfw', 'erotic', '裸体', '暴力', '血腥', '恐怖',
    ],
    uiStyle: 'child',
  },
  teen: {
    mode: 'teen',
    visibleSections: ['视频', '音乐', '漫画', '小说', '动漫', '游戏', '直播', '播客'],
    hiddenRatings: ['R', 'NC-17'],
    searchBlacklist: [],
    uiStyle: 'teen',
  },
  mature: {
    mode: 'mature',
    visibleSections: ['视频', '音乐', '漫画', '小说', '动漫', '游戏', '直播', '播客'],
    hiddenRatings: ['NC-17'],
    searchBlacklist: [],
    uiStyle: 'standard',
  },
  adult: {
    mode: 'adult',
    visibleSections: ['视频', '音乐', '漫画', '小说', '动漫', '游戏', '直播', '播客', '成人专区'],
    hiddenRatings: [],
    searchBlacklist: [],
    uiStyle: 'adult',
  },
  elder: {
    mode: 'elder',
    visibleSections: ['看电视', '听音乐', '听戏曲', '看新闻'],
    hiddenRatings: ['PG-13', 'R', 'NC-17'],
    searchBlacklist: [],
    uiStyle: 'elder',
  },
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface DailyLimitConfig {
  dailyLimit: number;
  usedToday: number;
  lastResetDate: string;
}

interface ModeSwitchLogEntry {
  fromMode: UserMode;
  toMode: UserMode;
  switchedAt: string; // ISO 8601 timestamp
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBrowser(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Hash a PIN string to a hex-encoded SHA-256 digest using the Web Crypto API.
 */
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Return the numeric index of a rating in RATING_ORDER.
 * Lower index = less restrictive.
 */
function ratingIndex(rating: ContentRating): number {
  return RATING_ORDER.indexOf(rating);
}

// ---------------------------------------------------------------------------
// AgeGate class
// ---------------------------------------------------------------------------

export class AgeGate {
  // ---- Mode ---------------------------------------------------------------

  /** Get the current user mode. Defaults to 'teen' if never set. */
  getMode(): UserMode {
    if (!isBrowser()) return DEFAULT_MODE;
    const stored = localStorage.getItem(STORAGE_MODE_KEY);
    if (stored && isValidMode(stored)) return stored;
    return DEFAULT_MODE;
  }

  /** Check if the user has explicitly chosen a mode (first-time setup done). */
  hasChosenMode(): boolean {
    if (!isBrowser()) return false;
    return localStorage.getItem(STORAGE_MODE_KEY) !== null;
  }

  /** Set mode directly (for first-time selection, no PIN required). */
  selectMode(mode: UserMode): void {
    this.setMode(mode);
  }

  /** Persist a mode value to localStorage. */
  private setMode(mode: UserMode): void {
    if (!isBrowser()) return;
    localStorage.setItem(STORAGE_MODE_KEY, mode);
  }

  // ---- Access control -----------------------------------------------------

  /**
   * Check whether the current mode allows access to the given rating.
   * Compares the rating's index against the mode's max-allowed rating index.
   */
  canAccess(rating: ContentRating): boolean {
    const maxRating = MODE_MAX_RATING[this.getMode()];
    return ratingIndex(rating) <= ratingIndex(maxRating);
  }

  /**
   * Filter a list of rated items, keeping only those the current mode allows.
   */
  filterContent<T extends { rating: ContentRating }>(items: T[]): T[] {
    return items.filter((item) => this.canAccess(item.rating));
  }

  // ---- Mode switching (PIN-protected) ------------------------------------

  /**
   * Set (or update) the PIN. Must be called at least once before switchMode
   * can verify. Stores the SHA-256 hash in localStorage.
   */
  async setPin(pin: string): Promise<void> {
    if (!isBrowser()) return;
    const hash = await hashPin(pin);
    localStorage.setItem(STORAGE_PIN_KEY, hash);
  }

  /**
   * Switch to a new user mode after verifying the PIN.
   *
   * - Switching from a higher privilege level to a lower one does NOT require PIN.
   * - Switching from a lower privilege level to a higher one requires PIN.
   * - Integrates PIN lockout: after 3 consecutive failures, locks for 30 minutes.
   *
   * Returns `true` if the mode was changed.
   * Returns `false` if the PIN was wrong, locked out, or no PIN has been set.
   */
  async switchMode(newMode: UserMode, pin: string): Promise<boolean> {
    if (!isBrowser()) return false;

    const currentMode = this.getMode();
    const goingDown = MODE_LEVEL[newMode] <= MODE_LEVEL[currentMode];

    // Switching to a lower or equal privilege level — no PIN needed
    if (goingDown) {
      const fromMode = currentMode;
      this.setMode(newMode);
      this.applyDailyLimitForMode(newMode);
      this.logModeSwitch(fromMode, newMode);
      return true;
    }

    // Going up — PIN verification required
    // Check lockout first
    const lockStatus = this.getPinLockStatus();
    if (lockStatus.locked) return false;

    const storedHash = localStorage.getItem(STORAGE_PIN_KEY);
    if (!storedHash) return false;

    const inputHash = await hashPin(pin);
    if (inputHash !== storedHash) {
      // PIN failure — increment counter, possibly trigger lockout
      this.incrementPinFailCount();
      return false;
    }

    // PIN success — reset failure count, switch mode
    this.resetPinFailCount();
    const fromMode = currentMode;
    this.setMode(newMode);
    this.applyDailyLimitForMode(newMode);
    this.logModeSwitch(fromMode, newMode);
    return true;
  }

  /**
   * Apply the default daily limit configuration for a given mode.
   */
  private applyDailyLimitForMode(mode: UserMode): void {
    const config = this.loadConfig();
    if (config.dailyLimit === 0 && DEFAULT_DAILY_LIMITS[mode] > 0) {
      config.dailyLimit = DEFAULT_DAILY_LIMITS[mode];
      this.saveConfig(config);
    } else if (DEFAULT_DAILY_LIMITS[mode] === 0) {
      config.dailyLimit = 0;
      this.saveConfig(config);
    }
  }

  // ---- Daily limit --------------------------------------------------------

  /**
   * Check whether the user is still within their daily usage limit.
   * Resets `usedToday` if `lastResetDate` is not today.
   */
  checkDailyLimit(): { allowed: boolean; remainingMinutes: number } {
    const config = this.loadConfig();
    const today = todayDateString();

    // Reset counter if it's a new day
    if (config.lastResetDate !== today) {
      config.usedToday = 0;
      config.lastResetDate = today;
      this.saveConfig(config);
    }

    // 0 means unlimited
    if (config.dailyLimit === 0) {
      return { allowed: true, remainingMinutes: Infinity };
    }

    const remaining = Math.max(0, config.dailyLimit - config.usedToday);
    return { allowed: remaining > 0, remainingMinutes: remaining };
  }

  /**
   * Record usage time (in minutes). Call periodically to track daily usage.
   */
  recordUsage(minutes: number): void {
    const config = this.loadConfig();
    const today = todayDateString();

    if (config.lastResetDate !== today) {
      config.usedToday = 0;
      config.lastResetDate = today;
    }

    config.usedToday += minutes;
    this.saveConfig(config);
  }

  /**
   * Set a custom daily limit (in minutes). 0 = unlimited.
   */
  setDailyLimit(minutes: number): void {
    const config = this.loadConfig();
    config.dailyLimit = minutes;
    this.saveConfig(config);
  }

  // ---- Navigation config --------------------------------------------------

  /**
   * Return the NavConfig for the current user mode.
   * Determines which sections are visible, which ratings are hidden,
   * search blacklist keywords, and UI style.
   */
  getNavConfig(): NavConfig {
    return NAV_CONFIGS[this.getMode()];
  }

  // ---- PIN lockout --------------------------------------------------------

  /**
   * Return the current PIN lock status.
   * After 3 consecutive PIN failures, the PIN is locked for 30 minutes.
   */
  getPinLockStatus(): { locked: boolean; remainingSeconds: number } {
    if (!isBrowser()) return { locked: false, remainingSeconds: 0 };

    const lockedUntilStr = localStorage.getItem(STORAGE_PIN_LOCKED_UNTIL_KEY);
    if (!lockedUntilStr) return { locked: false, remainingSeconds: 0 };

    const lockedUntil = Number(lockedUntilStr);
    const now = Date.now();

    if (now >= lockedUntil) {
      // Lock expired — clean up
      localStorage.removeItem(STORAGE_PIN_LOCKED_UNTIL_KEY);
      localStorage.removeItem(STORAGE_PIN_FAIL_COUNT_KEY);
      return { locked: false, remainingSeconds: 0 };
    }

    const remainingMs = lockedUntil - now;
    return { locked: true, remainingSeconds: Math.ceil(remainingMs / 1000) };
  }

  /**
   * Increment the PIN failure counter. If it reaches MAX_PIN_FAILURES,
   * set the lock expiry to now + PIN_LOCKOUT_SECONDS.
   */
  private incrementPinFailCount(): void {
    if (!isBrowser()) return;

    const current = Number(localStorage.getItem(STORAGE_PIN_FAIL_COUNT_KEY) || '0');
    const newCount = current + 1;
    localStorage.setItem(STORAGE_PIN_FAIL_COUNT_KEY, String(newCount));

    if (newCount >= MAX_PIN_FAILURES) {
      const lockUntil = Date.now() + PIN_LOCKOUT_SECONDS * 1000;
      localStorage.setItem(STORAGE_PIN_LOCKED_UNTIL_KEY, String(lockUntil));
    }
  }

  /**
   * Reset the PIN failure counter (called on successful PIN verification).
   */
  private resetPinFailCount(): void {
    if (!isBrowser()) return;
    localStorage.removeItem(STORAGE_PIN_FAIL_COUNT_KEY);
    localStorage.removeItem(STORAGE_PIN_LOCKED_UNTIL_KEY);
  }

  // ---- Mode switch logging ------------------------------------------------

  /**
   * Log a mode switch event to localStorage.
   * Keeps the last MAX_MODE_SWITCH_LOG_ENTRIES entries.
   */
  logModeSwitch(fromMode: UserMode, toMode: UserMode): void {
    if (!isBrowser()) return;

    const entry: ModeSwitchLogEntry = {
      fromMode,
      toMode,
      switchedAt: new Date().toISOString(),
    };

    let log: ModeSwitchLogEntry[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_MODE_SWITCH_LOG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          log = parsed;
        }
      }
    } catch {
      // Corrupted data — start fresh
    }

    log.push(entry);

    // Keep only the last N entries
    if (log.length > MAX_MODE_SWITCH_LOG_ENTRIES) {
      log = log.slice(log.length - MAX_MODE_SWITCH_LOG_ENTRIES);
    }

    localStorage.setItem(STORAGE_MODE_SWITCH_LOG_KEY, JSON.stringify(log));
  }

  // ---- Config persistence -------------------------------------------------

  private loadConfig(): DailyLimitConfig {
    if (!isBrowser()) {
      return { dailyLimit: 0, usedToday: 0, lastResetDate: todayDateString() };
    }

    try {
      const raw = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DailyLimitConfig;
        return {
          dailyLimit: typeof parsed.dailyLimit === 'number' ? parsed.dailyLimit : 0,
          usedToday: typeof parsed.usedToday === 'number' ? parsed.usedToday : 0,
          lastResetDate: typeof parsed.lastResetDate === 'string' ? parsed.lastResetDate : todayDateString(),
        };
      }
    } catch {
      // Corrupted data — fall through to defaults
    }

    return { dailyLimit: 0, usedToday: 0, lastResetDate: todayDateString() };
  }

  private saveConfig(config: DailyLimitConfig): void {
    if (!isBrowser()) return;
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
  }
}

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

const VALID_MODES: ReadonlySet<string> = new Set<UserMode>([
  'child',
  'teen',
  'mature',
  'adult',
  'elder',
]);

function isValidMode(value: string): value is UserMode {
  return VALID_MODES.has(value);
}

// ---------------------------------------------------------------------------
// Singleton export for convenience
// ---------------------------------------------------------------------------

export const ageGate = new AgeGate();
