'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Header from '@/components/layout/Header';
import RatingBadge from '@/components/ui/RatingBadge';
import PlaylistManager from '@/components/player/PlaylistManager';
import { useMusicPlayer, type MusicTrack } from '@/components/player/MusicPlayerProvider';
import type { ContentRating } from '@/lib/types';
import { ageGate } from '@/lib/age-gate';
import {
  Search,
  Music,
  Play,
  Pause,
  Plus,
  ListMusic,
  Disc3,
  Headphones,
  Radio,
  Mic2,
  Guitar,
  Piano,
  Drum,
  AudioWaveform,
  TrendingUp,
  Clock,
  Shuffle,
  MoreHorizontal,
  ChevronRight,
  X,
  Filter,
  SlidersHorizontal,
  Shield,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Music genre categories
// ---------------------------------------------------------------------------

interface GenreCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  gradient: string;
}

const GENRES: GenreCategory[] = [
  { id: 'all', label: '全部', icon: Music, gradient: 'from-[#3ea6ff]/20 to-[#3ea6ff]/5' },
  { id: 'pop', label: '流行', icon: TrendingUp, gradient: 'from-pink-500/20 to-pink-500/5' },
  { id: 'rock', label: '摇滚', icon: Guitar, gradient: 'from-red-500/20 to-red-500/5' },
  { id: 'electronic', label: '电子', icon: AudioWaveform, gradient: 'from-cyan-500/20 to-cyan-500/5' },
  { id: 'classical', label: '古典', icon: Piano, gradient: 'from-amber-500/20 to-amber-500/5' },
  { id: 'hiphop', label: '嘻哈', icon: Mic2, gradient: 'from-purple-500/20 to-purple-500/5' },
  { id: 'rnb', label: 'R&B', icon: Headphones, gradient: 'from-indigo-500/20 to-indigo-500/5' },
  { id: 'folk', label: '民谣', icon: Guitar, gradient: 'from-green-500/20 to-green-500/5' },
  { id: 'jazz', label: '爵士', icon: Drum, gradient: 'from-yellow-500/20 to-yellow-500/5' },
  { id: 'podcast', label: '播客', icon: Radio, gradient: 'from-orange-500/20 to-orange-500/5' },
];

// ---------------------------------------------------------------------------
// Source platform tabs
// ---------------------------------------------------------------------------

interface SourceTab {
  id: string;
  label: string;
}

const SOURCE_TABS: SourceTab[] = [
  { id: 'all', label: '全部来源' },
  { id: 'netease', label: '网易云音乐' },
  { id: 'qq', label: 'QQ音乐' },
  { id: 'kugou', label: '酷狗音乐' },
  { id: 'kuwo', label: '酷我音乐' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'soundcloud', label: 'SoundCloud' },
  { id: 'youtube', label: 'YouTube Music' },
  { id: 'migu', label: '咪咕音乐' },
];

// ---------------------------------------------------------------------------
// Mock music data
// ---------------------------------------------------------------------------

interface MockMusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  source: string;
  sourceId: string;
  genre: string;
  duration: number;
  rating: ContentRating;
  plays: number;
  streamUrl: string;
  lrcUrl?: string;
}

const COVER_IMAGES = [
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&q=80',
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80',
  'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=300&q=80',
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80',
  'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=300&q=80',
  'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&q=80',
  'https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=300&q=80',
  'https://images.unsplash.com/photo-1446057032654-9d8885db76c6?w=300&q=80',
];

