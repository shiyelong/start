'use client';

import { useState, useCallback, useMemo } from 'react';
import Header from '@/components/Header';
import RatingBadge from '@/components/ui/RatingBadge';
import ComicReader from '@/components/reader/ComicReader';
import type { ComicPage } from '@/components/reader/ComicReader';
import { ageGate } from '@/lib/age-gate';
import type { ContentRating, AggregatedItem } from '@/lib/types';
import {
  Search,
  X,
  Eye,
  Clock,
  Filter,
  BookOpen,
  ShieldAlert,
  Lock,
  SlidersHorizontal,
  ArrowUpDown,
  Flame,
  CalendarDays,
  Star,
  Shuffle,
  Palette,
  Languages,
  FileText,
  Bookmark,
  Heart,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// AgeGate access check
// ---------------------------------------------------------------------------

function useAdultAccess(): boolean {
  return ageGate.canAccess('NC-17');
}

// ---------------------------------------------------------------------------
// Filter dimension definitions
// ---------------------------------------------------------------------------

interface FilterOption {
  id: string;
  label: string;
}

const GENRE_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部类型' },
  { id: 'pure-love', label: '纯爱' },
  { id: 'harem', label: '后宫' },
  { id: 'tentacle', label: '触手' },
  { id: 'ntr', label: 'NTR/寝取' },
  { id: 'yuri', label: '百合' },
  { id: 'bl', label: '耽美/BL' },
  { id: 'school', label: '校园' },
  { id: 'fantasy', label: '奇幻' },
  { id: 'bdsm', label: '调教/SM' },
  { id: 'humiliation', label: '凌辱' },
  { id: 'chijo', label: '痴女' },
  { id: 'milf', label: '人妻/熟女' },
  { id: 'big-breasts', label: '巨乳' },
  { id: 'small-breasts', label: '贫乳' },
  { id: 'loli-style', label: '萝莉风' },
  { id: 'shota-style', label: '正太风' },
  { id: 'pregnant', label: '怀孕' },
  { id: 'lactation', label: '母乳' },
  { id: 'hypnosis', label: '催眠' },
  { id: 'anal', label: '肛交' },
  { id: 'orgy', label: '群交' },
  { id: 'monster', label: '人外/怪物' },
  { id: 'full-color', label: '全彩' },
  { id: 'bw', label: '黑白' },
];

const LANGUAGE_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部语言' },
  { id: 'cn', label: '中文翻译' },
  { id: 'en', label: '英文翻译' },
  { id: 'jp', label: '日文原版' },
  { id: 'kr', label: '韩文原版' },
];

const STYLE_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部画风' },
  { id: 'jp-manga', label: '日漫' },
  { id: 'kr-webtoon', label: '韩漫(竖屏彩漫)' },
  { id: 'western', label: '欧美' },
  { id: 'cn-manga', label: '国漫' },
  { id: 'doujinshi', label: '同人志' },
];

const PAGE_COUNT_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部页数' },
  { id: 'short', label: '短篇(<30页)' },
  { id: 'medium', label: '中篇(30-100页)' },
  { id: 'long', label: '长篇(>100页)' },
];

const SORT_OPTIONS: FilterOption[] = [
  { id: 'hot', label: '热度' },
  { id: 'latest', label: '最新' },
  { id: 'rating', label: '评分' },
  { id: 'favorites', label: '收藏数' },
  { id: 'random', label: '随机' },
];

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface AdultComic {
  id: string;
  title: string;
  cover: string;
  source: string;
  sourceId: string;
  genre: string;
  language: string;
  style: string;
  pageCategory: string;
  rating: ContentRating;
  pages: number;
  chapters: number;
  views: number;
  score: number;
  favorites: number;
  date: string;
  url: string;
}

