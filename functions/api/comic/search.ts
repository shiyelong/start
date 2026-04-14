/**
 * Comic aggregated search API.
 *
 * GET /api/comic/search — search across all comic sources with filtering
 *
 * Query params:
 *   q        (required) — search query string
 *   source   (optional) — filter by source ID (e.g. mangadex, manhuagui)
 *   rating   (optional) — max content rating filter (G/PG/PG-13/R/NC-17)
 *   genre    (optional) — comic genre filter (热血/恋爱/搞笑/冒险/科幻/悬疑/恐怖/运动)
 *   status   (optional) — update status filter (ongoing/completed)
 *   page     (optional) — page number, default 1
 *   pageSize (optional) — results per page, default 20 (max 100)
 *   sortBy   (optional) — relevance/latest/popular/rating
 *
 * Comic MPAA rating (Requirement 18.13):
 *   G     — children's / all-ages comics
 *   PG    — mainstream manga / manhua / manhwa
 *   PG-13 — violent or mildly suggestive comics
 *   R     — mature themes
 *   NC-17 — adult / explicit comics
 *
 * Validates: Requirements 18.1, 18.2, 18.3, 18.11, 18.12, 18.13
 */

import { jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';
import { sanitizeString, validateEnum } from '../_lib/validate';
import { isRatingAllowed, type ContentRating } from '../_lib/rating';
import { AggregatorEngine } from '../_lib/aggregator';
import type { SearchRequest } from '../_lib/aggregator';
import { createAllComicAdapters, getAllComicSourceIds, getComicAdapterById } from './_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

const VALID_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const;
const VALID_SORT = ['relevance', 'latest', 'popular', 'rating'] as const;
const VALID_COMIC_GENRES = ['热血', '恋爱', '搞笑', '冒险', '科幻', '悬疑', '恐怖', '运动'] as const;
const VALID_STATUS = ['ongoing', 'completed'] as const;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);

    // --- Parse & validate query params ---
    const rawQuery = url.searchParams.get('q');
    if (!rawQuery || !rawQuery.trim()) {
      throw new APIError(400, '搜索关键词不能为空');
    }
    const query = sanitizeString(rawQuery, 200);

    // Source filter (specific comic source ID)
    const sourceParam = url.searchParams.get('source');
    if (sourceParam) {
      const validSources = getAllComicSourceIds();
      if (!validSources.includes(sourceParam)) {
        throw new APIError(400, `无效的漫画源。可选值: ${validSources.join(', ')}`);
      }
    }

    // Rating filter — use query param, fall back to middleware-resolved maxRating
    const ratingParam = url.searchParams.get('rating');
    let maxRating: ContentRating = (context.data.maxRating as ContentRating) || 'NC-17';
    if (ratingParam) {
      if (!validateEnum(ratingParam, [...VALID_RATINGS])) {
        throw new APIError(400, `无效的分级。可选值: ${VALID_RATINGS.join(', ')}`);
      }
      if (isRatingAllowed(maxRating, ratingParam as ContentRating)) {
        maxRating = ratingParam as ContentRating;
      }
    }

    // Genre filter
    const genreParam = url.searchParams.get('genre');
    if (genreParam && !validateEnum(genreParam, [...VALID_COMIC_GENRES])) {
      throw new APIError(400, `无效的漫画类型。可选值: ${VALID_COMIC_GENRES.join(', ')}`);
    }

    // Status filter
    const statusParam = url.searchParams.get('status');
    if (statusParam && !validateEnum(statusParam, [...VALID_STATUS])) {
      throw new APIError(400, `无效的更新状态。可选值: ${VALID_STATUS.join(', ')}`);
    }

    // Pagination
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));

    // Sort
    const sortByParam = url.searchParams.get('sortBy') || 'relevance';
    if (!validateEnum(sortByParam, [...VALID_SORT])) {
      throw new APIError(400, `无效的排序方式。可选值: ${VALID_SORT.join(', ')}`);
    }

    // --- Build aggregator with comic adapters ---
    const engine = new AggregatorEngine();

    if (sourceParam) {
      // Single source search
      const adapter = getComicAdapterById(sourceParam);
      if (adapter) {
        engine.registerAdapter(adapter);
      }
    } else {
      // Search all comic sources
      const adapters = createAllComicAdapters();
      for (const adapter of adapters) {
        engine.registerAdapter(adapter);
      }
    }

    // --- Execute search ---
    const tags: string[] = [];
    if (genreParam) tags.push(genreParam);
    if (statusParam) tags.push(statusParam);

    const searchRequest: SearchRequest = {
      query,
      type: 'comic',
      rating: maxRating,
      tags: tags.length > 0 ? tags : undefined,
      page,
      pageSize,
      sortBy: sortByParam as SearchRequest['sortBy'],
    };

    const result = await engine.search(searchRequest);

    return jsonResponse({
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      sources: result.sources,
    });
  } catch (error) {
    return handleError(error);
  }
};
