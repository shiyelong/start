'use client';

import { useState, useCallback, useMemo } from 'react';
import Header from '@/components/Header';
import RatingBadge from '@/components/ui/RatingBadge';
import VideoPlayer from '@/components/player/VideoPlayer';
import DanmakuLayer, { type DanmakuItem } from '@/components/player/DanmakuLayer';
import AutoPlayOverlay from '@/components/player/AutoPlayOverlay';
import { ageGate } from '@/lib/age-gate';
import type { ContentRating, AggregatedItem } from '@/lib/types';
import type { AutoPlayCandidate } from '@/lib/player/autoplay-engine';
import {
  Search,
  X,
  Eye,
  Clock,
  Filter,
  Film,
  PlayCircle,
  ShieldAlert,
  Lock,
  SlidersHorizontal,
  ArrowUpDown,
  Flame,
  CalendarDays,
  Star,
  BarChart3,
  Shuffle,
  Tv,
  Palette,
  ListVideo,
  Calendar,
  Loader,
  Subtitles,
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
  { id: 'fantasy', label: '奇幻/异世界' },
  { id: 'bdsm', label: '调教/SM' },
  { id: 'humiliation', label: '凌辱' },
  { id: 'chijo', label: '痴女' },
  { id: 'chikan', label: '痴汉' },
  { id: 'milf', label: '人妻/熟女' },
  { id: 'big-breasts', label: '巨乳' },
  { id: 'small-breasts', label: '贫乳' },
  { id: 'loli-style', label: '萝莉风' },
  { id: 'shota-style', label: '正太风' },
  { id: 'pregnant', label: '怀孕' },
  { id: 'lactation', label: '母乳' },
  { id: 'hypnosis', label: '催眠' },
  { id: 'anal', label: '肛交' },
  { id: 'orgy', label: '群交/乱交' },
  { id: 'monster', label: '人外/怪物' },
  { id: 'mecha-h', label: '机甲+色情' },
  { id: 'action-h', label: '热血+色情' },
  { id: 'horror-h', label: '恐怖+色情' },
  { id: 'comedy-h', label: '搞笑+色情' },
  { id: 'swimsuit', label: '泳装' },
  { id: 'maid', label: '女仆' },
  { id: 'nurse', label: '护士' },
  { id: 'teacher', label: '教师' },
  { id: 'nun', label: '修女' },
];

const STYLE_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部画风' },
  { id: 'jp-anime', label: '日式动漫' },
  { id: '3d-cg', label: '3D/CG' },
  { id: 'pixel', label: '像素风' },
  { id: 'western', label: '欧美卡通' },
];

const EPISODE_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部集数' },
  { id: 'ova', label: '单集OVA' },
  { id: 'short', label: '短篇(2-4集)' },
  { id: 'long', label: '长篇(5集以上)' },
];

const YEAR_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部年份' },
  { id: '2026', label: '2026' },
  { id: '2025', label: '2025' },
  { id: '2024', label: '2024' },
  { id: '2023', label: '2023' },
  { id: '2022', label: '2022' },
  { id: '2020-2021', label: '2020-2021' },
  { id: '2015-2019', label: '2015-2019' },
  { id: 'classic', label: '2014及更早' },
];

const STATUS_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部状态' },
  { id: 'ongoing', label: '连载中' },
  { id: 'completed', label: '已完结' },
];

const SUBTITLE_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部字幕' },
  { id: 'cn', label: '中文字幕' },
  { id: 'en', label: '英文字幕' },
  { id: 'jp', label: '日文原声' },
  { id: 'none', label: '无字幕' },
];

const SORT_OPTIONS: FilterOption[] = [
  { id: 'hot', label: '热度' },
  { id: 'latest', label: '最新' },
  { id: 'rating', label: '评分' },
  { id: 'random', label: '随机' },
];

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface AdultAnime {
  id: string;
  title: string;
  cover: string;
  source: string;
  sourceId: string;
  genre: string;
  style: string;
  episodeCategory: string;
  year: string;
  status: string;
  subtitle: string;
  rating: ContentRating;
  episodes: number;
  currentEpisode: number;
  views: number;
  score: number;
  date: string;
  url: string;
}

