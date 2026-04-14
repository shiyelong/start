'use client';

import { useState, useCallback, useMemo } from 'react';
import Header from '@/components/Header';
import RatingBadge from '@/components/ui/RatingBadge';
import NovelReader from '@/components/reader/NovelReader';
import { ageGate } from '@/lib/age-gate';
import type { ContentRating } from '@/lib/types';
import {
  Search,
  X,
  Eye,
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
  Languages,
  FileText,
  Heart,
  Loader,
  Hash,
  BookText,
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
  { id: 'ntr', label: 'NTR/寝取' },
  { id: 'yuri', label: '百合' },
  { id: 'bl', label: '耽美/BL' },
  { id: 'school', label: '校园' },
  { id: 'fantasy', label: '奇幻' },
  { id: 'urban', label: '都市' },
  { id: 'ancient', label: '古代/宫廷' },
  { id: 'scifi', label: '科幻' },
  { id: 'bdsm', label: '调教/SM' },
  { id: 'humiliation', label: '凌辱' },
  { id: 'milf', label: '人妻' },
  { id: 'hypnosis', label: '催眠' },
  { id: 'wife-swap', label: '换妻' },
  { id: 'orgy', label: '群交' },
  { id: 'monster', label: '人外/怪物' },
  { id: 'isekai-h', label: '穿越+色情' },
  { id: 'cultivation-h', label: '修仙+色情' },
  { id: 'apocalypse-h', label: '末日+色情' },
];

const LANGUAGE_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部语言' },
  { id: 'cn', label: '中文' },
  { id: 'en', label: '英文' },
  { id: 'jp', label: '日文' },
];

const WORD_COUNT_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部字数' },
  { id: 'short', label: '短篇(<5万字)' },
  { id: 'medium', label: '中篇(5-20万字)' },
  { id: 'long', label: '长篇(20-100万字)' },
  { id: 'extra-long', label: '超长篇(>100万字)' },
];

const STATUS_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部状态' },
  { id: 'ongoing', label: '连载中' },
  { id: 'completed', label: '已完结' },
];

const SORT_OPTIONS: FilterOption[] = [
  { id: 'hot', label: '热度' },
  { id: 'latest', label: '最新' },
  { id: 'rating', label: '评分' },
  { id: 'words', label: '字数' },
  { id: 'favorites', label: '收藏数' },
];

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface AdultNovel {
  id: string;
  title: string;
  cover: string;
  source: string;
  sourceId: string;
  genre: string;
  language: string;
  wordCategory: string;
  status: string;
  rating: ContentRating;
  wordCount: number;
  chapters: number;
  views: number;
  score: number;
  favorites: number;
  date: string;
  author: string;
  url: string;
}

function generateMockAdultNovels(): AdultNovel[] {
  const genres = GENRE_OPTIONS.filter(g => g.id !== 'all').map(g => g.id);
  const languages = LANGUAGE_OPTIONS.filter(l => l.id !== 'all').map(l => l.id);
  const wordCats = WORD_COUNT_OPTIONS.filter(w => w.id !== 'all').map(w => w.id);
  const statuses = STATUS_OPTIONS.filter(s => s.id !== 'all').map(s => s.id);

  const titles = [
    '禁忌之恋', '都市猎艳记', '校园秘事录', '异世界后宫传',
    '催眠大师', '人妻的秘密', '修仙双修录', '末日求生记',
    '宫廷秘史', '科幻情缘', '百合花开', '耽美风云',
    '换妻俱乐部', '群交派对', '人外之恋', '穿越艳遇',
    '调教日记', '凌辱学园', '纯爱物语', '后宫争霸',
    '都市风流', '古代艳史', '奇幻冒险', '校园禁恋',
    'NTR之夏', '催眠教室', '人妻日记', '修仙艳途',
    '末日乐园', '科幻后宫', '百合庭院', '耽美情缘',
    '换妻游戏', '群交学园', '人外娘传', '穿越后宫',
  ];

  const authors = [
    '匿名作者A', '匿名作者B', '匿名作者C', '匿名作者D',
    '匿名作者E', '匿名作者F', '匿名作者G', '匿名作者H',
  ];

  const sources = [
    'Source-A', 'Source-B', 'Source-C', 'Source-D',
    'Source-E', 'Source-F', 'Source-G',
  ];

  const covers = [
    'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400&q=80',
    'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400&q=80',
    'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&q=80',
    'https://images.unsplash.com/photo-1524578271613-d550eacf6090?w=400&q=80',
    'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=400&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80',
    'https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400&q=80',
    'https://images.unsplash.com/photo-1476275466078-4007374efbbe?w=400&q=80',
  ];

  const novelList: AdultNovel[] = [];
  for (let i = 0; i < titles.length; i++) {
    const wordCat = wordCats[i % wordCats.length];
    const wordCount =
      wordCat === 'short' ? (i % 40000) + 10000 :
      wordCat === 'medium' ? (i % 150000) + 50000 :
      wordCat === 'long' ? (i % 800000) + 200000 :
      (i % 2000000) + 1000000;
    const st = statuses[i % statuses.length];
    const totalChapters = Math.max(1, Math.floor(wordCount / 3000));
    const currentChapters = st === 'completed' ? totalChapters : Math.max(1, Math.floor(totalChapters * 0.7));

    novelList.push({
      id: `an-${i + 1}`,
      title: titles[i],
      cover: covers[i % covers.length],
      source: sources[i % sources.length],
      sourceId: `adult-novel-src-${(i % 7) + 1}`,
      genre: genres[i % genres.length],
      language: languages[i % languages.length],
      wordCategory: wordCat,
      status: st,
      rating: 'NC-17',
      wordCount,
      chapters: st === 'completed' ? totalChapters : currentChapters,
      views: Math.floor(Math.random() * 3000000) + 10000,
      score: Math.round((Math.random() * 3 + 7) * 10) / 10,
      favorites: Math.floor(Math.random() * 80000) + 200,
      date: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
      author: authors[i % authors.length],
      url: `/api/zone/novel/${i + 1}`,
    });
  }
  return novelList;
}

