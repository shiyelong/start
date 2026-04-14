/**
 * Video aggregated search API.
 *
 * GET /api/video/search — search across all video sources with filtering
 *
 * Query params:
 *   q        (required) — search query string
 *   source   (optional) — filter by source ID (e.g. bilibili, youtube, acfun)
 *   rating   (optional) — max content rating filter (G/PG/PG-13/R/NC-17)
 *   region   (optional) — comma-separated region list (中国大陆/港台/日本/韩国/美国/欧洲)
 *   type     (optional) — video type (电影/电视剧/综艺/纪录片/短视频/动漫/MV)
 *   page     (optional) — page number, default 1
 *   pageSize (optional) — results per page, default 20 (max 100)
 *   sortBy   (optional) — relevance/latest/popular/rating
 *
 * Validates: Requirements 2.1, 2.2, 2.5, 2.6, 3.1, 3.2, 3.6, 4.1, 4.2, 4.3,
 *            16.1, 16.2, 16.5, 16.6, 21.1
 */

import { jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';
import { sanitizeString, validateEnum } from '../_lib/validate';
import { isRatingAllowed, type ContentRating } from '../_lib/rating';
import { AggregatorEngine } from '../_lib/aggregator';
import type { SearchRequest } from '../_lib/aggregator';
import { createAllVideoAdapters, getAllVideoSourceIds, getVideoAdapterById } from './_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

const VALID_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const;
const VALID_SORT = ['relevance', 'latest', 'popular', 'rating'] as const;
const VALID_VIDEO_TYPES = ['电影', '电视剧', '综艺', '纪录片', '短视频', '动漫', 'MV'] as const;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);

    // --- Parse & validate query params ---
    const rawQuery = url.searchParams.get('q');
    if (!rawQuery || !rawQuery.trim()) {
      throw new APIError(400, '搜索关键词不能为空');
    }
    const query = sanitizeString(rawQuery, 200);

    // Source filter (specific video source ID)
    const sourceParam = url.searchParams.get('source');
    if (sourceParam) {
      const validSources = getAllVideoSourceIds();
      if (!validSources.includes(sourceParam)) {
        throw new APIError(400, `无效的视频源。可选值: ${validSources.join(', ')}`);
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

    // Region filter (comma-separated)
    const regionParam = url.searchParams.get('region');
    const regions = regionParam
      ? regionParam.split(',').map((r) => sanitizeString(r.trim(), 50)).filter(Boolean)
      : [];

    // Video type filter
    const typeParam = url.searchParams.get('type');
    if (typeParam && !validateEnum(typeParam, [...VALID_VIDEO_TYPES])) {
      throw new APIError(400, `无效的视频类型。可选值: ${VALID_VIDEO_TYPES.join(', ')}`);
    }

    // Pagination
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));

    // Sort
    const sortByParam = url.searchParams.get('sortBy') || 'relevance';
    if (!validateEnum(sortByParam, [...VALID_SORT])) {
      throw new APIError(400, `无效的排序方式。可选值: ${VALID_SORT.join(', ')}`);
    }

    // --- Build aggregator with video adapters ---
    const engine = new AggregatorEngine();

    if (sourceParam) {
      // Single source search
      const adapter = getVideoAdapterById(sourceParam);
      if (adapter) {
        engine.registerAdapter(adapter);
      }
    } else {
      // Search all video sources
      const adapters = createAllVideoAdapters();
      for (const adapter of adapters) {
        engine.registerAdapter(adapter);
      }
    }

    // --- Execute search ---
    const searchRequest: SearchRequest = {
      query,
      type: 'video',
      rating: maxRating,
      region: regions.length > 0 ? regions : undefined,
      tags: typeParam ? [typeParam] : undefined,
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
