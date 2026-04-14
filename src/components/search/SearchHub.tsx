'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, X, Clock, TrendingUp, ChevronRight,
  Play, Music, BookOpen, FileText, Radio, Podcast,
  Loader2,
} from 'lucide-react';
import { ageGate } from '@/lib/age-gate';
import { fetchAPI } from '@/lib/api-client';
import type { SourceType, AggregatedItem, SearchResponse } from '@/lib/types';
import ContentCard from '@/components/ui/ContentCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchHubProps {
  /** Initial search query */
  initialQuery?: string;
  /** Restrict search to a specific content type */
  filterType?: SourceType;
}

interface SearchResultGroup {
  type: SourceType;
  label: string;
  icon: React.ReactNode;
  items: AggregatedItem[];
  total: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HISTORY_KEY = 'starhub_search_history';
const MAX_HISTORY = 15;
const DEBOUNCE_MS = 300;
const RESULTS_PER_GROUP = 5;

const TYPE_META: Record<SourceType, { label: string; icon: React.ReactNode }> = {
  video:   { label: '视频', icon: <Play size={16} /> },
  music:   { label: '音乐', icon: <Music size={16} /> },
  comic:   { label: '漫画', icon: <BookOpen size={16} /> },
  novel:   { label: '小说', icon: <FileText size={16} /> },
  anime:   { label: '动漫', icon: <Play size={16} /> },
  live:    { label: '直播', icon: <Radio size={16} /> },
  podcast: { label: '播客', icon: <Podcast size={16} /> },
};

const ALL_TYPES: SourceType[] = ['video', 'music', 'comic', 'novel', 'anime', 'live', 'podcast'];

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function loadHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    // quota exceeded — silently ignore
  }
}

function addToHistory(query: string, current: string[]): string[] {
  const trimmed = query.trim();
  if (!trimmed) return current;
  const filtered = current.filter((h) => h !== trimmed);
  return [trimmed, ...filtered].slice(0, MAX_HISTORY);
}

// ---------------------------------------------------------------------------
// Mock data for hot searches and suggestions (until backend is ready)
// ---------------------------------------------------------------------------

const MOCK_HOT_KEYWORDS = [
  '进击的巨人', '周杰伦', '海贼王', '斗破苍穹',
  '原神', 'YOASOBI', '鬼灭之刃', '三体',
  '英雄联盟', 'Taylor Swift',
];

function getMockSuggestions(query: string): string[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const pool = [
    '进击的巨人 最终季', '进击的巨人 第一季',
    '周杰伦 晴天', '周杰伦 稻香', '周杰伦 演唱会',
    '海贼王 最新集', '海贼王 剧场版',
    '斗破苍穹 动漫', '斗破苍穹 小说',
    '原神 攻略', '原神 角色',
    '鬼灭之刃 无限列车', '三体 动画',
    '英雄联盟 赛事', 'Taylor Swift Eras Tour',
  ];
  return pool.filter((s) => s.toLowerCase().includes(q)).slice(0, 8);
}

