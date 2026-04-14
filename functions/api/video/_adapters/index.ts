/**
 * Video source adapter registry.
 *
 * Exports all video source adapters and a factory function to
 * instantiate the full set of adapters for the video aggregation engine.
 *
 * Adapter list:
 * - Bilibili (B站) — PG
 * - YouTube — PG (via Cloudflare Workers reverse proxy)
 * - AcFun (A站) — G
 * - 低端影视 — PG-13
 * - 茶杯狐 — PG-13
 * - 电影天堂 — PG-13
 * - Twitch VOD — PG-13
 * - Dailymotion — PG
 * - Vimeo — PG
 * - 抖音/TikTok — PG
 * - 快手 — PG
 * - 西瓜视频 — PG
 * - Niconico — PG
 * - Rumble — PG
 * - PeerTube — PG
 * - Odysee/LBRY — PG
 * - 搜狐视频 — PG
 * - 好看视频 — PG
 * - 韩剧TV — PG-13
 * - 人人视频 — PG-13
 *
 * Validates: Requirements 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 16.1, 16.2, 21.1
 */

import type { ISourceAdapter } from '../../_lib/source-adapter';
import { BilibiliAdapter } from './bilibili';
import { YouTubeAdapter } from './youtube';
import { AcFunAdapter } from './acfun';
import { GenericVideoAdapter } from './generic-video-adapter';
import type { GenericVideoAdapterOptions } from './generic-video-adapter';

// Re-export named adapters
export { BilibiliAdapter } from './bilibili';
export { YouTubeAdapter } from './youtube';
export { AcFunAdapter } from './acfun';
export { GenericVideoAdapter } from './generic-video-adapter';

/**
 * Free video source definitions.
 * Each entry creates a GenericVideoAdapter with source-specific config.
 */
const FREE_VIDEO_SOURCES: GenericVideoAdapterOptions[] = [
  {
    id: 'ddrk',
    name: '低端影视',
    rating: 'PG-13',
    priority: 25,
    searchUrl: 'https://ddrk.me/search/',
    platform: 'ddrk',
  },
  {
    id: 'cupfox',
    name: '茶杯狐',
    rating: 'PG-13',
    priority: 26,
    searchUrl: 'https://www.cupfox.app/search/',
    platform: 'cupfox',
  },
  {
    id: 'dytt',
    name: '电影天堂',
    rating: 'PG-13',
    priority: 27,
    searchUrl: 'https://www.dytt8.net/html/gndy/',
    platform: 'dytt',
  },
  {
    id: 'twitch-vod',
    name: 'Twitch VOD',
    rating: 'PG-13',
    priority: 30,
    searchUrl: 'https://api.twitch.tv/helix/videos',
    platform: 'twitch',
  },
  {
    id: 'dailymotion',
    name: 'Dailymotion',
    rating: 'PG',
    priority: 35,
    searchUrl: 'https://api.dailymotion.com/videos',
    platform: 'dailymotion',
  },
  {
    id: 'vimeo',
    name: 'Vimeo',
    rating: 'PG',
    priority: 36,
    searchUrl: 'https://api.vimeo.com/videos',
    platform: 'vimeo',
  },
  {
    id: 'douyin',
    name: '抖音/TikTok',
    rating: 'PG',
    priority: 40,
    searchUrl: 'https://www.douyin.com/search/',
    platform: 'douyin',
  },
  {
    id: 'kuaishou',
    name: '快手',
    rating: 'PG',
    priority: 41,
    searchUrl: 'https://www.kuaishou.com/search/',
    platform: 'kuaishou',
  },
  {
    id: 'xigua',
    name: '西瓜视频',
    rating: 'PG',
    priority: 42,
    searchUrl: 'https://www.ixigua.com/search/',
    platform: 'xigua',
  },
  {
    id: 'niconico',
    name: 'Niconico',
    rating: 'PG',
    priority: 45,
    searchUrl: 'https://api.search.nicovideo.jp/api/v2/snapshot/video/contents/search',
    platform: 'niconico',
  },
  {
    id: 'rumble',
    name: 'Rumble',
    rating: 'PG',
    priority: 50,
    searchUrl: 'https://rumble.com/search/video',
    platform: 'rumble',
  },
  {
    id: 'peertube',
    name: 'PeerTube',
    rating: 'PG',
    priority: 55,
    searchUrl: 'https://search.joinpeertube.org/api/v1/search/videos',
    platform: 'peertube',
  },
  {
    id: 'odysee',
    name: 'Odysee/LBRY',
    rating: 'PG',
    priority: 56,
    searchUrl: 'https://odysee.com/$/search',
    platform: 'odysee',
  },
  {
    id: 'sohu',
    name: '搜狐视频',
    rating: 'PG',
    priority: 60,
    searchUrl: 'https://so.tv.sohu.com/mts',
    platform: 'sohu',
  },
  {
    id: 'haokan',
    name: '好看视频',
    rating: 'PG',
    priority: 61,
    searchUrl: 'https://haokan.baidu.com/web/search/page',
    platform: 'haokan',
  },
  {
    id: 'hanjutv',
    name: '韩剧TV',
    rating: 'PG-13',
    priority: 65,
    searchUrl: 'https://www.hanjutv.com/search/',
    platform: 'hanjutv',
  },
  {
    id: 'rrvideo',
    name: '人人视频',
    rating: 'PG-13',
    priority: 66,
    searchUrl: 'https://www.rrvideo.com/search/',
    platform: 'rrvideo',
  },
];

/**
 * Create all video source adapters.
 *
 * Returns an array of ISourceAdapter instances ready to be registered
 * with the AggregatorEngine.
 */
export function createAllVideoAdapters(): ISourceAdapter[] {
  const adapters: ISourceAdapter[] = [
    new BilibiliAdapter(),
    new YouTubeAdapter(),
    new AcFunAdapter(),
  ];

  for (const opts of FREE_VIDEO_SOURCES) {
    adapters.push(new GenericVideoAdapter(opts));
  }

  return adapters;
}

/**
 * Create a single video adapter by source ID.
 *
 * Useful for detail/stream endpoints that need to resolve a specific source.
 */
export function getVideoAdapterById(sourceId: string): ISourceAdapter | null {
  switch (sourceId) {
    case 'bilibili':
      return new BilibiliAdapter();
    case 'youtube':
      return new YouTubeAdapter();
    case 'acfun':
      return new AcFunAdapter();
    default: {
      const opts = FREE_VIDEO_SOURCES.find((s) => s.id === sourceId);
      if (opts) return new GenericVideoAdapter(opts);
      return null;
    }
  }
}

/** Get all registered video source IDs. */
export function getAllVideoSourceIds(): string[] {
  return [
    'bilibili',
    'youtube',
    'acfun',
    ...FREE_VIDEO_SOURCES.map((s) => s.id),
  ];
}
