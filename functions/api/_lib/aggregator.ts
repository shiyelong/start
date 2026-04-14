/**
 * Aggregation engine — manages multiple source adapters, executes
 * concurrent searches, merges / deduplicates results, and tracks
 * source health.
 *
 * Key behaviours:
 * - Concurrent search via `Promise.allSettled` (one slow source
 *   never blocks the others).
 * - Per-source timeout (from `SourceConfig.timeout`, default 10 s).
 * - Deduplication by title similarity — keeps the item from the
 *   highest-priority source.
 * - Rating filtering based on the caller's max allowed rating.
 * - Health state machine:
 *     online  → degraded  (1-2 consecutive failures)
 *     degraded → offline  (3+ consecutive failures)
 *     offline  → online   (auto-retry after 1 hour)
 *
 * (Design doc § 聚合引擎)
 * (Requirements 4.2, 4.7, 4.8, 10.4, 10.5)
 */

import type { ContentRating, SourceHealth } from '../../../src/lib/types';
import { RATING_ORDER } from '../../../src/lib/types';
import type {
  AggregatedItem,
  ISourceAdapter,
  SourceConfig,
} from './source-adapter';

// Re-export for convenience
export type { AggregatedItem, ISourceAdapter, SourceConfig };

// ── Search request / response (mirrors shared types) ──────────

export interface SearchRequest {
  query: string;
  type?: string;
  rating?: ContentRating;     // user's max allowed rating
  tags?: string[];
  region?: string[];
  page?: number;
  pageSize?: number;
  sortBy?: 'relevance' | 'latest' | 'popular' | 'rating';
}

export interface SearchSourceStatus {
  name: string;
  count: number;
  health: SourceHealth;
}

export interface SearchResponse {
  items: AggregatedItem[];
  total: number;
  page: number;
  pageSize: number;
  sources: SearchSourceStatus[];
}

// ── IAggregatorEngine interface ───────────────────────────────

export interface IAggregatorEngine {
  registerAdapter(adapter: ISourceAdapter): void;
  search(request: SearchRequest): Promise<SearchResponse>;
  getHealthStatus(): SourceConfig[];
  markSourceUnavailable(sourceId: string): void;
}

// ── Constants ─────────────────────────────────────────────────

/** Default per-source timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Consecutive failures before a source is marked offline. */
const OFFLINE_THRESHOLD = 3;

/** How long (ms) an offline source stays dormant before auto-retry. */
const OFFLINE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/** Default page size when the caller doesn't specify one. */
const DEFAULT_PAGE_SIZE = 20;

// ── Helpers ───────────────────────────────────────────────────

/**
 * Race a promise against a timeout. Resolves with the promise
 * result or rejects with a timeout error.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Source timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err)   => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Normalise a title for deduplication comparison.
 * Lowercases, strips whitespace / punctuation, collapses spaces.
 */
export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s\-_:：·・.。,，!！?？()（）【】\[\]「」『』""'']/g, '')
    .trim();
}

/**
 * Return `true` if `contentRating` is at or below `maxRating`
 * according to `RATING_ORDER`.
 */
function isRatingAllowed(
  maxRating: ContentRating,
  contentRating: ContentRating,
): boolean {
  const maxIdx = RATING_ORDER.indexOf(maxRating);
  const contentIdx = RATING_ORDER.indexOf(contentRating);
  if (maxIdx === -1 || contentIdx === -1) return false;
  return contentIdx <= maxIdx;
}

// ── AggregatorEngine ──────────────────────────────────────────

export class AggregatorEngine implements IAggregatorEngine {
  /** Registered adapters keyed by source id. */
  private adapters: Map<string, ISourceAdapter> = new Map();

  /**
   * In-memory health state per source id.
   * Tracks consecutive failures and the timestamp of the last
   * health transition so we can implement the cooldown logic.
   */
  private healthState: Map<
    string,
    { failCount: number; health: SourceHealth; lastStateChange: number }
  > = new Map();

  // ── Registration ────────────────────────────────────────────

  registerAdapter(adapter: ISourceAdapter): void {
    const id = adapter.config.id;
    this.adapters.set(id, adapter);

    // Initialise health state from the config
    if (!this.healthState.has(id)) {
      this.healthState.set(id, {
        failCount: adapter.config.failCount ?? 0,
        health: adapter.config.health ?? 'online',
        lastStateChange: Date.now(),
      });
    }
  }

  // ── Search ──────────────────────────────────────────────────

