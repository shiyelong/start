/**
 * Music source adapter registry.
 *
 * Exports all music source adapters and factory functions to
 * instantiate the full set of adapters for the music aggregation engine.
 *
 * Named adapters (custom search/stream logic):
 * - 网易云音乐 (NetEase Cloud Music) — PG
 * - QQ音乐 (QQ Music) — PG
 *
 * Generic adapters (shared stub logic via GenericMusicAdapter):
 * - 酷狗音乐 (Kugou) — PG
 * - 酷我音乐 (Kuwo) — PG
 * - 咪咕音乐 (Migu) — PG
 * - Spotify — PG
 * - SoundCloud — PG
 * - Bandcamp — PG
 * - Jamendo — G (Creative Commons music)
 * - Free Music Archive — G (free/CC music)
 * - YouTube Music (audio extraction) — PG
 *
 * Music MPAA rating rules (Requirement 8.15):
 * - Instrumental / children's songs: G
 * - Pop / rock / folk: PG
 * - Mild profanity or suggestive lyrics: PG-13
 * - Explicit lyrics (Explicit tag): R
 * - Adult ASMR / voice works / adult radio drama: NC-17
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.11, 8.13, 8.14, 8.15
 */

import type { ISourceAdapter } from '../../_lib/source-adapter';
import { NeteaseAdapter } from './netease';
import { QQMusicAdapter } from './qqmusic';
import { GenericMusicAdapter } from './generic-music-adapter';
import type { GenericMusicAdapterOptions } from './generic-music-adapter';

// Re-export named adapters
export { NeteaseAdapter } from './netease';
export { QQMusicAdapter } from './qqmusic';
export { GenericMusicAdapter } from './generic-music-adapter';

/**
 * Music source definitions for GenericMusicAdapter.
 * Each entry creates a GenericMusicAdapter with source-specific config.
 */
const GENERIC_MUSIC_SOURCES: GenericMusicAdapterOptions[] = [
  {
    id: 'kugou',
    name: '酷狗音乐',
    rating: 'PG',
    priority: 15,
    searchUrl: 'https://complexsearch.kugou.com/v2/search/song',
    platform: 'kugou',
  },
  {
    id: 'kuwo',
    name: '酷我音乐',
    rating: 'PG',
    priority: 16,
    searchUrl: 'https://www.kuwo.cn/api/www/search/searchMusicBykeyWord',
    platform: 'kuwo',
  },
  {
    id: 'migu',
    name: '咪咕音乐',
    rating: 'PG',
    priority: 20,
    searchUrl: 'https://m.music.migu.cn/migu/remoting/scr_search_tag',
    platform: 'migu',
  },
  {
    id: 'spotify',
    name: 'Spotify',
    rating: 'PG',
    priority: 25,
    searchUrl: 'https://api.spotify.com/v1/search',
    platform: 'spotify',
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    rating: 'PG',
    priority: 30,
    searchUrl: 'https://api-v2.soundcloud.com/search/tracks',
    platform: 'soundcloud',
  },
  {
    id: 'bandcamp',
    name: 'Bandcamp',
    rating: 'PG',
    priority: 35,
    searchUrl: 'https://bandcamp.com/api/fuzzysearch/1/autocomplete',
    platform: 'bandcamp',
  },
  {
    id: 'jamendo',
    name: 'Jamendo',
    rating: 'G',
    priority: 40,
    searchUrl: 'https://api.jamendo.com/v3.0/tracks',
    platform: 'jamendo',
  },
  {
    id: 'fma',
    name: 'Free Music Archive',
    rating: 'G',
    priority: 41,
    searchUrl: 'https://freemusicarchive.org/api/get/tracks.json',
    platform: 'fma',
  },
  {
    id: 'ytmusic',
    name: 'YouTube Music',
    rating: 'PG',
    priority: 45,
    searchUrl: 'https://music.youtube.com/youtubei/v1/search',
    platform: 'ytmusic',
  },
];

/**
 * Create all music source adapters.
 *
 * Returns an array of ISourceAdapter instances ready to be registered
 * with the AggregatorEngine.
 */
export function createAllMusicAdapters(): ISourceAdapter[] {
  const adapters: ISourceAdapter[] = [
    new NeteaseAdapter(),
    new QQMusicAdapter(),
  ];

  for (const opts of GENERIC_MUSIC_SOURCES) {
    adapters.push(new GenericMusicAdapter(opts));
  }

  return adapters;
}

/**
 * Create a single music adapter by source ID.
 *
 * Useful for detail/stream endpoints that need to resolve a specific source.
 */
export function getMusicAdapterById(sourceId: string): ISourceAdapter | null {
  switch (sourceId) {
    case 'netease':
      return new NeteaseAdapter();
    case 'qqmusic':
      return new QQMusicAdapter();
    default: {
      const opts = GENERIC_MUSIC_SOURCES.find((s) => s.id === sourceId);
      if (opts) return new GenericMusicAdapter(opts);
      return null;
    }
  }
}

/** Get all registered music source IDs. */
export function getAllMusicSourceIds(): string[] {
  return [
    'netease',
    'qqmusic',
    ...GENERIC_MUSIC_SOURCES.map((s) => s.id),
  ];
}
