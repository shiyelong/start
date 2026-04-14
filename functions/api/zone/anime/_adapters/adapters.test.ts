/**
 * Unit tests for adult anime source adapters.
 *
 * Tests adapter instantiation, search, detail, stream URL generation,
 * NC-17 rating enforcement, and the adapter registry functions.
 *
 * Validates: Requirements 48.1, 48.6, 48.8, 48.10, 48.11
 */

import { describe, it, expect } from 'vitest';
import { GenericAdultAnimeAdapter } from './generic-adult-anime-adapter';
import {
  createAllAdultAnimeAdapters,
  getAdultAnimeAdapterById,
  getAllAdultAnimeSourceIds,
} from './index';

// ── GenericAdultAnimeAdapter ──────────────────────────────────

describe('GenericAdultAnimeAdapter', () => {
  const adapter = new GenericAdultAnimeAdapter({
    id: 'test-adult-anime-src',
    name: 'Test Adult Anime Source',
    priority: 50,
    searchUrl: 'https://cf-proxy.workers.dev/adult-anime/test/search',
    platform: 'test-adult-anime',
  });

  it('creates adapter with NC-17 rating forced', () => {
    expect(adapter.config.id).toBe('test-adult-anime-src');
    expect(adapter.config.name).toBe('Test Adult Anime Source');
    expect(adapter.config.rating).toBe('NC-17');
    expect(adapter.config.type).toBe('anime');
    expect(adapter.config.enabled).toBe(true);
  });

  it('forces NC-17 even when config overrides try to change rating', () => {
    const overridden = new GenericAdultAnimeAdapter(
      {
        id: 'override-test',
        name: 'Override Test',
        priority: 50,
        searchUrl: 'https://example.com',
        platform: 'test',
      },
      { rating: 'PG' as any },
    );
    expect(overridden.config.rating).toBe('NC-17');
  });

  it('search returns items with correct structure', async () => {
    const items = await adapter.search('test', 1, 5);
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.source).toBe('Test Adult Anime Source');
      expect(item.sourceId).toBe('test-adult-anime-src');
      expect(item.rating).toBe('NC-17');
      expect(item.type).toBe('anime');
      expect(item.metadata.platform).toBe('test-adult-anime');
      expect(item.url).toContain('/api/zone/anime/stream/');
    }
  });

  it('search respects pageSize limit', async () => {
    const items = await adapter.search('test', 1, 3);
    expect(items).toHaveLength(3);
  });

  it('getDetail returns item with metadata', async () => {
    const detail = await adapter.getDetail('test-adult-anime-src-item-0');
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('test-adult-anime-src-item-0');
    expect(detail!.rating).toBe('NC-17');
    expect(detail!.metadata.platform).toBe('test-adult-anime');
  });

  it('getStreamUrl returns CF proxy URL', async () => {
    const url = await adapter.getStreamUrl('test-item-1');
    expect(url).toContain('cf-proxy.workers.dev');
    expect(url).toContain('test-adult-anime-src');
  });

  it('healthCheck returns online', async () => {
    const health = await adapter.healthCheck();
    expect(health).toBe('online');
  });
});

// ── Adapter Registry ──────────────────────────────────────────

describe('Adult Anime Adapter Registry', () => {
  describe('createAllAdultAnimeAdapters', () => {
    it('creates all 7 adult anime adapters', () => {
      const adapters = createAllAdultAnimeAdapters();
      expect(adapters.length).toBe(7);
    });

    it('all adapters have type=anime', () => {
      const adapters = createAllAdultAnimeAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.type).toBe('anime');
      }
    });

    it('all adapters have rating=NC-17', () => {
      const adapters = createAllAdultAnimeAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.rating).toBe('NC-17');
      }
    });

    it('all adapters are enabled by default', () => {
      const adapters = createAllAdultAnimeAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.enabled).toBe(true);
      }
    });

    it('all adapters have unique IDs', () => {
      const adapters = createAllAdultAnimeAdapters();
      const ids = adapters.map((a) => a.config.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all adapter IDs follow adult-anime-src-N pattern', () => {
      const adapters = createAllAdultAnimeAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.id).toMatch(/^adult-anime-src-\d+$/);
      }
    });

    it('all adapter names follow Source-X pattern', () => {
      const adapters = createAllAdultAnimeAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.name).toMatch(/^Source-[A-G]$/);
      }
    });

    it('all adapter searchUrls go through CF proxy', () => {
      const adapters = createAllAdultAnimeAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.searchUrl).toContain('cf-proxy.workers.dev');
      }
    });
  });

  describe('getAdultAnimeAdapterById', () => {
    it('returns adapter for adult-anime-src-1', () => {
      const adapter = getAdultAnimeAdapterById('adult-anime-src-1');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('adult-anime-src-1');
      expect(adapter!.config.name).toBe('Source-A');
      expect(adapter!.config.rating).toBe('NC-17');
    });

    it('returns adapter for adult-anime-src-7', () => {
      const adapter = getAdultAnimeAdapterById('adult-anime-src-7');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('adult-anime-src-7');
      expect(adapter!.config.name).toBe('Source-G');
    });

    it('returns null for unknown source ID', () => {
      const adapter = getAdultAnimeAdapterById('nonexistent');
      expect(adapter).toBeNull();
    });

    it('returns null for regular anime source IDs', () => {
      const adapter = getAdultAnimeAdapterById('gogoanime');
      expect(adapter).toBeNull();
    });
  });

  describe('getAllAdultAnimeSourceIds', () => {
    it('returns 7 source IDs', () => {
      const ids = getAllAdultAnimeSourceIds();
      expect(ids.length).toBe(7);
    });

    it('all IDs are non-empty strings', () => {
      const ids = getAllAdultAnimeSourceIds();
      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });

    it('IDs range from adult-anime-src-1 to adult-anime-src-7', () => {
      const ids = getAllAdultAnimeSourceIds();
      for (let i = 1; i <= 7; i++) {
        expect(ids).toContain(`adult-anime-src-${i}`);
      }
    });
  });
});
