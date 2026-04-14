/**
 * Novel aggregated search API.
 *
 * GET /api/novel/search — search across all novel sources with filtering
 *
 * Query params:
 *   q        (required) — search query string
 *   source   (optional) — filter by source ID (e.g. biquge, novelupdates)
 *   rating   (optional) — max content rating filter (G/PG/PG-13/R/NC-17)
 *   genre    (optional) — novel genre filter (玄幻/都市/科幻/历史/言情/仙侠/武侠/游戏)
 *   status   (optional) — update status filter (ongoing/completed)
 *   page     (optional) — page number, default 1
 *   pageSize (optional) — results per page, default 20 (max 100)
 *   sortBy   (optional) — relevance/latest/popular/rating
 *
 * Novel MPAA rating (Requirement 23.13):
 *   All mainstream novel sources default to PG rating.
 *   Adult novel sources are NC-17 (handled separately).
 *
 * Validates: Requirements 23.1, 23.2, 23.3, 23.12, 23.13
 */

import { jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';
import { sanitizeString, validateEnum } from '../_lib/validate';
import { isRatingAllowed, type ContentRating } from '../_lib/rating';
import { AggregatorEngine } from '../_lib/aggregator';
import type { SearchRequest } from '../_lib/aggregator';
import { createAllNovelAdapters, getAllNovelSourceIds, getNovelAdapterById } from './_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

const VALID_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const;
const VALID_SORT = ['relevance', 'latest', 'popular', 'rating'] as const;
const VALID_NOVEL_GENRES = ['玄幻', '都市', '科幻', '历史', '言情', '仙侠', '武侠', '游戏'] as const;
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

    // Source filter (specific novel source ID)
    const sourceParam = url.searchParams.get('source');
    if (sourceParam) {
      const validSources = getAllNovelSourceIds();
      if (!validSources.includes(sourceParam)) {
        throw new APIError(400, `无效的小说源。可选值: ${validSources.join(', ')}`);
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
    if (genreParam && !validateEnum(genreParam, [...VALID_NOVEL_GENRES])) {
      throw new APIError(400, `无效的小说类型。可选值: ${VALID_NOVEL_GENRES.join(', ')}`);
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

    // --- Build aggregator with novel adapters ---
    const engine = new AggregatorEngine();

    if (sourceParam) {
      // Single source search
      const adapter = getNovelAdapterById(sourceParam);
      if (adapter) {
        engine.registerAdapter(adapter);
      }
    } else {
      // Search all novel sources
      const adapters = createAllNovelAdapters();
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
      type: 'novel',
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
