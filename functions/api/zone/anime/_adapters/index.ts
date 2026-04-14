/**
 * Adult anime source adapter registry.
 *
 * Exports all adult anime (里番) source adapters and factory functions to
 * instantiate the full set of adapters for the adult anime aggregation engine.
 *
 * All 7 adapters use sanitized/generic source names (Source-A through Source-G).
 * Adapter IDs follow the pattern "adult-anime-src-1" through "adult-anime-src-7".
 * All sources are forced NC-17 rating — hardcoded, never overridable.
 * All traffic goes through Cloudflare Workers proxy.
 *
 * Validates: Requirements 48.1, 48.6, 48.8, 48.10, 48.11
 */

import type { ISourceAdapter } from '../../../_lib/source-adapter';
import { GenericAdultAnimeAdapter } from './generic-adult-anime-adapter';
import type { GenericAdultAnimeAdapterOptions } from './generic-adult-anime-adapter';

// Re-export for consumers
export { GenericAdultAnimeAdapter } from './generic-adult-anime-adapter';

/**
 * Adult anime source definitions.
 * Each entry creates a GenericAdultAnimeAdapter with source-specific config.
 * All sources are NC-17 rated — enforced by the adapter class.
 *
 * Source names are sanitized (Source-A through Source-G) to avoid
 * explicit site names in code. IDs use "adult-anime-src-N" pattern.
 */
const ADULT_ANIME_SOURCES: GenericAdultAnimeAdapterOptions[] = [
  {
    id: 'adult-anime-src-1',
    name: 'Source-A',
    priority: 10,
    searchUrl: 'https://cf-proxy.workers.dev/adult-anime/src-1/search',
    platform: 'adult-anime-src-1',
  },
  {
    id: 'adult-anime-src-2',
    name: 'Source-B',
    priority: 11,
    searchUrl: 'https://cf-proxy.workers.dev/adult-anime/src-2/search',
    platform: 'adult-anime-src-2',
  },
  {
    id: 'adult-anime-src-3',
    name: 'Source-C',
    priority: 12,
    searchUrl: 'https://cf-proxy.workers.dev/adult-anime/src-3/search',
    platform: 'adult-anime-src-3',
  },
  {
    id: 'adult-anime-src-4',
    name: 'Source-D',
    priority: 13,
    searchUrl: 'https://cf-proxy.workers.dev/adult-anime/src-4/search',
    platform: 'adult-anime-src-4',
  },
  {
    id: 'adult-anime-src-5',
    name: 'Source-E',
    priority: 14,
    searchUrl: 'https://cf-proxy.workers.dev/adult-anime/src-5/search',
    platform: 'adult-anime-src-5',
  },
  {
    id: 'adult-anime-src-6',
    name: 'Source-F',
    priority: 15,
    searchUrl: 'https://cf-proxy.workers.dev/adult-anime/src-6/search',
    platform: 'adult-anime-src-6',
  },
  {
    id: 'adult-anime-src-7',
    name: 'Source-G',
    priority: 16,
    searchUrl: 'https://cf-proxy.workers.dev/adult-anime/src-7/search',
    platform: 'adult-anime-src-7',
  },
];

/**
 * Create all adult anime source adapters.
 *
 * Returns an array of 7 ISourceAdapter instances, all NC-17 rated,
 * ready to be registered with the AggregatorEngine.
 */
export function createAllAdultAnimeAdapters(): ISourceAdapter[] {
  return ADULT_ANIME_SOURCES.map((opts) => new GenericAdultAnimeAdapter(opts));
}

/**
 * Create a single adult anime adapter by source ID.
 *
 * Useful for detail/stream endpoints that need to resolve a specific source.
 */
export function getAdultAnimeAdapterById(sourceId: string): ISourceAdapter | null {
  const opts = ADULT_ANIME_SOURCES.find((s) => s.id === sourceId);
  if (opts) return new GenericAdultAnimeAdapter(opts);
  return null;
}

/** Get all registered adult anime source IDs. */
export function getAllAdultAnimeSourceIds(): string[] {
  return ADULT_ANIME_SOURCES.map((s) => s.id);
}
