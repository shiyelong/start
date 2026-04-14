/**
 * Unit tests for adult live streaming source adapters.
 *
 * Tests adapter instantiation, search, detail, stream URL generation,
 * NC-17 rating enforcement, and the adapter registry functions.
 *
 * Validates: Requirements 17.1, 17.2, 17.3, 17.5, 17.9
 */

import { describe, it, expect } from 'vitest';
import { GenericAdultLiveAdapter } from './generic-adult-live-adapter';
import {
  createAllAdultLiveAdapters,
  getAdultLiveAdapterById,
  getAllAdultLiveSourceIds,
} from './index';

// ── GenericAdultLiveAdapter ──────────────────────────────────

describe('GenericAdultLiveAdapter', () => {
  const adapter = new GenericAdultLiveAdapter({
    id: 'test-adult-live-src',
    name: 'Test Adult Live Source',
    priority: 50,
    searchUrl: 'https://cf-proxy.workers.dev/adult-live/test/search',
    platform: 'test-adult-live',
  });

  it('creates adapter with NC-17 rating forced', () => {
    expect(adapter.config.id).toBe('test-adult-live-src');
    expect(adapter.config.name).toBe('Test Adult Live Source');
    expect(adapter.config.rating).toBe('NC-17');
    expect(adapter.config.type).toBe('live');
    expect(adapter.config.enabled).toBe(true);
  });

  it('forces NC-17 even when config overrides try to change rating', () => {
    const overridden = new GenericAdultLiveAdapter(
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
      expect(item.source).toBe('Test Adult Live Source');
      expect(item.sourceId).toBe('test-adult-live-src');
      expect(item.rating).toBe('NC-17');
      expect(item.type).toBe('live');
      expect(item.metadata.platform).toBe('test-adult-live');
      expect(item.url).toContain('/api/zone/live/stream/');
    }
  });

  it('search respects pageSize limit', async () => {
    const items = await adapter.search('test', 1, 3);
    expect(items).toHaveLength(3);
  });

  it('getDetail returns item with metadata', async () => {
    const detail = await adapter.getDetail('test-adult-live-src-item-0');
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('test-adult-live-src-item-0');
    expect(detail!.rating).toBe('NC-17');
    expect(detail!.metadata.platform).toBe('test-adult-live');
  });

  it('getStreamUrl returns CF proxy URL', async () => {
    const url = await adapter.getStreamUrl('test-item-1');
    expect(url).toContain('cf-proxy.workers.dev');
    expect(url).toContain('test-adult-live-src');
  });

  it('healthCheck returns online', async () => {
    const health = await adapter.healthCheck();
    expect(health).toBe('online');
  });
});

// ── Adapter Registry ──────────────────────────────────────────

describe('Adult Live Adapter Registry', () => {
  describe('createAllAdultLiveAdapters', () => {
    it('creates all 7 adult live adapters', () => {
      const adapters = createAllAdultLiveAdapters();
      expect(adapters.length).toBe(7);
    });

    it('all adapters have type=live', () => {
      const adapters = createAllAdultLiveAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.type).toBe('live');
      }
    });

    it('all adapters have rating=NC-17', () => {
      const adapters = createAllAdultLiveAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.rating).toBe('NC-17');
      }
    });

    it('all adapters are enabled by default', () => {
      const adapters = createAllAdultLiveAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.enabled).toBe(true);
      }
    });

    it('all adapters have unique IDs', () => {
      const adapters = createAllAdultLiveAdapters();
      const ids = adapters.map((a) => a.config.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all adapter IDs follow adult-live-src-N pattern', () => {
      const adapters = createAllAdultLiveAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.id).toMatch(/^adult-live-src-\d+$/);
      }
    });

    it('all adapter names follow Source-X pattern', () => {
      const adapters = createAllAdultLiveAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.name).toMatch(/^Source-[A-G]$/);
      }
    });

    it('all adapter searchUrls go through CF proxy', () => {
      const adapters = createAllAdultLiveAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.searchUrl).toContain('cf-proxy.workers.dev');
      }
    });
  });

  describe('getAdultLiveAdapterById', () => {
    it('returns adapter for adult-live-src-1', () => {
      const adapter = getAdultLiveAdapterById('adult-live-src-1');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('adult-live-src-1');
      expect(adapter!.config.name).toBe('Source-A');
      expect(adapter!.config.rating).toBe('NC-17');
    });

    it('returns adapter for adult-live-src-7', () => {
      const adapter = getAdultLiveAdapterById('adult-live-src-7');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('adult-live-src-7');
      expect(adapter!.config.name).toBe('Source-G');
    });

    it('returns null for unknown source ID', () => {
      const adapter = getAdultLiveAdapterById('nonexistent');
      expect(adapter).toBeNull();
    });

    it('returns null for regular live source IDs', () => {
      const adapter = getAdultLiveAdapterById('douyu');
      expect(adapter).toBeNull();
    });
  });

  describe('getAllAdultLiveSourceIds', () => {
    it('returns 7 source IDs', () => {
      const ids = getAllAdultLiveSourceIds();
      expect(ids.length).toBe(7);
    });

    it('all IDs are non-empty strings', () => {
      const ids = getAllAdultLiveSourceIds();
      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });

    it('IDs range from adult-live-src-1 to adult-live-src-7', () => {
      const ids = getAllAdultLiveSourceIds();
      for (let i = 1; i <= 7; i++) {
        expect(ids).toContain(`adult-live-src-${i}`);
      }
    });
  });
});
