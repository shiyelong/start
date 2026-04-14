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
  Globe,
  Film,
  PlayCircle,
  ShieldAlert,
  Lock,
  SlidersHorizontal,
  Monitor,
  Timer,
  ArrowUpDown,
  Flame,
  CalendarDays,
  Star,
  BarChart3,
  Shuffle,
  Video,
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

const REGION_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部地区' },
  { id: 'jp', label: '日本' },
  { id: 'us-eu', label: '欧美' },
  { id: 'cn', label: '国产' },
  { id: 'kr', label: '韩国' },
  { id: 'sea', label: '东南亚' },
  { id: 'in', label: '印度' },
  { id: 'latam', label: '拉美' },
  { id: 'ru', label: '俄罗斯' },
  { id: 'af', label: '非洲' },
];

const VIDEO_TYPE_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部类型' },
  { id: 'drama', label: '剧情片' },
  { id: 'pure', label: '纯爱' },
  { id: 'animation', label: '动画/3D/CG' },
  { id: 'amateur', label: '业余自拍' },
  { id: 'live-rec', label: '直播录像' },
  { id: 'vr', label: 'VR' },
  { id: 'asmr', label: 'ASMR' },
];

const QUALITY_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部画质' },
  { id: '4k', label: '4K' },
  { id: '1080p', label: '1080p' },
  { id: '720p', label: '720p' },
  { id: '480p', label: '480p' },
];

const DURATION_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部时长' },
  { id: 'short', label: '短片(<10分钟)' },
  { id: 'medium', label: '中片(10-30分钟)' },
  { id: 'long', label: '长片(30-60分钟)' },
  { id: 'full', label: '全片电影(>60分钟)' },
];

const SORT_OPTIONS: FilterOption[] = [
  { id: 'hot', label: '热度' },
  { id: 'latest', label: '最新' },
  { id: 'rating', label: '评分' },
  { id: 'views', label: '播放量' },
  { id: 'duration', label: '时长' },
  { id: 'random', label: '随机' },
];

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface AdultVideo {
  id: string;
  title: string;
  cover: string;
  source: string;
  sourceId: string;
  region: string;
  videoType: string;
  quality: string;
  durationCategory: string;
  rating: ContentRating;
  duration: string;
  durationSeconds: number;
  views: number;
  score: number;
  date: string;
  url: string;
}

function generateMockAdultVideos(): AdultVideo[] {
  const regions = REGION_OPTIONS.filter(r => r.id !== 'all').map(r => r.id);
  const types = VIDEO_TYPE_OPTIONS.filter(t => t.id !== 'all').map(t => t.id);
  const qualities = QUALITY_OPTIONS.filter(q => q.id !== 'all').map(q => q.id);
  const durations: { cat: string; label: string; seconds: number }[] = [
    { cat: 'short', label: '08:30', seconds: 510 },
    { cat: 'medium', label: '22:15', seconds: 1335 },
    { cat: 'long', label: '45:00', seconds: 2700 },
    { cat: 'full', label: '1:32:00', seconds: 5520 },
  ];

  const titles = [
    '午后阳光', '夏日回忆', '都市夜色', '温泉物语',
    '海滩假日', '私人教练', '办公室恋情', '邻家女孩',
    '校园青春', '深夜食堂', '旅行日记', '健身房邂逅',
    '泳池派对', '摄影棚日常', '模特写真', '舞蹈教室',
    '瑜伽时光', '按摩体验', '温泉旅馆', '度假别墅',
    '城市探索', '乡村生活', '海岛风情', '雪山温泉',
    '花园午后', '阁楼秘密', '画室模特', '音乐教室',
    '咖啡时光', '书店邂逅', '图书馆', '电影院',
    '公园散步', '博物馆', '美术馆', '剧场后台',
    '录音棚', '化妆间', '更衣室', '休息室',
  ];

  const sources = ['Source-A', 'Source-B', 'Source-C', 'Source-D', 'Source-E'];

  const covers = [
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&q=80',
    'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400&q=80',
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&q=80',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&q=80',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80',
    'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=400&q=80',
    'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=400&q=80',
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=400&q=80',
  ];

  const videos: AdultVideo[] = [];
  for (let i = 0; i < titles.length; i++) {
    const dur = durations[i % durations.length];
    videos.push({
      id: `av-${i + 1}`,
      title: titles[i],
      cover: covers[i % covers.length],
      source: sources[i % sources.length],
      sourceId: `src-${i % sources.length}`,
      region: regions[i % regions.length],
      videoType: types[i % types.length],
      quality: qualities[i % qualities.length],
      durationCategory: dur.cat,
      rating: 'NC-17',
      duration: dur.label,
      durationSeconds: dur.seconds + (i * 37),
      views: Math.floor(Math.random() * 2000000) + 5000,
      score: Math.round((Math.random() * 3 + 7) * 10) / 10,
      date: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
      url: `/api/video/stream/av-${i + 1}`,
    });
  }
  return videos;
}

