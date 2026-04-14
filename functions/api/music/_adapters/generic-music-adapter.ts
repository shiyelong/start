/**
 * Generic music source adapter factory.
 *
 * Creates stub adapters for music sources that share the same
 * ISourceAdapter interface. Each adapter defines its own config
 * (name, rating, priority, searchUrl) but shares the same stub
 * search/detail/stream logic.
 *
 * Actual third-party API integration will be refined per-adapter later.
 * All requests go through Cloudflare Workers proxy to hide NAS IP.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.13, 8.14
 */

import { BaseSourceAdapter } from '../../_lib/source-adapter';
import type { AggregatedItem, SourceConfig } from '../../_lib/source-adapter';
import type { SourceHealth } from '../../../../src/lib/types';

export interface GenericMusicAdapterOptions {
  id: string;
  name: string;
  rating: 'G' | 'PG' | 'PG-13' | 'R' | 'NC-17';
  priority: number;
  searchUrl: string;
  /** Platform identifier used in metadata */
  platform: string;
}

export function createGenericMusicConfig(
  opts: GenericMusicAdapterOptions,
  overrides?: Partial<SourceConfig>,
): SourceConfig {
  return {
    id: opts.id,
    name: opts.name,
    type: 'music',
    enabled: true,
    rating: opts.rating,
    priority: opts.priority,
    searchUrl: opts.searchUrl,
    parseRules: JSON.stringify({ type: 'json', selector: '' }),
    timeout: 8000,
    health: 'online',
    avgResponseTime: 0,
    successRate: 100,
    failCount: 0,
    lastChecked: new Date().toISOString(),
    ...overrides,
  };
}

export class GenericMusicAdapter extends BaseSourceAdapter {
  private platform: string;

  constructor(opts: GenericMusicAdapterOptions, configOverrides?: Partial<SourceConfig>) {
    super(createGenericMusicConfig(opts, configOverrides));
    this.platform = opts.platform;
  }

  async search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]> {
    // Stub implementation — will be replaced with real API/scraping logic
    // All actual requests will go through Cloudflare Workers proxy
    const items: AggregatedItem[] = [];
    const count = Math.min(pageSize, 10);

    for (let i = 0; i < count; i++) {
      items.push(this.buildItem({
        id: `${this.config.id}-${query}-${(page - 1) * pageSize + i}`,
        title: `[${this.config.name}] ${query} - ${(page - 1) * pageSize + i + 1}`,
        cover: '',
        url: `/api/music/stream/${this.config.id}-${query}-${i}`,
        metadata: {
          platform: this.platform,
          artist: `${this.config.name} Artist`,
          album: `${this.config.name} Album`,
          duration: Math.floor(Math.random() * 300) + 60,
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
      url: `/api/music/stream/${itemId}`,
      metadata: {
        platform: this.platform,
        artist: `${this.config.name} Artist`,
        album: `${this.config.name} Album`,
        description: `${this.config.name} track detail (stub)`,
      },
    });
  }

  async getStreamUrl(itemId: string): Promise<string> {
    // In production: Cloudflare Workers proxy URL
    return `https://cf-proxy.workers.dev/music/${this.config.id}/${itemId}`;
  }

  async healthCheck(): Promise<SourceHealth> {
    return 'online';
  }
}
