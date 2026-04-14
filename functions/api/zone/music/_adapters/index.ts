/**
 * Adult music source adapter registry.
 *
 * Exports all adult music source adapters and factory functions to
 * instantiate the full set of adapters for the adult music aggregation engine.
 *
 * All 6 adapters use sanitized/generic source names (Source-A through Source-F).
 * Adapter IDs follow the pattern "adult-music-src-1" through "adult-music-src-6".
 * All sources are forced NC-17 rating — hardcoded, never overridable.
 * All traffic goes through Cloudflare Workers proxy.
 *
 * Validates: Requirements 17.1, 17.2, 17.3, 17.5, 17.9
 */

import type { ISourceAdapter } from '../../../_lib/source-adapter';
import { GenericAdultMusicAdapter } from './generic-adult-music-adapter';
import type { GenericAdultMusicAdapterOptions } from './generic-adult-music-adapter';

// Re-export for consumers
export { GenericAdultMusicAdapter } from './generic-adult-music-adapter';

/**
 * Adult music source definitions.
 * Each entry creates a GenericAdultMusicAdapter with source-specific config.
 * All sources are NC-17 rated — enforced by the adapter class.
 *
 * Source names are sanitized (Source-A through Source-F) to avoid
 * explicit site names in code. IDs use "adult-music-src-N" pattern.
 */
const ADULT_MUSIC_SOURCES: GenericAdultMusicAdapterOptions[] = [
  {
    id: 'adult-music-src-1',
    name: 'Source-A',
    priority: 10,
    searchUrl: 'https://cf-proxy.workers.dev/adult-music/src-1/search',
    platform: 'adult-music-src-1',
  },
  {
    id: 'adult-music-src-2',
    name: 'Source-B',
    priority: 11,
    searchUrl: 'https://cf-proxy.workers.dev/adult-music/src-2/search',
    platform: 'adult-music-src-2',
  },
  {
    id: 'adult-music-src-3',
    name: 'Source-C',
    priority: 12,
    searchUrl: 'https://cf-proxy.workers.dev/adult-music/src-3/search',
    platform: 'adult-music-src-3',
  },
  {
    id: 'adult-music-src-4',
    name: 'Source-D',
    priority: 13,
    searchUrl: 'https://cf-proxy.workers.dev/adult-music/src-4/search',
    platform: 'adult-music-src-4',
  },
  {
    id: 'adult-music-src-5',
    name: 'Source-E',
    priority: 14,
    searchUrl: 'https://cf-proxy.workers.dev/adult-music/src-5/search',
    platform: 'adult-music-src-5',
  },
  {
    id: 'adult-music-src-6',
    name: 'Source-F',
    priority: 15,
    searchUrl: 'https://cf-proxy.workers.dev/adult-music/src-6/search',
    platform: 'adult-music-src-6',
  },
];

/**
 * Create all adult music source adapters.
 *
 * Returns an array of 6 ISourceAdapter instances, all NC-17 rated,
 * ready to be registered with the AggregatorEngine.
 */
export function createAllAdultMusicAdapters(): ISourceAdapter[] {
  return ADULT_MUSIC_SOURCES.map((opts) => new GenericAdultMusicAdapter(opts));
}

/**
 * Create a single adult music adapter by source ID.
 *
 * Useful for detail/stream endpoints that need to resolve a specific source.
 */
export function getAdultMusicAdapterById(sourceId: string): ISourceAdapter | null {
  const opts = ADULT_MUSIC_SOURCES.find((s) => s.id === sourceId);
  if (opts) return new GenericAdultMusicAdapter(opts);
  return null;
}

/** Get all registered adult music source IDs. */
export function getAllAdultMusicSourceIds(): string[] {
  return ADULT_MUSIC_SOURCES.map((s) => s.id);
}
