/**
 * Adult music aggregated search API.
 *
 * GET /api/zone/music/search — search across all adult music sources with
 * multi-tag combination filtering.
 *
 * Query params:
 *   q            (required) — search query string
 *   source       (optional) — filter by source ID (e.g. adult-music-src-1)
 *   genre        (optional) — music genre (asmr/drama-cd/voice/bgm/doujin)
 *   language     (optional) — language filter (jp/cn/en/kr)
 *   voiceGender  (optional) — voice actor gender (female/male/both)
 *   duration     (optional) — duration filter (short/medium/long)
 *   page         (optional) — page number, default 1
 *   pageSize     (optional) — results per page, default 20 (max 100)
 *   sortBy       (optional) — relevance/latest/popular/rating
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
  createAllAdultMusicAdapters,
  getAllAdultMusicSourceIds,
  getAdultMusicAdapterById,
} from './_adapters/index';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

const VALID_SORT = ['relevance', 'latest', 'popular', 'rating'] as const;

const VALID_GENRES = ['asmr', 'drama-cd', 'voice', 'bgm', 'doujin'] as const;

const VALID_LANGUAGES = ['jp', 'cn', 'en', 'kr'] as const;

const VALID_VOICE_GENDERS = ['female', 'male', 'both'] as const;

const VALID_DURATIONS = ['short', 'medium', 'long'] as const;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);

    // --- Parse & validate query params ---
    const rawQuery = url.searchParams.get('q');
    if (!rawQuery || !rawQuery.trim()) {
      throw new APIError(400, '搜索关键词不能为空');
    }
    const query = sanitizeString(rawQuery, 200);

    // Source filter (specific adult music source ID)
    const sourceParam = url.searchParams.get('source');
    if (sourceParam) {
      const validSources = getAllAdultMusicSourceIds();
      if (!validSources.includes(sourceParam)) {
        throw new APIError(400, `无效的音乐源。可选值: ${validSources.join(', ')}`);
      }
    }

    // Genre filter
    const genreParam = url.searchParams.get('genre');
    if (genreParam && !validateEnum(genreParam, [...VALID_GENRES])) {
      throw new APIError(400, `无效的类型。可选值: ${VALID_GENRES.join(', ')}`);
    }

    // Language filter
    const languageParam = url.searchParams.get('language');
    if (languageParam && !validateEnum(languageParam, [...VALID_LANGUAGES])) {
      throw new APIError(400, `无效的语言。可选值: ${VALID_LANGUAGES.join(', ')}`);
    }

    // Voice gender filter
    const voiceGenderParam = url.searchParams.get('voiceGender');
    if (voiceGenderParam && !validateEnum(voiceGenderParam, [...VALID_VOICE_GENDERS])) {
      throw new APIError(400, `无效的声优性别。可选值: ${VALID_VOICE_GENDERS.join(', ')}`);
    }

    // Duration filter
    const durationParam = url.searchParams.get('duration');
    if (durationParam && !validateEnum(durationParam, [...VALID_DURATIONS])) {
      throw new APIError(400, `无效的时长筛选。可选值: ${VALID_DURATIONS.join(', ')}`);
    }

    // Pagination
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));

    // Sort
    const sortByParam = url.searchParams.get('sortBy') || 'relevance';
    if (!validateEnum(sortByParam, [...VALID_SORT])) {
      throw new APIError(400, `无效的排序方式。可选值: ${VALID_SORT.join(', ')}`);
    }

    // --- Build aggregator with adult music adapters ---
    const engine = new AggregatorEngine();

    if (sourceParam) {
      const adapter = getAdultMusicAdapterById(sourceParam);
      if (adapter) {
        engine.registerAdapter(adapter);
      }
    } else {
      const adapters = createAllAdultMusicAdapters();
      for (const adapter of adapters) {
        engine.registerAdapter(adapter);
      }
    }

    // --- Build tags from multi-dimensional filters ---
    const tags: string[] = [];
    if (genreParam) tags.push(genreParam);
    if (languageParam) tags.push(languageParam);
    if (voiceGenderParam) tags.push(voiceGenderParam);
    if (durationParam) tags.push(durationParam);

    // --- Execute search ---
    const searchRequest: SearchRequest = {
      query,
      type: 'music',
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
        genres: [...VALID_GENRES],
        languages: [...VALID_LANGUAGES],
        voiceGenders: [...VALID_VOICE_GENDERS],
        durations: [...VALID_DURATIONS],
        sortOptions: [...VALID_SORT],
      },
    });
  } catch (error) {
    return handleError(error);
  }
};
