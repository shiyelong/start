'use client';

import { useState, useCallback, useMemo } from 'react';
import Header from '@/components/Header';
import RatingBadge from '@/components/ui/RatingBadge';
import { useMusicPlayer, type MusicTrack } from '@/components/player/MusicPlayerProvider';
import { ageGate } from '@/lib/age-gate';
import type { ContentRating } from '@/lib/types';
import {
  Search,
  X,
  Eye,
  Clock,
  Filter,
  Play,
  Pause,
  ShieldAlert,
  Lock,
  SlidersHorizontal,
  ArrowUpDown,
  Flame,
  CalendarDays,
  Star,
  Shuffle,
  Music,
  Headphones,
  Languages,
  UserCircle,
  Timer,
  Mic2,
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
  { id: 'asmr', label: 'ASMR' },
  { id: 'drama-cd', label: 'Drama CD' },
  { id: 'voice', label: '音声作品' },
  { id: 'bgm', label: 'BGM/配乐' },
  { id: 'doujin', label: '同人音乐' },
];

const LANGUAGE_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部语言' },
  { id: 'jp', label: '日语' },
  { id: 'cn', label: '中文' },
  { id: 'en', label: '英语' },
  { id: 'kr', label: '韩语' },
];

const VOICE_GENDER_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部声优' },
  { id: 'female', label: '女声优' },
  { id: 'male', label: '男声优' },
  { id: 'both', label: '男女合作' },
];

const DURATION_OPTIONS: FilterOption[] = [
  { id: 'all', label: '全部时长' },
  { id: 'short', label: '短篇(<10分钟)' },
  { id: 'medium', label: '中篇(10-30分钟)' },
  { id: 'long', label: '长篇(>30分钟)' },
];

const SORT_OPTIONS: FilterOption[] = [
  { id: 'hot', label: '热度' },
  { id: 'latest', label: '最新' },
  { id: 'rating', label: '评分' },
  { id: 'plays', label: '播放量' },
  { id: 'duration', label: '时长' },
  { id: 'random', label: '随机' },
];


// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface AdultMusic {
  id: string;
  title: string;
  cover: string;
  source: string;
  sourceId: string;
  artist: string;
  genre: string;
  language: string;
  voiceGender: string;
  durationCategory: string;
  rating: ContentRating;
  duration: string;
  durationSeconds: number;
  plays: number;
  score: number;
  date: string;
  streamUrl: string;
}

function generateMockAdultMusic(): AdultMusic[] {
  const genres = GENRE_OPTIONS.filter(g => g.id !== 'all').map(g => g.id);
  const languages = LANGUAGE_OPTIONS.filter(l => l.id !== 'all').map(l => l.id);
  const voiceGenders = VOICE_GENDER_OPTIONS.filter(v => v.id !== 'all').map(v => v.id);
  const durCats: { cat: string; label: string; seconds: number }[] = [
    { cat: 'short', label: '05:30', seconds: 330 },
    { cat: 'medium', label: '18:45', seconds: 1125 },
    { cat: 'long', label: '42:00', seconds: 2520 },
  ];

  const titles = [
    '耳边低语', '深夜陪伴', '温柔催眠', '甜蜜告白',
    '雨夜物语', '秘密花园', '午后微风', '星空下的约定',
    '温泉旅行', '海边散步', '森林冥想', '咖啡馆邂逅',
    '图书馆私语', '电车告白', '屋顶星空', '樱花树下',
    '月光奏鸣曲', '晨间问候', '睡前故事', '心跳加速',
    '甜蜜梦境', '温暖拥抱', '秘密约会', '花火大会',
    '夏日祭典', '冬日暖阳', '春风物语', '秋叶飘零',
    '蜜糖之声', '天使低语', '恶魔诱惑', '精灵之歌',
    '人鱼之泪', '吸血鬼之吻', '狐仙物语', '龙族传说',
  ];

  const artists = [
    '花�的ASMR', '月光声优社', '甜心录音室', '星空之声',
    '蜜语工作室', '梦幻音声', 'Whisper Studio', 'Velvet Voice',
  ];

  const sources = ['Source-A', 'Source-B', 'Source-C', 'Source-D', 'Source-E', 'Source-F'];

  const covers = [
    'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&q=80',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80',
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80',
    'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&q=80',
    'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&q=80',
    'https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=400&q=80',
    'https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=400&q=80',
    'https://images.unsplash.com/photo-1446057032654-9d8885db76c6?w=400&q=80',
  ];

  const tracks: AdultMusic[] = [];
  for (let i = 0; i < titles.length; i++) {
    const dur = durCats[i % durCats.length];
    tracks.push({
      id: `am-${i + 1}`,
      title: titles[i],
      cover: covers[i % covers.length],
      source: sources[i % sources.length],
      sourceId: `adult-music-src-${(i % 6) + 1}`,
      artist: artists[i % artists.length],
      genre: genres[i % genres.length],
      language: languages[i % languages.length],
      voiceGender: voiceGenders[i % voiceGenders.length],
      durationCategory: dur.cat,
      rating: 'NC-17',
      duration: dur.label,
      durationSeconds: dur.seconds + (i * 23),
      plays: Math.floor(Math.random() * 500000) + 1000,
      score: Math.round((Math.random() * 3 + 7) * 10) / 10,
      date: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
      streamUrl: `https://example.com/audio/am-${i + 1}.mp3`,
    });
  }
  return tracks;
}

