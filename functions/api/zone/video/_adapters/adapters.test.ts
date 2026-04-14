/**
 * Unit tests for adult video source adapters.
 *
 * Tests adapter instantiation, search, detail, stream URL generation,
 * NC-17 rating enforcement, and the adapter registry functions.
 *
 * Validates: Requirements 17.1, 17.2, 17.3, 17.5, 17.7, 17.8, 17.9
 */

import { describe, it, expect } from 'vitest';
import { GenericAdultVideoAdapter } from './generic-adult-video-adapter';
import {
  createAllAdultVideoAdapters,
  getAdultVideoAdapterById,
  getAllAdultVideoSourceIds,
} from './index';

// ── GenericAdultVideoAdapter ──────────────────────────────────

describe('GenericAdultVideoAdapter', () => {
  const adapter = new GenericAdultVideoAdapter({
    id: 'test-adult-src',
    name: 'Test Adult Source',
    priority: 50,
    searchUrl: 'https://cf-proxy.workers.dev/adult/test/search',
    platform: 'test-adult',
  });

  it('creates adapter with NC-17 rating forced', () => {
    expect(adapter.config.id).toBe('test-adult-src');
    expect(adapter.config.name).toBe('Test Adult Source');
    expect(adapter.config.rating).toBe('NC-17');
    expect(adapter.config.type).toBe('video');
    expect(adapter.config.enabled).toBe(true);
  });

  it('forces NC-17 even when config overrides try to change rating', () => {
    const overridden = new GenericAdultVideoAdapter(
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
      expect(item.source).toBe('Test Adult Source');
      expect(item.sourceId).toBe('test-adult-src');
      expect(item.rating).toBe('NC-17');
      expect(item.type).toBe('video');
      expect(item.metadata.platform).toBe('test-adult');
      expect(item.url).toContain('/api/zone/video/stream/');
    }
  });

  it('search respects pageSize limit', async () => {
    const items = await adapter.search('test', 1, 3);
    expect(items).toHaveLength(3);
  });

  it('getDetail returns item with metadata', async () => {
    const detail = await adapter.getDetail('test-adult-src-item-0');
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('test-adult-src-item-0');
    expect(detail!.rating).toBe('NC-17');
    expect(detail!.metadata.platform).toBe('test-adult');
  });

  it('getStreamUrl returns CF proxy URL', async () => {
    const url = await adapter.getStreamUrl('test-item-1');
    expect(url).toContain('cf-proxy.workers.dev');
    expect(url).toContain('test-adult-src');
  });

  it('healthCheck returns online', async () => {
    const health = await adapter.healthCheck();
    expect(health).toBe('online');
  });
});

// ── Adapter Registry ──────────────────────────────────────────

describe('Adult Video Adapter Registry', () => {
  describe('createAllAdultVideoAdapters', () => {
    it('creates all 16 adult video adapters', () => {
      const adapters = createAllAdultVideoAdapters();
      expect(adapters.length).toBe(16);
    });

    it('all adapters have type=video', () => {
      const adapters = createAllAdultVideoAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.type).toBe('video');
      }
    });

    it('all adapters have rating=NC-17', () => {
      const adapters = createAllAdultVideoAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.rating).toBe('NC-17');
      }
    });

    it('all adapters are enabled by default', () => {
      const adapters = createAllAdultVideoAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.enabled).toBe(true);
      }
    });

    it('all adapters have unique IDs', () => {
      const adapters = createAllAdultVideoAdapters();
      const ids = adapters.map((a) => a.config.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all adapter IDs follow adult-src-N pattern', () => {
      const adapters = createAllAdultVideoAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.id).toMatch(/^adult-src-\d+$/);
      }
    });

    it('all adapter names follow Source-X pattern', () => {
      const adapters = createAllAdultVideoAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.name).toMatch(/^Source-[A-P]$/);
      }
    });

    it('all adapter searchUrls go through CF proxy', () => {
      const adapters = createAllAdultVideoAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.searchUrl).toContain('cf-proxy.workers.dev');
      }
    });
  });

  describe('getAdultVideoAdapterById', () => {
    it('returns adapter for adult-src-1', () => {
      const adapter = getAdultVideoAdapterById('adult-src-1');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('adult-src-1');
      expect(adapter!.config.name).toBe('Source-A');
      expect(adapter!.config.rating).toBe('NC-17');
    });

    it('returns adapter for adult-src-16', () => {
      const adapter = getAdultVideoAdapterById('adult-src-16');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('adult-src-16');
      expect(adapter!.config.name).toBe('Source-P');
    });

    it('returns null for unknown source ID', () => {
      const adapter = getAdultVideoAdapterById('nonexistent');
      expect(adapter).toBeNull();
    });

    it('returns null for regular video source IDs', () => {
      const adapter = getAdultVideoAdapterById('bilibili');
      expect(adapter).toBeNull();
    });
  });

  describe('getAllAdultVideoSourceIds', () => {
    it('returns 16 source IDs', () => {
      const ids = getAllAdultVideoSourceIds();
      expect(ids.length).toBe(16);
    });

    it('all IDs are non-empty strings', () => {
      const ids = getAllAdultVideoSourceIds();
      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });

    it('IDs range from adult-src-1 to adult-src-16', () => {
      const ids = getAllAdultVideoSourceIds();
      for (let i = 1; i <= 16; i++) {
        expect(ids).toContain(`adult-src-${i}`);
      }
    });
  });
});
