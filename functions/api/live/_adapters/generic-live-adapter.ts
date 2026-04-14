/**
 * Generic live source adapter factory.
 *
 * Creates stub adapters for live streaming sources that share the same
 * ISourceAdapter interface. Each adapter defines its own config
 * (name, rating, priority, searchUrl) but shares the same stub
 * search/detail/stream logic.
 *
 * Actual third-party API integration will be refined per-adapter later.
 * All requests go through Cloudflare Workers proxy to hide NAS IP.
 *
 * Live MPAA rating (Requirement 25.8):
 *   All live sources default to PG-13.
 *
 * Validates: Requirements 25.1, 25.2, 25.3, 25.4, 25.5, 25.8, 25.9
 */

import { BaseSourceAdapter } from '../../_lib/source-adapter';
import type { AggregatedItem, SourceConfig } from '../../_lib/source-adapter';
import type { SourceHealth } from '../../../../src/lib/types';

export interface GenericLiveAdapterOptions {
  id: string;
  name: string;
  rating: 'G' | 'PG' | 'PG-13' | 'R' | 'NC-17';
  priority: number;
  searchUrl: string;
  /** Platform identifier used in metadata */
  platform: string;
}

export function createGenericLiveConfig(
  opts: GenericLiveAdapterOptions,
  overrides?: Partial<SourceConfig>,
): SourceConfig {
  return {
    id: opts.id,
    name: opts.name,
    type: 'live',
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

export class GenericLiveAdapter extends BaseSourceAdapter {
  private platform: string;

  constructor(opts: GenericLiveAdapterOptions, configOverrides?: Partial<SourceConfig>) {
    super(createGenericLiveConfig(opts, configOverrides));
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
        url: `/api/live/stream/${this.config.id}-${query}-${i}`,
        metadata: {
          platform: this.platform,
          streamerName: `${this.config.name} Streamer`,
          viewerCount: Math.floor(Math.random() * 50000),
          category: 'gaming',
          isLive: true,
          tags: ['gaming', 'entertainment'],
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
      url: `/api/live/stream/${itemId}`,
      metadata: {
        platform: this.platform,
        streamerName: `${this.config.name} Streamer`,
        viewerCount: Math.floor(Math.random() * 50000),
        category: 'gaming',
        isLive: true,
        description: `${this.config.name} live stream (stub)`,
        tags: ['gaming', 'entertainment'],
      },
    });
  }

  async getStreamUrl(itemId: string): Promise<string> {
    // In production: Cloudflare Workers proxy URL for live stream
    return `https://cf-proxy.workers.dev/live/${this.config.id}/${itemId}`;
  }

  async healthCheck(): Promise<SourceHealth> {
    return 'online';
  }
}
