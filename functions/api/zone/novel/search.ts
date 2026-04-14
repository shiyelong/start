/**
 * Adult novel aggregated search API.
 *
 * GET /api/zone/novel/search — search across all adult novel sources with
 * multi-tag combination filtering.
 *
 * Query params:
 *   q        (required) — search query string
 *   source   (optional) — filter by source ID (e.g. adult-novel-src-1)
 *   genre    (optional) — comma-separated genre/theme list
 *   language (optional) — language filter (cn/en/jp)
 *   words    (optional) — word count filter (short/medium/long/extra-long)
 *   status   (optional) — status filter (ongoing/completed)
 *   page     (optional) — page number, default 1
 *   pageSize (optional) — results per page, default 20 (max 100)
 *   sortBy   (optional) — relevance/latest/popular/rating
 *
 * All results are forced NC-17 rating. Only adult-mode users should
 * reach this endpoint (enforced by AgeGate middleware).
 *
 * All traffic goes through Cloudflare Workers proxy — NAS IP never exposed.
 *
 * Validates: Requirements 30.1, 30.2, 30.3, 30.5, 30.7, 30.8, 30.9
 */

import { jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';
import { sanitizeString, validateEnum } from '../../_lib/validate';
import { AggregatorEngine } from '../../_lib/aggregator';
import type { SearchRequest } from '../../_lib/aggregator';
import {
  createAllAdultNovelAdapters,
  getAllAdultNovelSourceIds,
  getAdultNovelAdapterById,
} from './_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

const VALID_SORT = ['relevance', 'latest', 'popular', 'rating'] as const;

const VALID_LANGUAGES = ['cn', 'en', 'jp'] as const;

const VALID_WORDS = ['short', 'medium', 'long', 'extra-long'] as const;

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

    // Source filter (specific adult novel source ID)
    const sourceParam = url.searchParams.get('source');
    if (sourceParam) {
      const validSources = getAllAdultNovelSourceIds();
      if (!validSources.includes(sourceParam)) {
        throw new APIError(400, `无效的小说源。可选值: ${validSources.join(', ')}`);
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

    // Word count filter
    const wordsParam = url.searchParams.get('words');
    if (wordsParam && !validateEnum(wordsParam, [...VALID_WORDS])) {
      throw new APIError(400, `无效的字数筛选。可选值: ${VALID_WORDS.join(', ')}`);
    }

    // Status filter
    const statusParam = url.searchParams.get('status');
    if (statusParam && !validateEnum(statusParam, [...VALID_STATUS])) {
      throw new APIError(400, `无效的状态。可选值: ${VALID_STATUS.join(', ')}`);
    }

    // Pagination
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));

    // Sort
    const sortByParam = url.searchParams.get('sortBy') || 'relevance';
    if (!validateEnum(sortByParam, [...VALID_SORT])) {
      throw new APIError(400, `无效的排序方式。可选值: ${VALID_SORT.join(', ')}`);
    }

    // --- Build aggregator with adult novel adapters ---
    const engine = new AggregatorEngine();

    if (sourceParam) {
      // Single source search
      const adapter = getAdultNovelAdapterById(sourceParam);
      if (adapter) {
        engine.registerAdapter(adapter);
      }
    } else {
      // Search all adult novel sources
      const adapters = createAllAdultNovelAdapters();
      for (const adapter of adapters) {
        engine.registerAdapter(adapter);
      }
    }

    // --- Build tags from multi-dimensional filters ---
    const tags: string[] = [...genres];
    if (languageParam) tags.push(languageParam);
    if (wordsParam) tags.push(wordsParam);
    if (statusParam) tags.push(statusParam);

    // --- Execute search ---
    const searchRequest: SearchRequest = {
      query,
      type: 'novel',
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
        words: [...VALID_WORDS],
        status: [...VALID_STATUS],
        sortOptions: [...VALID_SORT],
      },
    });
  } catch (error) {
    return handleError(error);
  }
};