function generateMockAdultAnime(): AdultAnime[] {
  const genres = GENRE_OPTIONS.filter(g => g.id !== 'all').map(g => g.id);
  const styles = STYLE_OPTIONS.filter(s => s.id !== 'all').map(s => s.id);
  const episodeCats = EPISODE_OPTIONS.filter(e => e.id !== 'all').map(e => e.id);
  const years = ['2026', '2025', '2024', '2023', '2022', '2020-2021', '2015-2019', 'classic'];
  const statuses = STATUS_OPTIONS.filter(s => s.id !== 'all').map(s => s.id);
  const subtitles = SUBTITLE_OPTIONS.filter(s => s.id !== 'all').map(s => s.id);

  const titles = [
    '魔法少女的秘密', '异世界温泉物语', '校园禁忌之恋', '触手星球',
    '后宫学园', '百合花园', '催眠术师', '人妻的午后',
    '深夜的护士站', '女仆咖啡厅', '修女的告解', '泳池派对',
    '机甲少女', '恐怖之夜', '搞笑日常', '奇幻冒险',
    '痴女电车', '母乳工坊', '怀孕物语', '群交学园',
    '人外娘日记', '正太冒险记', '萝莉魔法师', '巨乳女骑士',
    '贫乳忍者', '肛交特训', '调教学院', '凌辱地牢',
    '寝取之夏', '痴汉列车', '教师的放课后', '泳装竞赛',
    '异世界后宫', '纯爱物语', '校园百合', '触手迷宫',
    '催眠教室', '女仆训练', '护士日记', '修女学园',
  ];

  const sources = ['Source-A', 'Source-B', 'Source-C', 'Source-D', 'Source-E', 'Source-F', 'Source-G'];

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

  const animeList: AdultAnime[] = [];
  for (let i = 0; i < titles.length; i++) {
    const epCat = episodeCats[i % episodeCats.length];
    const totalEps = epCat === 'ova' ? 1 : epCat === 'short' ? (i % 3) + 2 : (i % 8) + 5;
    const st = statuses[i % statuses.length];
    const currentEp = st === 'completed' ? totalEps : Math.max(1, Math.floor(totalEps * 0.6));

    animeList.push({
      id: `aa-${i + 1}`,
      title: titles[i],
      cover: covers[i % covers.length],
      source: sources[i % sources.length],
      sourceId: `adult-anime-src-${(i % 7) + 1}`,
      genre: genres[i % genres.length],
      style: styles[i % styles.length],
      episodeCategory: epCat,
      year: years[i % years.length],
      status: st,
      subtitle: subtitles[i % subtitles.length],
      rating: 'NC-17',
      episodes: totalEps,
      currentEpisode: currentEp,
      views: Math.floor(Math.random() * 1500000) + 3000,
      score: Math.round((Math.random() * 3 + 7) * 10) / 10,
      date: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
      url: `/api/zone/anime/stream/aa-${i + 1}`,
    });
  }
  return animeList;
}

const ALL_ADULT_ANIME = generateMockAdultAnime();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function toAggregatedItem(a: AdultAnime): AggregatedItem {
  return {
    id: a.id,
    title: a.title,
    cover: a.cover,
    source: a.source,
    sourceId: a.sourceId,
    rating: a.rating,
    type: 'anime',
    url: a.url,
    metadata: {
      views: a.views,
      episodes: a.episodes,
      score: a.score,
    },
  };
}

// ---------------------------------------------------------------------------
// Mock danmaku
// ---------------------------------------------------------------------------

const MOCK_DANMAKU: DanmakuItem[] = [
  { id: 'd1', text: '好看', time: 3, color: '#FFFFFF', position: 'scroll', size: 'normal' },
  { id: 'd2', text: '经典', time: 8, color: '#FF6B6B', position: 'scroll', size: 'normal' },
  { id: 'd3', text: '高能预警', time: 15, color: '#FFFF00', position: 'top', size: 'large' },
  { id: 'd4', text: '画质不错', time: 22, color: '#3EA6FF', position: 'scroll', size: 'normal' },
];

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

