'use client';

import { useState, useCallback, useMemo } from 'react';
import Header from '@/components/Header';
import RatingBadge from '@/components/ui/RatingBadge';
import VideoPlayer from '@/components/player/VideoPlayer';
import { ageGate } from '@/lib/age-gate';
import type { ContentRating } from '@/lib/types';
import {
  Search,
  X,
  Eye,
  Filter,
  PlayCircle,
  ShieldAlert,
  Lock,
  SlidersHorizontal,
  ArrowUpDown,
  Flame,
  CalendarDays,
  Star,
  Shuffle,
  Radio,
  Users,
  UserCircle,
  Tv,
  Glasses,
  Gamepad2,
  Sparkles,
  CircleDot,
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

const GENDER_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部性别' },
  { id: 'female', label: '女主播' },
  { id: 'male', label: '男主播' },
  { id: 'trans', label: '跨性别' },
  { id: 'couple', label: '情侣' },
];

const STREAMER_TAG_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部特征' },
  { id: 'asian', label: '亚洲' },
  { id: 'western', label: '欧美' },
  { id: 'latina', label: '拉丁' },
  { id: 'ebony', label: '黑人' },
  { id: 'mature', label: '熟女' },
  { id: 'young', label: '年轻' },
  { id: 'curvy', label: '丰满' },
  { id: 'petite', label: '娇小' },
];

const STREAM_TYPE_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部类型' },
  { id: 'show', label: '公开秀' },
  { id: 'private', label: '私密秀' },
  { id: 'vr', label: 'VR直播' },
  { id: 'interactive', label: '互动直播' },
];

const PLATFORM_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部平台' },
  { id: 'Source-A', label: 'Source-A' },
  { id: 'Source-B', label: 'Source-B' },
  { id: 'Source-C', label: 'Source-C' },
  { id: 'Source-D', label: 'Source-D' },
  { id: 'Source-E', label: 'Source-E' },
  { id: 'Source-F', label: 'Source-F' },
  { id: 'Source-G', label: 'Source-G' },
];

const SORT_OPTIONS: FilterOption[] = [
  { id: 'hot', label: '热度' },
  { id: 'latest', label: '最新' },
  { id: 'viewers', label: '观看人数' },
  { id: 'rating', label: '评分' },
  { id: 'random', label: '随机' },
];


// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface AdultLiveStream {
  id: string;
  title: string;
  cover: string;
  source: string;
  sourceId: string;
  streamerName: string;
  streamerGender: string;
  streamerTag: string;
  streamType: string;
  rating: ContentRating;
  viewers: number;
  score: number;
  isLive: boolean;
  url: string;
}

function generateMockAdultStreams(): AdultLiveStream[] {
  const genders = GENDER_OPTIONS.filter(g => g.id !== 'all').map(g => g.id);
  const tags = STREAMER_TAG_OPTIONS.filter(t => t.id !== 'all').map(t => t.id);
  const types = STREAM_TYPE_OPTIONS.filter(t => t.id !== 'all').map(t => t.id);
  const sources = ['Source-A', 'Source-B', 'Source-C', 'Source-D', 'Source-E', 'Source-F', 'Source-G'];

  const names = [
    'Luna', 'Sakura', 'Mia', 'Yuki', 'Bella',
    'Chloe', 'Hana', 'Lily', 'Rose', 'Jade',
    'Amber', 'Crystal', 'Diamond', 'Ruby', 'Pearl',
    'Ivy', 'Violet', 'Daisy', 'Iris', 'Jasmine',
    'Aria', 'Nova', 'Stella', 'Aurora', 'Luna',
    'Zara', 'Kira', 'Nana', 'Momo', 'Sora',
  ];

  const covers = [
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&q=80',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&q=80',
    'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400&q=80',
    'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=400&q=80',
    'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=400&q=80',
    'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&q=80',
  ];

  const streams: AdultLiveStream[] = [];
  for (let i = 0; i < names.length; i++) {
    streams.push({
      id: `al-${i + 1}`,
      title: `${names[i]} 的直播间`,
      cover: covers[i % covers.length],
      source: sources[i % sources.length],
      sourceId: `adult-live-src-${(i % 7) + 1}`,
      streamerName: names[i],
      streamerGender: genders[i % genders.length],
      streamerTag: tags[i % tags.length],
      streamType: types[i % types.length],
      rating: 'NC-17',
      viewers: Math.floor(Math.random() * 50000) + 100,
      score: Math.round((Math.random() * 3 + 7) * 10) / 10,
      isLive: Math.random() > 0.15,
      url: `/api/zone/live/stream/al-${i + 1}`,
    });
  }
  return streams;
}

