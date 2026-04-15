/**
 * GET /api/recommend/home — Home page personalized recommendations
 *
 * Returns recommended content based on user's recent playback history,
 * favorites, and bookmarks. Falls back to popular/trending content
 * when no history is available.
 *
 * Query params: page, pageSize
 *
 * Validates: Requirement 28.1, 28.2, 28.3
 */

import { requireAuth } from '../_lib/auth';
import { query, jsonResponse } from '../_lib/db';
import { handleError } from '../_lib/errors';
import { canAccess, type UserMode } from '../_lib/rating';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

interface RecommendItem {
  id: string;
  title: string;
  cover: string;
  source: string;
  type: string;
  rating: string;
  tags: string[];
  score: number;
}

// ── GET /api/recommend/home ───────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const url = new URL(context.request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
    const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '20', 10) || 20, 50);

    // Check KV cache first (per-user, hourly refresh)
    const cacheKey = `recommend:home:${user.id}:${page}`;
    const cached = await context.env.KV.get(cacheKey, 'json').catch(() => null);
    if (cached) {
      return jsonResponse(cached);
    }

    // Get user mode from settings for MPAA filtering
    const settings = await query<{ age_mode: string }>(
      context.env.DB,
      'SELECT age_mode FROM user_settings WHERE user_id = ?',
      [user.id],
    ).catch(() => []);

    const userMode = (settings[0]?.age_mode as UserMode) || 'teen';

    // Extract high-frequency tags from recent 30-day history
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const historyTags = await query<{ tags: string; type: string }>(
      context.env.DB,
      `SELECT tags, type FROM playback_history
       WHERE user_id = ? AND created_at > ?
       ORDER BY created_at DESC LIMIT 100`,
      [user.id, thirtyDaysAgo],
    ).catch(() => []);

    const favoriteTags = await query<{ tags: string; type: string }>(
      context.env.DB,
      `SELECT tags, type FROM favorites
       WHERE user_id = ? AND created_at > ?
       ORDER BY created_at DESC LIMIT 50`,
      [user.id, thirtyDaysAgo],
    ).catch(() => []);

    // Count tag frequencies
    const tagFreq: Record<string, number> = {};
    const typeFreq: Record<string, number> = {};

    [...historyTags, ...favoriteTags].forEach((row) => {
      if (row.type) {
        typeFreq[row.type] = (typeFreq[row.type] || 0) + 1;
      }
      if (row.tags) {
        try {
          const parsed = JSON.parse(row.tags);
          if (Array.isArray(parsed)) {
            parsed.forEach((tag: string) => {
              tagFreq[tag] = (tagFreq[tag] || 0) + 1;
            });
          }
        } catch {
          // tags might be comma-separated
          row.tags.split(',').forEach((tag: string) => {
            const t = tag.trim();
            if (t) tagFreq[t] = (tagFreq[t] || 0) + 1;
          });
        }
      }
    });

    const hasHistory = Object.keys(tagFreq).length > 0 || Object.keys(typeFreq).length > 0;

    let recommendations: RecommendItem[] = [];

    if (!hasHistory) {
      // No history — return popular/trending content
      const popular = await query<Record<string, unknown>>(
        context.env.DB,
        `SELECT id, title, cover, source, type, rating, tags
         FROM source_config
         WHERE enabled = 1
         ORDER BY success_rate DESC, priority ASC
         LIMIT ?`,
        [pageSize],
      ).catch(() => []);

      recommendations = popular.map((item) => ({
        id: String(item.id || ''),
        title: String(item.name || item.title || ''),
        cover: String(item.cover || ''),
        source: String(item.name || ''),
        type: String(item.type || ''),
        rating: String(item.rating || 'PG'),
        tags: [],
        score: 0,
      }));
    } else {
      // Build recommendations based on tag/type frequency
      const topTypes = Object.entries(typeFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => t);

      if (topTypes.length > 0) {
        const placeholders = topTypes.map(() => '?').join(',');
        const items = await query<Record<string, unknown>>(
          context.env.DB,
          `SELECT id, name AS title, '' AS cover, name AS source, type, rating, '' AS tags
           FROM source_config
           WHERE enabled = 1 AND type IN (${placeholders})
           ORDER BY priority ASC
           LIMIT ?`,
          [...topTypes, pageSize],
        ).catch(() => []);

        recommendations = items.map((item) => ({
          id: String(item.id || ''),
          title: String(item.title || ''),
          cover: String(item.cover || ''),
          source: String(item.source || ''),
          type: String(item.type || ''),
          rating: String(item.rating || 'PG'),
          tags: [],
          score: typeFreq[String(item.type)] || 0,
        }));
      }
    }

    // Filter by user MPAA mode
    recommendations = recommendations.filter((item) =>
      canAccess(userMode, item.rating as import('../_lib/rating').ContentRating),
    );

    // Filter out disliked content
    const disliked = await query<{ content_id: string }>(
      context.env.DB,
      'SELECT content_id FROM recommend_dislikes WHERE user_id = ?',
      [user.id],
    ).catch(() => []);

    const dislikedIds = new Set(disliked.map((d) => d.content_id));
    recommendations = recommendations.filter((item) => !dislikedIds.has(item.id));

    const offset = (page - 1) * pageSize;
    const paged = recommendations.slice(offset, offset + pageSize);

    const result = {
      items: paged,
      total: recommendations.length,
      page,
      pageSize,
      hasHistory,
    };

    // Cache for 1 hour
    await context.env.KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 3600 }).catch(() => {});

    return jsonResponse(result);
  } catch (error) {
    return handleError(error);
  }
};
