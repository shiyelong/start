/**
 * Anime source adapter registry.
 *
 * Exports all anime source adapters and factory functions to
 * instantiate the full set of adapters for the anime aggregation engine.
 *
 * All adapters are GenericAnimeAdapter instances (stub implementations).
 * Actual third-party API integration will be refined per-adapter later.
 * All requests go through Cloudflare Workers proxy to hide NAS IP.
 *
 * Adapter list (13 sources):
 * - 樱花动漫 (Yinghua) — PG-13
 * - AGE动漫 (AGE) — PG-13
 * - OmoFun — PG-13
 * - Anime1 — PG-13
 * - AnimePahe — PG-13
 * - GoGoAnime — PG-13
 * - 9Anime — PG-13
 * - AnimeDao — PG-13
 * - Zoro.to — PG-13
 * - Crunchyroll 免费区 (Crunchyroll Free) — PG-13
 * - 动漫花园 (DMHY) — PG-13
 * - 萌番组 (Bangumi Moe) — PG-13
 * - 简单动漫 (SimpleAnime) — PG-13
 *
 * Anime MPAA rating rules (Requirement 22.9):
 * - All anime sources default to PG-13 rating
 *
 * Validates: Requirements 22.1, 22.2, 22.3, 22.4, 22.7, 22.8, 22.9, 22.10
 */

import type { ISourceAdapter } from '../../_lib/source-adapter';
import { GenericAnimeAdapter } from './generic-anime-adapter';
import type { GenericAnimeAdapterOptions } from './generic-anime-adapter';

// Re-export
export { GenericAnimeAdapter } from './generic-anime-adapter';

/**
 * Anime source definitions.
 * Each entry creates a GenericAnimeAdapter with source-specific config.
 * All anime sources default to PG-13 per Requirement 22.9.
 */
const ANIME_SOURCES: GenericAnimeAdapterOptions[] = [
  {
    id: 'yinghua',
    name: '樱花动漫',
    rating: 'PG-13',
    priority: 10,
    searchUrl: 'https://www.yinghuacd.com/search/',
    platform: 'yinghua',
  },
  {
    id: 'age',
    name: 'AGE动漫',
    rating: 'PG-13',
    priority: 11,
    searchUrl: 'https://www.agemys.net/search',
    platform: 'age',
  },
  {
    id: 'omofun',
    name: 'OmoFun',
    rating: 'PG-13',
    priority: 12,
    searchUrl: 'https://omofun.tv/search/',
    platform: 'omofun',
  },
  {
    id: 'anime1',
    name: 'Anime1',
    rating: 'PG-13',
    priority: 15,
    searchUrl: 'https://anime1.me/',
    platform: 'anime1',
  },
  {
    id: 'animepahe',
    name: 'AnimePahe',
    rating: 'PG-13',
    priority: 16,
    searchUrl: 'https://animepahe.ru/api',
    platform: 'animepahe',
  },
  {
    id: 'gogoanime',
    name: 'GoGoAnime',
    rating: 'PG-13',
    priority: 20,
    searchUrl: 'https://gogoanime3.co/search.html',
    platform: 'gogoanime',
  },
  {
    id: '9anime',
    name: '9Anime',
    rating: 'PG-13',
    priority: 21,
    searchUrl: 'https://9animetv.to/search',
    platform: '9anime',
  },
  {
    id: 'animedao',
    name: 'AnimeDao',
    rating: 'PG-13',
    priority: 22,
    searchUrl: 'https://animedao.to/search/',
    platform: 'animedao',
  },
  {
    id: 'zoroto',
    name: 'Zoro.to',
    rating: 'PG-13',
    priority: 23,
    searchUrl: 'https://zoro.to/search',
    platform: 'zoroto',
  },
  {
    id: 'crunchyroll-free',
    name: 'Crunchyroll 免费区',
    rating: 'PG-13',
    priority: 25,
    searchUrl: 'https://www.crunchyroll.com/search',
    platform: 'crunchyroll-free',
  },
  {
    id: 'dmhy',
    name: '动漫花园',
    rating: 'PG-13',
    priority: 30,
    searchUrl: 'https://share.dmhy.org/topics/list',
    platform: 'dmhy',
  },
  {
    id: 'bangumi-moe',
    name: '萌番组',
    rating: 'PG-13',
    priority: 31,
    searchUrl: 'https://bangumi.moe/search/index',
    platform: 'bangumi-moe',
  },
  {
    id: 'simpleanime',
    name: '简单动漫',
    rating: 'PG-13',
    priority: 35,
    searchUrl: 'https://www.36dm.club/search/',
    platform: 'simpleanime',
  },
];

/**
 * Create all anime source adapters.
 *
 * Returns an array of ISourceAdapter instances ready to be registered
 * with the AggregatorEngine.
 */
export function createAllAnimeAdapters(): ISourceAdapter[] {
  const adapters: ISourceAdapter[] = [];

  for (const opts of ANIME_SOURCES) {
    adapters.push(new GenericAnimeAdapter(opts));
  }

  return adapters;
}

/**
 * Create a single anime adapter by source ID.
 *
 * Useful for detail endpoints that need to resolve a specific source.
 */
export function getAnimeAdapterById(sourceId: string): ISourceAdapter | null {
  const opts = ANIME_SOURCES.find((s) => s.id === sourceId);
  if (opts) return new GenericAnimeAdapter(opts);
  return null;
}

/** Get all registered anime source IDs. */
export function getAllAnimeSourceIds(): string[] {
  return ANIME_SOURCES.map((s) => s.id);
}
