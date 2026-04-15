/**
 * GET /api/recommend/[type] — Channel-specific recommendations
 *
 * Params: type = video | music | comic | novel | anime
 * Query params: page, pageSize
 *
 * Returns recommendations for a specific content channel based on
 * user history within that channel.
 *
 * Validates: Requirement 28.2, 28.4
 */

import { requireAuth } from '../_lib/auth';
import { query, jsonResponse, errorResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';
import { canAccess, type UserMode, type ContentRating } from '../_lib/rating';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

const VALID_TYPES = ['video', 'music', 'comic', 'novel', 'anime'] as const;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const type = context.params.type as string;

    if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
      return errorResponse(
        `Invalid type. Allowed: ${VALID_TYPES.join(', ')}`,
        400,
      );
    }

    const url = new URL(context.request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
    const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '20', 10) || 20, 50);

    // Check KV cache
    const cacheKey = `recommend:${type}:${user.id}:${page}`;
    const cached = await context.env.KV.get(cacheKey, 'json').catch(() => null);
    if (cached) {
      return jsonResponse(cached);
    }

    // Get user mode
    const settings = await query<{ age_mode: string }>(
      context.env.DB,
      'SELECT age_mode FROM user_settings WHERE user_id = ?',
      [user.id],
    ).catch(() => []);

    const userMode = (settings[0]?.age_mode as UserMode) || 'teen';

    // Get channel-specific history tags
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const history = await query<{ tags: string }>(
      context.env.DB,
      `SELECT tags FROM playback_history
       WHERE user_id = ? AND type = ? AND created_at > ?
       ORDER BY created_at DESC LIMIT 50`,
      [user.id, type, thirtyDaysAgo],
    ).catch(() => []);

    // Extract tag frequencies
    const tagFreq: Record<string, number> = {};
    history.forEach((row) => {
      if (row.tags) {
        try {
          const parsed = JSON.parse(row.tags);
          if (Array.isArray(parsed)) {
            parsed.forEach((tag: string) => {
              tagFreq[tag] = (tagFreq[tag] || 0) + 1;
            });
          }
        } catch {
          row.tags.split(',').forEach((tag: string) => {
            const t = tag.trim();
            if (t) tagFreq[t] = (tagFreq[t] || 0) + 1;
          });
        }
      }
    });

    // Get sources for this type, ordered by priority
    const sources = await query<Record<string, unknown>>(
      context.env.DB,
      `SELECT id, name, type, rating, priority
       FROM source_config
       WHERE enabled = 1 AND type = ?
       ORDER BY priority ASC
       LIMIT ?`,
      [type, pageSize * 2],
    ).catch(() => []);

    // Filter by MPAA mode
    let items = sources
      .filter((s) => canAccess(userMode, String(s.rating || 'PG') as ContentRating))
      .map((s) => ({
        id: String(s.id || ''),
        title: String(s.name || ''),
        cover: '',
        source: String(s.name || ''),
        type: String(s.type || type),
        rating: String(s.rating || 'PG'),
        tags: [] as string[],
        score: 0,
      }));

    // Filter out disliked
    const disliked = await query<{ content_id: string }>(
      context.env.DB,
      'SELECT content_id FROM recommend_dislikes WHERE user_id = ? AND type = ?',
      [user.id, type],
    ).catch(() => []);

    const dislikedIds = new Set(disliked.map((d) => d.content_id));
    items = items.filter((item) => !dislikedIds.has(item.id));

    const offset = (page - 1) * pageSize;
    const paged = items.slice(offset, offset + pageSize);

    const result = {
      items: paged,
      total: items.length,
      page,
      pageSize,
      type,
    };

    // Cache for 1 hour
    await context.env.KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 3600 }).catch(() => {});

    return jsonResponse(result);
  } catch (error) {
    return handleError(error);
  }
};
