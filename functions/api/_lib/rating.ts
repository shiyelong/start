/**
 * MPAA content-rating utility functions.
 *
 * Provides:
 * - `autoRate(sourceName)` — map a known aggregation source to its default
 *   MPAA rating (Requirement 14.9).
 * - `esrbToMpaa(esrb)` — convert an ESRB rating to the MPAA equivalent
 *   (Requirement 35.4).
 * - `canAccess(userMode, contentRating)` — check whether a user mode
 *   permits viewing a given content rating.
 * - `isRatingAllowed(maxRating, contentRating)` — compare two ratings
 *   using RATING_ORDER.
 *
 * All rating types and constants are imported from the shared types module
 * (`src/lib/types.ts`) to keep a single source of truth.
 */

// ── Types (mirrored from src/lib/types.ts for backend use) ────

/** MPAA content rating levels. */
export type ContentRating = 'G' | 'PG' | 'PG-13' | 'R' | 'NC-17';

/** User age-gate mode. */
export type UserMode = 'child' | 'teen' | 'mature' | 'adult' | 'elder';

/** Ordered rating levels — lower index = less restrictive. */
export const RATING_ORDER: readonly ContentRating[] = [
  'G',
  'PG',
  'PG-13',
  'R',
  'NC-17',
] as const;

/** Maximum allowed content rating per user mode. */
export const MODE_MAX_RATING: Record<UserMode, ContentRating> = {
  child: 'G',
  teen: 'PG-13',
  mature: 'R',
  adult: 'NC-17',
  elder: 'PG',
};

// ── ESRB rating type ──────────────────────────────────────────

/** Valid ESRB rating values. */
export type ESRBRating = 'E' | 'E10+' | 'T' | 'M' | 'AO';

// ── Source → MPAA auto-rating map (Requirement 14.9) ──────────

/**
 * Default MPAA rating for well-known aggregation sources.
 *
 * Sources not listed here should fall back to a sensible default
 * (e.g. 'PG') or be configured per-source in the admin panel.
 */
const SOURCE_RATING_MAP: Record<string, ContentRating> = {
  // Video sources
  'A站': 'G',
  'AcFun': 'G',
  'B站': 'PG',
  'Bilibili': 'PG',
  'YouTube': 'PG',
  '免费影视': 'PG-13',
  'Twitch': 'PG-13',
  '抖音': 'PG',
  '快手': 'PG',
  'Niconico': 'PG',

  // Adult sources — always NC-17
  '成人源': 'NC-17',
  '成人视频': 'NC-17',
  '成人漫画': 'NC-17',
  '成人小说': 'NC-17',
  '成人直播': 'NC-17',
  '成人音乐': 'NC-17',
  '成人游戏': 'NC-17',
  '成人动漫': 'NC-17',
  '成人服务': 'NC-17',

  // Music defaults
  '纯音乐': 'G',
  '儿歌': 'G',
  '流行': 'PG',
  '摇滚': 'PG',
  '民谣': 'PG',
  'Explicit': 'R',
  '成人ASMR': 'NC-17',

  // Anime / comic / novel defaults
  '动漫': 'PG-13',
  '漫画': 'PG',
  '小说': 'PG',
  '播客': 'PG',
  '直播': 'PG-13',
};

// ── ESRB → MPAA mapping (Requirement 35.4) ────────────────────

const ESRB_TO_MPAA: Record<ESRBRating, ContentRating> = {
  'E': 'G',
  'E10+': 'PG',
  'T': 'PG-13',
  'M': 'R',
  'AO': 'NC-17',
};

// ── Public API ────────────────────────────────────────────────

/**
 * Return the default MPAA rating for a known source name.
 *
 * If the source is not in the built-in map, returns `null` so the
 * caller can decide on a fallback (e.g. the rating stored in D1).
 */
export function autoRate(sourceName: string): ContentRating | null {
  return SOURCE_RATING_MAP[sourceName] ?? null;
}

/**
 * Convert an ESRB rating to its MPAA equivalent.
 *
 * @returns The mapped MPAA rating, or `null` for unknown ESRB values.
 */
export function esrbToMpaa(esrb: string): ContentRating | null {
  return ESRB_TO_MPAA[esrb as ESRBRating] ?? null;
}

/**
 * Check whether a user mode allows access to a given content rating.
 *
 * Uses `MODE_MAX_RATING` to determine the ceiling for each mode,
 * then compares via `RATING_ORDER`.
 */
export function canAccess(userMode: UserMode, contentRating: ContentRating): boolean {
  const maxRating = MODE_MAX_RATING[userMode];
  return isRatingAllowed(maxRating, contentRating);
}

/**
 * Return `true` if `contentRating` is at or below `maxRating`
 * according to `RATING_ORDER`.
 *
 * Example: `isRatingAllowed('PG-13', 'PG')` → true
 *          `isRatingAllowed('PG', 'R')`     → false
 */
export function isRatingAllowed(
  maxRating: ContentRating,
  contentRating: ContentRating,
): boolean {
  const maxIndex = RATING_ORDER.indexOf(maxRating);
  const contentIndex = RATING_ORDER.indexOf(contentRating);
  // Unknown ratings are treated as disallowed
  if (maxIndex === -1 || contentIndex === -1) return false;
  return contentIndex <= maxIndex;
}
