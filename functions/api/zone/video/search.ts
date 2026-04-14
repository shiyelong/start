/**
 * Adult video aggregated search API.
 *
 * GET /api/zone/video/search — search across all adult video sources with
 * multi-tag combination filtering.
 *
 * Query params:
 *   q        (required) — search query string
 *   source   (optional) — filter by source ID (e.g. adult-src-1)
 *   region   (optional) — comma-separated region list (日本AV/欧美/国产/韩国/东南亚/印度/拉美)
 *   type     (optional) — video type (剧情片/纯色情/动画3D/业余自拍/直播录像/VR/ASMR)
 *   quality  (optional) — video quality (4K/1080p/720p/480p)
 *   duration (optional) — duration filter (short/medium/long/full)
 *   page     (optional) — page number, default 1
 *   pageSize (optional) — results per page, default 20 (max 100)
 *   sortBy   (optional) — relevance/latest/popular/rating
 *
 * All results are forced NC-17 rating. Only adult-mode users should
 * reach this endpoint (enforced by AgeGate middleware).
 *
 * All traffic goes through Cloudflare Workers proxy — NAS IP never exposed.
 *
 * Validates: Requirements 17.1, 17.2, 17.3, 17.5, 17.7, 17.8, 17.9
 */

import { jsonResponse } from '../../_lib/db';
import { APIError, handleError } from '../../_lib/errors';
import { sanitizeString, validateEnum } from '../../_lib/validate';
import { AggregatorEngine } from '../../_lib/aggregator';
import type { SearchRequest } from '../../_lib/aggregator';
import {
  createAllAdultVideoAdapters,
  getAllAdultVideoSourceIds,
  getAdultVideoAdapterById,
} from './_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

const VALID_SORT = ['relevance', 'latest', 'popular', 'rating'] as const;

const VALID_REGIONS = [
  '日本AV', '欧美', '国产', '韩国', '东南亚', '印度', '拉美',
] as const;

const VALID_TYPES = [
  '剧情片', '纯色情', '动画3D', '业余自拍', '直播录像', 'VR', 'ASMR',
] as const;

const VALID_QUALITY = ['4K', '1080p', '720p', '480p'] as const;

const VALID_DURATION = ['short', 'medium', 'long', 'full'] as const;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);

    // --- Parse & validate query params ---
    const rawQuery = url.searchParams.get('q');
    if (!rawQuery || !rawQuery.trim()) {
      throw new APIError(400, '搜索关键词不能为空');
    }
    const query = sanitizeString(rawQuery, 200);

    // Source filter (specific adult video source ID)
    const sourceParam = url.searchParams.get('source');
    if (sourceParam) {
      const validSources = getAllAdultVideoSourceIds();
      if (!validSources.includes(sourceParam)) {
        throw new APIError(400, `无效的视频源。可选值: ${validSources.join(', ')}`);
      }
    }

    // Region filter (comma-separated)
    const regionParam = url.searchParams.get('region');
    const regions = regionParam
      ? regionParam.split(',').map((r) => sanitizeString(r.trim(), 50)).filter(Boolean)
      : [];

    // Type filter
    const typeParam = url.searchParams.get('type');
    if (typeParam && !validateEnum(typeParam, [...VALID_TYPES])) {
      throw new APIError(400, `无效的视频类型。可选值: ${VALID_TYPES.join(', ')}`);
    }

    // Quality filter
    const qualityParam = url.searchParams.get('quality');
    if (qualityParam && !validateEnum(qualityParam, [...VALID_QUALITY])) {
      throw new APIError(400, `无效的画质。可选值: ${VALID_QUALITY.join(', ')}`);
    }

    // Duration filter
    const durationParam = url.searchParams.get('duration');
    if (durationParam && !validateEnum(durationParam, [...VALID_DURATION])) {
      throw new APIError(400, `无效的时长筛选。可选值: ${VALID_DURATION.join(', ')}`);
    }

    // Pagination
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));

    // Sort
    const sortByParam = url.searchParams.get('sortBy') || 'relevance';
    if (!validateEnum(sortByParam, [...VALID_SORT])) {
      throw new APIError(400, `无效的排序方式。可选值: ${VALID_SORT.join(', ')}`);
    }

    // --- Build aggregator with adult video adapters ---
    const engine = new AggregatorEngine();

    if (sourceParam) {
      // Single source search
      const adapter = getAdultVideoAdapterById(sourceParam);
      if (adapter) {
        engine.registerAdapter(adapter);
      }
    } else {
      // Search all adult video sources
      const adapters = createAllAdultVideoAdapters();
      for (const adapter of adapters) {
        engine.registerAdapter(adapter);
      }
    }

    // --- Build tags from multi-dimensional filters ---
    const tags: string[] = [];
    if (typeParam) tags.push(typeParam);
    if (qualityParam) tags.push(qualityParam);
    if (durationParam) tags.push(durationParam);

    // --- Execute search ---
    const searchRequest: SearchRequest = {
      query,
      type: 'video',
      rating: 'NC-17',             // Adult zone — always NC-17
      region: regions.length > 0 ? regions : undefined,
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
        regions: [...VALID_REGIONS],
        types: [...VALID_TYPES],
        quality: [...VALID_QUALITY],
        duration: [...VALID_DURATION],
        sortOptions: [...VALID_SORT],
      },
    });
  } catch (error) {
    return handleError(error);
  }
};
