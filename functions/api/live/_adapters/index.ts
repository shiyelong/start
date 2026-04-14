/**
 * Live source adapter registry.
 *
 * Exports all live source adapters and factory functions to
 * instantiate the full set of adapters for the live aggregation engine.
 *
 * All adapters are GenericLiveAdapter instances (stub implementations).
 * Actual third-party API integration will be refined per-adapter later.
 * All requests go through Cloudflare Workers proxy to hide NAS IP.
 *
 * Adapter list (14 sources):
 * - 斗鱼 (Douyu) — PG-13
 * - 虎牙 (Huya) — PG-13
 * - B站直播 (Bilibili Live) — PG-13
 * - Twitch — PG-13
 * - YouTube Live — PG-13
 * - 抖音直播 (Douyin Live) — PG-13
 * - 快手直播 (Kuaishou Live) — PG-13
 * - 花椒直播 (Huajiao) — PG-13
 * - 映客直播 (Inke) — PG-13
 * - 企鹅电竞 (Egame) — PG-13
 * - CC直播 (CC Live) — PG-13
 * - AfreecaTV — PG-13
 * - Kick — PG-13
 * - Facebook Gaming — PG-13
 *
 * Live MPAA rating rules (Requirement 25.8):
 * - All live sources default to PG-13 rating
 *
 * Validates: Requirements 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.8, 25.9
 */

import type { ISourceAdapter } from '../../_lib/source-adapter';
import { GenericLiveAdapter } from './generic-live-adapter';
import type { GenericLiveAdapterOptions } from './generic-live-adapter';

// Re-export
export { GenericLiveAdapter } from './generic-live-adapter';

/**
 * Live source definitions.
 * Each entry creates a GenericLiveAdapter with source-specific config.
 * All live sources default to PG-13 per Requirement 25.8.
 */
const LIVE_SOURCES: GenericLiveAdapterOptions[] = [
  {
    id: 'douyu',
    name: '斗鱼',
    rating: 'PG-13',
    priority: 10,
    searchUrl: 'https://www.douyu.com/gapi/rkc/directory/mixList/2_1',
    platform: 'douyu',
  },
  {
    id: 'huya',
    name: '虎牙',
    rating: 'PG-13',
    priority: 11,
    searchUrl: 'https://www.huya.com/cache.php',
    platform: 'huya',
  },
  {
    id: 'bilibili-live',
    name: 'B站直播',
    rating: 'PG-13',
    priority: 12,
    searchUrl: 'https://api.live.bilibili.com/xlive/web-interface/v1/second/getList',
    platform: 'bilibili-live',
  },
  {
    id: 'twitch',
    name: 'Twitch',
    rating: 'PG-13',
    priority: 15,
    searchUrl: 'https://api.twitch.tv/helix/streams',
    platform: 'twitch',
  },
  {
    id: 'youtube-live',
    name: 'YouTube Live',
    rating: 'PG-13',
    priority: 16,
    searchUrl: 'https://www.googleapis.com/youtube/v3/search',
    platform: 'youtube-live',
  },
  {
    id: 'douyin-live',
    name: '抖音直播',
    rating: 'PG-13',
    priority: 20,
    searchUrl: 'https://live.douyin.com/webcast/web/partition/detail/room/',
    platform: 'douyin-live',
  },
  {
    id: 'kuaishou-live',
    name: '快手直播',
    rating: 'PG-13',
    priority: 21,
    searchUrl: 'https://live.kuaishou.com/live_api/liveroom/liveList',
    platform: 'kuaishou-live',
  },
  {
    id: 'huajiao',
    name: '花椒直播',
    rating: 'PG-13',
    priority: 25,
    searchUrl: 'https://www.huajiao.com/api/live/index',
    platform: 'huajiao',
  },
  {
    id: 'inke',
    name: '映客直播',
    rating: 'PG-13',
    priority: 26,
    searchUrl: 'https://webapi.busi.inke.cn/web/live_hotlist_pc',
    platform: 'inke',
  },
  {
    id: 'egame',
    name: '企鹅电竞',
    rating: 'PG-13',
    priority: 30,
    searchUrl: 'https://share.egame.qq.com/cgi-bin/pgg_async_fcgi',
    platform: 'egame',
  },
  {
    id: 'cc-live',
    name: 'CC直播',
    rating: 'PG-13',
    priority: 31,
    searchUrl: 'https://cc.163.com/api/category/',
    platform: 'cc-live',
  },
  {
    id: 'afreecatv',
    name: 'AfreecaTV',
    rating: 'PG-13',
    priority: 35,
    searchUrl: 'https://live.afreecatv.com/afreeca/player_live_api.php',
    platform: 'afreecatv',
  },
  {
    id: 'kick',
    name: 'Kick',
    rating: 'PG-13',
    priority: 36,
    searchUrl: 'https://kick.com/api/v2/channels',
    platform: 'kick',
  },
  {
    id: 'facebook-gaming',
    name: 'Facebook Gaming',
    rating: 'PG-13',
    priority: 40,
    searchUrl: 'https://www.facebook.com/gaming/browse',
    platform: 'facebook-gaming',
  },
];

/**
 * Create all live source adapters.
 *
 * Returns an array of ISourceAdapter instances ready to be registered
 * with the AggregatorEngine.
 */
export function createAllLiveAdapters(): ISourceAdapter[] {
  const adapters: ISourceAdapter[] = [];

  for (const opts of LIVE_SOURCES) {
    adapters.push(new GenericLiveAdapter(opts));
  }

  return adapters;
}

/**
 * Create a single live adapter by source ID.
 *
 * Useful for detail endpoints that need to resolve a specific source.
 */
export function getLiveAdapterById(sourceId: string): ISourceAdapter | null {
  const opts = LIVE_SOURCES.find((s) => s.id === sourceId);
  if (opts) return new GenericLiveAdapter(opts);
  return null;
}

/** Get all registered live source IDs. */
export function getAllLiveSourceIds(): string[] {
  return LIVE_SOURCES.map((s) => s.id);
}
