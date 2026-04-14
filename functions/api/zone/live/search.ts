/**
 * Adult live streaming aggregated search API.
 *
 * GET /api/zone/live/search — search across all adult live sources with
 * multi-tag combination filtering.
 *
 * Query params:
 *   q             (required) — search query string
 *   source        (optional) — filter by source ID (e.g. adult-live-src-1)
 *   streamerGender(optional) — streamer gender filter (female/male/trans/couple)
 *   streamerTag   (optional) — comma-separated streamer feature tags
 *   streamType    (optional) — stream type (show/private/vr/interactive)
 *   page          (optional) — page number, default 1
 *   pageSize      (optional) — results per page, default 20 (max 100)
 *   sortBy        (optional) — relevance/latest/popular/rating
 *
 * All results are forced NC-17 rating. Only adult-mode users should
 * reach this endpoint (enforced by AgeGate middleware).
 *
 * All traffic goes through Cloudflare Workers proxy — NAS IP never exposed.
 *
 * Validates: Requirements 17.1, 17.2, 17.3, 17.5, 17.9
 */

import { jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';
import { sanitizeString, validateEnum } from '../../_lib/validate';
import { AggregatorEngine } from '../../_lib/aggregator';
import type { SearchRequest } from '../../_lib/aggregator';
import {
  createAllAdultLiveAdapters,
  getAllAdultLiveSourceIds,
  getAdultLiveAdapterById,
} from './_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

const VALID_SORT = ['relevance', 'latest', 'popular', 'rating'] as const;

const VALID_GENDERS = ['female', 'male', 'trans', 'couple'] as const;

const VALID_STREAM_TYPES = ['show', 'private', 'vr', 'interactive'] as const;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);

    // --- Parse & validate query params ---
    const rawQuery = url.searchParams.get('q');
    if (!rawQuery || !rawQuery.trim()) {
      throw new APIError(400, '搜索关键词不能为空');
    }
    const query = sanitizeString(rawQuery, 200);

    // Source filter (specific adult live source ID)
    const sourceParam = url.searchParams.get('source');
    if (sourceParam) {
      const validSources = getAllAdultLiveSourceIds();
      if (!validSources.includes(sourceParam)) {
        throw new APIError(400, `无效的直播源。可选值: ${validSources.join(', ')}`);
      }
    }

    // Streamer gender filter
    const genderParam = url.searchParams.get('streamerGender');
    if (genderParam && !validateEnum(genderParam, [...VALID_GENDERS])) {
      throw new APIError(400, `无效的主播性别。可选值: ${VALID_GENDERS.join(', ')}`);
    }

    // Streamer tag filter (comma-separated)
    const streamerTagParam = url.searchParams.get('streamerTag');
    const streamerTags = streamerTagParam
      ? streamerTagParam.split(',').map((t) => sanitizeString(t.trim(), 50)).filter(Boolean)
      : [];

    // Stream type filter
    const streamTypeParam = url.searchParams.get('streamType');
    if (streamTypeParam && !validateEnum(streamTypeParam, [...VALID_STREAM_TYPES])) {
      throw new APIError(400, `无效的直播类型。可选值: ${VALID_STREAM_TYPES.join(', ')}`);
    }

    // Pagination
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));

    // Sort
    const sortByParam = url.searchParams.get('sortBy') || 'relevance';
    if (!validateEnum(sortByParam, [...VALID_SORT])) {
      throw new APIError(400, `无效的排序方式。可选值: ${VALID_SORT.join(', ')}`);
    }

    // --- Build aggregator with adult live adapters ---
    const engine = new AggregatorEngine();

    if (sourceParam) {
      const adapter = getAdultLiveAdapterById(sourceParam);
      if (adapter) {
        engine.registerAdapter(adapter);
      }
    } else {
      const adapters = createAllAdultLiveAdapters();
      for (const adapter of adapters) {
        engine.registerAdapter(adapter);
      }
    }

    // --- Build tags from multi-dimensional filters ---
    const tags: string[] = [...streamerTags];
    if (genderParam) tags.push(genderParam);
    if (streamTypeParam) tags.push(streamTypeParam);

    // --- Execute search ---
    const searchRequest: SearchRequest = {
      query,
      type: 'live',
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
        genders: [...VALID_GENDERS],
        streamTypes: [...VALID_STREAM_TYPES],
        sortOptions: [...VALID_SORT],
      },
    });
  } catch (error) {
    return handleError(error);
  }
};
