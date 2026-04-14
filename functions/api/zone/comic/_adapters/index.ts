/**
 * Adult comic source adapter registry.
 *
 * Exports all adult comic source adapters and factory functions to
 * instantiate the full set of adapters for the adult comic aggregation engine.
 *
 * All 11 adapters use sanitized/generic source names (Source-A through Source-K).
 * Adapter IDs follow the pattern "adult-comic-src-1" through "adult-comic-src-11".
 * All sources are forced NC-17 rating — hardcoded, never overridable.
 * All traffic goes through Cloudflare Workers proxy.
 *
 * Validates: Requirements 19.1, 19.5, 19.7, 19.8, 19.9
 */

import type { ISourceAdapter } from '../../../_lib/source-adapter';
import { GenericAdultComicAdapter } from './generic-adult-comic-adapter';
import type { GenericAdultComicAdapterOptions } from './generic-adult-comic-adapter';

// Re-export for consumers
export { GenericAdultComicAdapter } from './generic-adult-comic-adapter';

/**
 * Adult comic source definitions.
 * Each entry creates a GenericAdultComicAdapter with source-specific config.
 * All sources are NC-17 rated — enforced by the adapter class.
 *
 * Source names are sanitized (Source-A through Source-K) to avoid
 * explicit site names in code. IDs use "adult-comic-src-N" pattern.
 */
const ADULT_COMIC_SOURCES: GenericAdultComicAdapterOptions[] = [
  {
    id: 'adult-comic-src-1',
    name: 'Source-A',
    priority: 10,
    searchUrl: 'https://cf-proxy.workers.dev/adult-comic/src-1/search',
    platform: 'adult-comic-src-1',
  },
  {
    id: 'adult-comic-src-2',
    name: 'Source-B',
    priority: 11,
    searchUrl: 'https://cf-proxy.workers.dev/adult-comic/src-2/search',
    platform: 'adult-comic-src-2',
  },
  {
    id: 'adult-comic-src-3',
    name: 'Source-C',
    priority: 12,
    searchUrl: 'https://cf-proxy.workers.dev/adult-comic/src-3/search',
    platform: 'adult-comic-src-3',
  },
  {
    id: 'adult-comic-src-4',
    name: 'Source-D',
    priority: 13,
    searchUrl: 'https://cf-proxy.workers.dev/adult-comic/src-4/search',
    platform: 'adult-comic-src-4',
  },
  {
    id: 'adult-comic-src-5',
    name: 'Source-E',
    priority: 14,
    searchUrl: 'https://cf-proxy.workers.dev/adult-comic/src-5/search',
    platform: 'adult-comic-src-5',
  },
  {
    id: 'adult-comic-src-6',
    name: 'Source-F',
    priority: 15,
    searchUrl: 'https://cf-proxy.workers.dev/adult-comic/src-6/search',
    platform: 'adult-comic-src-6',
  },
  {
    id: 'adult-comic-src-7',
    name: 'Source-G',
    priority: 16,
    searchUrl: 'https://cf-proxy.workers.dev/adult-comic/src-7/search',
    platform: 'adult-comic-src-7',
  },
  {
    id: 'adult-comic-src-8',
    name: 'Source-H',
    priority: 17,
    searchUrl: 'https://cf-proxy.workers.dev/adult-comic/src-8/search',
    platform: 'adult-comic-src-8',
  },
  {
    id: 'adult-comic-src-9',
    name: 'Source-I',
    priority: 18,
    searchUrl: 'https://cf-proxy.workers.dev/adult-comic/src-9/search',
    platform: 'adult-comic-src-9',
  },
  {
    id: 'adult-comic-src-10',
    name: 'Source-J',
    priority: 19,
    searchUrl: 'https://cf-proxy.workers.dev/adult-comic/src-10/search',
    platform: 'adult-comic-src-10',
  },
  {
    id: 'adult-comic-src-11',
    name: 'Source-K',
    priority: 20,
    searchUrl: 'https://cf-proxy.workers.dev/adult-comic/src-11/search',
    platform: 'adult-comic-src-11',
  },
];

/**
 * Create all adult comic source adapters.
 *
 * Returns an array of 11 ISourceAdapter instances, all NC-17 rated,
 * ready to be registered with the AggregatorEngine.
 */
export function createAllAdultComicAdapters(): ISourceAdapter[] {
  return ADULT_COMIC_SOURCES.map((opts) => new GenericAdultComicAdapter(opts));
}

/**
 * Create a single adult comic adapter by source ID.
 *
 * Useful for detail/stream endpoints that need to resolve a specific source.
 */
export function getAdultComicAdapterById(sourceId: string): ISourceAdapter | null {
  const opts = ADULT_COMIC_SOURCES.find((s) => s.id === sourceId);
  if (opts) return new GenericAdultComicAdapter(opts);
  return null;
}

/** Get all registered adult comic source IDs. */
export function getAllAdultComicSourceIds(): string[] {
  return ADULT_COMIC_SOURCES.map((s) => s.id);
}
