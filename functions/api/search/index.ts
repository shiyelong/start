/**
 * Global aggregated search API.
 *
 * GET /api/search — search across all content types with filtering
 *
 * Query params:
 *   q        (required) — search query string
 *   type     (optional) — content type filter (video/music/comic/novel/anime/live/podcast)
 *   rating   (optional) — max content rating filter (G/PG/PG-13/R/NC-17)
 *   tags     (optional) — comma-separated tag list for AND filtering
 *   region   (optional) — comma-separated region list
 *   page     (optional) — page number, default 1
 *   pageSize (optional) — results per page, default 20 (max 100)
 *   sortBy   (optional) — relevance/latest/popular/rating
 *
 * Validates: Requirements 27.1, 27.5, 27.6
 */

import { jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';
import { sanitizeString, validateEnum } from '../_lib/validate';
import { isRatingAllowed, type ContentRating } from '../_lib/rating';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

const VALID_TYPES = ['video', 'music', 'comic', 'novel', 'anime', 'live', 'podcast'] as const;
const VALID_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const;
const VALID_SORT = ['relevance', 'latest', 'popular', 'rating'] as const;

/**
 * Generate placeholder search results.
 *
 * Since source adapters are not wired up yet, this returns structured
 * mock data that matches the SearchResponse format the frontend expects.
 * Results are filtered by the user's max allowed rating.
 */
function generatePlaceholderResults(
  query: string,
  types: readonly string[],
  maxRating: ContentRating,
  tags: string[],
  regions: string[],
  sortBy: string,
  page: number,
  pageSize: number,
): { items: Record<string, unknown>[]; total: number; sources: Record<string, unknown>[] } {
  const allItems: Record<string, unknown>[] = [];

  // Ratings ordered by restrictiveness
  const ratingPool: ContentRating[] = ['G', 'PG', 'PG-13', 'R', 'NC-17'];

  for (const type of types) {
    // Generate a handful of mock items per type
    const sourceNames: Record<string, string[]> = {
      video: ['B站', 'YouTube', '免费影视'],
      music: ['网易云音乐', 'QQ音乐', 'Spotify'],
      comic: ['漫画柜', 'MangaDex', '动漫之家'],
      novel: ['笔趣阁', '全本小说网', 'NovelUpdates'],
      anime: ['樱花动漫', 'GoGoAnime', 'AGE动漫'],
      live:  ['斗鱼', '虎牙', 'Twitch'],
      podcast: ['小宇宙', 'Apple Podcasts', '喜马拉雅'],
    };

    const sources = sourceNames[type] || ['默认源'];

    for (let i = 0; i < 8; i++) {
      const itemRating = ratingPool[i % ratingPool.length];

      // Skip items that exceed the user's max rating
      if (!isRatingAllowed(maxRating, itemRating)) continue;

      const source = sources[i % sources.length];

      allItems.push({
        id: `${type}-${query}-${i}`,
        title: `${query} - ${type}结果 ${i + 1}`,
        cover: '',
        source,
        sourceId: `src-${type}-${i}`,
        rating: itemRating,
        type,
        url: `/${type}/${type}-${query}-${i}`,
        metadata: {},
      });
    }
  }

  // Apply tag filtering (placeholder: filter by title containing tag)
  let filtered = allItems;
  if (tags.length > 0) {
    filtered = filtered.filter((item) => {
      const title = (item.title as string).toLowerCase();
      return tags.some((tag) => title.includes(tag.toLowerCase()));
    });
  }

  // Apply region filtering (placeholder: no-op since mock data has no region)
  // Regions will be used once real source adapters are connected.

  // Sort
  if (sortBy === 'latest') {
    filtered.reverse();
  }
  // Other sort modes are no-ops on placeholder data

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  // Build source summary
  const sourceCounts = new Map<string, number>();
  for (const item of filtered) {
    const src = item.source as string;
    sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
  }
  const sourceSummary = Array.from(sourceCounts.entries()).map(([name, count]) => ({
    name,
    count,
    health: 'online',
  }));

  return { items: paged, total, sources: sourceSummary };
}

// ── GET handler ───────────────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);

    // --- Parse & validate query params ---
    const rawQuery = url.searchParams.get('q');
    if (!rawQuery || !rawQuery.trim()) {
      throw new APIError(400, '搜索关键词不能为空');
    }
    const query = sanitizeString(rawQuery, 200);

    // Content type filter
    const typeParam = url.searchParams.get('type');
    let types: readonly string[] = VALID_TYPES;
    if (typeParam) {
      if (!validateEnum(typeParam, [...VALID_TYPES])) {
        throw new APIError(400, `无效的内容类型。可选值: ${VALID_TYPES.join(', ')}`);
      }
      types = [typeParam];
    }

    // Rating filter — use query param, fall back to middleware-resolved maxRating
    const ratingParam = url.searchParams.get('rating');
    let maxRating: ContentRating = (context.data.maxRating as ContentRating) || 'NC-17';
    if (ratingParam) {
      if (!validateEnum(ratingParam, [...VALID_RATINGS])) {
        throw new APIError(400, `无效的分级。可选值: ${VALID_RATINGS.join(', ')}`);
      }
      // Use the more restrictive of the two
      if (isRatingAllowed(maxRating, ratingParam as ContentRating)) {
        maxRating = ratingParam as ContentRating;
      }
    }

    // Tags (comma-separated)
    const tagsParam = url.searchParams.get('tags');
    const tags = tagsParam
      ? tagsParam.split(',').map((t) => sanitizeString(t.trim(), 50)).filter(Boolean)
      : [];

    // Region (comma-separated)
    const regionParam = url.searchParams.get('region');
    const regions = regionParam
      ? regionParam.split(',').map((r) => sanitizeString(r.trim(), 50)).filter(Boolean)
      : [];

    // Pagination
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));

    // Sort
    const sortByParam = url.searchParams.get('sortBy') || 'relevance';
    if (!validateEnum(sortByParam, [...VALID_SORT])) {
      throw new APIError(400, `无效的排序方式。可选值: ${VALID_SORT.join(', ')}`);
    }

    // --- Generate results ---
    const { items, total, sources } = generatePlaceholderResults(
      query, types, maxRating, tags, regions, sortByParam, page, pageSize,
    );

    return jsonResponse({
      items,
      total,
      page,
      pageSize,
      sources,
    });
  } catch (error) {
    return handleError(error);
  }
};
