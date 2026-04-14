'use client';

import { useState, useMemo, useCallback } from 'react';
import Header from '@/components/layout/Header';
import RatingBadge from '@/components/ui/RatingBadge';
import VideoPlayer from '@/components/player/VideoPlayer';
import type { ContentRating, AggregatedItem } from '@/lib/types';
import { AutoPlayEngine } from '@/lib/player/autoplay-engine';
import {
  Tv,
  Search,
  Filter,
  X,
  Star,
  Calendar,
  Play,
  Heart,
  HeartOff,
  ChevronRight,
  Clock,
  Globe,
  Tag,
  Layers,
  Eye,
  ListVideo,
  CalendarDays,
  Flame,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnimeEpisode {
  id: string;
  number: number;
  title: string;
  duration: string;
  date: string;
  streamUrl: string;
}

interface MockAnime {
  id: string;
  title: string;
  cover: string;
  genres: string[];
  status: '连载中' | '已完结';
  source: string;
  sourceId: string;
  rating: ContentRating;
  episodes: AnimeEpisode[];
  score: number;
  views: number;
  description: string;
  year: number;
  region: string;
  updateDay?: number; // 0=Sun..6=Sat, undefined = not airing this season
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Filter definitions
// ---------------------------------------------------------------------------

interface FilterOption {
  id: string;
  label: string;
}

const GENRE_TAGS: FilterOption[] = [
  { id: '热血', label: '热血' },
  { id: '恋爱', label: '恋爱' },
  { id: '搞笑', label: '搞笑' },
  { id: '机甲', label: '机甲' },
  { id: '异世界', label: '异世界' },
  { id: '后宫', label: '后宫' },
  { id: '百合', label: '百合' },
  { id: '耽美', label: '耽美' },
  { id: '恐怖', label: '恐怖' },
  { id: '运动', label: '运动' },
  { id: '音乐', label: '音乐' },
  { id: '日常', label: '日常' },
  { id: '奇幻', label: '奇幻' },
  { id: '科幻', label: '科幻' },
  { id: '悬疑', label: '悬疑' },
  { id: '治愈', label: '治愈' },
];

const REGION_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部地区' },
  { id: '日漫', label: '日漫' },
  { id: '国漫', label: '国漫' },
  { id: '美漫', label: '美漫' },
  { id: '韩漫', label: '韩漫' },
];

const STATUS_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部状态' },
  { id: '连载中', label: '连载中' },
  { id: '已完结', label: '已完结' },
];

const YEAR_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部年份' },
  { id: '2026', label: '2026' },
  { id: '2025', label: '2025' },
  { id: '2024', label: '2024' },
  { id: '2023', label: '2023' },
  { id: '2022', label: '2022' },
  { id: 'older', label: '更早' },
];

const SCHEDULE_DAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

function makeEpisodes(count: number): AnimeEpisode[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ep-${i + 1}`,
    number: i + 1,
    title: `第${i + 1}话`,
    duration: `${Math.floor(Math.random() * 4) + 22}:00`,
    date: `2026-0${Math.min(4, Math.floor(i / 4) + 1)}-${String(((i * 7) % 28) + 1).padStart(2, '0')}`,
    streamUrl: `https://example.com/stream/ep-${i + 1}`,
  }));
}