function generateMockTracks(): MockMusicTrack[] {
  const tracks: MockMusicTrack[] = [];
  const sources = SOURCE_TABS.filter((s) => s.id !== 'all');
  const genres = GENRES.filter((g) => g.id !== 'all').map((g) => g.id);
  const ratings: ContentRating[] = ['G', 'PG', 'PG-13'];

  const songData: { title: string; artist: string; album: string; genre: string }[] = [
    { title: '晴天', artist: '周杰伦', album: '叶惠美', genre: 'pop' },
    { title: '夜曲', artist: '周杰伦', album: '十一月的萧邦', genre: 'pop' },
    { title: '稻香', artist: '周杰伦', album: '魔杰座', genre: 'pop' },
    { title: '七里香', artist: '周杰伦', album: '七里香', genre: 'pop' },
    { title: '起风了', artist: '买辣椒也用券', album: '起风了', genre: 'pop' },
    { title: '光年之外', artist: '邓紫棋', album: '光年之外', genre: 'pop' },
    { title: '泡沫', artist: '邓紫棋', album: 'Xposed', genre: 'pop' },
    { title: '平凡之路', artist: '朴树', album: '猎户星座', genre: 'folk' },
    { title: '成都', artist: '赵雷', album: '无法长大', genre: 'folk' },
    { title: '南山南', artist: '马頔', album: '孤岛', genre: 'folk' },
    { title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera', genre: 'rock' },
    { title: 'Hotel California', artist: 'Eagles', album: 'Hotel California', genre: 'rock' },
    { title: 'Stairway to Heaven', artist: 'Led Zeppelin', album: 'Led Zeppelin IV', genre: 'rock' },
    { title: 'Smells Like Teen Spirit', artist: 'Nirvana', album: 'Nevermind', genre: 'rock' },
    { title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', genre: 'rnb' },
    { title: 'Save Your Tears', artist: 'The Weeknd', album: 'After Hours', genre: 'rnb' },
    { title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', genre: 'electronic' },
    { title: 'Strobe', artist: 'Deadmau5', album: 'For Lack of a Better Name', genre: 'electronic' },
    { title: 'Faded', artist: 'Alan Walker', album: 'Different World', genre: 'electronic' },
    { title: 'Moonlight Sonata', artist: 'Beethoven', album: 'Piano Sonatas', genre: 'classical' },
    { title: 'Canon in D', artist: 'Pachelbel', album: 'Classical Favorites', genre: 'classical' },
    { title: 'HUMBLE.', artist: 'Kendrick Lamar', album: 'DAMN.', genre: 'hiphop' },
    { title: 'Lose Yourself', artist: 'Eminem', album: '8 Mile OST', genre: 'hiphop' },
    { title: 'God\'s Plan', artist: 'Drake', album: 'Scorpion', genre: 'hiphop' },
    { title: 'Take Five', artist: 'Dave Brubeck', album: 'Time Out', genre: 'jazz' },
    { title: 'So What', artist: 'Miles Davis', album: 'Kind of Blue', genre: 'jazz' },
    { title: 'Fly Me to the Moon', artist: 'Frank Sinatra', album: 'It Might as Well Be Swing', genre: 'jazz' },
    { title: '海阔天空', artist: 'Beyond', album: '乐与怒', genre: 'rock' },
    { title: '光辉岁月', artist: 'Beyond', album: '命运派对', genre: 'rock' },
    { title: '红豆', artist: '王菲', album: '唱游', genre: 'pop' },
    { title: '匆匆那年', artist: '王菲', album: '匆匆那年', genre: 'pop' },
    { title: 'Shape of You', artist: 'Ed Sheeran', album: '÷', genre: 'pop' },
    { title: 'Someone Like You', artist: 'Adele', album: '21', genre: 'pop' },
    { title: 'Bad Guy', artist: 'Billie Eilish', album: 'WHEN WE ALL FALL ASLEEP', genre: 'electronic' },
    { title: 'Uptown Funk', artist: 'Bruno Mars', album: 'Uptown Special', genre: 'rnb' },
    { title: '告白气球', artist: '周杰伦', album: '周杰伦的床边故事', genre: 'pop' },
  ];

  for (let i = 0; i < songData.length; i++) {
    const song = songData[i];
    const src = sources[i % sources.length];
    tracks.push({
      id: `m-${i + 1}`,
      title: song.title,
      artist: song.artist,
      album: song.album,
      cover: COVER_IMAGES[i % COVER_IMAGES.length],
      source: src.label,
      sourceId: src.id,
      genre: song.genre,
      duration: 180 + Math.floor(Math.random() * 120),
      rating: ratings[i % ratings.length],
      plays: Math.floor(Math.random() * 5000000) + 10000,
      streamUrl: `https://example.com/stream/m-${i + 1}`,
    });
  }

  return tracks;
}

const ALL_TRACKS = generateMockTracks();

// ---------------------------------------------------------------------------
// Mock playlists
// ---------------------------------------------------------------------------

interface MockPlaylist {
  id: number;
  name: string;
  type: string;
  track_ids: string[];
  created_at: string;
  updated_at: string;
}

const INITIAL_PLAYLISTS: MockPlaylist[] = [
  { id: 1, name: '我的最爱', type: 'music', track_ids: ['m-1', 'm-3', 'm-5'], created_at: '2026-04-01', updated_at: '2026-04-09' },
  { id: 2, name: '深夜放松', type: 'music', track_ids: ['m-20', 'm-25', 'm-26'], created_at: '2026-03-20', updated_at: '2026-04-08' },
  { id: 3, name: '运动节奏', type: 'music', track_ids: ['m-17', 'm-18', 'm-22'], created_at: '2026-03-15', updated_at: '2026-04-07' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtPlays(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function toMusicTrack(mock: MockMusicTrack): MusicTrack {
  return {
    id: mock.id,
    title: mock.title,
    artist: mock.artist,
    album: mock.album,
    cover: mock.cover,
    source: mock.source,
    duration: mock.duration,
    streamUrl: mock.streamUrl,
    lrcUrl: mock.lrcUrl,
    rating: mock.rating,
  };
}

// ---------------------------------------------------------------------------
// Source badge component
// ---------------------------------------------------------------------------

function SourceBadge({ source }: { source: string }) {
  const colorMap: Record<string, string> = {
    '网易云音乐': 'bg-red-500/15 text-red-400 border-red-500/30',
    'QQ音乐': 'bg-green-500/15 text-green-400 border-green-500/30',
    '酷狗音乐': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    '酷我音乐': 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    'Spotify': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    'SoundCloud': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    'YouTube Music': 'bg-red-600/15 text-red-300 border-red-600/30',
    '咪咕音乐': 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  };
  const cls = colorMap[source] ?? 'bg-white/10 text-white/60 border-white/20';
  return (
    <span className={`inline-flex items-center text-[9px] px-1.5 py-0.5 rounded border font-medium ${cls}`}>
      {source}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Music card component
// ---------------------------------------------------------------------------

function MusicCard({
  track,
  onPlay,
  onAddToQueue,
  isCurrentTrack,
  isPlaying,
}: {
  track: MockMusicTrack;
  onPlay: () => void;
  onAddToQueue: () => void;
  isCurrentTrack: boolean;
  isPlaying: boolean;
}) {
  return (
    <div
      className={`group cursor-pointer rounded-xl overflow-hidden transition hover:-translate-y-1 ${
        isCurrentTrack ? 'ring-1 ring-[#3ea6ff]/50' : ''
      }`}
      onClick={onPlay}
    >
      <div className="relative aspect-square bg-[#1a1a1a] overflow-hidden rounded-xl">
        <img
          src={track.cover}
          alt={track.album}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
          <div className="w-12 h-12 rounded-full bg-[#3ea6ff] flex items-center justify-center shadow-lg shadow-[#3ea6ff]/30">
            {isCurrentTrack && isPlaying ? (
              <Pause className="w-5 h-5 text-black" />
            ) : (
              <Play className="w-5 h-5 text-black ml-0.5" />
            )}
          </div>
        </div>

        {/* Currently playing indicator */}
        {isCurrentTrack && isPlaying && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1">
            <div className="flex items-end gap-0.5 h-3">
              <div className="w-0.5 bg-[#3ea6ff] rounded-full animate-pulse" style={{ height: '60%' }} />
              <div className="w-0.5 bg-[#3ea6ff] rounded-full animate-pulse" style={{ height: '100%', animationDelay: '0.15s' }} />
              <div className="w-0.5 bg-[#3ea6ff] rounded-full animate-pulse" style={{ height: '40%', animationDelay: '0.3s' }} />
            </div>
            <span className="text-[9px] text-[#3ea6ff] font-medium">Playing</span>
          </div>
        )}

        {/* Source badge */}
        <div className="absolute top-1.5 left-1.5">
          <SourceBadge source={track.source} />
        </div>

        {/* MPAA Rating badge */}
        <div className="absolute top-1.5 right-1.5">
          <RatingBadge rating={track.rating} />
        </div>

        {/* Duration */}
        <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
          <Clock className="w-2 h-2" />
          {formatDuration(track.duration)}
        </span>

        {/* Add to queue button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddToQueue();
          }}
          className="absolute bottom-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition p-1.5 rounded-full bg-black/60 text-white/80 hover:text-[#3ea6ff] hover:bg-black/80"
          aria-label="Add to queue"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="pt-2 pb-1">
        <h3 className={`text-sm font-medium line-clamp-1 leading-snug transition ${
          isCurrentTrack ? 'text-[#3ea6ff]' : 'text-white group-hover:text-[#3ea6ff]'
        }`}>
          {track.title}
        </h3>
        <p className="text-[12px] text-[#8a8a8a] mt-0.5 line-clamp-1">
          {track.artist}
        </p>
        <p className="text-[11px] text-[#555] mt-0.5 flex items-center gap-1">
          <Headphones className="w-2.5 h-2.5" />
          {fmtPlays(track.plays)}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Track list row component (for search results / list view)
// ---------------------------------------------------------------------------

function TrackRow({
  track,
  index,
  onPlay,
  onAddToQueue,
  isCurrentTrack,
  isPlaying,
}: {
  track: MockMusicTrack;
  index: number;
  onPlay: () => void;
  onAddToQueue: () => void;
  isCurrentTrack: boolean;
  isPlaying: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition group ${
        isCurrentTrack
          ? 'bg-[#3ea6ff]/10 border border-[#3ea6ff]/20'
          : 'hover:bg-white/5'
      }`}
      onClick={onPlay}
    >
      {/* Index / playing indicator */}
      <div className="w-8 text-center flex-shrink-0">
        {isCurrentTrack && isPlaying ? (
          <div className="flex items-end justify-center gap-0.5 h-4">
            <div className="w-0.5 bg-[#3ea6ff] rounded-full animate-pulse" style={{ height: '50%' }} />
            <div className="w-0.5 bg-[#3ea6ff] rounded-full animate-pulse" style={{ height: '100%', animationDelay: '0.15s' }} />
            <div className="w-0.5 bg-[#3ea6ff] rounded-full animate-pulse" style={{ height: '30%', animationDelay: '0.3s' }} />
          </div>
        ) : (
          <span className={`text-xs tabular-nums ${isCurrentTrack ? 'text-[#3ea6ff]' : 'text-white/30'}`}>
            {index + 1}
          </span>
        )}
      </div>

      {/* Cover */}
      <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 relative">
        <img src={track.cover} alt={track.album} className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/40">
          {isCurrentTrack && isPlaying ? (
            <Pause className="w-4 h-4 text-white" />
          ) : (
            <Play className="w-4 h-4 text-white ml-0.5" />
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${isCurrentTrack ? 'text-[#3ea6ff] font-medium' : 'text-white'}`}>
          {track.title}
        </p>
        <p className="text-xs text-white/40 truncate">{track.artist} · {track.album}</p>
      </div>

      {/* Source badge */}
      <div className="hidden sm:block flex-shrink-0">
        <SourceBadge source={track.source} />
      </div>

      {/* Rating */}
      <div className="flex-shrink-0">
        <RatingBadge rating={track.rating} />
      </div>

      {/* Duration */}
      <span className="text-xs text-white/30 tabular-nums w-10 text-right flex-shrink-0">
        {formatDuration(track.duration)}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddToQueue();
          }}
          className="p-1.5 text-white/50 hover:text-[#3ea6ff] transition"
          aria-label="Add to queue"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Genre browse section
// ---------------------------------------------------------------------------

function GenreBrowse({
  activeGenre,
  onGenreChange,
}: {
  activeGenre: string;
  onGenreChange: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-6">
      {GENRES.map((genre) => {
        const Icon = genre.icon;
        const isActive = activeGenre === genre.id;
        return (
          <button
            key={genre.id}
            onClick={() => onGenreChange(genre.id)}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition ${
              isActive
                ? `bg-gradient-to-r ${genre.gradient} border-[#3ea6ff]/30 text-[#3ea6ff]`
                : 'bg-[#1a1a1a] border-[#333]/50 text-white/60 hover:text-white hover:border-[#555]'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-medium">{genre.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trending section
// ---------------------------------------------------------------------------

function TrendingSection({
  tracks,
  onPlay,
  onAddToQueue,
  currentTrackId,
  isPlaying,
}: {
  tracks: MockMusicTrack[];
  onPlay: (track: MockMusicTrack) => void;
  onAddToQueue: (track: MockMusicTrack) => void;
  currentTrackId: string | null;
  isPlaying: boolean;
}) {
  const trending = tracks.slice(0, 10);

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#3ea6ff]" />
          热门推荐
        </h2>
        <button className="text-xs text-[#3ea6ff] hover:text-[#3ea6ff]/80 transition flex items-center gap-1">
          查看更多 <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
        {trending.map((track) => (
          <MusicCard
            key={track.id}
            track={track}
            onPlay={() => onPlay(track)}
            onAddToQueue={() => onAddToQueue(track)}
            isCurrentTrack={currentTrackId === track.id}
            isPlaying={isPlaying}
          />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Playlist sidebar
// ---------------------------------------------------------------------------

function PlaylistSidebar({
  playlists,
  onRefresh,
  isOpen,
  onClose,
}: {
  playlists: MockPlaylist[];
  onRefresh: () => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed top-0 right-0 h-full w-80 bg-[#141414] border-l border-white/5 z-50 transform transition-transform duration-300 lg:static lg:transform-none lg:h-auto lg:border-l-0 lg:bg-transparent ${
          isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-4 lg:p-0">
          {/* Mobile close button */}
          <div className="flex items-center justify-between mb-4 lg:hidden">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-[#3ea6ff]" />
              播放列表
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 text-white/50 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <PlaylistManager playlists={playlists} onRefresh={onRefresh} />
        </div>
      </aside>
    </>
  );
}

// ===========================================================================
// Main Music Page Component
// ===========================================================================

export default function MusicPage() {
  const { state, actions } = useMusicPlayer();

  // --- State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGenre, setActiveGenre] = useState('all');
  const [activeSource, setActiveSource] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showPlaylistSidebar, setShowPlaylistSidebar] = useState(false);
  const [playlists, setPlaylists] = useState<MockPlaylist[]>(INITIAL_PLAYLISTS);
  const [apiResults, setApiResults] = useState<MockMusicTrack[]>([]);
  const [apiSearching, setApiSearching] = useState(false);

  // --- API search (debounced) ---
  useEffect(() => {
    if (!searchQuery.trim()) {
      setApiResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setApiSearching(true);
      try {
        const params = new URLSearchParams({ q: searchQuery.trim(), pageSize: '30' });
        if (activeSource !== 'all') params.set('source', activeSource);
        const res = await fetch(`/api/music/search?${params}`);
        if (res.ok) {
          const data = await res.json() as { items?: Record<string, unknown>[] };
          if (data.items && data.items.length > 0) {
            const mapped: MockMusicTrack[] = data.items.map((item, i) => ({
              id: String(item.id || `api-${i}`),
              title: String(item.title || ''),
              artist: String((item.metadata as Record<string, unknown>)?.artist || item.source || ''),
              album: String((item.metadata as Record<string, unknown>)?.album || ''),
              cover: String(item.cover || ''),
              duration: Number((item.metadata as Record<string, unknown>)?.duration || 200),
              source: String(item.source || ''),
              sourceId: String(item.sourceId || ''),
              genre: 'pop',
              plays: Number(item.popularity || 0),
              rating: (item.rating || 'PG') as ContentRating,
              streamUrl: String(item.url || ''),
            }));
            setApiResults(mapped);
          }
        }
      } catch { /* silent */ }
      setApiSearching(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, activeSource]);

  // --- Filtered tracks (merge local + API results) ---
  const filteredTracks = useMemo(() => {
    let list = ALL_TRACKS;

    if (activeGenre !== 'all') {
      list = list.filter((t) => t.genre === activeGenre);
    }

    if (activeSource !== 'all') {
      list = list.filter((t) => t.sourceId === activeSource);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q) ||
          t.source.toLowerCase().includes(q),
      );
      // Merge API results (deduplicate by title+artist)
      if (apiResults.length > 0) {
        const existingKeys = new Set(list.map(t => `${t.title.toLowerCase()}-${t.artist.toLowerCase()}`));
        const newItems = apiResults.filter(t => !existingKeys.has(`${t.title.toLowerCase()}-${t.artist.toLowerCase()}`));
        list = [...list, ...newItems];
      }
    }

    return list;
  }, [activeGenre, activeSource, searchQuery, apiResults]);

  const isSearching = searchQuery.trim().length > 0;

  // --- Handlers ---
  const handlePlayTrack = useCallback(
    (track: MockMusicTrack) => {
      const musicTrack = toMusicTrack(track);

      // If clicking the currently playing track, toggle play/pause
      if (state.currentTrack?.id === track.id) {
        actions.togglePlay();
        return;
      }

      // Set the filtered list as queue and play from the clicked track
      const queue = filteredTracks.map(toMusicTrack);
      const idx = filteredTracks.findIndex((t) => t.id === track.id);
      actions.setQueue(queue, idx >= 0 ? idx : 0);
    },
    [state.currentTrack?.id, actions, filteredTracks],
  );

  const handleAddToQueue = useCallback(
    (track: MockMusicTrack) => {
      actions.addToQueue(toMusicTrack(track));
    },
    [actions],
  );

  const handlePlayAll = useCallback(() => {
    if (filteredTracks.length === 0) return;
    const queue = filteredTracks.map(toMusicTrack);
    actions.setQueue(queue, 0);
  }, [filteredTracks, actions]);

  const handleShuffleAll = useCallback(() => {
    if (filteredTracks.length === 0) return;
    const shuffled = [...filteredTracks].sort(() => Math.random() - 0.5);
    const queue = shuffled.map(toMusicTrack);
    actions.setQueue(queue, 0);
    actions.setMode('shuffle');
  }, [filteredTracks, actions]);

  const handleRefreshPlaylists = useCallback(() => {
    // In a real app this would refetch from API
    setPlaylists((prev) => [...prev]);
  }, []);

  const currentTrackId = state.currentTrack?.id ?? null;

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-24 md:pb-4">
        {/* ===== Page Header ===== */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Disc3 className="w-5 h-5 text-[#3ea6ff]" />
            音乐中心
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPlaylistSidebar(!showPlaylistSidebar)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                showPlaylistSidebar
                  ? 'bg-[#3ea6ff]/15 text-[#3ea6ff] border border-[#3ea6ff]/30'
                  : 'bg-[#1a1a1a] text-white/60 border border-[#333] hover:text-white'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">播放列表</span>
            </button>
          </div>
        </div>

        {/* ===== Layout: Main + Sidebar ===== */}
        <div className="flex gap-6">
          {/* Main content area */}
          <div className="flex-1 min-w-0">
            {/* ===== Search Bar ===== */}
            <div className="relative mb-4">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666] w-4 h-4"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索歌曲、歌手、专辑..."
                className="w-full h-10 pl-10 pr-24 bg-[#1a1a1a] border border-[#333] rounded-xl text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] transition ${
                    showFilters
                      ? 'bg-[#3ea6ff]/20 text-[#3ea6ff]'
                      : 'bg-[#2a2a2a] text-[#aaa] hover:text-white'
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  筛选
                </button>
              </div>
            </div>

            {/* ===== Source Tabs ===== */}
            {showFilters && (
              <div className="mb-4 p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50 space-y-3">
                <div>
                  <p className="text-[11px] text-[#666] mb-2 flex items-center gap-1">
                    <SlidersHorizontal className="w-3 h-3" /> 来源平台
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {SOURCE_TABS.map((src) => (
                      <button
                        key={src.id}
                        onClick={() => setActiveSource(src.id)}
                        className={`px-3 py-1 rounded-full text-[12px] border transition ${
                          activeSource === src.id
                            ? 'bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/40 font-medium'
                            : 'bg-transparent text-[#888] border-[#333] hover:text-white hover:border-[#555]'
                        }`}
                      >
                        {src.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ===== Genre Browse ===== */}
            <GenreBrowse activeGenre={activeGenre} onGenreChange={setActiveGenre} />

            {/* Adult mode: show adult music tab */}
            {ageGate.canAccess('NC-17') && (
              <div className="mb-4">
                <a
                  href="/zone/music"
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] whitespace-nowrap border transition shrink-0 bg-transparent text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300 w-fit"
                >
                  <Shield size={13} />
                  成人音乐
                </a>
              </div>
            )}

            {/* ===== Action Bar ===== */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePlayAll}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3ea6ff] text-black text-xs font-semibold hover:bg-[#3ea6ff]/90 transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  播放全部
                </button>
                <button
                  onClick={handleShuffleAll}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/5 text-white/70 text-xs font-medium border border-[#333] hover:bg-white/10 hover:text-white transition"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  随机播放
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-white/30">
                  {filteredTracks.length} 首
                </span>
                {/* View mode toggle */}
                <div className="flex items-center bg-[#1a1a1a] rounded-lg border border-[#333]/50 p-0.5">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded transition ${
                      viewMode === 'grid' ? 'bg-white/10 text-[#3ea6ff]' : 'text-white/30 hover:text-white/60'
                    }`}
                    aria-label="Grid view"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded transition ${
                      viewMode === 'list' ? 'bg-white/10 text-[#3ea6ff]' : 'text-white/30 hover:text-white/60'
                    }`}
                    aria-label="List view"
                  >
                    <ListMusic className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* ===== Trending Section (only when not searching) ===== */}
            {!isSearching && activeGenre === 'all' && activeSource === 'all' && (
              <TrendingSection
                tracks={ALL_TRACKS}
                onPlay={handlePlayTrack}
                onAddToQueue={handleAddToQueue}
                currentTrackId={currentTrackId}
                isPlaying={state.isPlaying}
              />
            )}

            {/* ===== Search Results / Browse Results ===== */}
            <section>
              {isSearching && (
                <div className="flex items-center gap-2 mb-3 text-[12px] text-[#888]">
                  <Search className="w-3 h-3" />
                  <span>
                    搜索 &quot;{searchQuery}&quot;
                    {activeSource !== 'all' && ` · ${SOURCE_TABS.find((s) => s.id === activeSource)?.label}`}
                    {activeGenre !== 'all' && ` · ${GENRES.find((g) => g.id === activeGenre)?.label}`}
                  </span>
                  <span className="text-[#555]">·</span>
                  <span>{filteredTracks.length} 个结果</span>
                </div>
              )}

              {!isSearching && (activeGenre !== 'all' || activeSource !== 'all') && (
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-lg font-bold text-white">
                    {activeGenre !== 'all'
                      ? GENRES.find((g) => g.id === activeGenre)?.label
                      : '全部歌曲'}
                  </h2>
                  {activeSource !== 'all' && (
                    <SourceBadge source={SOURCE_TABS.find((s) => s.id === activeSource)?.label ?? ''} />
                  )}
                </div>
              )}

              {/* Grid view */}
              {viewMode === 'grid' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                  {filteredTracks.map((track) => (
                    <MusicCard
                      key={track.id}
                      track={track}
                      onPlay={() => handlePlayTrack(track)}
                      onAddToQueue={() => handleAddToQueue(track)}
                      isCurrentTrack={currentTrackId === track.id}
                      isPlaying={state.isPlaying}
                    />
                  ))}
                </div>
              )}

              {/* List view */}
              {viewMode === 'list' && (
                <div className="space-y-0.5">
                  {filteredTracks.map((track, i) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      index={i}
                      onPlay={() => handlePlayTrack(track)}
                      onAddToQueue={() => handleAddToQueue(track)}
                      isCurrentTrack={currentTrackId === track.id}
                      isPlaying={state.isPlaying}
                    />
                  ))}
                </div>
              )}

              {/* Empty state */}
              {filteredTracks.length === 0 && (
                <div className="text-center text-[#8a8a8a] py-20">
                  <Music className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p className="text-sm">暂无匹配的歌曲</p>
                  <p className="text-xs mt-1 text-[#555]">
                    尝试切换分类或来源平台
                  </p>
                </div>
              )}
            </section>
          </div>

          {/* ===== Desktop Playlist Sidebar ===== */}
          <div className="hidden lg:block w-72 flex-shrink-0">
            <div className="sticky top-20">
              <PlaylistManager playlists={playlists} onRefresh={handleRefreshPlaylists} />
            </div>
          </div>
        </div>
      </main>

      {/* ===== Mobile Playlist Sidebar ===== */}
      <PlaylistSidebar
        playlists={playlists}
        onRefresh={handleRefreshPlaylists}
        isOpen={showPlaylistSidebar}
        onClose={() => setShowPlaylistSidebar(false)}
      />
    </>
  );
}
