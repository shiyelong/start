import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AggregatorEngine,
  normaliseTitle,
} from './aggregator';
import type { ISourceAdapter, SourceConfig, AggregatedItem } from './source-adapter';

// ── Test helpers ──────────────────────────────────────────────

function makeConfig(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: 'src-1',
    name: 'Test Source',
    type: 'video',
    enabled: true,
    rating: 'PG',
    priority: 50,
    searchUrl: 'https://example.com/search',
    parseRules: '{}',
    timeout: 10_000,
    health: 'online',
    avgResponseTime: 200,
    successRate: 100,
    failCount: 0,
    lastChecked: new Date().toISOString(),
    ...overrides,
  };
}

function makeItem(overrides: Partial<AggregatedItem> = {}): AggregatedItem {
  return {
    id: 'item-1',
    title: 'Test Video',
    cover: 'https://example.com/cover.jpg',
    source: 'Test Source',
    sourceId: 'src-1',
    rating: 'PG',
    type: 'video',
    url: 'https://example.com/play/1',
    metadata: {},
    ...overrides,
  };
}

function makeMockAdapter(
  config: SourceConfig,
  searchResult: AggregatedItem[] | Error = [],
  delay = 0,
): ISourceAdapter {
  return {
    config,
    search: vi.fn().mockImplementation(() => {
      if (delay > 0) {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            if (searchResult instanceof Error) reject(searchResult);
            else resolve(searchResult);
          }, delay);
        });
      }
      if (searchResult instanceof Error) return Promise.reject(searchResult);
      return Promise.resolve(searchResult);
    }),
    getDetail: vi.fn().mockResolvedValue(null),
    getStreamUrl: vi.fn().mockResolvedValue(''),
    healthCheck: vi.fn().mockResolvedValue('online' as const),
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe('normaliseTitle', () => {
  it('lowercases and strips punctuation/whitespace', () => {
    expect(normaliseTitle('Hello World!')).toBe('helloworld');
    expect(normaliseTitle('  Test - Video  ')).toBe('testvideo');
    expect(normaliseTitle('进击的巨人：最终季')).toBe('进击的巨人最终季');
  });

  it('treats identical titles as equal after normalisation', () => {
    expect(normaliseTitle('One Piece')).toBe(normaliseTitle('one piece'));
    expect(normaliseTitle('One-Piece')).toBe(normaliseTitle('One Piece'));
  });
});

