/**
 * Anime aggregated search API.
 *
 * GET /api/anime/search — search across all anime sources with filtering
 *
 * Query params:
 *   q        (required) — search query string
 *   source   (optional) — filter by source ID (e.g. yinghua, gogoanime)
 *   rating   (optional) — max content rating filter (G/PG/PG-13/R/NC-17)
 *   tags     (optional) — comma-separated multi-tag filter (热血,机甲)
 *   year     (optional) — year filter (e.g. 2024)
 *   status   (optional) — update status filter (ongoing/completed)
 *   region   (optional) — region filter (日漫/国漫/美漫/韩漫)
 *   page     (optional) — page number, default 1
 *   pageSize (optional) — results per page, default 20 (max 100)
 *   sortBy   (optional) — relevance/latest/popular/rating
 *
 * Anime MPAA rating (Requirement 22.9):
 *   All anime sources default to PG-13.
 *
 * Validates: Requirements 22.1, 22.2, 22.7, 22.9, 22.10
 */

import { jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';
import { sanitizeString, validateEnum } from '../_lib/validate';
import { isRatingAllowed, type ContentRating } from '../_lib/rating';
import { AggregatorEngine } from '../_lib/aggregator';
import type { SearchRequest } from '../_lib/aggregator';
import { createAllAnimeAdapters, getAllAnimeSourceIds, getAnimeAdapterById } from './_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

const VALID_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const;
const VALID_SORT = ['relevance', 'latest', 'popular', 'rating'] as const;
const VALID_STATUS = ['ongoing', 'completed'] as const;
const VALID_REGIONS = ['日漫', '国漫', '美漫', '韩漫'] as const;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);

    // --- Parse & validate query params ---
    const rawQuery = url.searchParams.get('q');
    if (!rawQuery || !rawQuery.trim()) {
      throw new APIError(400, '搜索关键词不能为空');
    }
    const query = sanitizeString(rawQuery, 200);

    // Source filter (specific anime source ID)
    const sourceParam = url.searchParams.get('source');
    if (sourceParam) {
      const validSources = getAllAnimeSourceIds();
      if (!validSources.includes(sourceParam)) {
        throw new APIError(400, `无效的动漫源。可选值: ${validSources.join(', ')}`);
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

    // Tags filter (multi-tag, comma-separated)
    const tagsParam = url.searchParams.get('tags');
    const tags: string[] = [];
    if (tagsParam) {
      const parsed = tagsParam.split(',').map((t) => t.trim()).filter(Boolean);
      tags.push(...parsed);
    }

    // Year filter
    const yearParam = url.searchParams.get('year');
    if (yearParam) {
      const yearNum = parseInt(yearParam, 10);
      if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
        throw new APIError(400, '无效的年份');
      }
      tags.push(`year:${yearNum}`);
    }

    // Status filter
    const statusParam = url.searchParams.get('status');
    if (statusParam) {
      if (!validateEnum(statusParam, [...VALID_STATUS])) {
        throw new APIError(400, `无效的更新状态。可选值: ${VALID_STATUS.join(', ')}`);
      }
      tags.push(statusParam);
    }

    // Region filter
    const regionParam = url.searchParams.get('region');
    if (regionParam) {
      if (!validateEnum(regionParam, [...VALID_REGIONS])) {
        throw new APIError(400, `无效的地区。可选值: ${VALID_REGIONS.join(', ')}`);
      }
      tags.push(regionParam);
    }

    // Pagination
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));

    // Sort
    const sortByParam = url.searchParams.get('sortBy') || 'relevance';
    if (!validateEnum(sortByParam, [...VALID_SORT])) {
      throw new APIError(400, `无效的排序方式。可选值: ${VALID_SORT.join(', ')}`);
    }

    // --- Build aggregator with anime adapters ---
    const engine = new AggregatorEngine();

    if (sourceParam) {
      // Single source search
      const adapter = getAnimeAdapterById(sourceParam);
      if (adapter) {
        engine.registerAdapter(adapter);
      }
    } else {
      // Search all anime sources
      const adapters = createAllAnimeAdapters();
      for (const adapter of adapters) {
        engine.registerAdapter(adapter);
      }
    }

    // --- Execute search ---
    const searchRequest: SearchRequest = {
      query,
      type: 'anime',
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