const ALL_ADULT_VIDEOS = generateMockAdultVideos();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function toAggregatedItem(v: AdultVideo): AggregatedItem {
  return {
    id: v.id,
    title: v.title,
    cover: v.cover,
    source: v.source,
    sourceId: v.sourceId,
    rating: v.rating,
    type: 'video',
    url: v.url,
    metadata: {
      views: v.views,
      duration: v.duration,
      score: v.score,
    },
  };
}

// ---------------------------------------------------------------------------
// Mock danmaku
// ---------------------------------------------------------------------------

const MOCK_DANMAKU: DanmakuItem[] = [
  { id: 'd1', text: '不错', time: 3, color: '#FFFFFF', position: 'scroll', size: 'normal' },
  { id: 'd2', text: '精彩', time: 8, color: '#FF6B6B', position: 'scroll', size: 'normal' },
  { id: 'd3', text: '高能预警', time: 15, color: '#FFFF00', position: 'top', size: 'large' },
  { id: 'd4', text: '画质真好', time: 22, color: '#3EA6FF', position: 'scroll', size: 'normal' },
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

export default function ZoneVideosPage() {
  // --- AgeGate check ---
  const hasAccess = useAdultAccess();

  // --- Filter state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeRegion, setActiveRegion] = useState('all');
  const [activeVideoType, setActiveVideoType] = useState('all');
  const [activeQuality, setActiveQuality] = useState('all');
  const [activeDuration, setActiveDuration] = useState('all');
  const [activeSort, setActiveSort] = useState('hot');

  // --- Player state ---
  const [playingVideo, setPlayingVideo] = useState<AdultVideo | null>(null);
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
    activeRegion !== 'all',
    activeVideoType !== 'all',
    activeQuality !== 'all',
    activeDuration !== 'all',
  ].filter(Boolean).length;

  // --- Filtered & sorted videos ---
  const filteredVideos = useMemo(() => {
    let list = [...ALL_ADULT_VIDEOS];

    if (activeRegion !== 'all') {
      list = list.filter((v) => v.region === activeRegion);
    }
    if (activeVideoType !== 'all') {
      list = list.filter((v) => v.videoType === activeVideoType);
    }
    if (activeQuality !== 'all') {
      list = list.filter((v) => v.quality === activeQuality);
    }
    if (activeDuration !== 'all') {
      list = list.filter((v) => v.durationCategory === activeDuration);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.source.toLowerCase().includes(q)
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
      case 'views':
        list.sort((a, b) => b.views - a.views);
        break;
      case 'duration':
        list.sort((a, b) => b.durationSeconds - a.durationSeconds);
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
  }, [activeRegion, activeVideoType, activeQuality, activeDuration, searchQuery, activeSort]);

  // --- AutoPlay candidate ---
  const autoPlayCandidate = useMemo<AutoPlayCandidate | null>(() => {
    if (!playingVideo || filteredVideos.length < 2) return null;
    const idx = filteredVideos.findIndex((v) => v.id === playingVideo.id);
    const next = filteredVideos[idx + 1] ?? filteredVideos[0];
    if (!next || next.id === playingVideo.id) return null;
    return {
      item: toAggregatedItem(next),
      reason: 'recommended',
      priority: 1,
    };
  }, [playingVideo, filteredVideos]);

  const autoPlayQueue = useMemo<AutoPlayCandidate[]>(() => {
    if (!playingVideo) return [];
    const idx = filteredVideos.findIndex((v) => v.id === playingVideo.id);
    return filteredVideos
      .slice(idx + 1, idx + 6)
      .map((v) => ({
        item: toAggregatedItem(v),
        reason: 'recommended' as AutoPlayCandidate['reason'],
        priority: 1,
      }));
  }, [playingVideo, filteredVideos]);

  // --- Handlers ---
  const handlePlayVideo = useCallback((video: AdultVideo) => {
    setPlayingVideo(video);
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
    const nextVideo = ALL_ADULT_VIDEOS.find((v) => v.id === autoPlayCandidate.item.id);
    if (nextVideo) handlePlayVideo(nextVideo);
    setShowAutoPlay(false);
  }, [autoPlayCandidate, handlePlayVideo]);

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
    setPlayingVideo(null);
    setShowAutoPlay(false);
  }, []);

  const clearFilters = useCallback(() => {
    setActiveRegion('all');
    setActiveVideoType('all');
    setActiveQuality('all');
    setActiveDuration('all');
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
            <span>成人视频专区</span>
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
            placeholder="搜索成人视频..."
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
            else if (opt.id === 'views') SortIcon = BarChart3;
            else if (opt.id === 'duration') SortIcon = Timer;
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
              label="地区/产地"
              icon={<Globe size={11} />}
              options={REGION_OPTIONS}
              value={activeRegion}
              onChange={setActiveRegion}
            />
            <FilterRow
              label="视频类型"
              icon={<Film size={11} />}
              options={VIDEO_TYPE_OPTIONS}
              value={activeVideoType}
              onChange={setActiveVideoType}
            />
            <FilterRow
              label="画质"
              icon={<Monitor size={11} />}
              options={QUALITY_OPTIONS}
              value={activeQuality}
              onChange={setActiveQuality}
            />
            <FilterRow
              label="时长"
              icon={<Timer size={11} />}
              options={DURATION_OPTIONS}
              value={activeDuration}
              onChange={setActiveDuration}
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
        {(activeRegion !== 'all' || activeVideoType !== 'all' || activeQuality !== 'all' || activeDuration !== 'all' || searchQuery) && (
          <div className="flex items-center gap-2 mb-3 text-[12px] text-[#888]">
            <SlidersHorizontal size={12} />
            <span>
              {activeRegion !== 'all' && REGION_OPTIONS.find(r => r.id === activeRegion)?.label}
              {activeVideoType !== 'all' && ` · ${VIDEO_TYPE_OPTIONS.find(t => t.id === activeVideoType)?.label}`}
              {activeQuality !== 'all' && ` · ${QUALITY_OPTIONS.find(q => q.id === activeQuality)?.label}`}
              {activeDuration !== 'all' && ` · ${DURATION_OPTIONS.find(d => d.id === activeDuration)?.label}`}
              {searchQuery && ` · "${searchQuery}"`}
            </span>
            <span className="text-[#555]">·</span>
            <span>{filteredVideos.length} 个结果</span>
          </div>
        )}

        {/* ===== Video Grid ===== */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
          {filteredVideos.map((v) => (
            <div
              key={v.id}
              onClick={() => handlePlayVideo(v)}
              className="group cursor-pointer rounded-xl overflow-hidden transition hover:-translate-y-1"
            >
              <div className="relative aspect-video bg-[#1a1a1a] overflow-hidden rounded-xl">
                {v.cover ? (
                  <img
                    src={v.cover}
                    alt={v.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#1a0a1a] to-[#2a0a2a] flex items-center justify-center">
                    <PlayCircle size={32} className="text-white/20" />
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                    <PlayCircle size={24} className="text-white" />
                  </div>
                </div>
                {/* Duration badge */}
                <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <Clock size={8} />
                  {v.duration}
                </span>
                {/* Source badge */}
                <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                  {v.source}
                </span>
                {/* NC-17 Rating badge */}
                <span className="absolute top-1.5 right-1.5">
                  <RatingBadge rating="NC-17" />
                </span>
                {/* Quality badge */}
                {v.quality !== '480p' && (
                  <span className="absolute bottom-1.5 left-1.5 bg-[#3ea6ff]/90 text-[#0f0f0f] text-[9px] px-1.5 py-0.5 rounded font-bold">
                    {v.quality.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="pt-2 pb-1">
                <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug group-hover:text-[#3ea6ff] transition">
                  {v.title}
                </h3>
                <div className="flex items-center gap-1.5 text-[12px] text-[#8a8a8a] mt-1">
                  <Eye size={10} />
                  <span>{fmtNum(v.views)}</span>
                  <span className="text-[#555]">·</span>
                  <Star size={10} />
                  <span>{v.score}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ===== Empty state ===== */}
        {filteredVideos.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <Video size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">暂无匹配的视频</p>
            <p className="text-xs mt-1 text-[#555]">
              尝试调整筛选条件或搜索关键词
            </p>
          </div>
        )}
      </main>

      {/* ===== Video Player Modal ===== */}
      {playingVideo && (
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
                  {playingVideo.title}
                </h2>
                <RatingBadge rating="NC-17" />
                <span className="text-[11px] text-[#888] bg-[#2a2a2a] px-2 py-0.5 rounded shrink-0">
                  {playingVideo.source}
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
                src={playingVideo.url || 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'}
                title={playingVideo.title}
                source={playingVideo.source}
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

            {/* Video info below player */}
            <div className="mt-3 flex items-center gap-3 text-[13px] text-[#8a8a8a]">
              <span className="flex items-center gap-1">
                <Eye size={12} /> {fmtNum(playingVideo.views)} 播放
              </span>
              <span className="flex items-center gap-1">
                <Star size={12} /> {playingVideo.score} 分
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} /> {playingVideo.duration}
              </span>
              <span className="flex items-center gap-1">
                <Monitor size={12} /> {playingVideo.quality.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