const ALL_ANIME: MockAnime[] = [
  {
    id: 'a-1', title: '咒术回战 第三季', cover: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&q=80',
    genres: ['热血', '奇幻'], status: '连载中', source: '樱花动漫', sourceId: 'yhdm',
    rating: 'PG-13', episodes: makeEpisodes(12), score: 9.2, views: 3800000,
    description: '虎杖悠仁与同伴们在涩谷事变后继续对抗诅咒之王的战斗。',
    year: 2026, region: '日漫', updateDay: 6, lastUpdated: '2026-04-12',
  },
  {
    id: 'a-2', title: '鬼灭之刃 柱训练篇', cover: 'https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?w=300&q=80',
    genres: ['热血', '奇幻'], status: '已完结', source: 'AGE动漫', sourceId: 'age',
    rating: 'PG-13', episodes: makeEpisodes(8), score: 9.5, views: 5200000,
    description: '炭治郎在柱训练中不断突破极限，为最终决战做准备。',
    year: 2025, region: '日漫', lastUpdated: '2025-12-20',
  },
  {
    id: 'a-3', title: '间谍过家家 第三季', cover: 'https://images.unsplash.com/photo-1601850494422-3cf14624b0b3?w=300&q=80',
    genres: ['搞笑', '日常'], status: '连载中', source: 'GoGoAnime', sourceId: 'gogo',
    rating: 'PG', episodes: makeEpisodes(25), score: 8.8, views: 2900000,
    description: '黄昏一家的温馨搞笑日常继续，阿尼亚的学校生活更加精彩。',
    year: 2026, region: '日漫', updateDay: 0, lastUpdated: '2026-04-07',
  },
  {
    id: 'a-4', title: '进击的巨人 完结篇', cover: 'https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?w=300&q=80',
    genres: ['热血', '悬疑'], status: '已完结', source: '樱花动漫', sourceId: 'yhdm',
    rating: 'R', episodes: makeEpisodes(16), score: 9.8, views: 8500000,
    description: '艾伦的最终计划揭晓，人类与巨人的命运迎来终章。',
    year: 2024, region: '日漫', lastUpdated: '2024-11-05',
  },
  {
    id: 'a-5', title: '机动战士高达 水星的魔女', cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&q=80',
    genres: ['机甲', '恋爱'], status: '已完结', source: 'AnimePahe', sourceId: 'animepahe',
    rating: 'PG-13', episodes: makeEpisodes(24), score: 8.6, views: 1800000,
    description: '少女苏莱塔在水星学园驾驶高达风灵的校园机甲故事。',
    year: 2023, region: '日漫', lastUpdated: '2023-07-02',
  },
  {
    id: 'a-6', title: '葬送的芙莉莲', cover: 'https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=300&q=80',
    genres: ['奇幻', '治愈'], status: '连载中', source: '动漫花园', sourceId: 'dmhy',
    rating: 'PG', episodes: makeEpisodes(28), score: 9.4, views: 3200000,
    description: '精灵魔法使芙莉莲在勇者一行打倒魔王后踏上了解人类的旅途。',
    year: 2026, region: '日漫', updateDay: 5, lastUpdated: '2026-04-11',
  },
  {
    id: 'a-7', title: '斗破苍穹 年番', cover: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=300&q=80',
    genres: ['热血', '异世界'], status: '连载中', source: '樱花动漫', sourceId: 'yhdm',
    rating: 'PG-13', episodes: makeEpisodes(52), score: 7.8, views: 4100000,
    description: '萧炎在斗气大陆不断修炼突破，追寻药老的足迹。',
    year: 2026, region: '国漫', updateDay: 0, lastUpdated: '2026-04-07',
  },
  {
    id: 'a-8', title: '我独自升级 第二季', cover: 'https://images.unsplash.com/photo-1596727147705-61a532a659bd?w=300&q=80',
    genres: ['热血', '异世界'], status: '连载中', source: 'Anime1', sourceId: 'anime1',
    rating: 'PG-13', episodes: makeEpisodes(13), score: 8.9, views: 2600000,
    description: '成振宇继续在地下城中升级，面对更强大的敌人。',
    year: 2026, region: '韩漫', updateDay: 6, lastUpdated: '2026-04-12',
  },
  {
    id: 'a-9', title: '蓝色监狱 第二季', cover: 'https://images.unsplash.com/photo-1611457194403-d3f8c5154dc2?w=300&q=80',
    genres: ['运动', '热血'], status: '连载中', source: 'GoGoAnime', sourceId: 'gogo',
    rating: 'PG-13', episodes: makeEpisodes(24), score: 8.5, views: 2100000,
    description: '蓝色监狱计划进入新阶段，世界级前锋之战开启。',
    year: 2026, region: '日漫', updateDay: 6, lastUpdated: '2026-04-12',
  },
  {
    id: 'a-10', title: '无职转生 第三季', cover: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=300&q=80',
    genres: ['异世界', '奇幻'], status: '连载中', source: 'AGE动漫', sourceId: 'age',
    rating: 'PG-13', episodes: makeEpisodes(12), score: 8.7, views: 1900000,
    description: '鲁迪乌斯在异世界的冒险继续，新的危机即将来临。',
    year: 2026, region: '日漫', updateDay: 1, lastUpdated: '2026-04-08',
  },
  {
    id: 'a-11', title: '孤独摇滚', cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&q=80',
    genres: ['音乐', '日常'], status: '已完结', source: 'AnimePahe', sourceId: 'animepahe',
    rating: 'PG', episodes: makeEpisodes(12), score: 9.1, views: 2400000,
    description: '社恐少女后藤一里加入乐队，在音乐中找到自我。',
    year: 2023, region: '日漫', lastUpdated: '2023-12-25',
  },
  {
    id: 'a-12', title: '药屋少女的呢喃 第二季', cover: 'https://images.unsplash.com/photo-1601850494422-3cf14624b0b3?w=300&q=80',
    genres: ['悬疑', '恋爱'], status: '连载中', source: '动漫花园', sourceId: 'dmhy',
    rating: 'PG', episodes: makeEpisodes(24), score: 8.9, views: 2000000,
    description: '猫猫在后宫中继续用药学知识解开更多谜团。',
    year: 2026, region: '日漫', updateDay: 3, lastUpdated: '2026-04-10',
  },
  {
    id: 'a-13', title: '仙逆', cover: 'https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?w=300&q=80',
    genres: ['奇幻', '热血'], status: '连载中', source: '樱花动漫', sourceId: 'yhdm',
    rating: 'PG-13', episodes: makeEpisodes(40), score: 8.2, views: 3500000,
    description: '王林在修仙世界中逆天改命的传奇故事。',
    year: 2026, region: '国漫', updateDay: 4, lastUpdated: '2026-04-11',
  },
  {
    id: 'a-14', title: '赛博朋克 边缘行者', cover: 'https://images.unsplash.com/photo-1611457194403-d3f8c5154dc2?w=300&q=80',
    genres: ['科幻', '热血'], status: '已完结', source: 'GoGoAnime', sourceId: 'gogo',
    rating: 'R', episodes: makeEpisodes(10), score: 9.3, views: 4500000,
    description: '在夜之城中，少年大卫走上了成为边缘行者的道路。',
    year: 2022, region: '日漫', lastUpdated: '2022-09-13',
  },
  {
    id: 'a-15', title: '无敌破坏王 动画版', cover: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=300&q=80',
    genres: ['搞笑', '日常'], status: '已完结', source: 'Anime1', sourceId: 'anime1',
    rating: 'G', episodes: makeEpisodes(13), score: 7.5, views: 800000,
    description: '游戏角色们在街机世界中的冒险故事。',
    year: 2023, region: '美漫', lastUpdated: '2023-06-15',
  },
];


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + '亿';
  if (n >= 10_000) return (n / 10_000).toFixed(1) + '万';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function getScoreColor(score: number): string {
  if (score >= 9) return 'text-yellow-400';
  if (score >= 8) return 'text-green-400';
  if (score >= 7) return 'text-blue-400';
  return 'text-gray-400';
}

