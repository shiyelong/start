/**
 * Unit tests for novel source adapters.
 *
 * Tests adapter instantiation, search, detail, stream URL generation,
 * and the adapter registry functions.
 *
 * Validates: Requirements 23.1, 23.2, 23.3, 23.12, 23.13
 */

import { describe, it, expect } from 'vitest';
import { GenericNovelAdapter } from './generic-novel-adapter';
import {
  createAllNovelAdapters,
  getNovelAdapterById,
  getAllNovelSourceIds,
} from './index';

// ── GenericNovelAdapter ───────────────────────────────────────

describe('GenericNovelAdapter', () => {
  const adapter = new GenericNovelAdapter({
    id: 'test-novel',
    name: 'Test Novel',
    rating: 'PG',
    priority: 50,
    searchUrl: 'https://example.com/novel/search',
    platform: 'test',
  });

  it('creates adapter with provided config', () => {
    expect(adapter.config.id).toBe('test-novel');
    expect(adapter.config.name).toBe('Test Novel');
    expect(adapter.config.rating).toBe('PG');
    expect(adapter.config.type).toBe('novel');
  });

  it('uses 10s timeout for novel sources', () => {
    expect(adapter.config.timeout).toBe(10000);
  });

  it('search returns items with correct source info', async () => {
    const items = await adapter.search('query', 1, 4);
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.source).toBe('Test Novel');
      expect(item.sourceId).toBe('test-novel');
      expect(item.rating).toBe('PG');
      expect(item.type).toBe('novel');
    }
  });

  it('search items contain novel metadata', async () => {
    const items = await adapter.search('fiction', 1, 2);
    for (const item of items) {
      expect(item.metadata.platform).toBe('test');
      expect(item.metadata.author).toBeDefined();
      expect(item.metadata.status).toBeDefined();
      expect(item.metadata.wordCount).toBeDefined();
      expect(item.metadata.chapters).toBeDefined();
    }
  });

  it('search respects pageSize limit (max 8)', async () => {
    const items = await adapter.search('test', 1, 20);
    expect(items).toHaveLength(8);
  });

  it('getDetail returns item with metadata', async () => {
    const detail = await adapter.getDetail('test-novel-item-0');
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('test-novel-item-0');
    expect(detail!.metadata.platform).toBe('test');
    expect(detail!.metadata.author).toBeDefined();
    expect(detail!.metadata.wordCount).toBeDefined();
  });

  it('getStreamUrl returns CF proxy URL', async () => {
    const url = await adapter.getStreamUrl('test-item-1');
    expect(url).toContain('cf-proxy.workers.dev');
    expect(url).toContain('test-novel');
  });

  it('healthCheck returns online', async () => {
    const health = await adapter.healthCheck();
    expect(health).toBe('online');
  });
});

// ── Adapter Registry ──────────────────────────────────────────

describe('Novel Adapter Registry', () => {
  describe('createAllNovelAdapters', () => {
    it('creates all 14 novel adapters', () => {
      const adapters = createAllNovelAdapters();
      expect(adapters.length).toBe(14);
    });

    it('all adapters have type=novel', () => {
      const adapters = createAllNovelAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.type).toBe('novel');
      }
    });

    it('all adapters are enabled by default', () => {
      const adapters = createAllNovelAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.enabled).toBe(true);
      }
    });

    it('all adapters have unique IDs', () => {
      const adapters = createAllNovelAdapters();
      const ids = adapters.map((a) => a.config.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('includes all expected novel sources', () => {
      const adapters = createAllNovelAdapters();
      const ids = adapters.map((a) => a.config.id);
      const expected = [
        'biquge', '69shu', 'quanben', 'dingdian', 'bayi',
        'shuquge', 'piaotian', 'uukanshu', 'novelqi', 'wucuo',
        'luoqiu', 'novelupdates', 'lightnovelworld', 'readnovelfull',
      ];
      for (const id of expected) {
        expect(ids).toContain(id);
      }
    });

    it('all mainstream novel sources have PG rating', () => {
      const adapters = createAllNovelAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.rating).toBe('PG');
      }
    });
  });

  describe('getNovelAdapterById', () => {
    it('returns adapter for biquge', () => {
      const adapter = getNovelAdapterById('biquge');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('biquge');
      expect(adapter!.config.name).toBe('笔趣阁');
    });

    it('returns adapter for novelupdates', () => {
      const adapter = getNovelAdapterById('novelupdates');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('novelupdates');
      expect(adapter!.config.name).toBe('Novel Updates');
    });

    it('returns null for unknown source ID', () => {
      const adapter = getNovelAdapterById('nonexistent');
      expect(adapter).toBeNull();
    });

    it('returns correct adapter for each registered source', () => {
      const allIds = getAllNovelSourceIds();
      for (const id of allIds) {
        const adapter = getNovelAdapterById(id);
        expect(adapter).not.toBeNull();
        expect(adapter!.config.id).toBe(id);
      }
    });
  });

  describe('getAllNovelSourceIds', () => {
    it('returns 14 source IDs', () => {
      const ids = getAllNovelSourceIds();
      expect(ids.length).toBe(14);
    });

    it('all IDs are non-empty strings', () => {
      const ids = getAllNovelSourceIds();
      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });
  });
});