const ALL_ADULT_STREAMS = generateMockAdultStreams();

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

export default function ZoneLivePage() {
  // --- AgeGate check ---
  const hasAccess = useAdultAccess();

  // --- Filter state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeGender, setActiveGender] = useState('all');
  const [activeTag, setActiveTag] = useState('all');
  const [activeStreamType, setActiveStreamType] = useState('all');
  const [activePlatform, setActivePlatform] = useState('all');
  const [activeSort, setActiveSort] = useState('hot');

  // --- Player state ---
  const [playingStream, setPlayingStream] = useState<AdultLiveStream | null>(null);

  // --- Access gate ---
  if (!hasAccess) {
    return <AccessDenied />;
  }

  // --- Active filter count ---
  const activeFilterCount = [
    activeGender !== 'all',
    activeTag !== 'all',
    activeStreamType !== 'all',
    activePlatform !== 'all',
  ].filter(Boolean).length;

  // --- Filtered & sorted streams ---
  const filteredStreams = useMemo(() => {
    let list = [...ALL_ADULT_STREAMS];

    if (activeGender !== 'all') {
      list = list.filter((s) => s.streamerGender === activeGender);
    }
    if (activeTag !== 'all') {
      list = list.filter((s) => s.streamerTag === activeTag);
    }
    if (activeStreamType !== 'all') {
      list = list.filter((s) => s.streamType === activeStreamType);
    }
    if (activePlatform !== 'all') {
      list = list.filter((s) => s.source === activePlatform);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.streamerName.toLowerCase().includes(q) ||
          s.source.toLowerCase().includes(q)
      );
    }

    // Sort
    switch (activeSort) {
      case 'latest':
        list.sort((a, b) => b.id.localeCompare(a.id));
        break;
      case 'viewers':
        list.sort((a, b) => b.viewers - a.viewers);
        break;
      case 'rating':
        list.sort((a, b) => b.score - a.score);
        break;
      case 'random':
        list.sort(() => Math.random() - 0.5);
        break;
      case 'hot':
      default:
        list.sort((a, b) => b.viewers * b.score - a.viewers * a.score);
        break;
    }

    return list;
  }, [activeGender, activeTag, activeStreamType, activePlatform, searchQuery, activeSort]);

  // --- Handlers ---
  const handlePlayStream = useCallback((stream: AdultLiveStream) => {
    setPlayingStream(stream);
  }, []);

  const closePlayer = useCallback(() => {
    setPlayingStream(null);
  }, []);

  const clearFilters = useCallback(() => {
    setActiveGender('all');
    setActiveTag('all');
    setActiveStreamType('all');
    setActivePlatform('all');
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
            <span>成人直播专区</span>
            <RatingBadge rating="NC-17" size="md" />
          </h1>
          <div className="flex items-center gap-1.5 text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
            <CircleDot size={8} />
            <span>LIVE</span>
          </div>
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
            placeholder="搜索主播、直播间..."
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
            else if (opt.id === 'viewers') SortIcon = Users;
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
              label="主播性别"
              icon={<UserCircle size={11} />}
              options={GENDER_OPTIONS}
              value={activeGender}
              onChange={setActiveGender}
            />
            <FilterRow
              label="主播特征"
              icon={<Sparkles size={11} />}
              options={STREAMER_TAG_OPTIONS}
              value={activeTag}
              onChange={setActiveTag}
            />
            <FilterRow
              label="直播类型"
              icon={<Tv size={11} />}
              options={STREAM_TYPE_OPTIONS}
              value={activeStreamType}
              onChange={setActiveStreamType}
            />
            <FilterRow
              label="平台来源"
              icon={<Radio size={11} />}
              options={PLATFORM_OPTIONS}
              value={activePlatform}
              onChange={setActivePlatform}
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
        {(activeGender !== 'all' || activeTag !== 'all' || activeStreamType !== 'all' || activePlatform !== 'all' || searchQuery) && (
          <div className="flex items-center gap-2 mb-3 text-[12px] text-[#888]">
            <SlidersHorizontal size={12} />
            <span>
              {activeGender !== 'all' && GENDER_OPTIONS.find(g => g.id === activeGender)?.label}
              {activeTag !== 'all' && ` · ${STREAMER_TAG_OPTIONS.find(t => t.id === activeTag)?.label}`}
              {activeStreamType !== 'all' && ` · ${STREAM_TYPE_OPTIONS.find(t => t.id === activeStreamType)?.label}`}
              {activePlatform !== 'all' && ` · ${activePlatform}`}
              {searchQuery && ` · "${searchQuery}"`}
            </span>
            <span className="text-[#555]">·</span>
            <span>{filteredStreams.length} 个结果</span>
          </div>
        )}

        {/* ===== Stream Grid ===== */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
          {filteredStreams.map((s) => (
            <div
              key={s.id}
              onClick={() => handlePlayStream(s)}
              className="group cursor-pointer rounded-xl overflow-hidden transition hover:-translate-y-1"
            >
              <div className="relative aspect-video bg-[#1a1a1a] overflow-hidden rounded-xl">
                {s.cover ? (
                  <img
                    src={s.cover}
                    alt={s.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#1a0a2a] to-[#2a0a1a] flex items-center justify-center">
                    <Radio size={32} className="text-white/20" />
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                    <PlayCircle size={24} className="text-white" />
                  </div>
                </div>
                {/* Live badge */}
                {s.isLive && (
                  <span className="absolute bottom-1.5 right-1.5 bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                    <CircleDot size={7} />
                    LIVE
                  </span>
                )}
                {/* Source badge */}
                <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                  {s.source}
                </span>
                {/* NC-17 Rating badge */}
                <span className="absolute top-1.5 right-1.5">
                  <RatingBadge rating="NC-17" />
                </span>
                {/* Viewer count */}
                <span className="absolute bottom-1.5 left-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <Eye size={8} />
                  {fmtNum(s.viewers)}
                </span>
              </div>
              <div className="pt-2 pb-1">
                <h3 className="text-sm font-medium text-white line-clamp-1 leading-snug group-hover:text-[#3ea6ff] transition">
                  {s.streamerName}
                </h3>
                <div className="flex items-center gap-1.5 text-[12px] text-[#8a8a8a] mt-1">
                  <Eye size={10} />
                  <span>{fmtNum(s.viewers)}</span>
                  <span className="text-[#555]">·</span>
                  <Star size={10} />
                  <span>{s.score}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ===== Empty state ===== */}
        {filteredStreams.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <Radio size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">暂无匹配的直播</p>
            <p className="text-xs mt-1 text-[#555]">
              尝试调整筛选条件或搜索关键词
            </p>
          </div>
        )}
      </main>

      {/* ===== Video Player Modal ===== */}
      {playingStream && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-3 md:p-6"
          onClick={closePlayer}
        >
          <div
            className="w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-white font-bold text-base md:text-lg truncate">
                  {playingStream.streamerName} 的直播间
                </h2>
                <RatingBadge rating="NC-17" />
                <span className="text-[11px] text-[#888] bg-[#2a2a2a] px-2 py-0.5 rounded shrink-0">
                  {playingStream.source}
                </span>
                {playingStream.isLive && (
                  <span className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20 flex items-center gap-0.5 shrink-0">
                    <CircleDot size={7} />
                    LIVE
                  </span>
                )}
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
                src={playingStream.url || 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'}
                title={playingStream.title}
                source={playingStream.source}
                rating="NC-17"
                autoPlay
              />
            </div>

            {/* Stream info below player */}
            <div className="mt-3 flex items-center gap-3 text-[13px] text-[#8a8a8a]">
              <span className="flex items-center gap-1">
                <Eye size={12} /> {fmtNum(playingStream.viewers)} 观看
              </span>
              <span className="flex items-center gap-1">
                <Star size={12} /> {playingStream.score} 分
              </span>
              <span className="flex items-center gap-1">
                <UserCircle size={12} /> {GENDER_OPTIONS.find(g => g.id === playingStream.streamerGender)?.label}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
