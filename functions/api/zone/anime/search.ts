/**
 * Adult anime aggregated search API.
 *
 * GET /api/zone/anime/search — search across all adult anime sources with
 * multi-tag combination filtering.
 *
 * Query params:
 *   q        (required) — search query string
 *   source   (optional) — filter by source ID (e.g. adult-anime-src-1)
 *   genre    (optional) — comma-separated genre/theme list
 *   style    (optional) — art style (日式动漫/3D-CG/像素风/欧美卡通)
 *   episodes (optional) — episode count filter (ova/short/long)
 *   year     (optional) — release year filter
 *   status   (optional) — airing status (ongoing/completed)
 *   subtitle (optional) — subtitle language (cn/en/jp/none)
 *   page     (optional) — page number, default 1
 *   pageSize (optional) — results per page, default 20 (max 100)
 *   sortBy   (optional) — relevance/latest/popular/rating
 *
 * All results are forced NC-17 rating. Only adult-mode users should
 * reach this endpoint (enforced by AgeGate middleware).
 *
 * All traffic goes through Cloudflare Workers proxy — NAS IP never exposed.
 *
 * Validates: Requirements 48.1, 48.2, 48.3, 48.5, 48.6, 48.8, 48.10, 48.11
 */

import { jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';
import { sanitizeString, validateEnum } from '../../_lib/validate';
import { AggregatorEngine } from '../../_lib/aggregator';
import type { SearchRequest } from '../../_lib/aggregator';
import {
  createAllAdultAnimeAdapters,
  getAllAdultAnimeSourceIds,
  getAdultAnimeAdapterById,
} from './_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

const VALID_SORT = ['relevance', 'latest', 'popular', 'rating'] as const;

const VALID_STYLES = ['日式动漫', '3D-CG', '像素风', '欧美卡通'] as const;

const VALID_EPISODES = ['ova', 'short', 'long'] as const;

const VALID_STATUS = ['ongoing', 'completed'] as const;

const VALID_SUBTITLE = ['cn', 'en', 'jp', 'none'] as const;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);

    // --- Parse & validate query params ---
    const rawQuery = url.searchParams.get('q');
    if (!rawQuery || !rawQuery.trim()) {
      throw new APIError(400, '搜索关键词不能为空');
    }
    const query = sanitizeString(rawQuery, 200);

    // Source filter (specific adult anime source ID)
    const sourceParam = url.searchParams.get('source');
    if (sourceParam) {
      const validSources = getAllAdultAnimeSourceIds();
      if (!validSources.includes(sourceParam)) {
        throw new APIError(400, `无效的动漫源。可选值: ${validSources.join(', ')}`);
      }
    }

    // Genre filter (comma-separated)
    const genreParam = url.searchParams.get('genre');
    const genres = genreParam
      ? genreParam.split(',').map((g) => sanitizeString(g.trim(), 50)).filter(Boolean)
      : [];

    // Style filter
    const styleParam = url.searchParams.get('style');
    if (styleParam && !validateEnum(styleParam, [...VALID_STYLES])) {
      throw new APIError(400, `无效的画风。可选值: ${VALID_STYLES.join(', ')}`);
    }

    // Episodes filter
    const episodesParam = url.searchParams.get('episodes');
    if (episodesParam && !validateEnum(episodesParam, [...VALID_EPISODES])) {
      throw new APIError(400, `无效的集数筛选。可选值: ${VALID_EPISODES.join(', ')}`);
    }

    // Year filter
    const yearParam = url.searchParams.get('year');
    if (yearParam) {
      const yearNum = parseInt(yearParam, 10);
      if (isNaN(yearNum) || yearNum < 1980 || yearNum > new Date().getFullYear() + 1) {
        throw new APIError(400, '无效的年份');
      }
    }

    // Status filter
    const statusParam = url.searchParams.get('status');
    if (statusParam && !validateEnum(statusParam, [...VALID_STATUS])) {
      throw new APIError(400, `无效的状态。可选值: ${VALID_STATUS.join(', ')}`);
    }

    // Subtitle filter
    const subtitleParam = url.searchParams.get('subtitle');
    if (subtitleParam && !validateEnum(subtitleParam, [...VALID_SUBTITLE])) {
      throw new APIError(400, `无效的字幕选项。可选值: ${VALID_SUBTITLE.join(', ')}`);
    }

    // Pagination
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));

    // Sort
    const sortByParam = url.searchParams.get('sortBy') || 'relevance';
    if (!validateEnum(sortByParam, [...VALID_SORT])) {
      throw new APIError(400, `无效的排序方式。可选值: ${VALID_SORT.join(', ')}`);
    }

    // --- Build aggregator with adult anime adapters ---
    const engine = new AggregatorEngine();

    if (sourceParam) {
      // Single source search
      const adapter = getAdultAnimeAdapterById(sourceParam);
      if (adapter) {
        engine.registerAdapter(adapter);
      }
    } else {
      // Search all adult anime sources
      const adapters = createAllAdultAnimeAdapters();
      for (const adapter of adapters) {
        engine.registerAdapter(adapter);
      }
    }

    // --- Build tags from multi-dimensional filters ---
    const tags: string[] = [...genres];
    if (styleParam) tags.push(styleParam);
    if (episodesParam) tags.push(episodesParam);
    if (statusParam) tags.push(statusParam);
    if (subtitleParam) tags.push(subtitleParam);
    if (yearParam) tags.push(yearParam);

    // --- Execute search ---
    const searchRequest: SearchRequest = {
      query,
      type: 'anime',
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
        styles: [...VALID_STYLES],
        episodes: [...VALID_EPISODES],
        status: [...VALID_STATUS],
        subtitle: [...VALID_SUBTITLE],
        sortOptions: [...VALID_SORT],
      },
    });
  } catch (error) {
    return handleError(error);
  }
};
