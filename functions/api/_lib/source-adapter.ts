/**
 * Source adapter interface and base class for the aggregation engine.
 *
 * All content aggregation sources (video, music, comic, novel, anime, live,
 * podcast) implement the `ISourceAdapter` interface. The `BaseSourceAdapter`
 * abstract class provides shared plumbing so concrete adapters only need to
 * implement the four core methods.
 *
 * (Design doc § 统一源适配器模式)
 * (Requirements 4.2, 4.7, 4.8, 10.4, 10.5)
 */

import type { ContentRating, SourceHealth, SourceType } from '../../../src/lib/types';

// Re-export types used by consumers of this module
export type { ContentRating, SourceHealth, SourceType };

// ── Source config (matches D1 `source_config` table) ──────────

export interface SourceConfig {
  id: string;
  name: string;
  type: SourceType;
  enabled: boolean;
  rating: ContentRating;
  priority: number;
  searchUrl: string;
  parseRules: string;
  timeout: number;           // milliseconds
  health: SourceHealth;
  avgResponseTime: number;   // milliseconds
  successRate: number;       // 0-100
  failCount: number;
  lastChecked: string;       // ISO timestamp
}

// ── Aggregated item ───────────────────────────────────────────

export interface AggregatedItem {
  id: string;
  title: string;
  cover: string;
  source: string;            // human-readable source name
  sourceId: string;          // source config id
  rating: ContentRating;
  type: SourceType;
  url: string;               // proxied playback / read URL
  metadata: Record<string, unknown>;
  tags?: string[];
}

// ── ISourceAdapter interface ──────────────────────────────────

/**
 * Every aggregation source must implement this interface.
 *
 * The aggregator engine calls these methods during search, detail
 * retrieval, and health monitoring.
 */
export interface ISourceAdapter {
  /** The source configuration this adapter is bound to. */
  readonly config: SourceConfig;

  /** Search this source for content matching `query`. */
  search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]>;

  /** Retrieve full details for a single item. */
  getDetail(itemId: string): Promise<AggregatedItem | null>;

  /** Obtain a proxied stream / read URL for the given item. */
  getStreamUrl(itemId: string): Promise<string>;

  /** Probe the source and return its current health status. */
  healthCheck(): Promise<SourceHealth>;
}

// ── BaseSourceAdapter abstract class ──────────────────────────

/**
 * Abstract base class that concrete source adapters extend.
 *
 * Provides:
 * - Storage of the `SourceConfig` reference.
 * - A helper to build `AggregatedItem` objects with common fields
 *   pre-filled from the config.
 *
 * Subclasses must implement `search`, `getDetail`, `getStreamUrl`,
 * and `healthCheck`.
 */
export abstract class BaseSourceAdapter implements ISourceAdapter {
  public readonly config: SourceConfig;

  constructor(config: SourceConfig) {
    this.config = config;
  }

  // ── Abstract methods (must be implemented by subclasses) ────

  abstract search(query: string, page: number, pageSize: number): Promise<AggregatedItem[]>;
  abstract getDetail(itemId: string): Promise<AggregatedItem | null>;
  abstract getStreamUrl(itemId: string): Promise<string>;
  abstract healthCheck(): Promise<SourceHealth>;

  // ── Helpers ─────────────────────────────────────────────────

  /**
   * Build an `AggregatedItem` with common fields pre-filled from
   * this adapter's config. Callers supply the item-specific fields.
   */
  protected buildItem(
    partial: Pick<AggregatedItem, 'id' | 'title' | 'cover' | 'url'> &
      Partial<AggregatedItem>,
  ): AggregatedItem {
    return {
      source: this.config.name,
      sourceId: this.config.id,
      rating: this.config.rating,
      type: this.config.type,
      metadata: {},
      ...partial,
    };
  }
}