describe('AggregatorEngine', () => {
  let engine: AggregatorEngine;

  beforeEach(() => {
    engine = new AggregatorEngine();
  });

  // ── Registration ──────────────────────────────────────────

  describe('registerAdapter', () => {
    it('registers an adapter and tracks its health', () => {
      const adapter = makeMockAdapter(makeConfig());
      engine.registerAdapter(adapter);

      const statuses = engine.getHealthStatus();
      expect(statuses).toHaveLength(1);
      expect(statuses[0].id).toBe('src-1');
      expect(statuses[0].health).toBe('online');
    });
  });

  // ── Search — basic ────────────────────────────────────────

  describe('search', () => {
    it('returns items from a single source', async () => {
      const items = [
        makeItem({ id: 'a', title: 'Alpha Video' }),
        makeItem({ id: 'b', title: 'Beta Video' }),
      ];
      engine.registerAdapter(makeMockAdapter(makeConfig(), items));

      const res = await engine.search({ query: 'test' });
      expect(res.items).toHaveLength(2);
      expect(res.total).toBe(2);
      expect(res.sources).toHaveLength(1);
      expect(res.sources[0].count).toBe(2);
    });

    it('merges items from multiple sources', async () => {
      const cfg1 = makeConfig({ id: 'src-1', name: 'Source A' });
      const cfg2 = makeConfig({ id: 'src-2', name: 'Source B' });

      engine.registerAdapter(
        makeMockAdapter(cfg1, [makeItem({ id: 'a1', title: 'Alpha', sourceId: 'src-1' })]),
      );
      engine.registerAdapter(
        makeMockAdapter(cfg2, [makeItem({ id: 'b1', title: 'Beta', sourceId: 'src-2' })]),
      );

      const res = await engine.search({ query: 'test' });
      expect(res.items).toHaveLength(2);
      expect(res.sources).toHaveLength(2);
    });

    it('skips disabled sources', async () => {
      const enabled = makeConfig({ id: 'src-1', enabled: true });
      const disabled = makeConfig({ id: 'src-2', enabled: false });

      engine.registerAdapter(
        makeMockAdapter(enabled, [makeItem({ id: 'a', sourceId: 'src-1' })]),
      );
      engine.registerAdapter(
        makeMockAdapter(disabled, [makeItem({ id: 'b', sourceId: 'src-2' })]),
      );

      const res = await engine.search({ query: 'test' });
      expect(res.items).toHaveLength(1);
      expect(res.items[0].sourceId).toBe('src-1');
    });

    it('filters by source type when specified', async () => {
      const video = makeConfig({ id: 'src-v', type: 'video' });
      const music = makeConfig({ id: 'src-m', type: 'music' });

      engine.registerAdapter(
        makeMockAdapter(video, [makeItem({ id: 'v1', sourceId: 'src-v', type: 'video' })]),
      );
      engine.registerAdapter(
        makeMockAdapter(music, [makeItem({ id: 'm1', sourceId: 'src-m', type: 'music' })]),
      );

      const res = await engine.search({ query: 'test', type: 'video' });
      expect(res.items).toHaveLength(1);
      expect(res.items[0].type).toBe('video');
    });
  });

  // ── Deduplication ─────────────────────────────────────────

  describe('deduplication', () => {
    it('keeps the item from the highest-priority source', async () => {
      const highPri = makeConfig({ id: 'src-hi', priority: 10, name: 'High' });
      const lowPri = makeConfig({ id: 'src-lo', priority: 90, name: 'Low' });

      engine.registerAdapter(
        makeMockAdapter(highPri, [
          makeItem({ id: 'hi-1', title: 'Same Title', sourceId: 'src-hi', source: 'High' }),
        ]),
      );
      engine.registerAdapter(
        makeMockAdapter(lowPri, [
          makeItem({ id: 'lo-1', title: 'Same Title', sourceId: 'src-lo', source: 'Low' }),
        ]),
      );

      const res = await engine.search({ query: 'test' });
      expect(res.items).toHaveLength(1);
      expect(res.items[0].source).toBe('High');
    });

    it('treats titles differing only in punctuation as duplicates', async () => {
      const cfg1 = makeConfig({ id: 'src-1', priority: 10 });
      const cfg2 = makeConfig({ id: 'src-2', priority: 20 });

      engine.registerAdapter(
        makeMockAdapter(cfg1, [
          makeItem({ id: 'a', title: 'One Piece', sourceId: 'src-1' }),
        ]),
      );
      engine.registerAdapter(
        makeMockAdapter(cfg2, [
          makeItem({ id: 'b', title: 'One-Piece', sourceId: 'src-2' }),
        ]),
      );

      const res = await engine.search({ query: 'test' });
      expect(res.items).toHaveLength(1);
    });
  });

  // ── Rating filtering ──────────────────────────────────────

  describe('rating filtering', () => {
    it('filters items above the user max rating', async () => {
      const cfg = makeConfig({ id: 'src-1' });
      engine.registerAdapter(
        makeMockAdapter(cfg, [
          makeItem({ id: 'g', title: 'G Movie', rating: 'G' }),
          makeItem({ id: 'pg', title: 'PG Movie', rating: 'PG' }),
          makeItem({ id: 'r', title: 'R Movie', rating: 'R' }),
          makeItem({ id: 'nc17', title: 'NC17 Movie', rating: 'NC-17' }),
        ]),
      );

      const res = await engine.search({ query: 'test', rating: 'PG-13' });
      expect(res.items.every((i) => ['G', 'PG', 'PG-13'].includes(i.rating))).toBe(true);
      expect(res.total).toBe(2); // G and PG
    });

    it('returns all items when no rating filter is set', async () => {
      const cfg = makeConfig({ id: 'src-1' });
      engine.registerAdapter(
        makeMockAdapter(cfg, [
          makeItem({ id: 'g', title: 'G Movie', rating: 'G' }),
          makeItem({ id: 'nc17', title: 'NC17 Movie', rating: 'NC-17' }),
        ]),
      );

      const res = await engine.search({ query: 'test' });
      expect(res.total).toBe(2);
    });
  });

  // ── Timeout handling ──────────────────────────────────────

  describe('timeout handling', () => {
    it('skips a source that times out without blocking others', async () => {
      const fast = makeConfig({ id: 'src-fast', name: 'Fast Source', timeout: 10_000 });
      const slow = makeConfig({ id: 'src-slow', name: 'Slow Source', timeout: 50 }); // 50ms timeout

      engine.registerAdapter(
        makeMockAdapter(fast, [makeItem({ id: 'f1', title: 'Fast Video', sourceId: 'src-fast' })]),
      );
      // This adapter takes 200ms but has a 50ms timeout
      engine.registerAdapter(
        makeMockAdapter(slow, [makeItem({ id: 's1', title: 'Slow Video', sourceId: 'src-slow' })], 200),
      );

      const res = await engine.search({ query: 'test' });
      expect(res.items).toHaveLength(1);
      expect(res.items[0].title).toBe('Fast Video');
      // The slow source should show 0 count
      const slowStatus = res.sources.find((s) => s.name === 'Slow Source');
      expect(slowStatus?.count).toBe(0);
    });

    it('records a failure for a timed-out source', async () => {
      const slow = makeConfig({ id: 'src-slow', timeout: 50 });
      engine.registerAdapter(
        makeMockAdapter(slow, [makeItem()], 200),
      );

      await engine.search({ query: 'test' });
      expect(engine.getSourceFailCount('src-slow')).toBe(1);
    });
  });

  // ── Health state machine ──────────────────────────────────

  describe('health state machine', () => {
    it('transitions online → degraded after 1 failure', () => {
      const cfg = makeConfig({ id: 'src-1' });
      engine.registerAdapter(makeMockAdapter(cfg));

      engine.recordFailure('src-1');
      expect(engine.getSourceHealth('src-1')).toBe('degraded');
      expect(engine.getSourceFailCount('src-1')).toBe(1);
    });

    it('stays degraded at 2 failures', () => {
      const cfg = makeConfig({ id: 'src-1' });
      engine.registerAdapter(makeMockAdapter(cfg));

      engine.recordFailure('src-1');
      engine.recordFailure('src-1');
      expect(engine.getSourceHealth('src-1')).toBe('degraded');
      expect(engine.getSourceFailCount('src-1')).toBe(2);
    });

    it('transitions degraded → offline at 3 failures', () => {
      const cfg = makeConfig({ id: 'src-1' });
      engine.registerAdapter(makeMockAdapter(cfg));

      engine.recordFailure('src-1');
      engine.recordFailure('src-1');
      engine.recordFailure('src-1');
      expect(engine.getSourceHealth('src-1')).toBe('offline');
      expect(engine.getSourceFailCount('src-1')).toBe(3);
    });

    it('resets to online on success', () => {
      const cfg = makeConfig({ id: 'src-1' });
      engine.registerAdapter(makeMockAdapter(cfg));

      engine.recordFailure('src-1');
      engine.recordFailure('src-1');
      expect(engine.getSourceHealth('src-1')).toBe('degraded');

      engine.recordSuccess('src-1');
      expect(engine.getSourceHealth('src-1')).toBe('online');
      expect(engine.getSourceFailCount('src-1')).toBe(0);
    });

    it('markSourceUnavailable forces offline', () => {
      const cfg = makeConfig({ id: 'src-1' });
      engine.registerAdapter(makeMockAdapter(cfg));

      engine.markSourceUnavailable('src-1');
      expect(engine.getSourceHealth('src-1')).toBe('offline');
    });

    it('excludes offline sources from search', async () => {
      const cfg = makeConfig({ id: 'src-1' });
      engine.registerAdapter(
        makeMockAdapter(cfg, [makeItem({ id: 'a', sourceId: 'src-1' })]),
      );

      // Force offline
      engine.markSourceUnavailable('src-1');

      const res = await engine.search({ query: 'test' });
      expect(res.items).toHaveLength(0);
      expect(res.sources).toHaveLength(0);
    });
  });

  // ── Pagination ────────────────────────────────────────────

  describe('pagination', () => {
    it('returns the correct page slice', async () => {
      const items = Array.from({ length: 25 }, (_, i) =>
        makeItem({ id: `item-${i}`, title: `Video ${i}` }),
      );
      engine.registerAdapter(makeMockAdapter(makeConfig(), items));

      const page1 = await engine.search({ query: 'test', page: 1, pageSize: 10 });
      expect(page1.items).toHaveLength(10);
      expect(page1.total).toBe(25);
      expect(page1.page).toBe(1);

      const page3 = await engine.search({ query: 'test', page: 3, pageSize: 10 });
      expect(page3.items).toHaveLength(5);
    });
  });

  // ── Error handling ────────────────────────────────────────

  describe('error handling', () => {
    it('gracefully handles a source that throws', async () => {
      const good = makeConfig({ id: 'src-good', name: 'Good' });
      const bad = makeConfig({ id: 'src-bad', name: 'Bad' });

      engine.registerAdapter(
        makeMockAdapter(good, [makeItem({ id: 'g1', title: 'Good Item', sourceId: 'src-good' })]),
      );
      engine.registerAdapter(
        makeMockAdapter(bad, new Error('Network error')),
      );

      const res = await engine.search({ query: 'test' });
      expect(res.items).toHaveLength(1);
      expect(res.items[0].title).toBe('Good Item');
      // Bad source recorded a failure
      expect(engine.getSourceFailCount('src-bad')).toBe(1);
    });
  });
});
