/**
 * Generic anime source adapter factory.
 *
 * Creates stub adapters for anime sources that share the same
 * ISourceAdapter interface. Each adapter defines its own config
 * (name, rating, priority, searchUrl) but shares the same stub
 * search/detail/stream logic.
 *
 * Actual third-party API integration will be refined per-adapter later.
 * All requests go through Cloudflare Workers proxy to hide NAS IP.
 *
 * Anime MPAA rating (Requirement 22.9):
 *   All anime sources default to PG-13.
 *
 * Validates: Requirements 22.1, 22.2, 22.3, 22.4, 22.7, 22.9
 */

import { BaseSourceAdapter } from '../../_lib/source-adapter';
import type { AggregatedItem, SourceConfig } from '../../_lib/source-adapter';
import type { SourceHealth } from '../../../../src/lib/types';

export interface GenericAnimeAdapterOptions {
  id: string;
  name: string;
  rating: 'G' | 'PG' | 'PG-13' | 'R' | 'NC-17';
  priority: number;
  searchUrl: string;
  /** Platform identifier used in metadata */
  platform: string;
}

export function createGenericAnimeConfig(
  opts: GenericAnimeAdapterOptions,
  overrides?: Partial<SourceConfig>,
): SourceConfig {
  return {
    id: opts.id,
    name: opts.name,
    type: 'anime',
    enabled: true,
    rating: opts.rating,
    priority: opts.priority,
    searchUrl: opts.searchUrl,
    parseRules: JSON.stringify({ type: 'html', selector: '' }),
    timeout: 10000,
    health: 'online',
    avgResponseTime: 0,
    successRate: 100,
    failCount: 0,
    lastChecked: new Date().toISOString(),
    ...overrides,
  };
}

export class GenericAnimeAdapter extends BaseSourceAdapter {
  private platform: string;

  constructor(opts: GenericAnimeAdapterOptions, configOverrides?: Partial<SourceConfig>) {
    super(createGenericAnimeConfig(opts, configOverrides));
    this.platform = opts.platform;
  }

  async search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]> {
    // Stub implementation — will be replaced with real scraping/API logic
    // All actual requests will go through Cloudflare Workers proxy
    const items: AggregatedItem[] = [];
    const count = Math.min(pageSize, 8);

    for (let i = 0; i < count; i++) {
      items.push(this.buildItem({
        id: `${this.config.id}-${query}-${(page - 1) * pageSize + i}`,
        title: `[${this.config.name}] ${query} - ${(page - 1) * pageSize + i + 1}`,
        cover: '',
        url: `/api/anime/${this.config.id}-${query}-${i}`,
        metadata: {
          platform: this.platform,
          studio: `${this.config.name} Studio`,
          status: 'ongoing',
          episodes: Math.floor(Math.random() * 24) + 1,
          year: 2024,
          region: '日本',
          tags: ['热血', '冒险'],
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
      url: `/api/anime/${itemId}`,
      metadata: {
        platform: this.platform,
        studio: `${this.config.name} Studio`,
        status: 'ongoing',
        description: `${this.config.name} anime detail (stub)`,
        year: 2024,
        region: '日本',
        tags: ['热血', '冒险'],
        episodes: [
          { id: '1', title: '第1集', url: `/api/anime/${itemId}/ep/1` },
          { id: '2', title: '第2集', url: `/api/anime/${itemId}/ep/2` },
          { id: '3', title: '第3集', url: `/api/anime/${itemId}/ep/3` },
        ],
      },
    });
  }

  async getStreamUrl(itemId: string): Promise<string> {
    // In production: Cloudflare Workers proxy URL for anime video stream
    return `https://cf-proxy.workers.dev/anime/${this.config.id}/${itemId}`;
  }

  async healthCheck(): Promise<SourceHealth> {
    return 'online';
  }
}
