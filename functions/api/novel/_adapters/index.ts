/**
 * Novel source adapter registry.
 *
 * Exports all novel source adapters and factory functions to
 * instantiate the full set of adapters for the novel aggregation engine.
 *
 * All adapters are GenericNovelAdapter instances (stub implementations).
 * Actual third-party API integration will be refined per-adapter later.
 * All requests go through Cloudflare Workers proxy to hide NAS IP.
 *
 * Adapter list:
 * - 笔趣阁 (Biquge) — PG
 * - 69书吧 (69shu) — PG
 * - 全本小说网 (Quanben) — PG
 * - 顶点小说 (Dingdian) — PG
 * - 八一中文网 (Bayi) — PG
 * - 书趣阁 (Shuquge) — PG
 * - 飘天文学 (Piaotian) — PG
 * - UU看书 (UUkankan) — PG
 * - 小说旗 (Novelqi) — PG
 * - 无错小说网 (Wucuo) — PG
 * - 落秋中文 (Luoqiu) — PG
 * - Novel Updates — PG
 * - Light Novel World — PG
 * - ReadNovelFull — PG
 *
 * Novel MPAA rating rules (Requirement 23.13):
 * - All mainstream novel sources default to PG rating
 * - Adult novel sources are NC-17 (handled separately)
 *
 * Validates: Requirements 23.1, 23.2, 23.3, 23.12, 23.13
 */

import type { ISourceAdapter } from '../../_lib/source-adapter';
import { GenericNovelAdapter } from './generic-novel-adapter';
import type { GenericNovelAdapterOptions } from './generic-novel-adapter';

// Re-export
export { GenericNovelAdapter } from './generic-novel-adapter';

/**
 * Novel source definitions.
 * Each entry creates a GenericNovelAdapter with source-specific config.
 */
const NOVEL_SOURCES: GenericNovelAdapterOptions[] = [
  {
    id: 'biquge',
    name: '笔趣阁',
    rating: 'PG',
    priority: 10,
    searchUrl: 'https://www.biquge.info/search.php',
    platform: 'biquge',
  },
  {
    id: '69shu',
    name: '69书吧',
    rating: 'PG',
    priority: 11,
    searchUrl: 'https://www.69shu.com/modules/article/search.php',
    platform: '69shu',
  },
  {
    id: 'quanben',
    name: '全本小说网',
    rating: 'PG',
    priority: 12,
    searchUrl: 'https://www.quanben.io/search',
    platform: 'quanben',
  },
  {
    id: 'dingdian',
    name: '顶点小说',
    rating: 'PG',
    priority: 13,
    searchUrl: 'https://www.dingdiann.net/searchbook/',
    platform: 'dingdian',
  },
  {
    id: 'bayi',
    name: '八一中文网',
    rating: 'PG',
    priority: 14,
    searchUrl: 'https://www.81zw.com/search.php',
    platform: 'bayi',
  },
  {
    id: 'shuquge',
    name: '书趣阁',
    rating: 'PG',
    priority: 15,
    searchUrl: 'https://www.shuquge.com/search.php',
    platform: 'shuquge',
  },
  {
    id: 'piaotian',
    name: '飘天文学',
    rating: 'PG',
    priority: 16,
    searchUrl: 'https://www.piaotia.com/modules/article/search.php',
    platform: 'piaotian',
  },
  {
    id: 'uukanshu',
    name: 'UU看书',
    rating: 'PG',
    priority: 17,
    searchUrl: 'https://www.uukanshu.com/search.aspx',
    platform: 'uukanshu',
  },
  {
    id: 'novelqi',
    name: '小说旗',
    rating: 'PG',
    priority: 18,
    searchUrl: 'https://www.xiaoshuoqi.com/search/',
    platform: 'novelqi',
  },
  {
    id: 'wucuo',
    name: '无错小说网',
    rating: 'PG',
    priority: 19,
    searchUrl: 'https://www.wucuoxs.com/search.php',
    platform: 'wucuo',
  },
  {
    id: 'luoqiu',
    name: '落秋中文',
    rating: 'PG',
    priority: 20,
    searchUrl: 'https://www.luoqiu.com/search/',
    platform: 'luoqiu',
  },
  {
    id: 'novelupdates',
    name: 'Novel Updates',
    rating: 'PG',
    priority: 25,
    searchUrl: 'https://www.novelupdates.com/series-finder/',
    platform: 'novelupdates',
  },
  {
    id: 'lightnovelworld',
    name: 'Light Novel World',
    rating: 'PG',
    priority: 26,
    searchUrl: 'https://www.lightnovelworld.com/search',
    platform: 'lightnovelworld',
  },
  {
    id: 'readnovelfull',
    name: 'ReadNovelFull',
    rating: 'PG',
    priority: 27,
    searchUrl: 'https://readnovelfull.com/search',
    platform: 'readnovelfull',
  },
];

/**
 * Create all novel source adapters.
 *
 * Returns an array of ISourceAdapter instances ready to be registered
 * with the AggregatorEngine.
 */
export function createAllNovelAdapters(): ISourceAdapter[] {
  const adapters: ISourceAdapter[] = [];

  for (const opts of NOVEL_SOURCES) {
    adapters.push(new GenericNovelAdapter(opts));
  }

  return adapters;
}

/**
 * Create a single novel adapter by source ID.
 *
 * Useful for detail endpoints that need to resolve a specific source.
 */
export function getNovelAdapterById(sourceId: string): ISourceAdapter | null {
  const opts = NOVEL_SOURCES.find((s) => s.id === sourceId);
  if (opts) return new GenericNovelAdapter(opts);
  return null;
}

/** Get all registered novel source IDs. */
export function getAllNovelSourceIds(): string[] {
  return NOVEL_SOURCES.map((s) => s.id);
}
