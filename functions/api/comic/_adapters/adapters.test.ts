/**
 * Unit tests for comic source adapters.
 *
 * Tests adapter instantiation, search, detail, stream URL generation,
 * and the adapter registry functions.
 *
 * Validates: Requirements 18.1, 18.2, 18.3, 18.11, 18.12, 18.13
 */

import { describe, it, expect } from 'vitest';
import { GenericComicAdapter } from './generic-comic-adapter';
import {
  createAllComicAdapters,
  getComicAdapterById,
  getAllComicSourceIds,
} from './index';

// ── GenericComicAdapter ───────────────────────────────────────

describe('GenericComicAdapter', () => {
  const adapter = new GenericComicAdapter({
    id: 'test-comic',
    name: 'Test Comic',
    rating: 'PG',
    priority: 50,
    searchUrl: 'https://example.com/comic/search',
    platform: 'test',
  });

  it('creates adapter with provided config', () => {
    expect(adapter.config.id).toBe('test-comic');
    expect(adapter.config.name).toBe('Test Comic');
    expect(adapter.config.rating).toBe('PG');
    expect(adapter.config.type).toBe('comic');
  });

  it('uses 10s timeout for comic sources', () => {
    expect(adapter.config.timeout).toBe(10000);
  });

  it('search returns items with correct source info', async () => {
    const items = await adapter.search('query', 1, 4);
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.source).toBe('Test Comic');
      expect(item.sourceId).toBe('test-comic');
      expect(item.rating).toBe('PG');
      expect(item.type).toBe('comic');
    }
  });

  it('search items contain comic metadata', async () => {
    const items = await adapter.search('manga', 1, 2);
    for (const item of items) {
      expect(item.metadata.platform).toBe('test');
      expect(item.metadata.author).toBeDefined();
      expect(item.metadata.status).toBeDefined();
      expect(item.metadata.chapters).toBeDefined();
    }
  });

  it('search respects pageSize limit (max 8)', async () => {
    const items = await adapter.search('test', 1, 20);
    expect(items).toHaveLength(8);
  });

  it('getDetail returns item with metadata', async () => {
    const detail = await adapter.getDetail('test-comic-item-0');
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('test-comic-item-0');
    expect(detail!.metadata.platform).toBe('test');
    expect(detail!.metadata.author).toBeDefined();
  });

  it('getStreamUrl returns CF proxy URL', async () => {
    const url = await adapter.getStreamUrl('test-item-1');
    expect(url).toContain('cf-proxy.workers.dev');
    expect(url).toContain('test-comic');
  });

  it('healthCheck returns online', async () => {
    const health = await adapter.healthCheck();
    expect(health).toBe('online');
  });
});

// ── Adapter Registry ──────────────────────────────────────────

describe('Comic Adapter Registry', () => {
  describe('createAllComicAdapters', () => {
    it('creates all 14 comic adapters', () => {
      const adapters = createAllComicAdapters();
      expect(adapters.length).toBe(14);
    });

    it('all adapters have type=comic', () => {
      const adapters = createAllComicAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.type).toBe('comic');
      }
    });

    it('all adapters are enabled by default', () => {
      const adapters = createAllComicAdapters();
      for (const adapter of adapters) {
        expect(adapter.config.enabled).toBe(true);
      }
    });

    it('all adapters have unique IDs', () => {
      const adapters = createAllComicAdapters();
      const ids = adapters.map((a) => a.config.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('includes all expected comic sources', () => {
      const adapters = createAllComicAdapters();
      const ids = adapters.map((a) => a.config.id);
      const expected = [
        'manhuagui', 'dmzj', 'copymanga', 'baozimh', 'qimiao',
        'mangadb', 'mangadex', 'mangareader', 'mangakakalot', 'mangapark',
        'webtoon', 'kuaikan', 'qqcomic', 'u17',
      ];
      for (const id of expected) {
        expect(ids).toContain(id);
      }
    });

    it('children-friendly sources have G rating', () => {
      const adapters = createAllComicAdapters();
      const gSources = ['qimiao', 'webtoon', 'kuaikan'];
      for (const id of gSources) {
        const adapter = adapters.find((a) => a.config.id === id);
        expect(adapter!.config.rating).toBe('G');
      }
    });

    it('mainstream comic sources have PG rating', () => {
      const adapters = createAllComicAdapters();
      const pgSources = ['manhuagui', 'dmzj', 'copymanga', 'baozimh', 'mangadb',
        'mangadex', 'mangareader', 'mangakakalot', 'mangapark', 'qqcomic', 'u17'];
      for (const id of pgSources) {
        const adapter = adapters.find((a) => a.config.id === id);
        expect(adapter!.config.rating).toBe('PG');
      }
    });
  });

  describe('getComicAdapterById', () => {
    it('returns adapter for manhuagui', () => {
      const adapter = getComicAdapterById('manhuagui');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('manhuagui');
      expect(adapter!.config.name).toBe('漫画柜');
    });

    it('returns adapter for mangadex', () => {
      const adapter = getComicAdapterById('mangadex');
      expect(adapter).not.toBeNull();
      expect(adapter!.config.id).toBe('mangadex');
      expect(adapter!.config.name).toBe('MangaDex');
    });

    it('returns null for unknown source ID', () => {
      const adapter = getComicAdapterById('nonexistent');
      expect(adapter).toBeNull();
    });

    it('returns correct adapter for each registered source', () => {
      const allIds = getAllComicSourceIds();
      for (const id of allIds) {
        const adapter = getComicAdapterById(id);
        expect(adapter).not.toBeNull();
        expect(adapter!.config.id).toBe(id);
      }
    });
  });

  describe('getAllComicSourceIds', () => {
    it('returns 14 source IDs', () => {
      const ids = getAllComicSourceIds();
      expect(ids.length).toBe(14);
    });

    it('all IDs are non-empty strings', () => {
      const ids = getAllComicSourceIds();
      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });
  });
});