// ===========================================================================
// Main Page Component
// ===========================================================================

export default function AnimePage() {
  // --- Filter state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGenres, setActiveGenres] = useState<string[]>([]);
  const [activeRegion, setActiveRegion] = useState('all');
  const [activeStatus, setActiveStatus] = useState('all');
  const [activeYear, setActiveYear] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // --- View state ---
  const [activeTab, setActiveTab] = useState<'browse' | 'schedule' | 'following'>('browse');
  const [selectedAnime, setSelectedAnime] = useState<MockAnime | null>(null);

  // --- Player state ---
  const [playingEpisode, setPlayingEpisode] = useState<{
    anime: MockAnime;
    episode: AnimeEpisode;
  } | null>(null);

  // --- Follow list (追番) ---
  const [followedIds, setFollowedIds] = useState<Set<string>>(
    () => new Set(['a-1', 'a-6', 'a-12'])
  );

  // --- Toggle genre (multi-select) ---
  const toggleGenre = useCallback((genreId: string) => {
    setActiveGenres((prev) =>
      prev.includes(genreId)
        ? prev.filter((g) => g !== genreId)
        : [...prev, genreId]
    );
  }, []);

  // --- Toggle follow ---
  const toggleFollow = useCallback((animeId: string) => {
    setFollowedIds((prev) => {
      const next = new Set(prev);
      if (next.has(animeId)) {
        next.delete(animeId);
      } else {
        next.add(animeId);
      }
      return next;
    });
  }, []);

  // --- Filtered anime ---
  const filteredAnime = useMemo(() => {
    let list = ALL_ANIME;

    if (activeGenres.length > 0) {
      list = list.filter((a) =>
        activeGenres.every((g) => a.genres.includes(g))
      );
    }
    if (activeRegion !== 'all') {
      list = list.filter((a) => a.region === activeRegion);
    }
    if (activeStatus !== 'all') {
      list = list.filter((a) => a.status === activeStatus);
    }
    if (activeYear !== 'all') {
      if (activeYear === 'older') {
        list = list.filter((a) => a.year < 2022);
      } else {
        list = list.filter((a) => a.year === Number(activeYear));
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.genres.some((g) => g.includes(q)) ||
          a.description.toLowerCase().includes(q)
      );
    }

    return list;
  }, [activeGenres, activeRegion, activeStatus, activeYear, searchQuery]);

  // --- Schedule data (anime airing this season) ---
  const scheduleByDay = useMemo(() => {
    const map: Record<number, MockAnime[]> = {};
    for (let d = 0; d < 7; d++) map[d] = [];
    for (const anime of ALL_ANIME) {
      if (anime.updateDay !== undefined && anime.status === '连载中') {
        map[anime.updateDay].push(anime);
      }
    }
    return map;
  }, []);

  // --- Followed anime list ---
  const followedAnime = useMemo(
    () => ALL_ANIME.filter((a) => followedIds.has(a.id)),
    [followedIds]
  );

  // --- Active filter count ---
  const activeFilterCount =
    activeGenres.length +
    (activeRegion !== 'all' ? 1 : 0) +
    (activeStatus !== 'all' ? 1 : 0) +
    (activeYear !== 'all' ? 1 : 0);

  // --- AutoPlay handler ---
  const handleEpisodeEnd = useCallback(() => {
    if (!playingEpisode) return;
    const { anime, episode } = playingEpisode;
    const idx = anime.episodes.findIndex((ep) => ep.id === episode.id);
    if (idx < anime.episodes.length - 1) {
      setPlayingEpisode({ anime, episode: anime.episodes[idx + 1] });
    }
  }, [playingEpisode]);

  // =========================================================================
  // Video Player fullscreen overlay
  // =========================================================================
  if (playingEpisode) {
    const { anime, episode } = playingEpisode;
    const currentIdx = anime.episodes.findIndex((ep) => ep.id === episode.id);

    // Build autoplay pool from remaining episodes
    const pool: AggregatedItem[] = anime.episodes
      .filter((ep) => ep.id !== episode.id)
      .map((ep) => ({
        id: ep.id,
        title: `${anime.title} ${ep.title}`,
        cover: anime.cover,
        source: anime.source,
        sourceId: anime.sourceId,
        rating: anime.rating,
        type: 'anime' as const,
        url: ep.streamUrl,
        metadata: {
          episode: ep.number,
          seriesId: anime.id,
        },
      }));

    const autoplayEngine = new AutoPlayEngine(pool);

    return (
      <div className="fixed inset-0 z-[70] bg-black flex flex-col">
        {/* Player header */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#0f0f0f] border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setPlayingEpisode(null)}
              className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Close player"
            >
              <X className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium text-white truncate">
              {anime.title}
            </span>
            <span className="text-xs text-white/40">{episode.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <RatingBadge rating={anime.rating} />
            <button
              onClick={() => toggleFollow(anime.id)}
              className={`p-1.5 rounded-lg transition-colors ${
                followedIds.has(anime.id)
                  ? 'text-red-400 hover:text-red-300'
                  : 'text-white/40 hover:text-white'
              }`}
              aria-label={followedIds.has(anime.id) ? 'Unfollow' : 'Follow'}
            >
              {followedIds.has(anime.id) ? (
                <Heart className="w-4 h-4 fill-current" />
              ) : (
                <Heart className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Video player */}
        <div className="flex-shrink-0">
          <VideoPlayer
            src={episode.streamUrl}
            title={`${anime.title} - ${episode.title}`}
            source={anime.source}
            rating={anime.rating}
            autoPlay
            onEnded={handleEpisodeEnd}
          />
        </div>

        {/* Episode list below player */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#0f0f0f] px-4 py-3">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-1.5">
            <ListVideo size={14} className="text-[#3ea6ff]" />
            剧集列表
            <span className="text-[11px] text-[#666] font-normal ml-1">
              共{anime.episodes.length}话
            </span>
          </h3>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {anime.episodes.map((ep) => (
              <button
                key={ep.id}
                onClick={() => setPlayingEpisode({ anime, episode: ep })}
                className={`px-2 py-2 rounded-lg text-xs font-medium transition ${
                  ep.id === episode.id
                    ? 'bg-[#3ea6ff] text-[#0f0f0f]'
                    : 'bg-[#1a1a1a] text-[#aaa] hover:bg-[#2a2a2a] hover:text-white border border-[#333]/50'
                }`}
              >
                {ep.number}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }


  // =========================================================================
  // Main page render
  // =========================================================================
  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
        {/* ===== Page Title ===== */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Tv size={22} className="text-[#3ea6ff]" />
            动漫中心
          </h1>
          <span className="text-xs text-[#666]">
            {ALL_ANIME.length} 部动漫 · 聚合多源
          </span>
        </div>

        {/* ===== Tab Navigation ===== */}
        <div className="flex gap-1 mb-4 border-b border-[#333]/50">
          {([
            { key: 'browse' as const, label: '全部动漫', icon: <Layers size={14} /> },
            { key: 'schedule' as const, label: '新番时间表', icon: <CalendarDays size={14} /> },
            { key: 'following' as const, label: '追番列表', icon: <Heart size={14} /> },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-[1px] ${
                activeTab === tab.key
                  ? 'text-[#3ea6ff] border-[#3ea6ff]'
                  : 'text-[#888] border-transparent hover:text-white'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.key === 'following' && followedIds.size > 0 && (
                <span className="ml-1 text-[10px] bg-[#3ea6ff]/20 text-[#3ea6ff] px-1.5 py-0.5 rounded-full">
                  {followedIds.size}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ===== Browse Tab ===== */}
        {activeTab === 'browse' && (
          <>
            {/* Search Bar */}
            <div className="relative mb-4">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索动漫名称、类型..."
                className="w-full h-9 pl-9 pr-20 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition"
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

            {/* Genre multi-tag pills */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
              {GENRE_TAGS.map((g) => (
                <button
                  key={g.id}
                  onClick={() => toggleGenre(g.id)}
                  className={`px-3 py-1.5 rounded-full text-[12px] whitespace-nowrap border transition shrink-0 ${
                    activeGenres.includes(g.id)
                      ? 'bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold'
                      : 'bg-transparent text-[#aaa] border-[#333] hover:bg-[#2a2a2a] hover:text-white'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {/* Active genre combination display */}
            {activeGenres.length > 1 && (
              <div className="flex items-center gap-1.5 mb-3 text-[12px]">
                <Tag size={11} className="text-[#3ea6ff]" />
                <span className="text-[#3ea6ff]">
                  组合筛选: {activeGenres.join(' + ')}
                </span>
                <button
                  onClick={() => setActiveGenres([])}
                  className="text-[#666] hover:text-white ml-1"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Expanded Filters */}
            {showFilters && (
              <div className="mb-4 p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50 space-y-3">
                {/* Region filter */}
                <div>
                  <p className="text-[11px] text-[#666] mb-2 flex items-center gap-1">
                    <Globe size={11} /> 地区
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {REGION_OPTIONS.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setActiveRegion(r.id)}
                        className={`px-3 py-1 rounded-full text-[12px] border transition ${
                          activeRegion === r.id
                            ? 'bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/40 font-medium'
                            : 'bg-transparent text-[#888] border-[#333] hover:text-white hover:border-[#555]'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Year filter */}
                <div>
                  <p className="text-[11px] text-[#666] mb-2 flex items-center gap-1">
                    <Calendar size={11} /> 年份
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {YEAR_OPTIONS.map((y) => (
                      <button
                        key={y.id}
                        onClick={() => setActiveYear(y.id)}
                        className={`px-3 py-1 rounded-full text-[12px] border transition ${
                          activeYear === y.id
                            ? 'bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/40 font-medium'
                            : 'bg-transparent text-[#888] border-[#333] hover:text-white hover:border-[#555]'
                        }`}
                      >
                        {y.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status filter */}
                <div>
                  <p className="text-[11px] text-[#666] mb-2 flex items-center gap-1">
                    <Clock size={11} /> 更新状态
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_OPTIONS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setActiveStatus(s.id)}
                        className={`px-3 py-1 rounded-full text-[12px] border transition ${
                          activeStatus === s.id
                            ? 'bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/40 font-medium'
                            : 'bg-transparent text-[#888] border-[#333] hover:text-white hover:border-[#555]'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clear filters */}
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => {
                      setActiveGenres([]);
                      setActiveRegion('all');
                      setActiveStatus('all');
                      setActiveYear('all');
                    }}
                    className="text-[11px] text-[#3ea6ff] hover:underline"
                  >
                    清除所有筛选
                  </button>
                )}
              </div>
            )}

            {/* Active filter summary */}
            {(activeFilterCount > 0 || searchQuery) && (
              <div className="flex items-center gap-2 mb-3 text-[12px] text-[#888]">
                <Filter size={12} />
                <span>
                  {activeGenres.length > 0 && activeGenres.join('+')}
                  {activeRegion !== 'all' && ` · ${activeRegion}`}
                  {activeStatus !== 'all' && ` · ${activeStatus}`}
                  {activeYear !== 'all' && ` · ${activeYear}`}
                  {searchQuery && ` · "${searchQuery}"`}
                </span>
                <span className="text-[#555]">·</span>
                <span>{filteredAnime.length} 个结果</span>
              </div>
            )}

            {/* Anime Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
              {filteredAnime.map((anime) => (
                <AnimeCard
                  key={anime.id}
                  anime={anime}
                  isFollowed={followedIds.has(anime.id)}
                  onSelect={() => setSelectedAnime(anime)}
                  onToggleFollow={() => toggleFollow(anime.id)}
                />
              ))}
            </div>

            {/* Empty state */}
            {filteredAnime.length === 0 && (
              <div className="text-center text-[#8a8a8a] py-20">
                <Tv size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-sm">暂无匹配的动漫</p>
                <p className="text-xs mt-1 text-[#555]">
                  尝试调整类型标签、地区或状态筛选
                </p>
              </div>
            )}
          </>
        )}


        {/* ===== Schedule Tab (新番时间表) ===== */}
        {activeTab === 'schedule' && (
          <div className="space-y-4">
            <p className="text-xs text-[#666] mb-2">
              当季新番更新时间表 · {ALL_ANIME.filter((a) => a.updateDay !== undefined && a.status === '连载中').length} 部连载中
            </p>
            {SCHEDULE_DAYS.map((dayLabel, dayIndex) => {
              const dayAnime = scheduleByDay[dayIndex] || [];
              const isToday = new Date().getDay() === dayIndex;
              return (
                <div key={dayIndex}>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-sm font-bold px-2.5 py-1 rounded-lg ${
                        isToday
                          ? 'bg-[#3ea6ff] text-[#0f0f0f]'
                          : 'bg-[#1a1a1a] text-[#aaa]'
                      }`}
                    >
                      周{dayLabel}
                    </span>
                    {isToday && (
                      <span className="text-[10px] text-[#3ea6ff] flex items-center gap-1">
                        <Flame size={10} />
                        今天
                      </span>
                    )}
                    <span className="text-[11px] text-[#555]">
                      {dayAnime.length} 部更新
                    </span>
                  </div>
                  {dayAnime.length > 0 ? (
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                      {dayAnime.map((anime) => (
                        <div
                          key={anime.id}
                          onClick={() => setSelectedAnime(anime)}
                          className="flex-shrink-0 w-[160px] cursor-pointer group"
                        >
                          <div className="relative aspect-[3/4] bg-[#1a1a1a] rounded-xl overflow-hidden mb-1.5">
                            <img
                              src={anime.cover}
                              alt={anime.title}
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                            <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                              {anime.source}
                            </span>
                            <span className="absolute top-1.5 right-1.5">
                              <RatingBadge rating={anime.rating} />
                            </span>
                            <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between">
                              <span className="text-[9px] bg-[#3ea6ff] text-[#0f0f0f] px-1.5 py-0.5 rounded font-bold">
                                更新至{anime.episodes.length}话
                              </span>
                              <span className={`text-[10px] font-bold ${getScoreColor(anime.score)}`}>
                                <Star size={8} className="inline mr-0.5" />
                                {anime.score}
                              </span>
                            </div>
                          </div>
                          <h3 className="text-xs font-medium text-white line-clamp-1 group-hover:text-[#3ea6ff] transition">
                            {anime.title}
                          </h3>
                          <p className="text-[10px] text-[#666]">{anime.region}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#444] py-3 pl-2">暂无更新</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ===== Following Tab (追番列表) ===== */}
        {activeTab === 'following' && (
          <div>
            {followedAnime.length > 0 ? (
              <div className="space-y-3">
                {followedAnime.map((anime) => (
                  <div
                    key={anime.id}
                    className="flex gap-3 p-3 rounded-xl bg-[#1a1a1a] border border-[#333]/50 hover:border-[#3ea6ff]/30 transition group"
                  >
                    <div
                      className="w-20 aspect-[3/4] rounded-lg overflow-hidden bg-[#212121] shrink-0 cursor-pointer"
                      onClick={() => setSelectedAnime(anime)}
                    >
                      <img
                        src={anime.cover}
                        alt={anime.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3
                            className="text-sm font-medium text-white truncate cursor-pointer group-hover:text-[#3ea6ff] transition"
                            onClick={() => setSelectedAnime(anime)}
                          >
                            {anime.title}
                          </h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <RatingBadge rating={anime.rating} />
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                anime.status === '连载中'
                                  ? 'bg-[#3ea6ff]/15 text-[#3ea6ff]'
                                  : 'bg-[#2ba640]/15 text-[#2ba640]'
                              }`}
                            >
                              {anime.status}
                            </span>
                            <span className={`text-[11px] font-bold ${getScoreColor(anime.score)}`}>
                              <Star size={9} className="inline mr-0.5" />
                              {anime.score}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleFollow(anime.id)}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition shrink-0"
                          aria-label="Unfollow"
                        >
                          <HeartOff size={16} />
                        </button>
                      </div>
                      <p className="text-[11px] text-[#666] mt-1.5 line-clamp-1">
                        {anime.description}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-[#555] flex items-center gap-1">
                          <Layers size={9} />
                          {anime.episodes.length}话
                        </span>
                        <span className="text-[10px] text-[#555]">
                          {anime.source}
                        </span>
                        {anime.updateDay !== undefined && (
                          <span className="text-[10px] text-[#3ea6ff] flex items-center gap-1">
                            <CalendarDays size={9} />
                            每周{SCHEDULE_DAYS[anime.updateDay]}更新
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() =>
                          setPlayingEpisode({
                            anime,
                            episode: anime.episodes[anime.episodes.length - 1],
                          })
                        }
                        className="mt-2 flex items-center gap-1 px-3 py-1 rounded-lg bg-[#3ea6ff]/15 text-[#3ea6ff] text-[11px] font-medium hover:bg-[#3ea6ff]/25 transition"
                      >
                        <Play size={10} />
                        看最新一话
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-[#8a8a8a] py-20">
                <Heart size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-sm">追番列表为空</p>
                <p className="text-xs mt-1 text-[#555]">
                  浏览动漫并点击追番按钮添加
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ===== Anime Detail Modal ===== */}
      {selectedAnime && (
        <AnimeDetailModal
          anime={selectedAnime}
          isFollowed={followedIds.has(selectedAnime.id)}
          onClose={() => setSelectedAnime(null)}
          onPlay={(anime, episode) => {
            setPlayingEpisode({ anime, episode });
            setSelectedAnime(null);
          }}
          onToggleFollow={() => toggleFollow(selectedAnime.id)}
        />
      )}
    </>
  );
}


// ===========================================================================
// Anime Card Component
// ===========================================================================

function AnimeCard({
  anime,
  isFollowed,
  onSelect,
  onToggleFollow,
}: {
  anime: MockAnime;
  isFollowed: boolean;
  onSelect: () => void;
  onToggleFollow: () => void;
}) {
  return (
    <div className="group cursor-pointer transition hover:-translate-y-1">
      <div
        className="relative aspect-[3/4] bg-[#1a1a1a] rounded-xl overflow-hidden"
        onClick={onSelect}
      >
        <img
          src={anime.cover}
          alt={anime.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        {/* Source badge */}
        <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
          {anime.source}
        </span>
        {/* MPAA Rating badge */}
        <span className="absolute top-1.5 right-1.5">
          <RatingBadge rating={anime.rating} />
        </span>
        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0 p-2 flex items-center justify-between">
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
              anime.status === '连载中'
                ? 'bg-[#3ea6ff] text-[#0f0f0f]'
                : 'bg-[#2ba640] text-white'
            }`}
          >
            {anime.status}
          </span>
          <span className="text-[9px] text-white/80 flex items-center gap-0.5">
            <Layers size={8} />
            {anime.episodes.length}话
          </span>
        </div>
      </div>
      <div className="pt-2">
        <div className="flex items-start justify-between gap-1">
          <h3
            className="text-sm font-medium text-white line-clamp-1 group-hover:text-[#3ea6ff] transition flex-1"
            onClick={onSelect}
          >
            {anime.title}
          </h3>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFollow();
            }}
            className={`p-0.5 transition shrink-0 ${
              isFollowed
                ? 'text-red-400'
                : 'text-[#555] hover:text-red-400'
            }`}
            aria-label={isFollowed ? 'Unfollow' : 'Follow'}
          >
            <Heart size={12} className={isFollowed ? 'fill-current' : ''} />
          </button>
        </div>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          <span className={`text-[10px] font-bold ${getScoreColor(anime.score)}`}>
            <Star size={8} className="inline mr-0.5" />
            {anime.score}
          </span>
          {anime.genres.slice(0, 2).map((g) => (
            <span
              key={g}
              className="text-[9px] px-1.5 py-0.5 rounded bg-[#2a2a2a] text-[#888]"
            >
              {g}
            </span>
          ))}
          <span className="text-[10px] text-[#555] flex items-center gap-0.5 ml-auto">
            <Eye size={9} />
            {fmtNum(anime.views)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Anime Detail Modal
// ===========================================================================

function AnimeDetailModal({
  anime,
  isFollowed,
  onClose,
  onPlay,
  onToggleFollow,
}: {
  anime: MockAnime;
  isFollowed: boolean;
  onClose: () => void;
  onPlay: (anime: MockAnime, episode: AnimeEpisode) => void;
  onToggleFollow: () => void;
}) {
  const [showAllEpisodes, setShowAllEpisodes] = useState(false);
  const displayedEpisodes = showAllEpisodes
    ? anime.episodes
    : anime.episodes.slice(0, 24);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#141414] border border-[#333] rounded-t-2xl md:rounded-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#141414]/95 backdrop-blur-xl border-b border-[#333]/50 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-bold text-base truncate">{anime.title}</h2>
            <RatingBadge rating={anime.rating} />
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#212121] flex items-center justify-center text-[#8a8a8a] hover:text-white transition shrink-0 ml-3"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Anime info */}
        <div className="px-5 py-4 border-b border-[#333]/30">
          <div className="flex gap-4 mb-3">
            <div className="w-24 aspect-[3/4] rounded-xl overflow-hidden shrink-0 bg-[#212121]">
              <img
                src={anime.cover}
                alt={anime.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-1.5 mb-2">
                <span
                  className={`text-[11px] px-2 py-0.5 rounded ${
                    anime.status === '连载中'
                      ? 'bg-[#3ea6ff]/15 text-[#3ea6ff]'
                      : 'bg-[#2ba640]/15 text-[#2ba640]'
                  }`}
                >
                  {anime.status}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-[#333] text-[#aaa] flex items-center gap-1">
                  <Layers size={10} />
                  {anime.episodes.length} 话
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded bg-[#333] font-bold ${getScoreColor(anime.score)}`}>
                  <Star size={10} className="inline mr-0.5" />
                  {anime.score}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-[#333] text-[#aaa] flex items-center gap-1">
                  <Eye size={10} />
                  {fmtNum(anime.views)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {anime.genres.map((g) => (
                  <span
                    key={g}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[#2a2a2a] text-[#888] flex items-center gap-0.5"
                  >
                    <Tag size={8} />
                    {g}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-[#666] flex items-center gap-1">
                <Globe size={10} />
                {anime.region} · {anime.year} · {anime.source}
              </p>
              {anime.updateDay !== undefined && (
                <p className="text-[11px] text-[#3ea6ff] flex items-center gap-1 mt-1">
                  <CalendarDays size={10} />
                  每周{SCHEDULE_DAYS[anime.updateDay]}更新
                </p>
              )}
            </div>
          </div>
          {anime.description && (
            <p className="text-sm text-[#8a8a8a] leading-relaxed">
              {anime.description}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onPlay(anime, anime.episodes[0])}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] text-sm font-semibold hover:bg-[#5ab8ff] transition"
            >
              <Play size={14} />
              开始观看
            </button>
            <button
              onClick={onToggleFollow}
              className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition border ${
                isFollowed
                  ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                  : 'bg-[#1a1a1a] text-[#aaa] border-[#333] hover:text-[#3ea6ff] hover:border-[#3ea6ff]/40'
              }`}
            >
              {isFollowed ? (
                <>
                  <CheckCircle2 size={14} />
                  已追番
                </>
              ) : (
                <>
                  <Heart size={14} />
                  追番
                </>
              )}
            </button>
          </div>
        </div>

        {/* Episode list */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <ListVideo size={14} className="text-[#3ea6ff]" />
              剧集列表
            </h3>
            <span className="text-[11px] text-[#666]">
              更新于 {anime.lastUpdated}
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {displayedEpisodes.map((ep) => (
              <button
                key={ep.id}
                onClick={() => onPlay(anime, ep)}
                className="flex flex-col items-center gap-0.5 px-2 py-2.5 rounded-lg bg-[#1a1a1a] border border-[#333]/50 hover:border-[#3ea6ff]/40 hover:bg-[#1a1a1a] transition group/ep"
              >
                <span className="text-xs font-medium text-[#aaa] group-hover/ep:text-[#3ea6ff] transition">
                  {ep.number}
                </span>
                <span className="text-[9px] text-[#555]">{ep.duration}</span>
              </button>
            ))}
          </div>

          {anime.episodes.length > 24 && (
            <button
              onClick={() => setShowAllEpisodes(!showAllEpisodes)}
              className="w-full mt-3 py-2 text-center text-[12px] text-[#3ea6ff] hover:underline flex items-center justify-center gap-1"
            >
              {showAllEpisodes
                ? '收起'
                : `展开全部 ${anime.episodes.length} 话`}
              <ChevronRight
                size={12}
                className={`transition-transform ${showAllEpisodes ? 'rotate-90' : ''}`}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
