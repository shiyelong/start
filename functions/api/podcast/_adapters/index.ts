/**
 * Podcast source adapter registry.
 *
 * Exports all podcast source adapters and factory functions to
 * instantiate the full set of adapters for the podcast aggregation engine.
 *
 * All adapters are GenericPodcastAdapter instances (stub implementations).
 * Actual third-party API integration will be refined per-adapter later.
 * All requests go through Cloudflare Workers proxy to hide NAS IP.
 *
 * Adapter list (11 sources):
 * - Apple Podcasts — PG
 * - Spotify Podcasts — PG
 * - 小宇宙 (Xiaoyuzhou) — PG
 * - 喜马拉雅 (Ximalaya) — PG
 * - 蜻蜓FM (QingTing FM) — PG
 * - 荔枝FM (Lizhi FM) — PG
 * - Google Podcasts — PG
 * - Pocket Casts — PG
 * - Overcast — PG
 * - Castbox — PG
 * - Podcast Addict — PG
 *
 * Podcast MPAA rating rules (Requirement 24.9):
 * - All podcast sources default to PG rating
 *
 * Validates: Requirements 24.1, 24.2, 24.3, 24.5, 24.9
 */

import type { ISourceAdapter } from '../../_lib/source-adapter';
import { GenericPodcastAdapter } from './generic-podcast-adapter';
import type { GenericPodcastAdapterOptions } from './generic-podcast-adapter';

// Re-export
export { GenericPodcastAdapter } from './generic-podcast-adapter';

/**
 * Podcast source definitions.
 * Each entry creates a GenericPodcastAdapter with source-specific config.
 * All podcast sources default to PG per Requirement 24.9.
 */
const PODCAST_SOURCES: GenericPodcastAdapterOptions[] = [
  {
    id: 'apple-podcasts',
    name: 'Apple Podcasts',
    rating: 'PG',
    priority: 10,
    searchUrl: 'https://itunes.apple.com/search',
    platform: 'apple-podcasts',
  },
  {
    id: 'spotify-podcasts',
    name: 'Spotify Podcasts',
    rating: 'PG',
    priority: 11,
    searchUrl: 'https://api.spotify.com/v1/search',
    platform: 'spotify-podcasts',
  },
  {
    id: 'xiaoyuzhou',
    name: '小宇宙',
    rating: 'PG',
    priority: 12,
    searchUrl: 'https://www.xiaoyuzhoufm.com/api/search',
    platform: 'xiaoyuzhou',
  },
  {
    id: 'ximalaya',
    name: '喜马拉雅',
    rating: 'PG',
    priority: 15,
    searchUrl: 'https://www.ximalaya.com/revision/search',
    platform: 'ximalaya',
  },
  {
    id: 'qingting',
    name: '蜻蜓FM',
    rating: 'PG',
    priority: 16,
    searchUrl: 'https://search.qingting.fm/v3/search',
    platform: 'qingting',
  },
  {
    id: 'lizhi',
    name: '荔枝FM',
    rating: 'PG',
    priority: 20,
    searchUrl: 'https://www.lizhi.fm/api/search',
    platform: 'lizhi',
  },
  {
    id: 'google-podcasts',
    name: 'Google Podcasts',
    rating: 'PG',
    priority: 21,
    searchUrl: 'https://podcasts.google.com/search',
    platform: 'google-podcasts',
  },
  {
    id: 'pocket-casts',
    name: 'Pocket Casts',
    rating: 'PG',
    priority: 25,
    searchUrl: 'https://api.pocketcasts.com/discover/search',
    platform: 'pocket-casts',
  },
  {
    id: 'overcast',
    name: 'Overcast',
    rating: 'PG',
    priority: 26,
    searchUrl: 'https://overcast.fm/search',
    platform: 'overcast',
  },
  {
    id: 'castbox',
    name: 'Castbox',
    rating: 'PG',
    priority: 30,
    searchUrl: 'https://castbox.fm/search',
    platform: 'castbox',
  },
  {
    id: 'podcast-addict',
    name: 'Podcast Addict',
    rating: 'PG',
    priority: 31,
    searchUrl: 'https://podcastaddict.com/search',
    platform: 'podcast-addict',
  },
];

/**
 * Create all podcast source adapters.
 *
 * Returns an array of ISourceAdapter instances ready to be registered
 * with the AggregatorEngine.
 */
export function createAllPodcastAdapters(): ISourceAdapter[] {
  const adapters: ISourceAdapter[] = [];

  for (const opts of PODCAST_SOURCES) {
    adapters.push(new GenericPodcastAdapter(opts));
  }

  return adapters;
}

/**
 * Create a single podcast adapter by source ID.
 *
 * Useful for detail endpoints that need to resolve a specific source.
 */
export function getPodcastAdapterById(sourceId: string): ISourceAdapter | null {
  const opts = PODCAST_SOURCES.find((s) => s.id === sourceId);
  if (opts) return new GenericPodcastAdapter(opts);
  return null;
}

/** Get all registered podcast source IDs. */
export function getAllPodcastSourceIds(): string[] {
  return PODCAST_SOURCES.map((s) => s.id);
}