const ALL_ADULT_MUSIC = generateMockAdultMusic();

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

export default function ZoneMusicPage() {
  // --- AgeGate check ---
  const hasAccess = useAdultAccess();

  // --- Filter state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeGenre, setActiveGenre] = useState('all');
  const [activeLanguage, setActiveLanguage] = useState('all');
  const [activeVoiceGender, setActiveVoiceGender] = useState('all');
  const [activeDuration, setActiveDuration] = useState('all');
  const [activeSort, setActiveSort] = useState('hot');

  // --- MusicPlayer integration ---
  const { state: playerState, actions: playerActions } = useMusicPlayer();

  // --- Access gate ---
  if (!hasAccess) {
    return <AccessDenied />;
  }

  // --- Active filter count ---
  const activeFilterCount = [
    activeGenre !== 'all',
    activeLanguage !== 'all',
    activeVoiceGender !== 'all',
    activeDuration !== 'all',
  ].filter(Boolean).length;

  // --- Filtered & sorted music ---
  const filteredMusic = useMemo(() => {
    let list = [...ALL_ADULT_MUSIC];

    if (activeGenre !== 'all') {
      list = list.filter((m) => m.genre === activeGenre);
    }
    if (activeLanguage !== 'all') {
      list = list.filter((m) => m.language === activeLanguage);
    }
    if (activeVoiceGender !== 'all') {
      list = list.filter((m) => m.voiceGender === activeVoiceGender);
    }
    if (activeDuration !== 'all') {
      list = list.filter((m) => m.durationCategory === activeDuration);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.artist.toLowerCase().includes(q) ||
          m.source.toLowerCase().includes(q)
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
      case 'plays':
        list.sort((a, b) => b.plays - a.plays);
        break;
      case 'duration':
        list.sort((a, b) => b.durationSeconds - a.durationSeconds);
        break;
      case 'random':
        list.sort(() => Math.random() - 0.5);
        break;
      case 'hot':
      default:
        list.sort((a, b) => b.plays * b.score - a.plays * a.score);
        break;
    }

    return list;
  }, [activeGenre, activeLanguage, activeVoiceGender, activeDuration, searchQuery, activeSort]);

  // --- Play track through MusicPlayer ---
  const playTrack = useCallback(
    (track: AdultMusic) => {
      const queue: MusicTrack[] = filteredMusic.map((m) => ({
        id: m.id,
        title: m.title,
        artist: m.artist,
        album: m.genre,
        cover: m.cover,
        source: m.source,
        duration: m.durationSeconds,
        streamUrl: m.streamUrl,
        rating: m.rating,
      }));
      const startIndex = queue.findIndex((t) => t.id === track.id);
      playerActions.setQueue(queue, startIndex >= 0 ? startIndex : 0);
    },
    [filteredMusic, playerActions],
  );

  // --- Check if track is currently playing ---
  const isTrackPlaying = useCallback(
    (trackId: string) => {
      return playerState.currentTrack?.id === trackId && playerState.isPlaying;
    },
    [playerState.currentTrack?.id, playerState.isPlaying],
  );

  const clearFilters = useCallback(() => {
    setActiveGenre('all');
    setActiveLanguage('all');
    setActiveVoiceGender('all');
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
            <span>成人音乐专区</span>
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
            placeholder="搜索成人音声、ASMR..."
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
            else if (opt.id === 'plays') SortIcon = Headphones;
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
              label="类型"
              icon={<Music size={11} />}
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
              label="声优性别"
              icon={<UserCircle size={11} />}
              options={VOICE_GENDER_OPTIONS}
              value={activeVoiceGender}
              onChange={setActiveVoiceGender}
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
        {(activeGenre !== 'all' || activeLanguage !== 'all' || activeVoiceGender !== 'all' || activeDuration !== 'all' || searchQuery) && (
          <div className="flex items-center gap-2 mb-3 text-[12px] text-[#888]">
            <SlidersHorizontal size={12} />
            <span>
              {activeGenre !== 'all' && GENRE_OPTIONS.find(g => g.id === activeGenre)?.label}
              {activeLanguage !== 'all' && ` · ${LANGUAGE_OPTIONS.find(l => l.id === activeLanguage)?.label}`}
              {activeVoiceGender !== 'all' && ` · ${VOICE_GENDER_OPTIONS.find(v => v.id === activeVoiceGender)?.label}`}
              {activeDuration !== 'all' && ` · ${DURATION_OPTIONS.find(d => d.id === activeDuration)?.label}`}
              {searchQuery && ` · "${searchQuery}"`}
            </span>
            <span className="text-[#555]">·</span>
            <span>{filteredMusic.length} 个结果</span>
          </div>
        )}

        {/* ===== Music List ===== */}
        <div className="space-y-2">
          {filteredMusic.map((m) => {
            const playing = isTrackPlaying(m.id);
            return (
              <div
                key={m.id}
                onClick={() => playTrack(m)}
                className={`flex items-center gap-3 p-3 rounded-xl transition cursor-pointer group ${
                  playing
                    ? 'bg-[#3ea6ff]/10 border border-[#3ea6ff]/20'
                    : 'bg-[#1a1a1a] hover:bg-[#222] border border-transparent'
                }`}
              >
                {/* Cover */}
                <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                  {m.cover ? (
                    <img src={m.cover} alt={m.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#2a0a2a] to-[#1a0a3a] flex items-center justify-center">
                      <Music size={16} className="text-white/30" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition">
                    {playing ? (
                      <Pause size={16} className="text-white" />
                    ) : (
                      <Play size={16} className="text-white ml-0.5" />
                    )}
                  </div>
                  {/* NC-17 badge */}
                  <span className="absolute top-0.5 right-0.5">
                    <RatingBadge rating="NC-17" />
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className={`text-sm font-medium truncate ${playing ? 'text-[#3ea6ff]' : 'text-white'}`}>
                    {m.title}
                  </h3>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#8a8a8a] mt-0.5">
                    <Mic2 size={9} />
                    <span className="truncate">{m.artist}</span>
                    <span className="text-[#555]">·</span>
                    <span>{m.source}</span>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-3 text-[11px] text-[#666] flex-shrink-0">
                  <span className="hidden sm:flex items-center gap-1">
                    <Headphones size={10} />
                    {fmtNum(m.plays)}
                  </span>
                  <span className="hidden sm:flex items-center gap-1">
                    <Star size={10} />
                    {m.score}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {m.duration}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ===== Empty state ===== */}
        {filteredMusic.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <Music size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">暂无匹配的音乐</p>
            <p className="text-xs mt-1 text-[#555]">
              尝试调整筛选条件或搜索关键词
            </p>
          </div>
        )}
      </main>
    </>
  );
}
