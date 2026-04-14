/**
 * Unit tests for adult comic source adapters.
 *
 * Tests adapter instantiation, search, detail, stream URL generation,
 * NC-17 rating enforcement, and the adapter registry functions.
 *
 * Validates: Requirements 19.1, 19.5, 19.7, 19.8, 19.9
 */

import { describe, it, expect } from 'vitest';
import { GenericAdultComicAdapter } from './generic-adult-comic-adapter';
import {
  createAllAdultComicAdapters,
  getAdultComicAdapterById,
  getAllAdultComicSourceIds,
} from './index';

// ── GenericAdultComicAdapter ──────────────────────────────────

describe('GenericAdultComicAdapter', () => {
  const adapter = new GenericAdultComicAdapter({
    id: 'test-adult-comic-src',
    name: 'Test Adult Comic Source',
    priority: 50,
    searchUrl: 'https://cf-proxy.workers.dev/adult-comic/test/search',
    platform: 'test-adult-comic',
  });

  it('creates adapter with NC-17 rating forced', () => {
    expect(adapter.config.id).toBe('test-adult-comic-src');
    expect(adapter.config.name).toBe('Test Adult Comic Source');
    expect(adapter.config.rating).toBe('NC-17');
    expect(adapter.config.type).toBe('comic');
    expect(adapter.config.enabled).toBe(true);
  });

  it('forces NC-17 even when config overrides try to change rating', () => {
    const overridden = new GenericAdultComicAdapter(
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
      expect(item.source).toBe('Test Adult Comic Source');
      expect(item.sourceId).toBe('test-adult-comic-src');
      expect(item.rating).toBe('NC-17');
      expect(item.type).toBe('comic');
      expect(item.metadata.platform).toBe('test-adult-comic');
      expect(item.url).toContain('/api/zone/comic/');
    }
  });

  it('search respects pageSize limit', async () => {
    const items = await adapter.search('test', 1, 3);
    expect(items).toHaveLength(3);
  });

  it('getDetail returns item with metadata', async () => {
    const detail = await adapter.getDetail('test-adult-comic-src-item-0');
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('test-adult-comic-src-item-0');
    expect(detail!.rating).toBe('NC-17');
    expect(detail!.metadata.platform).toBe('test-adult-comic');
  });

  it('getStreamUrl returns CF proxy URL', async () => {
    const url = await adapter.getStreamUrl('test-item-1');
    expect(url).toContain('cf-proxy.workers.dev');
    expect(url).toContain('test-adult-comic-src');
  });

  it('healthCheck returns online', async () => {
    const health = await adapter.healthCheck();
    expect(health).toBe('online');
  });
});

// ── Adapter Registry ──────────────────────────────────────────

describe('Adult Comic Adapter Registry', () => {
  describe('createAllAdultComicAdapters', () => {
    it('creates all 11 adult comic adapters', () => {
      const adapters = createAllAdultComicAdapters();
      expect(adapters.length).toBe(11);
    });

    it('all adapters have type=comic', () => {
      const adapters = createAllAdultComicAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.type).toBe('comic');
      }
    });

    it('all adapters have rating=NC-17', () => {
      const adapters = createAllAdultComicAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.rating).toBe('NC-17');
      }
    });

    it('all adapters are enabled by default', () => {
      const adapters = createAllAdultComicAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.enabled).toBe(true);
      }
    });

    it('all adapters have unique IDs', () => {
      const adapters = createAllAdultComicAdapters();
      const ids = adapters.map((a) => a.config.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all adapter IDs follow adult-comic-src-N pattern', () => {
      const adapters = createAllAdultComicAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.id).toMatch(/^adult-comic-src-\d+$/);
      }
    });

    it('all adapter names follow Source-X pattern', () => {
      const adapters = createAllAdultComicAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.name).toMatch(/^Source-[A-K]$/);
      }
    });

    it('all adapter searchUrls go through CF proxy', () => {
      const adapters = createAllAdultComicAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.searchUrl).toContain('cf-proxy.workers.dev');
      }
    });
  });

  describe('getAdultComicAdapterById', () => {
    it('returns adapter for adult-comic-src-1', () => {
      const adapter = getAdultComicAdapterById('adult-comic-src-1');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('adult-comic-src-1');
      expect(adapter!.config.name).toBe('Source-A');
      expect(adapter!.config.rating).toBe('NC-17');
    });

    it('returns adapter for adult-comic-src-11', () => {
      const adapter = getAdultComicAdapterById('adult-comic-src-11');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('adult-comic-src-11');
      expect(adapter!.config.name).toBe('Source-K');
    });

    it('returns null for unknown source ID', () => {
      const adapter = getAdultComicAdapterById('nonexistent');
      expect(adapter).toBeNull();
    });

    it('returns null for regular comic source IDs', () => {
      const adapter = getAdultComicAdapterById('mangadex');
      expect(adapter).toBeNull();
    });
  });

  describe('getAllAdultComicSourceIds', () => {
    it('returns 11 source IDs', () => {
      const ids = getAllAdultComicSourceIds();
      expect(ids.length).toBe(11);
    });

    it('all IDs are non-empty strings', () => {
      const ids = getAllAdultComicSourceIds();
      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });

    it('IDs range from adult-comic-src-1 to adult-comic-src-11', () => {
      const ids = getAllAdultComicSourceIds();
      for (let i = 1; i <= 11; i++) {
        expect(ids).toContain(`adult-comic-src-${i}`);
      }
    });
  });
});
