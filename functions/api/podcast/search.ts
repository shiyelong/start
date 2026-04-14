/**
 * Podcast aggregated search API.
 *
 * GET /api/podcast/search — search across all podcast sources with filtering
 *
 * Query params:
 *   q        (required) — search query string
 *   source   (optional) — filter by source ID (e.g. apple-podcasts, xiaoyuzhou)
 *   rating   (optional) — max content rating filter (G/PG/PG-13/R/NC-17)
 *   category (optional) — category filter (technology/business/education/entertainment/news)
 *   page     (optional) — page number, default 1
 *   pageSize (optional) — results per page, default 20 (max 100)
 *   sortBy   (optional) — relevance/latest/popular/rating
 *
 * Podcast MPAA rating (Requirement 24.9):
 *   All podcast sources default to PG.
 *
 * Validates: Requirements 24.1, 24.2, 24.3, 24.9
 */

import { jsonResponse } from '../_lib/db';
import { APIError, handleError } from '../_lib/errors';
import { sanitizeString, validateEnum } from '../_lib/validate';
import { isRatingAllowed, type ContentRating } from '../_lib/rating';
import { AggregatorEngine } from '../_lib/aggregator';
import type { SearchRequest } from '../_lib/aggregator';
import { createAllPodcastAdapters, getAllPodcastSourceIds, getPodcastAdapterById } from './_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

const VALID_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const;
const VALID_SORT = ['relevance', 'latest', 'popular', 'rating'] as const;
const VALID_CATEGORIES = [
  'technology', 'business', 'education', 'entertainment',
  'news', 'comedy', 'society', 'health', 'science', 'sports',
] as const;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);

    // --- Parse & validate query params ---
    const rawQuery = url.searchParams.get('q');
    if (!rawQuery || !rawQuery.trim()) {
      throw new APIError(400, '搜索关键词不能为空');
    }
    const query = sanitizeString(rawQuery, 200);

    // Source filter (specific podcast source ID)
    const sourceParam = url.searchParams.get('source');
    if (sourceParam) {
      const validSources = getAllPodcastSourceIds();
      if (!validSources.includes(sourceParam)) {
        throw new APIError(400, `无效的播客源。可选值: ${validSources.join(', ')}`);
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

    // Category filter
    const categoryParam = url.searchParams.get('category');
    const tags: string[] = [];
    if (categoryParam) {
      if (!validateEnum(categoryParam, [...VALID_CATEGORIES])) {
        throw new APIError(400, `无效的分类。可选值: ${VALID_CATEGORIES.join(', ')}`);
      }
      tags.push(categoryParam);
    }

    // Pagination
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));

    // Sort
    const sortByParam = url.searchParams.get('sortBy') || 'relevance';
    if (!validateEnum(sortByParam, [...VALID_SORT])) {
      throw new APIError(400, `无效的排序方式。可选值: ${VALID_SORT.join(', ')}`);
    }

    // --- Build aggregator with podcast adapters ---
    const engine = new AggregatorEngine();

    if (sourceParam) {
      // Single source search
      const adapter = getPodcastAdapterById(sourceParam);
      if (adapter) {
        engine.registerAdapter(adapter);
      }
    } else {
      // Search all podcast sources
      const adapters = createAllPodcastAdapters();
      for (const adapter of adapters) {
        engine.registerAdapter(adapter);
      }
    }

    // --- Execute search ---
    const searchRequest: SearchRequest = {
      query,
      type: 'podcast',
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
