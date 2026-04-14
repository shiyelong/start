'use client';

import { useState, useCallback, useMemo } from 'react';
import Header from '@/components/Header';
import RatingBadge from '@/components/ui/RatingBadge';
import { useMusicPlayer, type MusicTrack } from '@/components/player/MusicPlayerProvider';
import { ageGate } from '@/lib/age-gate';
import type { ContentRating } from '@/lib/types';
import {
  Search,
  Play,
  Pause,
  Clock,
  Podcast,
  ShieldAlert,
  Lock,
  Headphones,
  Mic2,
  Star,
  Eye,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// AgeGate access check
// ---------------------------------------------------------------------------

function useAdultAccess(): boolean {
  return ageGate.canAccess('NC-17');
}

// ---------------------------------------------------------------------------
// Mock NC-17 podcast data
// ---------------------------------------------------------------------------

interface AdultPodcastEpisode {
  id: string;
  title: string;
  description: string;
  duration: number; // seconds
  publishedAt: string;
  audioUrl: string;
}

interface AdultPodcast {
  id: string;
  title: string;
  host: string;
  cover: string;
  description: string;
  source: string;
  episodeCount: number;
  plays: number;
  score: number;
  rating: ContentRating;
  episodes: AdultPodcastEpisode[];
}

const ALL_ADULT_PODCASTS: AdultPodcast[] = [
  {
    id: 'apod-1',
    title: '深夜私语',
    host: '月光声优社',
    cover: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=400&q=80',
    description: '深夜陪伴类成人音声播客，温柔声线带你入眠。',
    source: 'Source-A',
    episodeCount: 86,
    plays: 320000,
    score: 9.1,
    rating: 'NC-17',
    episodes: [
      { id: 'apod-1-1', title: '第86期：雨夜低语', description: '窗外雨声，耳边温柔', duration: 1800, publishedAt: '2026-03-15', audioUrl: 'https://example.com/audio/apod-1-1.mp3' },
      { id: 'apod-1-2', title: '第85期：温泉物语', description: '温泉旅馆的私密时光', duration: 2100, publishedAt: '2026-03-08', audioUrl: 'https://example.com/audio/apod-1-2.mp3' },
      { id: 'apod-1-3', title: '第84期：午后阳光', description: '慵懒午后的甜蜜陪伴', duration: 1500, publishedAt: '2026-03-01', audioUrl: 'https://example.com/audio/apod-1-3.mp3' },
    ],
  },
  {
    id: 'apod-2',
    title: '禁忌故事集',
    host: '暗夜叙事者',
    cover: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&q=80',
    description: '成人向短篇故事朗读，每期一个禁忌题材的精彩故事。',
    source: 'Source-B',
    episodeCount: 52,
    plays: 180000,
    score: 8.7,
    rating: 'NC-17',
    episodes: [
      { id: 'apod-2-1', title: '第52期：秘密花园', description: '一段不为人知的邂逅', duration: 2400, publishedAt: '2026-03-14', audioUrl: 'https://example.com/audio/apod-2-1.mp3' },
      { id: 'apod-2-2', title: '第51期：午夜列车', description: '深夜列车上的奇遇', duration: 2700, publishedAt: '2026-03-07', audioUrl: 'https://example.com/audio/apod-2-2.mp3' },
    ],
  },
  {
    id: 'apod-3',
    title: 'ASMR Paradise',
    host: 'Whisper Angel',
    cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80',
    description: 'Premium adult ASMR content for relaxation and pleasure.',
    source: 'Source-C',
    episodeCount: 120,
    plays: 560000,
    score: 9.3,
    rating: 'NC-17',
    episodes: [
      { id: 'apod-3-1', title: 'Episode 120: Gentle Whispers', description: 'Soft spoken triggers for deep relaxation', duration: 3600, publishedAt: '2026-03-15', audioUrl: 'https://example.com/audio/apod-3-1.mp3' },
      { id: 'apod-3-2', title: 'Episode 119: Ear Massage', description: 'Binaural ear attention', duration: 2400, publishedAt: '2026-03-12', audioUrl: 'https://example.com/audio/apod-3-2.mp3' },
    ],
  },
  {
    id: 'apod-4',
    title: '声优剧场',
    host: '梦幻音声',
    cover: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&q=80',
    description: '专业声优演绎的成人向广播剧，沉浸式听觉体验。',
    source: 'Source-D',
    episodeCount: 38,
    plays: 210000,
    score: 9.0,
    rating: 'NC-17',
    episodes: [
      { id: 'apod-4-1', title: '第38期：校园秘事', description: '放学后的秘密约定', duration: 2700, publishedAt: '2026-03-13', audioUrl: 'https://example.com/audio/apod-4-1.mp3' },
      { id: 'apod-4-2', title: '第37期：办公室恋情', description: '加班夜的意外发展', duration: 3000, publishedAt: '2026-03-06', audioUrl: 'https://example.com/audio/apod-4-2.mp3' },
    ],
  },
  {
    id: 'apod-5',
    title: '蜜糖电台',
    host: '甜心主播',
    cover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&q=80',
    description: '甜蜜互动类播客，听众来信回复和情感话题讨论。',
    source: 'Source-E',
    episodeCount: 95,
    plays: 420000,
    score: 8.8,
    rating: 'NC-17',
    episodes: [
      { id: 'apod-5-1', title: '第95期：听众来信精选', description: '本周最火热的听众故事', duration: 2100, publishedAt: '2026-03-14', audioUrl: 'https://example.com/audio/apod-5-1.mp3' },
      { id: 'apod-5-2', title: '第94期：情人节特辑', description: '关于爱与欲望的讨论', duration: 2400, publishedAt: '2026-03-07', audioUrl: 'https://example.com/audio/apod-5-2.mp3' },
    ],
  },
  {
    id: 'apod-6',
    title: '夜话情感',
    host: '星空之声',
    cover: 'https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=400&q=80',
    description: '深夜情感类播客，探讨成人世界的亲密关系与情感话题。',
    source: 'Source-F',
    episodeCount: 64,
    plays: 280000,
    score: 8.5,
    rating: 'NC-17',
    episodes: [
      { id: 'apod-6-1', title: '第64期：开放关系探讨', description: '现代亲密关系的多元形态', duration: 3300, publishedAt: '2026-03-12', audioUrl: 'https://example.com/audio/apod-6-1.mp3' },
      { id: 'apod-6-2', title: '第63期：长距离恋爱', description: '异地恋的甜蜜与挑战', duration: 2700, publishedAt: '2026-03-05', audioUrl: 'https://example.com/audio/apod-6-2.mp3' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
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

export default function ZonePodcastsPage() {
  // --- AgeGate check ---
  const hasAccess = useAdultAccess();

  // --- Search state ---
  const [searchQuery, setSearchQuery] = useState('');

  // --- Detail state ---
  const [selectedPodcast, setSelectedPodcast] = useState<AdultPodcast | null>(null);

  // --- MusicPlayer integration ---
  const { state: playerState, actions: playerActions } = useMusicPlayer();

  // --- Access gate ---
  if (!hasAccess) {
    return <AccessDenied />;
  }

  // --- Filtered podcasts ---
  const filteredPodcasts = useMemo(() => {
    if (!searchQuery.trim()) return ALL_ADULT_PODCASTS;
    const q = searchQuery.toLowerCase();
    return ALL_ADULT_PODCASTS.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.host.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // --- Play episode through MusicPlayer ---
  const playEpisode = useCallback(
    (podcast: AdultPodcast, episode: AdultPodcastEpisode) => {
      const queue: MusicTrack[] = podcast.episodes.map((ep) => ({
        id: ep.id,
        title: ep.title,
        artist: podcast.host,
        album: podcast.title,
        cover: podcast.cover,
        source: podcast.source,
        duration: ep.duration,
        streamUrl: ep.audioUrl,
        rating: podcast.rating,
      }));
      const startIndex = queue.findIndex((t) => t.id === episode.id);
      playerActions.setQueue(queue, startIndex >= 0 ? startIndex : 0);
    },
    [playerActions],
  );

  // --- Check if episode is currently playing ---
  const isEpisodePlaying = useCallback(
    (episodeId: string) => {
      return playerState.currentTrack?.id === episodeId && playerState.isPlaying;
    },
    [playerState.currentTrack?.id, playerState.isPlaying],
  );

  // =========================================================================
  // Podcast Detail View
  // =========================================================================
  if (selectedPodcast) {
    return (
      <>
        <Header />
        <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
          {/* Back button */}
          <button
            onClick={() => setSelectedPodcast(null)}
            className="flex items-center gap-1.5 text-sm text-[#888] hover:text-[#3ea6ff] transition-colors mb-4"
          >
            <ShieldAlert size={14} />
            返回播客列表
          </button>

          {/* Show header */}
          <div className="flex flex-col sm:flex-row gap-5 mb-6">
            <img
              src={selectedPodcast.cover}
              alt={selectedPodcast.title}
              className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl object-cover flex-shrink-0 shadow-lg"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 mb-2">
                <h1 className="text-xl font-bold text-white">{selectedPodcast.title}</h1>
                <RatingBadge rating="NC-17" size="md" />
              </div>
              <p className="text-sm text-[#aaa] mb-1 flex items-center gap-1">
                <Mic2 size={12} />
                {selectedPodcast.host}
              </p>
              <div className="flex items-center gap-3 mb-3 text-xs text-[#666]">
                <span className="text-[10px] bg-[#2a2a2a] px-2 py-0.5 rounded font-medium">
                  {selectedPodcast.source}
                </span>
                <span className="flex items-center gap-1">
                  <Podcast size={12} />
                  {selectedPodcast.episodeCount} 集
                </span>
                <span className="flex items-center gap-1">
                  <Headphones size={12} />
                  {fmtNum(selectedPodcast.plays)} 播放
                </span>
                <span className="flex items-center gap-1">
                  <Star size={12} />
                  {selectedPodcast.score}
                </span>
              </div>
              <p className="text-sm text-[#999] leading-relaxed line-clamp-3">
                {selectedPodcast.description}
              </p>
            </div>
          </div>

          {/* Episode list */}
          <div>
            <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-1.5">
              <Podcast size={14} className="text-[#3ea6ff]" />
              单集列表
              <span className="text-[10px] text-[#666] font-normal ml-1">
                {selectedPodcast.episodes.length} 集
              </span>
            </h2>
            <div className="space-y-2">
              {selectedPodcast.episodes.map((ep) => {
                const playing = isEpisodePlaying(ep.id);
                return (
                  <div
                    key={ep.id}
                    className={`flex items-center gap-3 p-3 rounded-xl transition cursor-pointer group ${
                      playing
                        ? 'bg-[#3ea6ff]/10 border border-[#3ea6ff]/20'
                        : 'bg-[#1a1a1a] hover:bg-[#222] border border-transparent'
                    }`}
                    onClick={() => playEpisode(selectedPodcast, ep)}
                  >
                    {/* Play button */}
                    <div className="w-10 h-10 rounded-lg bg-[#2a2a2a] flex items-center justify-center flex-shrink-0 group-hover:bg-[#3ea6ff]/20 transition">
                      {playing ? (
                        <Pause size={16} className="text-[#3ea6ff]" />
                      ) : (
                        <Play size={16} className="text-[#aaa] group-hover:text-[#3ea6ff] transition ml-0.5" />
                      )}
                    </div>

                    {/* Episode info */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${playing ? 'text-[#3ea6ff]' : 'text-white'}`}>
                        {ep.title}
                      </p>
                      <p className="text-xs text-[#666] truncate mt-0.5">{ep.description}</p>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-3 text-xs text-[#666] flex-shrink-0">
                      <span className="hidden sm:flex items-center gap-1">
                        <Clock size={11} />
                        {fmtDuration(ep.duration)}
                      </span>
                      <span className="text-[10px]">{ep.publishedAt}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </>
    );
  }

  // =========================================================================
  // Main podcast list
  // =========================================================================
  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
        {/* ===== Page Title ===== */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldAlert size={22} className="text-red-400" />
            <span>成人播客</span>
            <RatingBadge rating="NC-17" size="md" />
          </h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-semibold">
            {ALL_ADULT_PODCASTS.length} 个节目
          </span>
        </div>

        {/* ===== Search Bar ===== */}
        <div className="relative mb-6">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索成人播客..."
            className="w-full h-9 pl-9 pr-4 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition"
          />
        </div>

        {/* ===== Podcast Grid ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPodcasts.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedPodcast(p)}
              className="group cursor-pointer rounded-xl bg-[#1a1a1a] border border-[#333]/50 overflow-hidden hover:border-[#3ea6ff]/30 transition"
            >
              <div className="flex gap-3 p-3">
                {/* Cover */}
                <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                  <img
                    src={p.cover}
                    alt={p.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <span className="absolute top-0.5 right-0.5">
                    <RatingBadge rating="NC-17" />
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-white line-clamp-1 group-hover:text-[#3ea6ff] transition">
                    {p.title}
                  </h3>
                  <p className="text-[11px] text-[#888] mt-0.5 flex items-center gap-1">
                    <Mic2 size={9} />
                    {p.host}
                  </p>
                  <p className="text-[11px] text-[#666] mt-1 line-clamp-2 leading-relaxed">
                    {p.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[#555]">
                    <span className="bg-[#2a2a2a] px-1.5 py-0.5 rounded">{p.source}</span>
                    <span className="flex items-center gap-0.5">
                      <Podcast size={8} />
                      {p.episodeCount}集
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Eye size={8} />
                      {fmtNum(p.plays)}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Star size={8} />
                      {p.score}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ===== Empty state ===== */}
        {filteredPodcasts.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <Podcast size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">暂无匹配的播客</p>
            <p className="text-xs mt-1 text-[#555]">
              尝试调整搜索关键词
            </p>
          </div>
        )}
      </main>
    </>
  );
}