function getMockResults(query: string, type?: SourceType): SearchResultGroup[] {
  if (!query.trim()) return [];

  const groups: SearchResultGroup[] = [];
  const types = type ? [type] : ALL_TYPES;

  for (const t of types) {
    const meta = TYPE_META[t];
    // Generate mock items for each type
    const mockItems: AggregatedItem[] = Array.from({ length: 8 }, (_, i) => ({
      id: `${t}-${i}`,
      title: `${query} - ${meta.label}结果 ${i + 1}`,
      cover: `https://images.unsplash.com/photo-${1500000000000 + i * 1000}?w=300&q=80`,
      source: `${meta.label}源${(i % 3) + 1}`,
      sourceId: `src-${t}-${i}`,
      rating: (['G', 'PG', 'PG-13', 'R', 'NC-17'] as const)[i % 5],
      type: t,
      url: `/${t}/${t}-${i}`,
      metadata: {},
    }));

    // Filter by AgeGate
    const filtered = ageGate.filterContent(mockItems);
    if (filtered.length === 0) continue;

    groups.push({
      type: t,
      label: meta.label,
      icon: meta.icon,
      items: filtered.slice(0, RESULTS_PER_GROUP),
      total: filtered.length,
      hasMore: filtered.length > RESULTS_PER_GROUP,
    });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SearchHub({ initialQuery = '', filterType }: SearchHubProps) {
  // --- State ---------------------------------------------------------------
  const [query, setQuery] = useState(initialQuery);
  const [activeType, setActiveType] = useState<SourceType | undefined>(filterType);
  const [history, setHistory] = useState<string[]>([]);
  const [hotKeywords, setHotKeywords] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResultGroup[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Load history & hot keywords on mount --------------------------------
  useEffect(() => {
    setHistory(loadHistory());
    // Try fetching hot keywords from API, fall back to mock
    fetchAPI<{ keywords: string[] }>('/api/search/hot')
      .then((res) => setHotKeywords(res.keywords))
      .catch(() => setHotKeywords(MOCK_HOT_KEYWORDS));
  }, []);

  // --- Close dropdown on outside click -------------------------------------
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Debounced suggestions -----------------------------------------------
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      // Try API first, fall back to mock
      fetchAPI<{ suggestions: string[] }>(`/api/search/suggestions?q=${encodeURIComponent(query)}`)
        .then((res) => setSuggestions(res.suggestions))
        .catch(() => setSuggestions(getMockSuggestions(query)));
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // --- Execute search ------------------------------------------------------
  const executeSearch = useCallback(
    async (searchQuery: string, type?: SourceType) => {
      const trimmed = searchQuery.trim();
      if (!trimmed) return;

      setIsSearching(true);
      setShowDropdown(false);
      setHasSearched(true);

      // Save to history
      const newHistory = addToHistory(trimmed, history);
      setHistory(newHistory);
      saveHistory(newHistory);

      try {
        // Try API first
        const params = new URLSearchParams({ q: trimmed });
        if (type) params.set('type', type);
        const res = await fetchAPI<SearchResponse>(`/api/search?${params.toString()}`);

        // Group results by type
        const grouped = new Map<SourceType, AggregatedItem[]>();
        for (const item of res.items) {
          const existing = grouped.get(item.type) ?? [];
          existing.push(item);
          grouped.set(item.type, existing);
        }

        const groups: SearchResultGroup[] = [];
        const types = type ? [type] : ALL_TYPES;
        for (const t of types) {
          const items = grouped.get(t);
          if (!items || items.length === 0) continue;
          const meta = TYPE_META[t];
          const filtered = ageGate.filterContent(items);
          if (filtered.length === 0) continue;
          groups.push({
            type: t,
            label: meta.label,
            icon: meta.icon,
            items: filtered.slice(0, RESULTS_PER_GROUP),
            total: filtered.length,
            hasMore: filtered.length > RESULTS_PER_GROUP,
          });
        }
        setResults(groups);
      } catch {
        // Fall back to mock results
        setResults(getMockResults(trimmed, type));
      } finally {
        setIsSearching(false);
      }
    },
    [history],
  );

  // --- Handlers ------------------------------------------------------------
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query, activeType);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    executeSearch(suggestion, activeType);
  };

  const handleHistoryClick = (term: string) => {
    setQuery(term);
    executeSearch(term, activeType);
  };

  const handleHotClick = (keyword: string) => {
    setQuery(keyword);
    executeSearch(keyword, activeType);
  };

  const handleTypeFilter = (type: SourceType | undefined) => {
    setActiveType(type);
    if (query.trim()) {
      executeSearch(query, type);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  const removeHistoryItem = (term: string) => {
    const updated = history.filter((h) => h !== term);
    setHistory(updated);
    saveHistory(updated);
  };

  const clearQuery = () => {
    setQuery('');
    setSuggestions([]);
    setResults([]);
    setHasSearched(false);
    inputRef.current?.focus();
  };

  // --- Render ---------------------------------------------------------------
  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Search Input */}
      <div className="relative" ref={dropdownRef}>
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl focus-within:border-[#3ea6ff]/50 focus-within:bg-white/[0.07] transition-colors">
            <Search size={20} className="ml-4 text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              placeholder="搜索视频、音乐、漫画、小说、游戏、直播、播客..."
              className="flex-1 bg-transparent text-white placeholder-gray-500 px-3 py-3 text-sm outline-none"
              aria-label="全局搜索"
            />
            {query && (
              <button
                type="button"
                onClick={clearQuery}
                className="p-2 text-gray-400 hover:text-white transition-colors"
                aria-label="清除搜索"
              >
                <X size={16} />
              </button>
            )}
            <button
              type="submit"
              disabled={isSearching}
              className="px-4 py-3 text-[#3ea6ff] hover:text-white hover:bg-[#3ea6ff]/20 rounded-r-xl transition-colors disabled:opacity-50"
              aria-label="搜索"
            >
              {isSearching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
            </button>
          </div>
        </form>

        {/* Dropdown: suggestions / history / hot */}
        {showDropdown && !hasSearched && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="p-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestionClick(s)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left"
                  >
                    <Search size={14} className="text-gray-500 flex-shrink-0" />
                    <span>{s}</span>
                  </button>
                ))}
              </div>
            )}

            {/* History */}
            {suggestions.length === 0 && history.length > 0 && (
              <div className="p-2">
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-xs text-gray-500 flex items-center gap-1.5">
                    <Clock size={12} />
                    搜索历史
                  </span>
                  <button
                    onClick={clearHistory}
                    className="text-xs text-gray-500 hover:text-[#3ea6ff] transition-colors"
                  >
                    清除
                  </button>
                </div>
                {history.map((h) => (
                  <div key={h} className="flex items-center group">
                    <button
                      onClick={() => handleHistoryClick(h)}
                      className="flex-1 flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left"
                    >
                      <Clock size={14} className="text-gray-500 flex-shrink-0" />
                      <span>{h}</span>
                    </button>
                    <button
                      onClick={() => removeHistoryItem(h)}
                      className="p-1.5 text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`删除 ${h}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Hot Keywords */}
            {suggestions.length === 0 && hotKeywords.length > 0 && (
              <div className="p-2 border-t border-white/5">
                <div className="flex items-center gap-1.5 px-3 py-1.5">
                  <TrendingUp size={12} className="text-[#3ea6ff]" />
                  <span className="text-xs text-gray-500">热门搜索</span>
                </div>
                <div className="flex flex-wrap gap-2 px-3 py-1.5">
                  {hotKeywords.map((kw, i) => (
                    <button
                      key={kw}
                      onClick={() => handleHotClick(kw)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full bg-white/5 text-gray-300 hover:text-[#3ea6ff] hover:bg-[#3ea6ff]/10 transition-colors"
                    >
                      <span className={`w-4 text-center font-medium ${i < 3 ? 'text-[#3ea6ff]' : 'text-gray-500'}`}>
                        {i + 1}
                      </span>
                      {kw}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Type Filter Tabs */}
      <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide">
        <button
          onClick={() => handleTypeFilter(undefined)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
            activeType === undefined
              ? 'bg-[#3ea6ff] text-white'
              : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
          }`}
        >
          全部
        </button>
        {ALL_TYPES.map((t) => {
          const meta = TYPE_META[t];
          return (
            <button
              key={t}
              onClick={() => handleTypeFilter(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                activeType === t
                  ? 'bg-[#3ea6ff] text-white'
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {meta.icon}
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* Search Results */}
      {isSearching && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-[#3ea6ff]" />
          <span className="ml-3 text-gray-400">搜索中...</span>
        </div>
      )}

      {!isSearching && hasSearched && results.length === 0 && (
        <div className="text-center py-16">
          <Search size={48} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400 text-lg">未找到相关结果</p>
          <p className="text-gray-500 text-sm mt-1">试试其他关键词或切换内容类型</p>
        </div>
      )}

      {!isSearching && results.length > 0 && (
        <div className="mt-6 space-y-8">
          {results.map((group) => (
            <section key={group.type}>
              {/* Group Header */}
              <div className="flex items-center justify-between mb-3">
                <h2 className="flex items-center gap-2 text-white font-medium">
                  <span className="text-[#3ea6ff]">{group.icon}</span>
                  {group.label}
                  <span className="text-xs text-gray-500 ml-1">({group.total})</span>
                </h2>
                {group.hasMore && (
                  <a
                    href={`/${group.type === 'anime' ? 'anime' : group.type + 's'}?q=${encodeURIComponent(query)}`}
                    className="flex items-center gap-1 text-xs text-[#3ea6ff] hover:text-[#3ea6ff]/80 transition-colors"
                  >
                    查看更多
                    <ChevronRight size={14} />
                  </a>
                )}
              </div>

              {/* Group Items */}
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {group.items.map((item) => (
                  <ContentCard
                    key={item.id}
                    title={item.title}
                    cover={item.cover}
                    source={item.source}
                    rating={item.rating}
                    type={item.type}
                    size="sm"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.location.href = item.url;
                      }
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Default state: hot keywords when no search has been performed */}
      {!hasSearched && !showDropdown && hotKeywords.length > 0 && (
        <div className="mt-8">
          <h2 className="flex items-center gap-2 text-white font-medium mb-4">
            <TrendingUp size={18} className="text-[#3ea6ff]" />
            热门搜索
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {hotKeywords.map((kw, i) => (
              <button
                key={kw}
                onClick={() => handleHotClick(kw)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left group"
              >
                <span
                  className={`w-5 h-5 flex items-center justify-center rounded text-xs font-bold ${
                    i < 3
                      ? 'bg-[#3ea6ff]/20 text-[#3ea6ff]'
                      : 'bg-white/5 text-gray-500'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="text-sm text-gray-300 group-hover:text-white truncate">
                  {kw}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