function generateMockAdultComics(): AdultComic[] {
  const genres = GENRE_OPTIONS.filter(g => g.id !== 'all').map(g => g.id);
  const languages = LANGUAGE_OPTIONS.filter(l => l.id !== 'all').map(l => l.id);
  const styles = STYLE_OPTIONS.filter(s => s.id !== 'all').map(s => s.id);
  const pageCats = PAGE_COUNT_OPTIONS.filter(p => p.id !== 'all').map(p => p.id);

  const titles = [
    '禁忌花园', '触手迷宫', '校园秘事', '异世界温泉',
    '后宫学院', '百合庭院', '催眠教室', '人妻日记',
    '深夜护士', '女仆物语', '修女告解', '泳装竞技',
    '机甲少女', '恐怖之夜', '搞笑日常', '奇幻冒险',
    '痴女电车', '母乳工坊', '怀孕物语', '群交学园',
    '人外娘日记', '正太冒险', '萝莉魔法', '巨乳骑士',
    '贫乳忍者', '肛交特训', '调教学院', '凌辱地牢',
    '寝取之夏', '全彩合集', '黑白经典', '同人精选',
    '韩漫精选', '国漫新作', '欧美经典', '日漫大全',
  ];

  const sources = [
    'Source-A', 'Source-B', 'Source-C', 'Source-D', 'Source-E',
    'Source-F', 'Source-G', 'Source-H', 'Source-I', 'Source-J', 'Source-K',
  ];

  const covers = [
    'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80',
    'https://images.unsplash.com/photo-1560972550-aba3456b5564?w=400&q=80',
    'https://images.unsplash.com/photo-1541562232579-512a21360020?w=400&q=80',
    'https://images.unsplash.com/photo-1607604276583-3296cae09a18?w=400&q=80',
    'https://images.unsplash.com/photo-1613376023733-0a73315d9b06?w=400&q=80',
    'https://images.unsplash.com/photo-1618336753974-aae8e04506aa?w=400&q=80',
    'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=400&q=80',
    'https://images.unsplash.com/photo-1611457194403-d3f8c5154dc2?w=400&q=80',
  ];

  const comicList: AdultComic[] = [];
  for (let i = 0; i < titles.length; i++) {
    const pageCat = pageCats[i % pageCats.length];
    const totalPages = pageCat === 'short' ? (i % 20) + 10 : pageCat === 'medium' ? (i % 70) + 30 : (i % 200) + 100;

    comicList.push({
      id: `ac-${i + 1}`,
      title: titles[i],
      cover: covers[i % covers.length],
      source: sources[i % sources.length],
      sourceId: `adult-comic-src-${(i % 11) + 1}`,
      genre: genres[i % genres.length],
      language: languages[i % languages.length],
      style: styles[i % styles.length],
      pageCategory: pageCat,
      rating: 'NC-17',
      pages: totalPages,
      chapters: Math.max(1, Math.floor(totalPages / 25)),
      views: Math.floor(Math.random() * 2000000) + 5000,
      score: Math.round((Math.random() * 3 + 7) * 10) / 10,
      favorites: Math.floor(Math.random() * 50000) + 100,
      date: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
      url: `/api/zone/comic/${i + 1}`,
    });
  }
  return comicList;
}

const ALL_ADULT_COMICS = generateMockAdultComics();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

// ---------------------------------------------------------------------------
// Mock comic pages for reader
// ---------------------------------------------------------------------------

function generateMockComicPages(count: number): ComicPage[] {
  return Array.from({ length: count }, (_, i) => ({
    url: `https://images.unsplash.com/photo-${1578632767115 + i * 1000}?w=800&q=80`,
    width: 800,
    height: 1200,
  }));
}

// ---------------------------------------------------------------------------
// Filter row component
// ---------------------------------------------------------------------------

interface FilterRowProps {
  label: string;
  icon: React.ReactNode;
  options: FilterOption[];
  value: string;
  onChange: (id: string) => void;
}

