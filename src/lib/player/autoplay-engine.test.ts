import { describe, it, expect } from 'vitest';
import {
  AutoPlayEngine,
  REASON_PRIORITY,
  type AutoPlayCandidate,
} from './autoplay-engine';
import type { AggregatedItem } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<AggregatedItem> = {}): AggregatedItem {
  return {
    id: 'item-1',
    title: 'Test Video',
    cover: '',
    source: 'test-source',
    sourceId: 'src-1',
    rating: 'PG',
    type: 'video',
    url: 'https://example.com/v/1',
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getNextCandidates
// ---------------------------------------------------------------------------

describe('AutoPlayEngine.getNextCandidates', () => {
  it('returns empty array when pool is empty', () => {
    const engine = new AutoPlayEngine([]);
    const current = makeItem();
    expect(engine.getNextCandidates(current)).toEqual([]);
  });

  it('excludes the current item from candidates', () => {
    const current = makeItem({ id: 'current' });
    const engine = new AutoPlayEngine([current]);
    expect(engine.getNextCandidates(current)).toEqual([]);
  });

  it('classifies next-episode correctly', () => {
    const current = makeItem({
      id: 'ep1',
      source: 'bilibili',
      type: 'video',
      metadata: { episode: 1, seriesId: 'series-a' },
    });
    const nextEp = makeItem({
      id: 'ep2',
      source: 'bilibili',
      type: 'video',
      metadata: { episode: 2, seriesId: 'series-a' },
    });
    const engine = new AutoPlayEngine([nextEp]);
    const candidates = engine.getNextCandidates(current);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].reason).toBe('next-episode');
    expect(candidates[0].priority).toBe(REASON_PRIORITY['next-episode']);
  });

  it('classifies same-channel correctly', () => {
    const current = makeItem({
      id: 'v1',
      source: 'youtube',
      metadata: { channelId: 'ch-1' },
    });
    const sameChannel = makeItem({
      id: 'v2',
      source: 'youtube',
      metadata: { channelId: 'ch-1' },
    });
    const engine = new AutoPlayEngine([sameChannel]);
    const candidates = engine.getNextCandidates(current);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].reason).toBe('same-channel');
    expect(candidates[0].priority).toBe(REASON_PRIORITY['same-channel']);
  });

  it('classifies recommended for unrelated items', () => {
    const current = makeItem({ id: 'v1', source: 'bilibili' });
    const other = makeItem({ id: 'v2', source: 'youtube' });
    const engine = new AutoPlayEngine([other]);
    const candidates = engine.getNextCandidates(current);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].reason).toBe('recommended');
    expect(candidates[0].priority).toBe(REASON_PRIORITY['recommended']);
  });

  it('sorts candidates by priority descending', () => {
    const current = makeItem({
      id: 'ep1',
      source: 'bilibili',
      type: 'video',
      metadata: { episode: 1, seriesId: 's1', channelId: 'ch-1' },
    });

    const nextEp = makeItem({
      id: 'ep2',
      source: 'bilibili',
      type: 'video',
      metadata: { episode: 2, seriesId: 's1', channelId: 'ch-1' },
    });
    const sameChannel = makeItem({
      id: 'v3',
      source: 'bilibili',
      metadata: { channelId: 'ch-1' },
    });
    const recommended = makeItem({
      id: 'v4',
      source: 'youtube',
    });

    const engine = new AutoPlayEngine([recommended, sameChannel, nextEp]);
    const candidates = engine.getNextCandidates(current);

    expect(candidates).toHaveLength(3);
    expect(candidates[0].reason).toBe('next-episode');
    expect(candidates[1].reason).toBe('same-channel');
    expect(candidates[2].reason).toBe('recommended');
  });

  it('does not classify as next-episode when series differs', () => {
    const current = makeItem({
      id: 'ep1',
      source: 'bilibili',
      type: 'video',
      metadata: { episode: 1, seriesId: 'series-a' },
    });
    const differentSeries = makeItem({
      id: 'ep2',
      source: 'bilibili',
      type: 'video',
      metadata: { episode: 2, seriesId: 'series-b' },
    });
    const engine = new AutoPlayEngine([differentSeries]);
    const candidates = engine.getNextCandidates(current);

    expect(candidates).toHaveLength(1);
    // Different series, same source — falls to same-channel or recommended
    expect(candidates[0].reason).not.toBe('next-episode');
  });

  it('does not classify as next-episode when episode gap > 1', () => {
    const current = makeItem({
      id: 'ep1',
      source: 'bilibili',
      type: 'video',
      metadata: { episode: 1, seriesId: 's1' },
    });
    const ep3 = makeItem({
      id: 'ep3',
      source: 'bilibili',
      type: 'video',
      metadata: { episode: 3, seriesId: 's1' },
    });
    const engine = new AutoPlayEngine([ep3]);
    const candidates = engine.getNextCandidates(current);

    expect(candidates[0].reason).not.toBe('next-episode');
  });
});

// ---------------------------------------------------------------------------
// getTopCandidate
// ---------------------------------------------------------------------------

describe('AutoPlayEngine.getTopCandidate', () => {
  const engine = new AutoPlayEngine();

  it('returns null for empty array', () => {
    expect(engine.getTopCandidate([])).toBeNull();
  });

  it('returns the single candidate when only one exists', () => {
    const c: AutoPlayCandidate = {
      item: makeItem(),
      reason: 'recommended',
      priority: 1,
    };
    expect(engine.getTopCandidate([c])).toBe(c);
  });

  it('returns the highest priority candidate', () => {
    const low: AutoPlayCandidate = {
      item: makeItem({ id: 'a' }),
      reason: 'recommended',
      priority: 1,
    };
    const mid: AutoPlayCandidate = {
      item: makeItem({ id: 'b' }),
      reason: 'same-channel',
      priority: 2,
    };
    const high: AutoPlayCandidate = {
      item: makeItem({ id: 'c' }),
      reason: 'next-episode',
      priority: 3,
    };

    // Pass in shuffled order
    expect(engine.getTopCandidate([mid, low, high])).toBe(high);
  });
});

// ---------------------------------------------------------------------------
// setPool
// ---------------------------------------------------------------------------

describe('AutoPlayEngine.setPool', () => {
  it('replaces the pool and produces new candidates', () => {
    const engine = new AutoPlayEngine([]);
    const current = makeItem({ id: 'current' });

    expect(engine.getNextCandidates(current)).toHaveLength(0);

    engine.setPool([makeItem({ id: 'new-1' }), makeItem({ id: 'new-2' })]);
    expect(engine.getNextCandidates(current)).toHaveLength(2);
  });
});
