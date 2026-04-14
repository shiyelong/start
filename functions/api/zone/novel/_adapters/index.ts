/**
 * Adult novel source adapter registry.
 *
 * Exports all adult novel source adapters and factory functions to
 * instantiate the full set of adapters for the adult novel aggregation engine.
 *
 * All 7 adapters use sanitized/generic source names (Source-A through Source-G).
 * Adapter IDs follow the pattern "adult-novel-src-1" through "adult-novel-src-7".
 * All sources are forced NC-17 rating — hardcoded, never overridable.
 * All traffic goes through Cloudflare Workers proxy.
 *
 * Validates: Requirements 30.1, 30.5, 30.7, 30.8, 30.9
 */

import type { ISourceAdapter } from '../../../_lib/source-adapter';
import { GenericAdultNovelAdapter } from './generic-adult-novel-adapter';
import type { GenericAdultNovelAdapterOptions } from './generic-adult-novel-adapter';

// Re-export for consumers
export { GenericAdultNovelAdapter } from './generic-adult-novel-adapter';

/**
 * Adult novel source definitions.
 * Each entry creates a GenericAdultNovelAdapter with source-specific config.
 * All sources are NC-17 rated — enforced by the adapter class.
 *
 * Source names are sanitized (Source-A through Source-G) to avoid
 * explicit site names in code. IDs use "adult-novel-src-N" pattern.
 */
const ADULT_NOVEL_SOURCES: GenericAdultNovelAdapterOptions[] = [
  {
    id: 'adult-novel-src-1',
    name: 'Source-A',
    priority: 10,
    searchUrl: 'https://cf-proxy.workers.dev/adult-novel/src-1/search',
    platform: 'adult-novel-src-1',
  },
  {
    id: 'adult-novel-src-2',
    name: 'Source-B',
    priority: 11,
    searchUrl: 'https://cf-proxy.workers.dev/adult-novel/src-2/search',
    platform: 'adult-novel-src-2',
  },
  {
    id: 'adult-novel-src-3',
    name: 'Source-C',
    priority: 12,
    searchUrl: 'https://cf-proxy.workers.dev/adult-novel/src-3/search',
    platform: 'adult-novel-src-3',
  },
  {
    id: 'adult-novel-src-4',
    name: 'Source-D',
    priority: 13,
    searchUrl: 'https://cf-proxy.workers.dev/adult-novel/src-4/search',
    platform: 'adult-novel-src-4',
  },
  {
    id: 'adult-novel-src-5',
    name: 'Source-E',
    priority: 14,
    searchUrl: 'https://cf-proxy.workers.dev/adult-novel/src-5/search',
    platform: 'adult-novel-src-5',
  },
  {
    id: 'adult-novel-src-6',
    name: 'Source-F',
    priority: 15,
    searchUrl: 'https://cf-proxy.workers.dev/adult-novel/src-6/search',
    platform: 'adult-novel-src-6',
  },
  {
    id: 'adult-novel-src-7',
    name: 'Source-G',
    priority: 16,
    searchUrl: 'https://cf-proxy.workers.dev/adult-novel/src-7/search',
    platform: 'adult-novel-src-7',
  },
];

/**
 * Create all adult novel source adapters.
 *
 * Returns an array of 7 ISourceAdapter instances, all NC-17 rated,
 * ready to be registered with the AggregatorEngine.
 */
export function createAllAdultNovelAdapters(): ISourceAdapter[] {
  return ADULT_NOVEL_SOURCES.map((opts) => new GenericAdultNovelAdapter(opts));
}

/**
 * Create a single adult novel adapter by source ID.
 *
 * Useful for detail/stream endpoints that need to resolve a specific source.
 */
export function getAdultNovelAdapterById(sourceId: string): ISourceAdapter | null {
  const opts = ADULT_NOVEL_SOURCES.find((s) => s.id === sourceId);
  if (opts) return new GenericAdultNovelAdapter(opts);
  return null;
}

/** Get all registered adult novel source IDs. */
export function getAllAdultNovelSourceIds(): string[] {
  return ADULT_NOVEL_SOURCES.map((s) => s.id);
}