function FilterRow({ label, icon, options, value, onChange }: FilterRowProps) {
  return (
    <div>
      <p className="text-[11px] text-[#666] mb-2 flex items-center gap-1">
        {icon} {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`px-3 py-1 rounded-full text-[12px] border transition ${
              value === opt.id
                ? 'bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/40 font-medium'
                : 'bg-transparent text-[#888] border-[#333] hover:text-white hover:border-[#555]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Access Denied component
// ---------------------------------------------------------------------------

function AccessDenied() {
  return (
    <>
      <Header />
      <main className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
            <Lock size={36} className="text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">访问受限</h1>
          <p className="text-[#8a8a8a] text-sm leading-relaxed mb-6">
            此区域包含 NC-17 级内容，仅限成人模式访问。
            请在设置中切换到成人模式后再访问。
          </p>
          <div className="flex items-center justify-center gap-2 text-[#666] text-xs">
            <ShieldAlert size={14} />
            <span>需要成人模式权限</span>
          </div>
        </div>
      </main>
    </>
  );
}

// ===========================================================================
// Main Page Component
// ===========================================================================

export default function ZoneComicsPage() {
  // --- AgeGate check ---
  const hasAccess = useAdultAccess();

  // --- Filter state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeGenre, setActiveGenre] = useState('all');
  const [activeLanguage, setActiveLanguage] = useState('all');
  const [activeStyle, setActiveStyle] = useState('all');
  const [activePageCount, setActivePageCount] = useState('all');
  const [activeSort, setActiveSort] = useState('hot');

  // --- Reader state ---
  const [readingComic, setReadingComic] = useState<AdultComic | null>(null);
  const [readerPages, setReaderPages] = useState<ComicPage[]>([]);

  // --- Access gate ---
  if (!hasAccess) {
    return <AccessDenied />;
  }

  // --- Active filter count ---
  const activeFilterCount = [
    activeGenre !== 'all',
    activeLanguage !== 'all',
    activeStyle !== 'all',
    activePageCount !== 'all',
  ].filter(Boolean).length;

  // --- Filtered & sorted comics ---
  const filteredComics = useMemo(() => {
    let list = [...ALL_ADULT_COMICS];

    if (activeGenre !== 'all') {
      list = list.filter((c) => c.genre === activeGenre);
    }
    if (activeLanguage !== 'all') {
      list = list.filter((c) => c.language === activeLanguage);
    }
    if (activeStyle !== 'all') {
      list = list.filter((c) => c.style === activeStyle);
    }
    if (activePageCount !== 'all') {
      list = list.filter((c) => c.pageCategory === activePageCount);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.source.toLowerCase().includes(q)
      );
    }

    // Sort
    switch (activeSort) {
      case 'latest':
        list.sort((a, b) => b.date.localeCompare(a.date));
        break;
      case 'rating':
        list.sort((a, b) => b.score - a.score);
        break;
      case 'favorites':
        list.sort((a, b) => b.favorites - a.favorites);
        break;
      case 'random':
        list.sort(() => Math.random() - 0.5);
        break;
      case 'hot':
      default:
        list.sort((a, b) => b.views * b.score - a.views * a.score);
        break;
    }

    return list;
  }, [activeGenre, activeLanguage, activeStyle, activePageCount, searchQuery, activeSort]);

  // --- Handlers ---
  const handleReadComic = useCallback((comic: AdultComic) => {
    setReadingComic(comic);
    setReaderPages(generateMockComicPages(Math.min(comic.pages, 20)));
  }, []);

  const closeReader = useCallback(() => {
    setReadingComic(null);
    setReaderPages([]);
  }, []);

  const clearFilters = useCallback(() => {
    setActiveGenre('all');
    setActiveLanguage('all');
    setActiveStyle('all');
    setActivePageCount('all');
    setSearchQuery('');
  }, []);

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
        {/* ===== Page Title ===== */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldAlert size={22} className="text-red-400" />
            <span>成人漫画专区</span>
            <RatingBadge rating="NC-17" size="md" />
          </h1>
        </div>

        {/* ===== Search Bar ===== */}
        <div className="relative mb-4">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索成人漫画..."
            className="w-full h-9 pl-9 pr-24 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition"
          />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] transition ${
              showFilters || activeFilterCount > 0
                ? 'bg-[#3ea6ff]/20 text-[#3ea6ff]'
                : 'bg-[#2a2a2a] text-[#aaa] hover:text-white'
            }`}
          >
            <Filter size={11} />
            筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
        </div>

        {/* ===== Sort Row ===== */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          <ArrowUpDown size={12} className="text-[#666] shrink-0" />
          {SORT_OPTIONS.map((opt) => {
            const isActive = activeSort === opt.id;
            let SortIcon: React.ElementType = Flame;
            if (opt.id === 'latest') SortIcon = CalendarDays;
            else if (opt.id === 'rating') SortIcon = Star;
            else if (opt.id === 'favorites') SortIcon = Heart;
            else if (opt.id === 'random') SortIcon = Shuffle;
            return (
              <button
                key={opt.id}
                onClick={() => setActiveSort(opt.id)}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-[12px] whitespace-nowrap border transition shrink-0 ${
                  isActive
                    ? 'bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold'
                    : 'bg-transparent text-[#aaa] border-[#333] hover:bg-[#2a2a2a] hover:text-white'
                }`}
              >
                <SortIcon size={11} />
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* ===== Multi-tag Filters ===== */}
        {showFilters && (
          <div className="mb-4 p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50 space-y-3">
            <FilterRow
              label="类型/题材"
              icon={<BookOpen size={11} />}
              options={GENRE_OPTIONS}
              value={activeGenre}
              onChange={setActiveGenre}
            />
            <FilterRow
              label="语言"
              icon={<Languages size={11} />}
              options={LANGUAGE_OPTIONS}
              value={activeLanguage}
              onChange={setActiveLanguage}
            />
            <FilterRow
              label="画风"
              icon={<Palette size={11} />}
              options={STYLE_OPTIONS}
              value={activeStyle}
              onChange={setActiveStyle}
            />
            <FilterRow
              label="页数"
              icon={<FileText size={11} />}
              options={PAGE_COUNT_OPTIONS}
              value={activePageCount}
              onChange={setActivePageCount}
            />

            {/* Clear filters */}
            {activeFilterCount > 0 && (
              <div className="pt-2 border-t border-[#333]/50">
                <button
                  onClick={clearFilters}
                  className="text-[12px] text-[#888] hover:text-[#3ea6ff] transition flex items-center gap-1"
                >
                  <X size={11} />
                  清除所有筛选
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== Active filter summary ===== */}
        {(activeGenre !== 'all' || activeLanguage !== 'all' || activeStyle !== 'all' || activePageCount !== 'all' || searchQuery) && (
          <div className="flex items-center gap-2 mb-3 text-[12px] text-[#888]">
            <SlidersHorizontal size={12} />
            <span>
              {activeGenre !== 'all' && GENRE_OPTIONS.find(g => g.id === activeGenre)?.label}
              {activeLanguage !== 'all' && ` · ${LANGUAGE_OPTIONS.find(l => l.id === activeLanguage)?.label}`}
              {activeStyle !== 'all' && ` · ${STYLE_OPTIONS.find(s => s.id === activeStyle)?.label}`}
              {activePageCount !== 'all' && ` · ${PAGE_COUNT_OPTIONS.find(p => p.id === activePageCount)?.label}`}
              {searchQuery && ` · "${searchQuery}"`}
            </span>
            <span className="text-[#555]">·</span>
            <span>{filteredComics.length} 个结果</span>
          </div>
        )}

        {/* ===== Comics Grid ===== */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
          {filteredComics.map((c) => (
            <div
              key={c.id}
              onClick={() => handleReadComic(c)}
              className="group cursor-pointer rounded-xl overflow-hidden transition hover:-translate-y-1"
            >
              <div className="relative aspect-[3/4] bg-[#1a1a1a] overflow-hidden rounded-xl">
                {c.cover ? (
                  <img
                    src={c.cover}
                    alt={c.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#1a0a2a] to-[#2a0a3a] flex items-center justify-center">
                    <BookOpen size={32} className="text-white/20" />
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                    <BookOpen size={24} className="text-white" />
                  </div>
                </div>
                {/* Page count badge */}
                <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <FileText size={8} />
                  {c.pages}页
                </span>
                {/* Source badge */}
                <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                  {c.source}
                </span>
                {/* NC-17 Rating badge */}
                <span className="absolute top-1.5 right-1.5">
                  <RatingBadge rating="NC-17" />
                </span>
                {/* Language badge */}
                {c.language === 'cn' && (
                  <span className="absolute top-8 left-1.5 bg-green-500/90 text-white text-[8px] px-1 py-0.5 rounded font-medium">
                    中文
                  </span>
                )}
              </div>
              <div className="pt-2 pb-1">
                <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug group-hover:text-[#3ea6ff] transition">
                  {c.title}
                </h3>
                <div className="flex items-center gap-1.5 text-[12px] text-[#8a8a8a] mt-1">
                  <Eye size={10} />
                  <span>{fmtNum(c.views)}</span>
                  <span className="text-[#555]">·</span>
                  <Star size={10} />
                  <span>{c.score}</span>
                  <span className="text-[#555]">·</span>
                  <Heart size={10} />
                  <span>{fmtNum(c.favorites)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ===== Empty state ===== */}
        {filteredComics.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <BookOpen size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">暂无匹配的漫画</p>
            <p className="text-xs mt-1 text-[#555]">
              尝试调整筛选条件或搜索关键词
            </p>
          </div>
        )}
      </main>

      {/* ===== Comic Reader Modal ===== */}
      {readingComic && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex flex-col"
          onClick={closeReader}
        >
          <div
            className="flex-1 flex flex-col w-full max-w-5xl mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-white font-bold text-base md:text-lg truncate">
                  {readingComic.title}
                </h2>
                <RatingBadge rating="NC-17" />
                <span className="text-[11px] text-[#888] bg-[#2a2a2a] px-2 py-0.5 rounded shrink-0">
                  {readingComic.source}
                </span>
              </div>
              <button
                onClick={closeReader}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition shrink-0 ml-2"
              >
                <X size={16} />
              </button>
            </div>

            {/* Reader area */}
            <div className="flex-1 overflow-hidden rounded-xl mx-4 mb-4">
              <ComicReader
                pages={readerPages}
                mode="scroll"
                currentPage={0}
                onPageChange={() => {}}
              />
            </div>

            {/* Comic info below reader */}
            <div className="px-4 pb-4 flex items-center gap-3 text-[13px] text-[#8a8a8a]">
              <span className="flex items-center gap-1">
                <Eye size={12} /> {fmtNum(readingComic.views)} 阅读
              </span>
              <span className="flex items-center gap-1">
                <Star size={12} /> {readingComic.score} 分
              </span>
              <span className="flex items-center gap-1">
                <FileText size={12} /> {readingComic.pages}页
              </span>
              <span className="flex items-center gap-1">
                <Heart size={12} /> {fmtNum(readingComic.favorites)} 收藏
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
