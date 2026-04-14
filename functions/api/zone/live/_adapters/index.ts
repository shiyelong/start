/**
 * Adult live streaming source adapter registry.
 *
 * Exports all adult live source adapters and factory functions to
 * instantiate the full set of adapters for the adult live aggregation engine.
 *
 * All 7 adapters use sanitized/generic source names (Source-A through Source-G).
 * Adapter IDs follow the pattern "adult-live-src-1" through "adult-live-src-7".
 * All sources are forced NC-17 rating — hardcoded, never overridable.
 * All traffic goes through Cloudflare Workers proxy.
 *
 * Validates: Requirements 17.1, 17.2, 17.3, 17.5, 17.9
 */

import type { ISourceAdapter } from '../../../_lib/source-adapter';
import { GenericAdultLiveAdapter } from './generic-adult-live-adapter';
import type { GenericAdultLiveAdapterOptions } from './generic-adult-live-adapter';

// Re-export for consumers
export { GenericAdultLiveAdapter } from './generic-adult-live-adapter';

/**
 * Adult live source definitions.
 * Each entry creates a GenericAdultLiveAdapter with source-specific config.
 * All sources are NC-17 rated — enforced by the adapter class.
 *
 * Source names are sanitized (Source-A through Source-G) to avoid
 * explicit site names in code. IDs use "adult-live-src-N" pattern.
 */
const ADULT_LIVE_SOURCES: GenericAdultLiveAdapterOptions[] = [
  {
    id: 'adult-live-src-1',
    name: 'Source-A',
    priority: 10,
    searchUrl: 'https://cf-proxy.workers.dev/adult-live/src-1/search',
    platform: 'adult-live-src-1',
  },
  {
    id: 'adult-live-src-2',
    name: 'Source-B',
    priority: 11,
    searchUrl: 'https://cf-proxy.workers.dev/adult-live/src-2/search',
    platform: 'adult-live-src-2',
  },
  {
    id: 'adult-live-src-3',
    name: 'Source-C',
    priority: 12,
    searchUrl: 'https://cf-proxy.workers.dev/adult-live/src-3/search',
    platform: 'adult-live-src-3',
  },
  {
    id: 'adult-live-src-4',
    name: 'Source-D',
    priority: 13,
    searchUrl: 'https://cf-proxy.workers.dev/adult-live/src-4/search',
    platform: 'adult-live-src-4',
  },
  {
    id: 'adult-live-src-5',
    name: 'Source-E',
    priority: 14,
    searchUrl: 'https://cf-proxy.workers.dev/adult-live/src-5/search',
    platform: 'adult-live-src-5',
  },
  {
    id: 'adult-live-src-6',
    name: 'Source-F',
    priority: 15,
    searchUrl: 'https://cf-proxy.workers.dev/adult-live/src-6/search',
    platform: 'adult-live-src-6',
  },
  {
    id: 'adult-live-src-7',
    name: 'Source-G',
    priority: 16,
    searchUrl: 'https://cf-proxy.workers.dev/adult-live/src-7/search',
    platform: 'adult-live-src-7',
  },
];

/**
 * Create all adult live source adapters.
 *
 * Returns an array of 7 ISourceAdapter instances, all NC-17 rated,
 * ready to be registered with the AggregatorEngine.
 */
export function createAllAdultLiveAdapters(): ISourceAdapter[] {
  return ADULT_LIVE_SOURCES.map((opts) => new GenericAdultLiveAdapter(opts));
}

/**
 * Create a single adult live adapter by source ID.
 *
 * Useful for detail/stream endpoints that need to resolve a specific source.
 */
export function getAdultLiveAdapterById(sourceId: string): ISourceAdapter | null {
  const opts = ADULT_LIVE_SOURCES.find((s) => s.id === sourceId);
  if (opts) return new GenericAdultLiveAdapter(opts);
  return null;
}

/** Get all registered adult live source IDs. */
export function getAllAdultLiveSourceIds(): string[] {
  return ADULT_LIVE_SOURCES.map((s) => s.id);
}
