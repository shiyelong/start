/**
 * Hot search keywords API.
 *
 * GET /api/search/hot — return top 10 hot search keywords
 *
 * No required params. Results are cached in KV for 1 hour.
 *
 * Returns: { keywords: string[] }
 *
 * For now returns a static list of hot keywords.
 * Will be replaced with real search analytics data later.
 *
 * Validates: Requirements 27.5, 27.6
 */

import { jsonResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';
import { cacheGet, cacheSet } from '../_lib/cache';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

const CACHE_KEY = 'search:hot:keywords';
const CACHE_TTL_SECONDS = 3600; // 1 hour

/**
 * Static hot keywords list.
 * Once real search analytics are available, this will be computed
 * from search frequency data in D1 and cached in KV.
 */
const HOT_KEYWORDS: string[] = [
  '进击的巨人',
  '周杰伦',
  '海贼王',
  '斗破苍穹',
  '原神',
  'YOASOBI',
  '鬼灭之刃',
  '三体',
  '英雄联盟',
  'Taylor Swift',
];

// ── GET handler ───────────────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    // Try reading from KV cache first
    if (context.env.KV) {
      const cached = await cacheGet<{ keywords: string[] }>(context.env.KV, CACHE_KEY);
      if (cached) {
        return jsonResponse(cached);
      }
    }

    // Build response
    const result = { keywords: HOT_KEYWORDS };

    // Cache in KV for 1 hour
    if (context.env.KV) {
      await cacheSet(context.env.KV, CACHE_KEY, result, CACHE_TTL_SECONDS);
    }

    return jsonResponse(result);
  } catch (error) {
    return handleError(error);
  }
};