  async search(request: SearchRequest): Promise<SearchResponse> {
    const {
      query,
      type,
      rating,
      page = 1,
      pageSize = DEFAULT_PAGE_SIZE,
    } = request;

    // 1. Determine which adapters to query
    const eligible = this.getEligibleAdapters(type);

    // 2. Fire concurrent searches with per-source timeouts
    const results = await Promise.allSettled(
      eligible.map((adapter) => {
        const timeout = adapter.config.timeout || DEFAULT_TIMEOUT_MS;
        return withTimeout(
          adapter.search(query, 1, 100), // fetch a generous batch for merging
          timeout,
        ).then(
          (items) => ({ adapter, items }),
        );
      }),
    );

    // 3. Collect items and build source status list
    const allItems: AggregatedItem[] = [];
    const sourceStatuses: SearchSourceStatus[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const adapter = eligible[i];

      if (result.status === 'fulfilled') {
        const { items } = result.value;
        allItems.push(...items);
        sourceStatuses.push({
          name: adapter.config.name,
          count: items.length,
          health: this.getSourceHealth(adapter.config.id),
        });
        this.recordSuccess(adapter.config.id);
      } else {
        // Source failed or timed out — record failure
        sourceStatuses.push({
          name: adapter.config.name,
          count: 0,
          health: this.getSourceHealth(adapter.config.id),
        });
        this.recordFailure(adapter.config.id);
      }
    }

    // 4. Rating filter
    const ratingFiltered = rating
      ? allItems.filter((item) => isRatingAllowed(rating, item.rating))
      : allItems;

    // 5. Deduplicate — group by normalised title, keep highest priority
    const deduped = this.deduplicateItems(ratingFiltered);

    // 6. Paginate
    const total = deduped.length;
    const start = (page - 1) * pageSize;
    const paged = deduped.slice(start, start + pageSize);

    return {
      items: paged,
      total,
      page,
      pageSize,
      sources: sourceStatuses,
    };
  }

  // ── Health status ───────────────────────────────────────────

  getHealthStatus(): SourceConfig[] {
    const configs: SourceConfig[] = [];
    for (const adapter of this.adapters.values()) {
      const state = this.healthState.get(adapter.config.id);
      configs.push({
        ...adapter.config,
        health: state?.health ?? adapter.config.health,
        failCount: state?.failCount ?? adapter.config.failCount,
      });
    }
    return configs;
  }

  markSourceUnavailable(sourceId: string): void {
    const state = this.healthState.get(sourceId);
    if (state) {
      state.health = 'offline';
      state.failCount = OFFLINE_THRESHOLD;
      state.lastStateChange = Date.now();
    }
  }

  // ── Failure / success tracking ──────────────────────────────

  /**
   * Record a failure for the given source.
   *
   * State machine:
   *   0 failures → online
   *   1-2 failures → degraded
   *   3+ failures → offline
   */
  recordFailure(sourceId: string): void {
    const state = this.healthState.get(sourceId);
    if (!state) return;

    state.failCount += 1;

    if (state.failCount >= OFFLINE_THRESHOLD) {
      state.health = 'offline';
      state.lastStateChange = Date.now();
    } else {
      state.health = 'degraded';
    }
  }

  /**
   * Record a success for the given source.
   * Resets fail count and sets health to online.
   */
  recordSuccess(sourceId: string): void {
    const state = this.healthState.get(sourceId);
    if (!state) return;

    state.failCount = 0;
    state.health = 'online';
    state.lastStateChange = Date.now();
  }

  // ── Internal helpers ────────────────────────────────────────

  /**
   * Return adapters that are eligible for a search:
   * - Must be enabled
   * - Must match the requested type (if specified)
   * - If offline, only include if the cooldown has elapsed
   */
  private getEligibleAdapters(type?: string): ISourceAdapter[] {
    const now = Date.now();
    const eligible: ISourceAdapter[] = [];

    for (const adapter of this.adapters.values()) {
      if (!adapter.config.enabled) continue;
      if (type && adapter.config.type !== type) continue;

      const state = this.healthState.get(adapter.config.id);
      if (state?.health === 'offline') {
        // Auto-retry after cooldown
        const elapsed = now - state.lastStateChange;
        if (elapsed < OFFLINE_COOLDOWN_MS) continue;
        // Cooldown elapsed — allow retry
      }

      eligible.push(adapter);
    }

    return eligible;
  }

  /**
   * Deduplicate items by normalised title.
   *
   * When two items share the same normalised title, keep the one
   * whose source has the higher priority (lower `priority` number
   * = higher priority). If priorities are equal, keep the first
   * encountered.
   */
  private deduplicateItems(items: AggregatedItem[]): AggregatedItem[] {
    const seen = new Map<string, { item: AggregatedItem; priority: number }>();

    for (const item of items) {
      const key = normaliseTitle(item.title);
      const adapter = this.adapters.get(item.sourceId);
      const priority = adapter?.config.priority ?? 50;

      const existing = seen.get(key);
      if (!existing || priority < existing.priority) {
        seen.set(key, { item, priority });
      }
    }

    return Array.from(seen.values()).map((entry) => entry.item);
  }

  // ── Accessors (useful for testing) ──────────────────────────

  getSourceHealth(sourceId: string): SourceHealth {
    return this.healthState.get(sourceId)?.health ?? 'online';
  }

  getSourceFailCount(sourceId: string): number {
    return this.healthState.get(sourceId)?.failCount ?? 0;
  }
}