const ALL_ADULT_NOVELS = generateMockAdultNovels();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function fmtWordCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万字';
  return n + '字';
}

// ---------------------------------------------------------------------------
// Mock novel content for reader
// ---------------------------------------------------------------------------

function generateMockNovelContent(title: string): string {
  const paragraphs = [
    `《${title}》第一章`,
    '',
    '夜幕降临，城市的霓虹灯开始闪烁。在这个繁华都市的某个角落，一段不为人知的故事正在悄然展开。',
    '',
    '主角站在窗前，望着远处的灯火，心中充满了对未来的期待和不安。这座城市太大了，大到可以容纳所有人的秘密。',
    '',
    '手机突然响了起来，屏幕上显示着一个陌生的号码。犹豫了片刻，还是接了起来。',
    '',
    '"你好，我是……"电话那头传来一个温柔的声音。',
    '',
    '这个声音，似乎在哪里听过。记忆像潮水一样涌来，那些被刻意遗忘的往事，又一次浮现在眼前。',
    '',
    '窗外的风吹动了窗帘，月光洒进房间，在地板上投下斑驳的影子。这是一个注定不平凡的夜晚。',
    '',
    '故事，就从这里开始……',
    '',
    '（示例内容 — 实际内容将通过 Cloudflare Workers 代理从源站获取）',
  ];
  return paragraphs.join('\n');
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

export default function ZoneNovelsPage() {
  // --- AgeGate check ---
  const hasAccess = useAdultAccess();

  // --- Filter state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeGenre, setActiveGenre] = useState('all');
  const [activeLanguage, setActiveLanguage] = useState('all');
  const [activeWordCount, setActiveWordCount] = useState('all');
  const [activeStatus, setActiveStatus] = useState('all');
  const [activeSort, setActiveSort] = useState('hot');

  // --- Reader state ---
  const [readingNovel, setReadingNovel] = useState<AdultNovel | null>(null);

  // --- Access gate ---
  if (!hasAccess) {
    return <AccessDenied />;
  }

  // --- Active filter count ---
  const activeFilterCount = [
    activeGenre !== 'all',
    activeLanguage !== 'all',
    activeWordCount !== 'all',
    activeStatus !== 'all',
  ].filter(Boolean).length;

  // --- Filtered & sorted novels ---
  const filteredNovels = useMemo(() => {
    let list = [...ALL_ADULT_NOVELS];

    if (activeGenre !== 'all') {
      list = list.filter((n) => n.genre === activeGenre);
    }
    if (activeLanguage !== 'all') {
      list = list.filter((n) => n.language === activeLanguage);
    }
    if (activeWordCount !== 'all') {
      list = list.filter((n) => n.wordCategory === activeWordCount);
    }
    if (activeStatus !== 'all') {
      list = list.filter((n) => n.status === activeStatus);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.author.toLowerCase().includes(q) ||
          n.source.toLowerCase().includes(q)
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
      case 'words':
        list.sort((a, b) => b.wordCount - a.wordCount);
        break;
      case 'favorites':
        list.sort((a, b) => b.favorites - a.favorites);
        break;
      case 'hot':
      default:
        list.sort((a, b) => b.views * b.score - a.views * a.score);
        break;
    }

    return list;
  }, [activeGenre, activeLanguage, activeWordCount, activeStatus, searchQuery, activeSort]);

  // --- Handlers ---
  const handleReadNovel = useCallback((novel: AdultNovel) => {
    setReadingNovel(novel);
  }, []);

  const closeReader = useCallback(() => {
    setReadingNovel(null);
  }, []);

  const clearFilters = useCallback(() => {
    setActiveGenre('all');
    setActiveLanguage('all');
    setActiveWordCount('all');
    setActiveStatus('all');
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
            <span>成人小说专区</span>
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
            placeholder="搜索成人小说..."
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
            else if (opt.id === 'words') SortIcon = Hash;
            else if (opt.id === 'favorites') SortIcon = Heart;
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
              icon={<BookText size={11} />}
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
              label="字数"
              icon={<Hash size={11} />}
              options={WORD_COUNT_OPTIONS}
              value={activeWordCount}
              onChange={setActiveWordCount}
            />
            <FilterRow
              label="状态"
              icon={<Loader size={11} />}
              options={STATUS_OPTIONS}
              value={activeStatus}
              onChange={setActiveStatus}
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
        {(activeGenre !== 'all' || activeLanguage !== 'all' || activeWordCount !== 'all' || activeStatus !== 'all' || searchQuery) && (
          <div className="flex items-center gap-2 mb-3 text-[12px] text-[#888]">
            <SlidersHorizontal size={12} />
            <span>
              {activeGenre !== 'all' && GENRE_OPTIONS.find(g => g.id === activeGenre)?.label}
              {activeLanguage !== 'all' && ` · ${LANGUAGE_OPTIONS.find(l => l.id === activeLanguage)?.label}`}
              {activeWordCount !== 'all' && ` · ${WORD_COUNT_OPTIONS.find(w => w.id === activeWordCount)?.label}`}
              {activeStatus !== 'all' && ` · ${STATUS_OPTIONS.find(s => s.id === activeStatus)?.label}`}
              {searchQuery && ` · "${searchQuery}"`}
            </span>
            <span className="text-[#555]">·</span>
            <span>{filteredNovels.length} 个结果</span>
          </div>
        )}

        {/* ===== Novels Grid ===== */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
          {filteredNovels.map((n) => (
            <div
              key={n.id}
              onClick={() => handleReadNovel(n)}
              className="group cursor-pointer rounded-xl overflow-hidden transition hover:-translate-y-1"
            >
              <div className="relative aspect-[3/4] bg-[#1a1a1a] overflow-hidden rounded-xl">
                {n.cover ? (
                  <img
                    src={n.cover}
                    alt={n.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#0a1a2a] to-[#0a2a3a] flex items-center justify-center">
                    <BookText size={32} className="text-white/20" />
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                    <BookOpen size={24} className="text-white" />
                  </div>
                </div>
                {/* Word count badge */}
                <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <FileText size={8} />
                  {fmtWordCount(n.wordCount)}
                </span>
                {/* Source badge */}
                <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                  {n.source}
                </span>
                {/* NC-17 Rating badge */}
                <span className="absolute top-1.5 right-1.5">
                  <RatingBadge rating="NC-17" />
                </span>
                {/* Status badge */}
                {n.status === 'ongoing' && (
                  <span className="absolute bottom-1.5 left-1.5 bg-[#3ea6ff]/90 text-[#0f0f0f] text-[9px] px-1.5 py-0.5 rounded font-bold">
                    连载中
                  </span>
                )}
                {/* Language badge */}
                {n.language === 'cn' && (
                  <span className="absolute top-8 left-1.5 bg-green-500/90 text-white text-[8px] px-1 py-0.5 rounded font-medium">
                    中文
                  </span>
                )}
              </div>
              <div className="pt-2 pb-1">
                <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug group-hover:text-[#3ea6ff] transition">
                  {n.title}
                </h3>
                <p className="text-[11px] text-[#666] mt-0.5 truncate">{n.author}</p>
                <div className="flex items-center gap-1.5 text-[12px] text-[#8a8a8a] mt-1">
                  <Eye size={10} />
                  <span>{fmtNum(n.views)}</span>
                  <span className="text-[#555]">·</span>
                  <Star size={10} />
                  <span>{n.score}</span>
                  <span className="text-[#555]">·</span>
                  <Heart size={10} />
                  <span>{fmtNum(n.favorites)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ===== Empty state ===== */}
        {filteredNovels.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <BookText size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">暂无匹配的小说</p>
            <p className="text-xs mt-1 text-[#555]">
              尝试调整筛选条件或搜索关键词
            </p>
          </div>
        )}
      </main>

      {/* ===== Novel Reader Modal ===== */}
      {readingNovel && (
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
                  {readingNovel.title}
                </h2>
                <RatingBadge rating="NC-17" />
                <span className="text-[11px] text-[#888] bg-[#2a2a2a] px-2 py-0.5 rounded shrink-0">
                  {readingNovel.source}
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
              <NovelReader
                content={generateMockNovelContent(readingNovel.title)}
                title={readingNovel.title}
                mode="scroll"
                theme="dark"
              />
            </div>

            {/* Novel info below reader */}
            <div className="px-4 pb-4 flex items-center gap-3 text-[13px] text-[#8a8a8a]">
              <span className="flex items-center gap-1">
                <Eye size={12} /> {fmtNum(readingNovel.views)} 阅读
              </span>
              <span className="flex items-center gap-1">
                <Star size={12} /> {readingNovel.score} 分
              </span>
              <span className="flex items-center gap-1">
                <FileText size={12} /> {fmtWordCount(readingNovel.wordCount)}
              </span>
              <span className="flex items-center gap-1">
                <Heart size={12} /> {fmtNum(readingNovel.favorites)} 收藏
              </span>
              <span className="flex items-center gap-1">
                <BookOpen size={12} /> {readingNovel.chapters}章
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
