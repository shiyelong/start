/**
 * Comic source adapter registry.
 *
 * Exports all comic source adapters and factory functions to
 * instantiate the full set of adapters for the comic aggregation engine.
 *
 * All adapters are GenericComicAdapter instances (stub implementations).
 * Actual third-party API integration will be refined per-adapter later.
 * All requests go through Cloudflare Workers proxy to hide NAS IP.
 *
 * Adapter list:
 * - 漫画柜 (Manhuagui) — PG
 * - 动漫之家 (Dmzj) — PG
 * - 拷贝漫画 (Copymanga) — PG
 * - 包子漫画 (Baozimh) — PG
 * - 奇妙漫画 (Qimiao) — G
 * - 漫画DB (MangaDB) — PG
 * - MangaDex — PG
 * - MangaReader — PG
 * - MangaKakalot — PG
 * - MangaPark — PG
 * - Webtoon — G
 * - 快看漫画 (Kuaikan) — G
 * - 腾讯动漫 (QQ Comic) — PG
 * - 有妖气 (U17) — PG
 *
 * Comic MPAA rating rules (Requirement 18.13):
 * - Children's / all-ages comics: G
 * - Mainstream manga / manhua / manhwa: PG
 * - Violent or mildly suggestive comics: PG-13
 * - Mature themes: R
 * - Adult / explicit comics: NC-17
 *
 * Validates: Requirements 18.1, 18.2, 18.3, 18.11, 18.12, 18.13
 */

import type { ISourceAdapter } from '../../_lib/source-adapter';
import { GenericComicAdapter } from './generic-comic-adapter';
import type { GenericComicAdapterOptions } from './generic-comic-adapter';

// Re-export
export { GenericComicAdapter } from './generic-comic-adapter';

/**
 * Comic source definitions.
 * Each entry creates a GenericComicAdapter with source-specific config.
 */
const COMIC_SOURCES: GenericComicAdapterOptions[] = [
  {
    id: 'manhuagui',
    name: '漫画柜',
    rating: 'PG',
    priority: 10,
    searchUrl: 'https://www.manhuagui.com/s/',
    platform: 'manhuagui',
  },
  {
    id: 'dmzj',
    name: '动漫之家',
    rating: 'PG',
    priority: 11,
    searchUrl: 'https://sacg.dmzj.com/comicsum/search.php',
    platform: 'dmzj',
  },
  {
    id: 'copymanga',
    name: '拷贝漫画',
    rating: 'PG',
    priority: 12,
    searchUrl: 'https://api.copymanga.tv/api/v3/search/comic',
    platform: 'copymanga',
  },
  {
    id: 'baozimh',
    name: '包子漫画',
    rating: 'PG',
    priority: 15,
    searchUrl: 'https://www.baozimh.com/search',
    platform: 'baozimh',
  },
  {
    id: 'qimiao',
    name: '奇妙漫画',
    rating: 'G',
    priority: 16,
    searchUrl: 'https://www.qimiaomh.com/search/',
    platform: 'qimiao',
  },
  {
    id: 'mangadb',
    name: '漫画DB',
    rating: 'PG',
    priority: 20,
    searchUrl: 'https://www.mangadb.top/search/',
    platform: 'mangadb',
  },
  {
    id: 'mangadex',
    name: 'MangaDex',
    rating: 'PG',
    priority: 25,
    searchUrl: 'https://api.mangadex.org/manga',
    platform: 'mangadex',
  },
  {
    id: 'mangareader',
    name: 'MangaReader',
    rating: 'PG',
    priority: 26,
    searchUrl: 'https://www.mangareader.to/search',
    platform: 'mangareader',
  },
  {
    id: 'mangakakalot',
    name: 'MangaKakalot',
    rating: 'PG',
    priority: 27,
    searchUrl: 'https://mangakakalot.com/search/story/',
    platform: 'mangakakalot',
  },
  {
    id: 'mangapark',
    name: 'MangaPark',
    rating: 'PG',
    priority: 28,
    searchUrl: 'https://mangapark.net/search',
    platform: 'mangapark',
  },
  {
    id: 'webtoon',
    name: 'Webtoon',
    rating: 'G',
    priority: 30,
    searchUrl: 'https://www.webtoons.com/search',
    platform: 'webtoon',
  },
  {
    id: 'kuaikan',
    name: '快看漫画',
    rating: 'G',
    priority: 35,
    searchUrl: 'https://www.kuaikanmanhua.com/search/mini/',
    platform: 'kuaikan',
  },
  {
    id: 'qqcomic',
    name: '腾讯动漫',
    rating: 'PG',
    priority: 36,
    searchUrl: 'https://ac.qq.com/Comic/searchList/',
    platform: 'qqcomic',
  },
  {
    id: 'u17',
    name: '有妖气',
    rating: 'PG',
    priority: 37,
    searchUrl: 'https://so.u17.com/all/',
    platform: 'u17',
  },
];

/**
 * Create all comic source adapters.
 *
 * Returns an array of ISourceAdapter instances ready to be registered
 * with the AggregatorEngine.
 */
export function createAllComicAdapters(): ISourceAdapter[] {
  const adapters: ISourceAdapter[] = [];

  for (const opts of COMIC_SOURCES) {
    adapters.push(new GenericComicAdapter(opts));
  }

  return adapters;
}

/**
 * Create a single comic adapter by source ID.
 *
 * Useful for detail endpoints that need to resolve a specific source.
 */
export function getComicAdapterById(sourceId: string): ISourceAdapter | null {
  const opts = COMIC_SOURCES.find((s) => s.id === sourceId);
  if (opts) return new GenericComicAdapter(opts);
  return null;
}

/** Get all registered comic source IDs. */
export function getAllComicSourceIds(): string[] {
  return COMIC_SOURCES.map((s) => s.id);
}
