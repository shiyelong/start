import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ContentRating } from '@/lib/types';
import { RATING_ORDER } from '@/lib/types';

// ---------------------------------------------------------------------------
// We test the pure logic extracted from TagFilter:
//   1. AgeGate-based tag filtering
//   2. Quick filter localStorage persistence
//   3. Tag selection (AND logic)
// ---------------------------------------------------------------------------

// --- AgeGate tag filtering logic (mirrors component logic) -----------------

interface TagItem {
  id: string;
  label: string;
  rating?: ContentRating;
}

interface TagGroup {
  id: string;
  name: string;
  tags: TagItem[];
}

type UserMode = 'child' | 'teen' | 'mature' | 'adult' | 'elder';

const MODE_MAX_RATING: Record<UserMode, ContentRating> = {
  child: 'G',
  teen: 'PG-13',
  mature: 'R',
  adult: 'NC-17',
  elder: 'PG',
};

function filterTagsByAgeGate(tags: TagItem[], mode: UserMode): TagItem[] {
  const maxRating = MODE_MAX_RATING[mode];
  const maxIndex = RATING_ORDER.indexOf(maxRating);
  return tags.filter((tag) => {
    if (!tag.rating) return true;
    return RATING_ORDER.indexOf(tag.rating) <= maxIndex;
  });
}

function filterGroupsByAgeGate(groups: TagGroup[], mode: UserMode): TagGroup[] {
  return groups
    .map((group) => ({
      ...group,
      tags: filterTagsByAgeGate(group.tags, mode),
    }))
    .filter((group) => group.tags.length > 0);
}

// --- Quick filter persistence logic ----------------------------------------

interface QuickFilter {
  id: string;
  name: string;
  tagIds: string[];
}

const QUICK_FILTERS_KEY = 'starhub_quick_filters';

function loadQuickFilters(storage: Record<string, string>): QuickFilter[] {
  try {
    const raw = storage[QUICK_FILTERS_KEY];
    return raw ? (JSON.parse(raw) as QuickFilter[]) : [];
  } catch {
    return [];
  }
}

function saveQuickFilters(
  filters: QuickFilter[],
  storage: Record<string, string>,
): void {
  storage[QUICK_FILTERS_KEY] = JSON.stringify(filters);
}

// --- AND selection logic ---------------------------------------------------

function applyAndFilter<T extends { tags?: string[] }>(
  items: T[],
  selectedTags: string[],
): T[] {
  if (selectedTags.length === 0) return items;
  return items.filter((item) =>
    selectedTags.every((tag) => item.tags?.includes(tag)),
  );
}

// ===========================================================================
// Tests
// ===========================================================================

describe('TagFilter — AgeGate tag filtering', () => {
  const sampleTags: TagItem[] = [
    { id: 'g-tag', label: 'General', rating: 'G' },
    { id: 'pg-tag', label: 'Parental Guidance', rating: 'PG' },
    { id: 'pg13-tag', label: 'PG-13', rating: 'PG-13' },
    { id: 'r-tag', label: 'Restricted', rating: 'R' },
    { id: 'nc17-tag', label: 'Adults Only', rating: 'NC-17' },
    { id: 'no-rating', label: 'No Rating' },
  ];

  it('child mode only shows G and unrated tags', () => {
    const result = filterTagsByAgeGate(sampleTags, 'child');
    const ids = result.map((t) => t.id);
    expect(ids).toEqual(['g-tag', 'no-rating']);
  });

  it('teen mode shows up to PG-13 and unrated tags', () => {
    const result = filterTagsByAgeGate(sampleTags, 'teen');
    const ids = result.map((t) => t.id);
    expect(ids).toEqual(['g-tag', 'pg-tag', 'pg13-tag', 'no-rating']);
  });

  it('mature mode shows up to R and unrated tags', () => {
    const result = filterTagsByAgeGate(sampleTags, 'mature');
    const ids = result.map((t) => t.id);
    expect(ids).toEqual(['g-tag', 'pg-tag', 'pg13-tag', 'r-tag', 'no-rating']);
  });

  it('adult mode shows all tags', () => {
    const result = filterTagsByAgeGate(sampleTags, 'adult');
    expect(result).toHaveLength(6);
  });

  it('elder mode shows up to PG and unrated tags', () => {
    const result = filterTagsByAgeGate(sampleTags, 'elder');
    const ids = result.map((t) => t.id);
    expect(ids).toEqual(['g-tag', 'pg-tag', 'no-rating']);
  });

  it('filters out entire groups that become empty', () => {
    const groups: TagGroup[] = [
      {
        id: 'adult-only',
        name: 'Adult Content',
        tags: [{ id: 'nc17-only', label: 'NC-17 Only', rating: 'NC-17' }],
      },
      {
        id: 'general',
        name: 'General',
        tags: [{ id: 'g-only', label: 'G Only', rating: 'G' }],
      },
    ];
    const result = filterGroupsByAgeGate(groups, 'child');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('general');
  });
});

describe('TagFilter — Quick filter persistence', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
  });

  it('returns empty array when no filters saved', () => {
    expect(loadQuickFilters(storage)).toEqual([]);
  });

  it('saves and loads quick filters', () => {
    const filters: QuickFilter[] = [
      { id: 'qf-1', name: 'My Filter', tagIds: ['tag-a', 'tag-b'] },
    ];
    saveQuickFilters(filters, storage);
    const loaded = loadQuickFilters(storage);
    expect(loaded).toEqual(filters);
  });

  it('handles corrupted data gracefully', () => {
    storage[QUICK_FILTERS_KEY] = 'not-valid-json{{{';
    expect(loadQuickFilters(storage)).toEqual([]);
  });

  it('supports multiple quick filters', () => {
    const filters: QuickFilter[] = [
      { id: 'qf-1', name: 'Filter A', tagIds: ['a'] },
      { id: 'qf-2', name: 'Filter B', tagIds: ['b', 'c'] },
      { id: 'qf-3', name: 'Filter C', tagIds: ['d', 'e', 'f'] },
    ];
    saveQuickFilters(filters, storage);
    expect(loadQuickFilters(storage)).toHaveLength(3);
  });
});

describe('TagFilter — AND combination filtering', () => {
  const items = [
    { id: '1', title: 'Item 1', tags: ['action', 'sci-fi'] },
    { id: '2', title: 'Item 2', tags: ['romance', 'comedy'] },
    { id: '3', title: 'Item 3', tags: ['action', 'comedy'] },
    { id: '4', title: 'Item 4', tags: ['action', 'sci-fi', 'comedy'] },
    { id: '5', title: 'Item 5', tags: undefined },
  ];

  it('returns all items when no tags selected', () => {
    expect(applyAndFilter(items, [])).toHaveLength(5);
  });

  it('filters by single tag', () => {
    const result = applyAndFilter(items, ['action']);
    expect(result.map((i) => i.id)).toEqual(['1', '3', '4']);
  });

  it('AND filters by multiple tags', () => {
    const result = applyAndFilter(items, ['action', 'comedy']);
    expect(result.map((i) => i.id)).toEqual(['3', '4']);
  });

  it('returns empty when no items match all tags', () => {
    const result = applyAndFilter(items, ['romance', 'sci-fi']);
    expect(result).toHaveLength(0);
  });

  it('excludes items with undefined tags', () => {
    const result = applyAndFilter(items, ['action']);
    expect(result.every((i) => i.tags !== undefined)).toBe(true);
  });
});
