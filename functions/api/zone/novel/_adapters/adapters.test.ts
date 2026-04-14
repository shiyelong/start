/**
 * Unit tests for adult novel source adapters.
 *
 * Tests adapter instantiation, search, detail, stream URL generation,
 * NC-17 rating enforcement, and the adapter registry functions.
 *
 * Validates: Requirements 30.1, 30.5, 30.7, 30.8, 30.9
 */

import { describe, it, expect } from 'vitest';
import { GenericAdultNovelAdapter } from './generic-adult-novel-adapter';
import {
  createAllAdultNovelAdapters,
  getAdultNovelAdapterById,
  getAllAdultNovelSourceIds,
} from './index';

// ── GenericAdultNovelAdapter ──────────────────────────────────

describe('GenericAdultNovelAdapter', () => {
  const adapter = new GenericAdultNovelAdapter({
    id: 'test-adult-novel-src',
    name: 'Test Adult Novel Source',
    priority: 50,
    searchUrl: 'https://cf-proxy.workers.dev/adult-novel/test/search',
    platform: 'test-adult-novel',
  });

  it('creates adapter with NC-17 rating forced', () => {
    expect(adapter.config.id).toBe('test-adult-novel-src');
    expect(adapter.config.name).toBe('Test Adult Novel Source');
    expect(adapter.config.rating).toBe('NC-17');
    expect(adapter.config.type).toBe('novel');
    expect(adapter.config.enabled).toBe(true);
  });

  it('forces NC-17 even when config overrides try to change rating', () => {
    const overridden = new GenericAdultNovelAdapter(
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
      expect(item.source).toBe('Test Adult Novel Source');
      expect(item.sourceId).toBe('test-adult-novel-src');
      expect(item.rating).toBe('NC-17');
      expect(item.type).toBe('novel');
      expect(item.metadata.platform).toBe('test-adult-novel');
      expect(item.url).toContain('/api/zone/novel/');
    }
  });

  it('search respects pageSize limit', async () => {
    const items = await adapter.search('test', 1, 3);
    expect(items).toHaveLength(3);
  });

  it('getDetail returns item with metadata', async () => {
    const detail = await adapter.getDetail('test-adult-novel-src-item-0');
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('test-adult-novel-src-item-0');
    expect(detail!.rating).toBe('NC-17');
    expect(detail!.metadata.platform).toBe('test-adult-novel');
  });

  it('getStreamUrl returns CF proxy URL', async () => {
    const url = await adapter.getStreamUrl('test-item-1');
    expect(url).toContain('cf-proxy.workers.dev');
    expect(url).toContain('test-adult-novel-src');
  });

  it('healthCheck returns online', async () => {
    const health = await adapter.healthCheck();
    expect(health).toBe('online');
  });
});

// ── Adapter Registry ──────────────────────────────────────────

describe('Adult Novel Adapter Registry', () => {
  describe('createAllAdultNovelAdapters', () => {
    it('creates all 7 adult novel adapters', () => {
      const adapters = createAllAdultNovelAdapters();
      expect(adapters.length).toBe(7);
    });

    it('all adapters have type=novel', () => {
      const adapters = createAllAdultNovelAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.type).toBe('novel');
      }
    });

    it('all adapters have rating=NC-17', () => {
      const adapters = createAllAdultNovelAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.rating).toBe('NC-17');
      }
    });

    it('all adapters are enabled by default', () => {
      const adapters = createAllAdultNovelAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.enabled).toBe(true);
      }
    });

    it('all adapters have unique IDs', () => {
      const adapters = createAllAdultNovelAdapters();
      const ids = adapters.map((a) => a.config.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all adapter IDs follow adult-novel-src-N pattern', () => {
      const adapters = createAllAdultNovelAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.id).toMatch(/^adult-novel-src-\d+$/);
      }
    });

    it('all adapter names follow Source-X pattern', () => {
      const adapters = createAllAdultNovelAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.name).toMatch(/^Source-[A-G]$/);
      }
    });

    it('all adapter searchUrls go through CF proxy', () => {
      const adapters = createAllAdultNovelAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.searchUrl).toContain('cf-proxy.workers.dev');
      }
    });
  });

  describe('getAdultNovelAdapterById', () => {
    it('returns adapter for adult-novel-src-1', () => {
      const adapter = getAdultNovelAdapterById('adult-novel-src-1');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('adult-novel-src-1');
      expect(adapter!.config.name).toBe('Source-A');
      expect(adapter!.config.rating).toBe('NC-17');
    });

    it('returns adapter for adult-novel-src-7', () => {
      const adapter = getAdultNovelAdapterById('adult-novel-src-7');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('adult-novel-src-7');
      expect(adapter!.config.name).toBe('Source-G');
    });

    it('returns null for unknown source ID', () => {
      const adapter = getAdultNovelAdapterById('nonexistent');
      expect(adapter).toBeNull();
    });

    it('returns null for regular novel source IDs', () => {
      const adapter = getAdultNovelAdapterById('qidian');
      expect(adapter).toBeNull();
    });
  });

  describe('getAllAdultNovelSourceIds', () => {
    it('returns 7 source IDs', () => {
      const ids = getAllAdultNovelSourceIds();
      expect(ids.length).toBe(7);
    });

    it('all IDs are non-empty strings', () => {
      const ids = getAllAdultNovelSourceIds();
      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });

    it('IDs range from adult-novel-src-1 to adult-novel-src-7', () => {
      const ids = getAllAdultNovelSourceIds();
      for (let i = 1; i <= 7; i++) {
        expect(ids).toContain(`adult-novel-src-${i}`);
      }
    });
  });
});
