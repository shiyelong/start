/**
 * Adult video source adapter registry.
 *
 * Exports all adult video source adapters and factory functions to
 * instantiate the full set of adapters for the adult video aggregation engine.
 *
 * All 16 adapters use sanitized/generic source names (Source-A through Source-P).
 * Adapter IDs follow the pattern "adult-src-1" through "adult-src-16".
 * All sources are forced NC-17 rating — hardcoded, never overridable.
 * All traffic goes through Cloudflare Workers proxy.
 *
 * Validates: Requirements 17.1, 17.2, 17.3, 17.5, 17.7, 17.8, 17.9
 */

import type { ISourceAdapter } from '../../../_lib/source-adapter';
import { GenericAdultVideoAdapter } from './generic-adult-video-adapter';
import type { GenericAdultVideoAdapterOptions } from './generic-adult-video-adapter';

// Re-export for consumers
export { GenericAdultVideoAdapter } from './generic-adult-video-adapter';

/**
 * Adult video source definitions.
 * Each entry creates a GenericAdultVideoAdapter with source-specific config.
 * All sources are NC-17 rated — enforced by the adapter class.
 *
 * Source names are sanitized (Source-A through Source-P) to avoid
 * explicit site names in code. IDs use "adult-src-N" pattern.
 */
const ADULT_VIDEO_SOURCES: GenericAdultVideoAdapterOptions[] = [
  {
    id: 'adult-src-1',
    name: 'Source-A',
    priority: 10,
    searchUrl: 'https://cf-proxy.workers.dev/adult/src-1/search',
    platform: 'adult-src-1',
  },
  {
    id: 'adult-src-2',
    name: 'Source-B',
    priority: 11,
    searchUrl: 'https://cf-proxy.workers.dev/adult/src-2/search',
    platform: 'adult-src-2',
  },
  {
    id: 'adult-src-3',
    name: 'Source-C',
    priority: 12,
    searchUrl: 'https://cf-proxy.workers.dev/adult/src-3/search',
    platform: 'adult-src-3',
  },
  {
    id: 'adult-src-4',
    name: 'Source-D',
    priority: 13,
    searchUrl: 'https://cf-proxy.workers.dev/adult/src-4/search',
    platform: 'adult-src-4',
  },
  {
    id: 'adult-src-5',
    name: 'Source-E',
    priority: 14,
    searchUrl: 'https://cf-proxy.workers.dev/adult/src-5/search',
    platform: 'adult-src-5',
  },
  {
    id: 'adult-src-6',
    name: 'Source-F',
    priority: 15,
    searchUrl: 'https://cf-proxy.workers.dev/adult/src-6/search',
    platform: 'adult-src-6',
  },
  {
    id: 'adult-src-7',
    name: 'Source-G',
    priority: 16,
    searchUrl: 'https://cf-proxy.workers.dev/adult/src-7/search',
    platform: 'adult-src-7',
  },
  {
    id: 'adult-src-8',
    name: 'Source-H',
    priority: 17,
    searchUrl: 'https://cf-proxy.workers.dev/adult/src-8/search',
    platform: 'adult-src-8',
  },
  {
    id: 'adult-src-9',
    name: 'Source-I',
    priority: 18,
    searchUrl: 'https://cf-proxy.workers.dev/adult/src-9/search',
    platform: 'adult-src-9',
  },
  {
    id: 'adult-src-10',
    name: 'Source-J',
    priority: 19,
    searchUrl: 'https://cf-proxy.workers.dev/adult/src-10/search',
    platform: 'adult-src-10',
  },
  {
    id: 'adult-src-11',
    name: 'Source-K',
    priority: 20,
    searchUrl: 'https://cf-proxy.workers.dev/adult/src-11/search',
    platform: 'adult-src-11',
  },
  {
    id: 'adult-src-12',
    name: 'Source-L',
    priority: 21,
    searchUrl: 'https://cf-proxy.workers.dev/adult/src-12/search',
    platform: 'adult-src-12',
  },
  {
    id: 'adult-src-13',
    name: 'Source-M',
    priority: 22,
    searchUrl: 'https://cf-proxy.workers.dev/adult/src-13/search',
    platform: 'adult-src-13',
  },
  {
    id: 'adult-src-14',
    name: 'Source-N',
    priority: 23,
    searchUrl: 'https://cf-proxy.workers.dev/adult/src-14/search',
    platform: 'adult-src-14',
  },
  {
    id: 'adult-src-15',
    name: 'Source-O',
    priority: 24,
    searchUrl: 'https://cf-proxy.workers.dev/adult/src-15/search',
    platform: 'adult-src-15',
  },
  {
    id: 'adult-src-16',
    name: 'Source-P',
    priority: 25,
    searchUrl: 'https://cf-proxy.workers.dev/adult/src-16/search',
    platform: 'adult-src-16',
  },
];

/**
 * Create all adult video source adapters.
 *
 * Returns an array of 16 ISourceAdapter instances, all NC-17 rated,
 * ready to be registered with the AggregatorEngine.
 */
export function createAllAdultVideoAdapters(): ISourceAdapter[] {
  return ADULT_VIDEO_SOURCES.map((opts) => new GenericAdultVideoAdapter(opts));
}

/**
 * Create a single adult video adapter by source ID.
 *
 * Useful for detail/stream endpoints that need to resolve a specific source.
 */
export function getAdultVideoAdapterById(sourceId: string): ISourceAdapter | null {
  const opts = ADULT_VIDEO_SOURCES.find((s) => s.id === sourceId);
  if (opts) return new GenericAdultVideoAdapter(opts);
  return null;
}

/** Get all registered adult video source IDs. */
export function getAllAdultVideoSourceIds(): string[] {
  return ADULT_VIDEO_SOURCES.map((s) => s.id);
}
