import { describe, it, expect } from 'vitest';
import {
  RATING_ORDER,
  MODE_MAX_RATING,
  type ContentRating,
  type SourceType,
  type UserMode,
  type SourceHealth,
  type SourceConfig,
  type AggregatedItem,
  type SearchRequest,
  type SearchResponse,
} from '../types';

describe('ContentRating type and RATING_ORDER', () => {
  it('should contain exactly 5 MPAA ratings in ascending restrictiveness', () => {
    expect(RATING_ORDER).toEqual(['G', 'PG', 'PG-13', 'R', 'NC-17']);
    expect(RATING_ORDER).toHaveLength(5);
  });

  it('should allow comparison via index', () => {
    const isMoreRestrictive = (a: ContentRating, b: ContentRating) =>
      RATING_ORDER.indexOf(a) > RATING_ORDER.indexOf(b);

    expect(isMoreRestrictive('PG-13', 'G')).toBe(true);
    expect(isMoreRestrictive('NC-17', 'R')).toBe(true);
    expect(isMoreRestrictive('G', 'PG')).toBe(false);
  });
});

describe('MODE_MAX_RATING', () => {
  it('should map all 5 user modes to correct max ratings', () => {
    expect(MODE_MAX_RATING.child).toBe('G');
    expect(MODE_MAX_RATING.teen).toBe('PG-13');
    expect(MODE_MAX_RATING.mature).toBe('R');
    expect(MODE_MAX_RATING.adult).toBe('NC-17');
    expect(MODE_MAX_RATING.elder).toBe('PG');
  });

  it('should cover all UserMode values', () => {
    const modes: UserMode[] = ['child', 'teen', 'mature', 'adult', 'elder'];
    for (const mode of modes) {
      expect(MODE_MAX_RATING[mode]).toBeDefined();
    }
  });
});

describe('SourceType', () => {
  it('should accept all 7 valid source types', () => {
    const types: SourceType[] = [
      'video',
      'music',
      'comic',
      'novel',
      'anime',
      'live',
      'podcast',
    ];
    // Type-level check — if this compiles, the types are correct
    expect(types).toHaveLength(7);
  });
});

describe('SourceConfig interface', () => {
  it('should accept a valid source config object', () => {
    const config: SourceConfig = {
      id: 'bilibili',
      name: 'Bilibili',
      type: 'video',
      enabled: true,
      rating: 'PG',
      priority: 80,
      searchUrl: 'https://api.bilibili.com/search',
      parseRules: '{}',
      timeout: 10000,
      health: 'online',
      avgResponseTime: 200,
      successRate: 99,
      failCount: 0,
      lastChecked: '2024-01-01T00:00:00Z',
    };
    expect(config.id).toBe('bilibili');
    expect(config.type).toBe('video');
    expect(config.health).toBe('online');
  });
});

describe('AggregatedItem interface', () => {
  it('should accept a valid aggregated item', () => {
    const item: AggregatedItem = {
      id: 'vid-001',
      title: 'Test Video',
      cover: 'https://example.com/cover.jpg',
      source: 'Bilibili',
      sourceId: 'BV1234',
      rating: 'PG',
      type: 'video',
      url: '/api/video/stream/vid-001',
      metadata: { duration: 300, views: 10000 },
      tags: ['comedy', 'animation'],
    };
    expect(item.id).toBe('vid-001');
    expect(item.tags).toContain('comedy');
  });
});

describe('SearchRequest / SearchResponse interfaces', () => {
  it('should accept a minimal search request', () => {
    const req: SearchRequest = { query: 'hello' };
    expect(req.query).toBe('hello');
    expect(req.type).toBeUndefined();
  });

  it('should accept a full search request', () => {
    const req: SearchRequest = {
      query: 'naruto',
      type: 'anime',
      rating: 'PG-13',
      tags: ['action', 'ninja'],
      region: ['JP'],
      page: 1,
      pageSize: 20,
      sortBy: 'popular',
    };
    expect(req.sortBy).toBe('popular');
  });

  it('should accept a valid search response', () => {
    const res: SearchResponse = {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      sources: [{ name: 'Bilibili', count: 0, health: 'online' as SourceHealth }],
    };
    expect(res.sources).toHaveLength(1);
  });
});
