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

import type { ContentRating, UserMode } from './types';
import { RATING_ORDER, MODE_MAX_RATING } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_MODE_KEY = 'starhub_age_gate_mode';
const STORAGE_PIN_KEY = 'starhub_age_gate_pin';
const STORAGE_CONFIG_KEY = 'starhub_age_gate_config';

const DEFAULT_MODE: UserMode = 'adult'; // 默认成人模式

/** Default daily limits per mode (minutes). 0 = unlimited. */
const DEFAULT_DAILY_LIMITS: Record<UserMode, number> = {
  child: 90,   // 1.5 hours
  teen: 180,   // 3 hours
  mature: 0,
  adult: 0,
  elder: 0,
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface DailyLimitConfig {
  dailyLimit: number;
  usedToday: number;
  lastResetDate: string;
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
   * Returns `true` if the PIN matched and the mode was changed.
   * Returns `false` if the PIN was wrong or no PIN has been set.
   *
   * NOTE: This is async because SHA-256 hashing uses the Web Crypto API.
   */
  async switchMode(newMode: UserMode, pin: string): Promise<boolean> {
    if (!isBrowser()) return false;

    const storedHash = localStorage.getItem(STORAGE_PIN_KEY);
    if (!storedHash) return false;

    const inputHash = await hashPin(pin);
    if (inputHash !== storedHash) return false;

    this.setMode(newMode);

    // Apply default daily limit for the new mode if not already configured
    const config = this.loadConfig();
    if (config.dailyLimit === 0 && DEFAULT_DAILY_LIMITS[newMode] > 0) {
      config.dailyLimit = DEFAULT_DAILY_LIMITS[newMode];
      this.saveConfig(config);
    } else if (DEFAULT_DAILY_LIMITS[newMode] === 0) {
      // Unlimited modes reset the limit
      config.dailyLimit = 0;
      this.saveConfig(config);
    }

    return true;
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
