/**
 * Generic podcast source adapter factory.
 *
 * Creates stub adapters for podcast sources that share the same
 * ISourceAdapter interface. Each adapter defines its own config
 * (name, rating, priority, searchUrl) but shares the same stub
 * search/detail/stream logic.
 *
 * Actual third-party API integration will be refined per-adapter later.
 * All requests go through Cloudflare Workers proxy to hide NAS IP.
 *
 * Podcast MPAA rating (Requirement 24.9):
 *   All podcast sources default to PG.
 *
 * Validates: Requirements 24.1, 24.2, 24.3, 24.5, 24.9
 */

import { BaseSourceAdapter } from '../../_lib/source-adapter';
import type { AggregatedItem, SourceConfig } from '../../_lib/source-adapter';
import type { SourceHealth } from '../../../../src/lib/types';

export interface GenericPodcastAdapterOptions {
  id: string;
  name: string;
  rating: 'G' | 'PG' | 'PG-13' | 'R' | 'NC-17';
  priority: number;
  searchUrl: string;
  /** Platform identifier used in metadata */
  platform: string;
}

export function createGenericPodcastConfig(
  opts: GenericPodcastAdapterOptions,
  overrides?: Partial<SourceConfig>,
): SourceConfig {
  return {
    id: opts.id,
    name: opts.name,
    type: 'podcast',
    enabled: true,
    rating: opts.rating,
    priority: opts.priority,
    searchUrl: opts.searchUrl,
    parseRules: JSON.stringify({ type: 'api', selector: '' }),
    timeout: 10000,
    health: 'online',
    avgResponseTime: 0,
    successRate: 100,
    failCount: 0,
    lastChecked: new Date().toISOString(),
    ...overrides,
  };
}

export class GenericPodcastAdapter extends BaseSourceAdapter {
  private platform: string;

  constructor(opts: GenericPodcastAdapterOptions, configOverrides?: Partial<SourceConfig>) {
    super(createGenericPodcastConfig(opts, configOverrides));
    this.platform = opts.platform;
  }

  async search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]> {
    // Stub implementation — will be replaced with real API/scraping logic
    // All actual requests will go through Cloudflare Workers proxy
    const items: AggregatedItem[] = [];
    const count = Math.min(pageSize, 8);

    for (let i = 0; i < count; i++) {
      items.push(this.buildItem({
        id: `${this.config.id}-${query}-${(page - 1) * pageSize + i}`,
        title: `[${this.config.name}] ${query} - ${(page - 1) * pageSize + i + 1}`,
        cover: '',
        url: `/api/podcast/${this.config.id}-${query}-${i}`,
        metadata: {
          platform: this.platform,
          host: `${this.config.name} Host`,
          description: `${this.config.name} podcast (stub)`,
          category: 'technology',
          episodeCount: Math.floor(Math.random() * 200) + 10,
          subscribers: Math.floor(Math.random() * 100000),
          tags: ['technology', 'education'],
        },
      }));
    }

    return items;
  }

  async getDetail(itemId: string): Promise<AggregatedItem | null> {
    return this.buildItem({
      id: itemId,
      title: `[${this.config.name}] ${itemId}`,
      cover: '',
      url: `/api/podcast/${itemId}`,
      metadata: {
        platform: this.platform,
        host: `${this.config.name} Host`,
        description: `${this.config.name} podcast detail (stub)`,
        category: 'technology',
        episodeCount: 50,
        subscribers: 10000,
        tags: ['technology', 'education'],
        episodes: [
          { id: '1', title: '第1期', url: `/api/podcast/${itemId}/ep/1`, duration: 1800 },
          { id: '2', title: '第2期', url: `/api/podcast/${itemId}/ep/2`, duration: 2400 },
          { id: '3', title: '第3期', url: `/api/podcast/${itemId}/ep/3`, duration: 3600 },
        ],
      },
    });
  }

  async getStreamUrl(itemId: string): Promise<string> {
    // In production: Cloudflare Workers proxy URL for podcast audio stream
    return `https://cf-proxy.workers.dev/podcast/${this.config.id}/${itemId}`;
  }

  async healthCheck(): Promise<SourceHealth> {
    return 'online';
  }
}