export default function ZoneAnimePage() {
  // --- AgeGate check ---
  const hasAccess = useAdultAccess();

  // --- Filter state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeGenre, setActiveGenre] = useState('all');
  const [activeStyle, setActiveStyle] = useState('all');
  const [activeEpisode, setActiveEpisode] = useState('all');
  const [activeYear, setActiveYear] = useState('all');
  const [activeStatus, setActiveStatus] = useState('all');
  const [activeSubtitle, setActiveSubtitle] = useState('all');
  const [activeSort, setActiveSort] = useState('hot');

  // --- Player state ---
  const [playingAnime, setPlayingAnime] = useState<AdultAnime | null>(null);
  const [playerTime, setPlayerTime] = useState(0);
  const [danmakuList, setDanmakuList] = useState<DanmakuItem[]>(MOCK_DANMAKU);
  const [isPlaying, setIsPlaying] = useState(true);

  // --- AutoPlay state ---
  const [showAutoPlay, setShowAutoPlay] = useState(false);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);

  // --- Access gate ---
  if (!hasAccess) {
    return <AccessDenied />;
  }

  // --- Active filter count ---
  const activeFilterCount = [
    activeGenre !== 'all',
    activeStyle !== 'all',
    activeEpisode !== 'all',
    activeYear !== 'all',
    activeStatus !== 'all',
    activeSubtitle !== 'all',
  ].filter(Boolean).length;

  // --- Filtered & sorted anime ---
  const filteredAnime = useMemo(() => {
    let list = [...ALL_ADULT_ANIME];

    if (activeGenre !== 'all') {
      list = list.filter((a) => a.genre === activeGenre);
    }
    if (activeStyle !== 'all') {
      list = list.filter((a) => a.style === activeStyle);
    }
    if (activeEpisode !== 'all') {
      list = list.filter((a) => a.episodeCategory === activeEpisode);
    }
    if (activeYear !== 'all') {
      list = list.filter((a) => a.year === activeYear);
    }
    if (activeStatus !== 'all') {
      list = list.filter((a) => a.status === activeStatus);
    }
    if (activeSubtitle !== 'all') {
      list = list.filter((a) => a.subtitle === activeSubtitle);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.source.toLowerCase().includes(q)
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
      case 'random':
        list.sort(() => Math.random() - 0.5);
        break;
      case 'hot':
      default:
        list.sort((a, b) => b.views * b.score - a.views * a.score);
        break;
    }

    return list;
  }, [activeGenre, activeStyle, activeEpisode, activeYear, activeStatus, activeSubtitle, searchQuery, activeSort]);

  // --- AutoPlay candidate ---
  const autoPlayCandidate = useMemo<AutoPlayCandidate | null>(() => {
    if (!playingAnime || filteredAnime.length < 2) return null;
    const idx = filteredAnime.findIndex((a) => a.id === playingAnime.id);
    const next = filteredAnime[idx + 1] ?? filteredAnime[0];
    if (!next || next.id === playingAnime.id) return null;
    return {
      item: toAggregatedItem(next),
      reason: 'recommended',
      priority: 1,
    };
  }, [playingAnime, filteredAnime]);

  const autoPlayQueue = useMemo<AutoPlayCandidate[]>(() => {
    if (!playingAnime) return [];
    const idx = filteredAnime.findIndex((a) => a.id === playingAnime.id);
    return filteredAnime
      .slice(idx + 1, idx + 6)
      .map((a) => ({
        item: toAggregatedItem(a),
        reason: 'recommended' as AutoPlayCandidate['reason'],
        priority: 1,
      }));
  }, [playingAnime, filteredAnime]);

  // --- Handlers ---
  const handlePlayAnime = useCallback((anime: AdultAnime) => {
    setPlayingAnime(anime);
    setPlayerTime(0);
    setIsPlaying(true);
    setShowAutoPlay(false);
  }, []);

  const handleVideoEnded = useCallback(() => {
    if (autoPlayEnabled && autoPlayCandidate) {
      setShowAutoPlay(true);
    }
  }, [autoPlayEnabled, autoPlayCandidate]);

  const handleAutoPlayNow = useCallback(() => {
    if (!autoPlayCandidate) return;
    const nextAnime = ALL_ADULT_ANIME.find((a) => a.id === autoPlayCandidate.item.id);
    if (nextAnime) handlePlayAnime(nextAnime);
    setShowAutoPlay(false);
  }, [autoPlayCandidate, handlePlayAnime]);

  const handleSendDanmaku = useCallback(
    (text: string, color: string, position: string, size: string) => {
      const newDanmaku: DanmakuItem = {
        id: `d-${Date.now()}`,
        text,
        time: playerTime,
        color,
        position: position as DanmakuItem['position'],
        size: size as DanmakuItem['size'],
      };
      setDanmakuList((prev) => [...prev, newDanmaku]);
    },
    [playerTime]
  );

  const closePlayer = useCallback(() => {
    setPlayingAnime(null);
    setShowAutoPlay(false);
  }, []);

  const clearFilters = useCallback(() => {
    setActiveGenre('all');
    setActiveStyle('all');
    setActiveEpisode('all');
    setActiveYear('all');
    setActiveStatus('all');
    setActiveSubtitle('all');
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
            <span>成人动漫专区</span>
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
            placeholder="搜索成人动漫..."
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
              icon={<Film size={11} />}
              options={GENRE_OPTIONS}
              value={activeGenre}
              onChange={setActiveGenre}
            />
            <FilterRow
              label="画风"
              icon={<Palette size={11} />}
              options={STYLE_OPTIONS}
              value={activeStyle}
              onChange={setActiveStyle}
            />
            <FilterRow
              label="集数"
              icon={<ListVideo size={11} />}
              options={EPISODE_OPTIONS}
              value={activeEpisode}
              onChange={setActiveEpisode}
            />
            <FilterRow
              label="年份"
              icon={<Calendar size={11} />}
              options={YEAR_OPTIONS}
              value={activeYear}
              onChange={setActiveYear}
            />
            <FilterRow
              label="状态"
              icon={<Loader size={11} />}
              options={STATUS_OPTIONS}
              value={activeStatus}
              onChange={setActiveStatus}
            />
            <FilterRow
              label="字幕"
              icon={<Subtitles size={11} />}
              options={SUBTITLE_OPTIONS}
              value={activeSubtitle}
              onChange={setActiveSubtitle}
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
        {(activeGenre !== 'all' || activeStyle !== 'all' || activeEpisode !== 'all' || activeYear !== 'all' || activeStatus !== 'all' || activeSubtitle !== 'all' || searchQuery) && (
          <div className="flex items-center gap-2 mb-3 text-[12px] text-[#888]">
            <SlidersHorizontal size={12} />
            <span>
              {activeGenre !== 'all' && GENRE_OPTIONS.find(g => g.id === activeGenre)?.label}
              {activeStyle !== 'all' && ` · ${STYLE_OPTIONS.find(s => s.id === activeStyle)?.label}`}
              {activeEpisode !== 'all' && ` · ${EPISODE_OPTIONS.find(e => e.id === activeEpisode)?.label}`}
              {activeYear !== 'all' && ` · ${YEAR_OPTIONS.find(y => y.id === activeYear)?.label}`}
              {activeStatus !== 'all' && ` · ${STATUS_OPTIONS.find(s => s.id === activeStatus)?.label}`}
              {activeSubtitle !== 'all' && ` · ${SUBTITLE_OPTIONS.find(s => s.id === activeSubtitle)?.label}`}
              {searchQuery && ` · "${searchQuery}"`}
            </span>
            <span className="text-[#555]">·</span>
            <span>{filteredAnime.length} 个结果</span>
          </div>
        )}

        {/* ===== Anime Grid ===== */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
          {filteredAnime.map((a) => (
            <div
              key={a.id}
              onClick={() => handlePlayAnime(a)}
              className="group cursor-pointer rounded-xl overflow-hidden transition hover:-translate-y-1"
            >
              <div className="relative aspect-[3/4] bg-[#1a1a1a] overflow-hidden rounded-xl">
                {a.cover ? (
                  <img
                    src={a.cover}
                    alt={a.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#1a0a2a] to-[#2a0a3a] flex items-center justify-center">
                    <PlayCircle size={32} className="text-white/20" />
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                    <PlayCircle size={24} className="text-white" />
                  </div>
                </div>
                {/* Episode badge */}
                <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <ListVideo size={8} />
                  {a.status === 'completed' ? `全${a.episodes}集` : `更新至${a.currentEpisode}/${a.episodes}集`}
                </span>
                {/* Source badge */}
                <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                  {a.source}
                </span>
                {/* NC-17 Rating badge */}
                <span className="absolute top-1.5 right-1.5">
                  <RatingBadge rating="NC-17" />
                </span>
                {/* Status badge */}
                {a.status === 'ongoing' && (
                  <span className="absolute bottom-1.5 left-1.5 bg-[#3ea6ff]/90 text-[#0f0f0f] text-[9px] px-1.5 py-0.5 rounded font-bold">
                    连载中
                  </span>
                )}
                {a.subtitle === 'cn' && (
                  <span className="absolute top-8 left-1.5 bg-green-500/90 text-white text-[8px] px-1 py-0.5 rounded font-medium">
                    中字
                  </span>
                )}
              </div>
              <div className="pt-2 pb-1">
                <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug group-hover:text-[#3ea6ff] transition">
                  {a.title}
                </h3>
                <div className="flex items-center gap-1.5 text-[12px] text-[#8a8a8a] mt-1">
                  <Eye size={10} />
                  <span>{fmtNum(a.views)}</span>
                  <span className="text-[#555]">·</span>
                  <Star size={10} />
                  <span>{a.score}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ===== Empty state ===== */}
        {filteredAnime.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <Tv size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">暂无匹配的动漫</p>
            <p className="text-xs mt-1 text-[#555]">
              尝试调整筛选条件或搜索关键词
            </p>
          </div>
        )}
      </main>

      {/* ===== Video Player Modal ===== */}
      {playingAnime && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-3 md:p-6 lg:p-8"
          onClick={closePlayer}
        >
          <div
            className="w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-white font-bold text-base md:text-lg truncate">
                  {playingAnime.title}
                </h2>
                <RatingBadge rating="NC-17" />
                <span className="text-[11px] text-[#888] bg-[#2a2a2a] px-2 py-0.5 rounded shrink-0">
                  {playingAnime.source}
                </span>
              </div>
              <button
                onClick={closePlayer}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition shrink-0 ml-2"
              >
                <X size={16} />
              </button>
            </div>

            {/* Player area */}
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
              <VideoPlayer
                src={playingAnime.url || 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'}
                title={playingAnime.title}
                source={playingAnime.source}
                rating="NC-17"
                autoPlay
                onEnded={handleVideoEnded}
                onProgress={(time) => {
                  setPlayerTime(time);
                }}
              />

              {/* Danmaku layer */}
              <div className="absolute inset-0 pointer-events-none">
                <DanmakuLayer
                  danmakuList={danmakuList}
                  currentTime={playerTime}
                  playing={isPlaying}
                  onSend={handleSendDanmaku}
                />
              </div>

              {/* AutoPlay overlay */}
              {showAutoPlay && autoPlayCandidate && (
                <AutoPlayOverlay
                  candidate={autoPlayCandidate}
                  queue={autoPlayQueue}
                  countdownSeconds={5}
                  onPlayNow={handleAutoPlayNow}
                  onCancel={() => setShowAutoPlay(false)}
                  onToggleAutoPlay={setAutoPlayEnabled}
                  autoPlayEnabled={autoPlayEnabled}
                />
              )}
            </div>

            {/* Anime info below player */}
            <div className="mt-3 flex items-center gap-3 text-[13px] text-[#8a8a8a]">
              <span className="flex items-center gap-1">
                <Eye size={12} /> {fmtNum(playingAnime.views)} 播放
              </span>
              <span className="flex items-center gap-1">
                <Star size={12} /> {playingAnime.score} 分
              </span>
              <span className="flex items-center gap-1">
                <ListVideo size={12} /> {playingAnime.status === 'completed' ? `全${playingAnime.episodes}集` : `${playingAnime.currentEpisode}/${playingAnime.episodes}集`}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} /> {playingAnime.year}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
