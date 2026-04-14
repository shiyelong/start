'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Tag, X, ChevronDown, ChevronUp, Save, Bookmark,
  Trash2, Filter,
} from 'lucide-react';
import { ageGate } from '@/lib/age-gate';
import type { ContentRating } from '@/lib/types';
import { RATING_ORDER } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TagItem {
  id: string;
  label: string;
  /** Optional MPAA rating associated with this tag — used for AgeGate filtering */
  rating?: ContentRating;
}

export interface TagGroup {
  id: string;
  name: string;
  tags: TagItem[];
}

export interface QuickFilter {
  id: string;
  name: string;
  tagIds: string[];
}

export interface TagFilterProps {
  /** Tag groups to display */
  groups: TagGroup[];
  /** Currently selected tag IDs */
  selectedTags?: string[];
  /** Called when selected tags change */
  onChange: (selectedTagIds: string[]) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUICK_FILTERS_KEY = 'starhub_quick_filters';

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function loadQuickFilters(): QuickFilter[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUICK_FILTERS_KEY);
    return raw ? (JSON.parse(raw) as QuickFilter[]) : [];
  } catch {
    return [];
  }
}

function saveQuickFilters(filters: QuickFilter[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(QUICK_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // quota exceeded — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TagFilter({
  groups,
  selectedTags: controlledSelected,
  onChange,
}: TagFilterProps) {
  // --- State ---------------------------------------------------------------
  const [selected, setSelected] = useState<Set<string>>(
    new Set(controlledSelected ?? []),
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([]);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveInputValue, setSaveInputValue] = useState('');

  // Sync controlled prop
  useEffect(() => {
    if (controlledSelected) {
      setSelected(new Set(controlledSelected));
    }
  }, [controlledSelected]);

  // Load quick filters on mount
  useEffect(() => {
    setQuickFilters(loadQuickFilters());
  }, []);

  // --- AgeGate filtering ---------------------------------------------------
  const maxRatingIndex = useMemo(() => {
    const mode = ageGate.getMode();
    const maxRating = (
      { child: 'G', teen: 'PG-13', mature: 'R', adult: 'NC-17', elder: 'PG' } as Record<string, ContentRating>
    )[mode] ?? 'NC-17';
    return RATING_ORDER.indexOf(maxRating);
  }, []);

  /** Filter out tags whose rating exceeds the user's AgeGate level */
  const filterTagsByAgeGate = useCallback(
    (tags: TagItem[]): TagItem[] =>
      tags.filter((tag) => {
        if (!tag.rating) return true;
        return RATING_ORDER.indexOf(tag.rating) <= maxRatingIndex;
      }),
    [maxRatingIndex],
  );

  // --- Filtered groups (after AgeGate) ------------------------------------
  const filteredGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          tags: filterTagsByAgeGate(group.tags),
        }))
        .filter((group) => group.tags.length > 0),
    [groups, filterTagsByAgeGate],
  );

  // --- Handlers ------------------------------------------------------------
  const toggleTag = useCallback(
    (tagId: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(tagId)) {
          next.delete(tagId);
        } else {
          next.add(tagId);
        }
        onChange(Array.from(next));
        return next;
      });
    },
    [onChange],
  );

  const removeTag = useCallback(
    (tagId: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(tagId);
        onChange(Array.from(next));
        return next;
      });
    },
    [onChange],
  );

  const clearAll = useCallback(() => {
    setSelected(new Set());
    onChange([]);
  }, [onChange]);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // --- Quick filter handlers -----------------------------------------------
  const handleSaveQuickFilter = useCallback(() => {
    const name = saveInputValue.trim();
    if (!name || selected.size === 0) return;

    const newFilter: QuickFilter = {
      id: `qf-${Date.now()}`,
      name,
      tagIds: Array.from(selected),
    };
    const updated = [...quickFilters, newFilter];
    setQuickFilters(updated);
    saveQuickFilters(updated);
    setShowSaveInput(false);
    setSaveInputValue('');
  }, [saveInputValue, selected, quickFilters]);

  const applyQuickFilter = useCallback(
    (filter: QuickFilter) => {
      const next = new Set(filter.tagIds);
      setSelected(next);
      onChange(Array.from(next));
    },
    [onChange],
  );

  const deleteQuickFilter = useCallback(
    (filterId: string) => {
      const updated = quickFilters.filter((f) => f.id !== filterId);
      setQuickFilters(updated);
      saveQuickFilters(updated);
    },
    [quickFilters],
  );

  // --- Build a lookup map for tag labels -----------------------------------
  const tagLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of filteredGroups) {
      for (const tag of group.tags) {
        map.set(tag.id, tag.label);
      }
    }
    return map;
  }, [filteredGroups]);

  const selectedArray = Array.from(selected);

  // --- Render ---------------------------------------------------------------
  return (
    <div className="w-full" role="region" aria-label="标签筛选">
      {/* Selected tags pills + clear all */}
      {selectedArray.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Filter size={12} />
            已选:
          </span>
          {selectedArray.map((tagId) => (
            <span
              key={tagId}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#3ea6ff]/20 text-[#3ea6ff] text-xs"
            >
              {tagLabelMap.get(tagId) ?? tagId}
              <button
                onClick={() => removeTag(tagId)}
                className="hover:text-white transition-colors"
                aria-label={`移除标签 ${tagLabelMap.get(tagId) ?? tagId}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <button
            onClick={clearAll}
            className="text-xs text-gray-400 hover:text-white transition-colors ml-1"
          >
            清除全部
          </button>

          {/* Save as quick filter */}
          {!showSaveInput ? (
            <button
              onClick={() => setShowSaveInput(true)}
              className="text-xs text-gray-400 hover:text-[#3ea6ff] transition-colors flex items-center gap-1 ml-2"
              aria-label="保存为快捷筛选"
            >
              <Save size={12} />
              保存
            </button>
          ) : (
            <div className="flex items-center gap-1 ml-2">
              <input
                type="text"
                value={saveInputValue}
                onChange={(e) => setSaveInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveQuickFilter();
                  if (e.key === 'Escape') setShowSaveInput(false);
                }}
                placeholder="筛选名称"
                className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-xs text-white placeholder-gray-500 outline-none focus:border-[#3ea6ff]/50 w-24"
                autoFocus
              />
              <button
                onClick={handleSaveQuickFilter}
                className="text-xs text-[#3ea6ff] hover:text-white transition-colors"
              >
                确定
              </button>
              <button
                onClick={() => setShowSaveInput(false)}
                className="text-xs text-gray-500 hover:text-white transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Quick filters */}
      {quickFilters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Bookmark size={12} />
            快捷筛选:
          </span>
          {quickFilters.map((qf) => (
            <div key={qf.id} className="inline-flex items-center group">
              <button
                onClick={() => applyQuickFilter(qf)}
                className="px-2 py-0.5 rounded-l-full bg-white/5 text-xs text-gray-300 hover:text-[#3ea6ff] hover:bg-[#3ea6ff]/10 transition-colors"
              >
                {qf.name}
              </button>
              <button
                onClick={() => deleteQuickFilter(qf.id)}
                className="px-1 py-0.5 rounded-r-full bg-white/5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100"
                aria-label={`删除快捷筛选 ${qf.name}`}
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tag groups */}
      <div className="space-y-2">
        {filteredGroups.map((group) => {
          const isCollapsed = collapsedGroups.has(group.id);
          return (
            <div key={group.id} className="rounded-lg bg-white/[0.02]">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-300 hover:text-white transition-colors"
                aria-expanded={!isCollapsed}
                aria-controls={`tag-group-${group.id}`}
              >
                <span className="flex items-center gap-1.5">
                  <Tag size={14} className="text-[#3ea6ff]" />
                  {group.name}
                  <span className="text-xs text-gray-600">
                    ({group.tags.length})
                  </span>
                </span>
                {isCollapsed ? (
                  <ChevronDown size={14} className="text-gray-500" />
                ) : (
                  <ChevronUp size={14} className="text-gray-500" />
                )}
              </button>

              {/* Group tags */}
              {!isCollapsed && (
                <div
                  id={`tag-group-${group.id}`}
                  className="px-3 pb-2 flex gap-2 overflow-x-auto scrollbar-hide md:flex-wrap md:overflow-x-visible"
                >
                  {group.tags.map((tag) => {
                    const isSelected = selected.has(tag.id);
                    return (
                      <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                          isSelected
                            ? 'bg-[#3ea6ff] text-white'
                            : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                        }`}
                        aria-pressed={isSelected}
                      >
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
