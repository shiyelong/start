/**
 * Adult comic aggregated search API.
 *
 * GET /api/zone/comic/search — search across all adult comic sources with
 * multi-tag combination filtering.
 *
 * Query params:
 *   q        (required) — search query string
 *   source   (optional) — filter by source ID (e.g. adult-comic-src-1)
 *   genre    (optional) — comma-separated genre/theme list
 *   language (optional) — language filter (cn/en/jp/kr)
 *   style    (optional) — art style (日漫/韩漫/欧美/国漫/同人志)
 *   pages    (optional) — page count filter (short/medium/long)
 *   page     (optional) — page number, default 1
 *   pageSize (optional) — results per page, default 20 (max 100)
 *   sortBy   (optional) — relevance/latest/popular/rating
 *
 * All results are forced NC-17 rating. Only adult-mode users should
 * reach this endpoint (enforced by AgeGate middleware).
 *
 * All traffic goes through Cloudflare Workers proxy — NAS IP never exposed.
 *
 * Validates: Requirements 19.1, 19.2, 19.3, 19.5, 19.7, 19.8, 19.9
 */

import { jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';
import { sanitizeString, validateEnum } from '../../_lib/validate';
import { AggregatorEngine } from '../../_lib/aggregator';
import type { SearchRequest } from '../../_lib/aggregator';
import {
  createAllAdultComicAdapters,
  getAllAdultComicSourceIds,
  getAdultComicAdapterById,
} from './_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

const VALID_SORT = ['relevance', 'latest', 'popular', 'rating'] as const;

const VALID_LANGUAGES = ['cn', 'en', 'jp', 'kr'] as const;

const VALID_STYLES = ['日漫', '韩漫', '欧美', '国漫', '同人志'] as const;

const VALID_PAGES = ['short', 'medium', 'long'] as const;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);

    // --- Parse & validate query params ---
    const rawQuery = url.searchParams.get('q');
    if (!rawQuery || !rawQuery.trim()) {
      throw new APIError(400, '搜索关键词不能为空');
    }
    const query = sanitizeString(rawQuery, 200);

    // Source filter (specific adult comic source ID)
    const sourceParam = url.searchParams.get('source');
    if (sourceParam) {
      const validSources = getAllAdultComicSourceIds();
      if (!validSources.includes(sourceParam)) {
        throw new APIError(400, `无效的漫画源。可选值: ${validSources.join(', ')}`);
      }
    }

    // Genre filter (comma-separated)
    const genreParam = url.searchParams.get('genre');
    const genres = genreParam
      ? genreParam.split(',').map((g) => sanitizeString(g.trim(), 50)).filter(Boolean)
      : [];

    // Language filter
    const languageParam = url.searchParams.get('language');
    if (languageParam && !validateEnum(languageParam, [...VALID_LANGUAGES])) {
      throw new APIError(400, `无效的语言。可选值: ${VALID_LANGUAGES.join(', ')}`);
    }

    // Style filter
    const styleParam = url.searchParams.get('style');
    if (styleParam && !validateEnum(styleParam, [...VALID_STYLES])) {
      throw new APIError(400, `无效的画风。可选值: ${VALID_STYLES.join(', ')}`);
    }

    // Pages filter
    const pagesParam = url.searchParams.get('pages');
    if (pagesParam && !validateEnum(pagesParam, [...VALID_PAGES])) {
      throw new APIError(400, `无效的页数筛选。可选值: ${VALID_PAGES.join(', ')}`);
    }

    // Pagination
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));

    // Sort
    const sortByParam = url.searchParams.get('sortBy') || 'relevance';
    if (!validateEnum(sortByParam, [...VALID_SORT])) {
      throw new APIError(400, `无效的排序方式。可选值: ${VALID_SORT.join(', ')}`);
    }

    // --- Build aggregator with adult comic adapters ---
    const engine = new AggregatorEngine();

    if (sourceParam) {
      // Single source search
      const adapter = getAdultComicAdapterById(sourceParam);
      if (adapter) {
        engine.registerAdapter(adapter);
      }
    } else {
      // Search all adult comic sources
      const adapters = createAllAdultComicAdapters();
      for (const adapter of adapters) {
        engine.registerAdapter(adapter);
      }
    }

    // --- Build tags from multi-dimensional filters ---
    const tags: string[] = [...genres];
    if (languageParam) tags.push(languageParam);
    if (styleParam) tags.push(styleParam);
    if (pagesParam) tags.push(pagesParam);

    // --- Execute search ---
    const searchRequest: SearchRequest = {
      query,
      type: 'comic',
      rating: 'NC-17',             // Adult zone — always NC-17
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
      filters: {
        languages: [...VALID_LANGUAGES],
        styles: [...VALID_STYLES],
        pages: [...VALID_PAGES],
        sortOptions: [...VALID_SORT],
      },
    });
  } catch (error) {
    return handleError(error);
  }
};
