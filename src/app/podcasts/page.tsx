'use client';

import { useState, useMemo, useCallback } from 'react';
import Header from '@/components/layout/Header';
import RatingBadge from '@/components/ui/RatingBadge';
import { useMusicPlayer, type MusicTrack } from '@/components/player/MusicPlayerProvider';
import type { ContentRating } from '@/lib/types';
import { ageGate } from '@/lib/age-gate';
import {
  Podcast,
  Search,
  Filter,
  Heart,
  Play,
  Pause,
  Clock,
  Headphones,
  Cpu,
  Briefcase,
  GraduationCap,
  Clapperboard,
  Newspaper,
  Users,
  Landmark,
  HeartPulse,
  Dumbbell,
  Music,
  Laugh,
  ShieldAlert,
  Flame,
  Globe,
  ChevronLeft,
  ListMusic,
  Rss,
  Tag,
  CircleDot,
  Shield,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PodcastEpisode {
  id: string;
  title: string;
  description: string;
  duration: number; // seconds
  publishedAt: string;
  audioUrl: string;
}

interface PodcastShow {
  id: string;
  title: string;
  host: string;
  cover: string;
  description: string;
  category: string;
  platform: string;
  episodeCount: number;
  subscriberCount: number;
  rating: ContentRating;
  episodes: PodcastEpisode[];
}

// ---------------------------------------------------------------------------
// Filter definitions
// ---------------------------------------------------------------------------

interface FilterOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

const CATEGORY_FILTERS: FilterOption[] = [
  { id: '科技', label: '科技', icon: <Cpu size={12} /> },
  { id: '商业', label: '商业', icon: <Briefcase size={12} /> },
  { id: '教育', label: '教育', icon: <GraduationCap size={12} /> },
  { id: '娱乐', label: '娱乐', icon: <Clapperboard size={12} /> },
  { id: '新闻', label: '新闻', icon: <Newspaper size={12} /> },
  { id: '社会', label: '社会', icon: <Users size={12} /> },
  { id: '历史', label: '历史', icon: <Landmark size={12} /> },
  { id: '健康', label: '健康', icon: <HeartPulse size={12} /> },
  { id: '体育', label: '体育', icon: <Dumbbell size={12} /> },
  { id: '音乐', label: '音乐', icon: <Music size={12} /> },
  { id: '喜剧', label: '喜剧', icon: <Laugh size={12} /> },
  { id: '真实犯罪', label: '真实犯罪', icon: <ShieldAlert size={12} /> },
];

const PLATFORM_FILTERS: FilterOption[] = [
  { id: 'Apple Podcasts', label: 'Apple Podcasts' },
  { id: 'Spotify', label: 'Spotify' },
  { id: '小宇宙', label: '小宇宙' },
  { id: '喜马拉雅', label: '喜马拉雅' },
  { id: '蜻蜓FM', label: '蜻蜓FM' },
  { id: '荔枝FM', label: '荔枝FM' },
  { id: 'Google Podcasts', label: 'Google Podcasts' },
  { id: 'Pocket Casts', label: 'Pocket Casts' },
  { id: 'Overcast', label: 'Overcast' },
  { id: 'Castbox', label: 'Castbox' },
];


// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const ALL_SHOWS: PodcastShow[] = [
  {
    id: 'pod-1',
    title: '硅谷早知道',
    host: '丰元资本',
    cover: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=400&q=80',
    description: '每周解读硅谷最新科技趋势、创业故事和投资动态，带你第一时间了解全球科技前沿。',
    category: '科技',
    platform: '小宇宙',
    episodeCount: 286,
    subscriberCount: 520000,
    rating: 'PG',
    episodes: [
      { id: 'ep-1-1', title: 'AI Agent 时代来了吗？', description: '深度解析AI Agent的现状与未来', duration: 2580, publishedAt: '2024-12-15', audioUrl: 'https://example.com/audio/ep-1-1.mp3' },
      { id: 'ep-1-2', title: 'OpenAI vs Google：大模型之战', description: 'GPT-5与Gemini 2.0的全面对比', duration: 3120, publishedAt: '2024-12-08', audioUrl: 'https://example.com/audio/ep-1-2.mp3' },
      { id: 'ep-1-3', title: '特斯拉机器人量产倒计时', description: 'Optimus机器人的最新进展', duration: 1980, publishedAt: '2024-12-01', audioUrl: 'https://example.com/audio/ep-1-3.mp3' },
    ],
  },
  {
    id: 'pod-2',
    title: '商业就是这样',
    host: '第一财经',
    cover: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=400&q=80',
    description: '用最通俗的语言解读商业世界的运作逻辑，让你听懂商业背后的故事。',
    category: '商业',
    platform: '喜马拉雅',
    episodeCount: 412,
    subscriberCount: 890000,
    rating: 'PG',
    episodes: [
      { id: 'ep-2-1', title: '瑞幸咖啡的逆袭之路', description: '从退市到重新崛起的商业奇迹', duration: 2100, publishedAt: '2024-12-14', audioUrl: 'https://example.com/audio/ep-2-1.mp3' },
      { id: 'ep-2-2', title: '拼多多为什么能赢', description: '解密拼多多的商业模式', duration: 2760, publishedAt: '2024-12-07', audioUrl: 'https://example.com/audio/ep-2-2.mp3' },
    ],
  },
  {
    id: 'pod-3',
    title: 'The Daily',
    host: 'The New York Times',
    cover: 'https://images.unsplash.com/photo-1504711434969-e33886168d6c?w=400&q=80',
    description: 'This is what the news should sound like. The biggest stories of our time, told by the best journalists in the world.',
    category: '新闻',
    platform: 'Apple Podcasts',
    episodeCount: 1850,
    subscriberCount: 4200000,
    rating: 'PG-13',
    episodes: [
      { id: 'ep-3-1', title: 'The State of AI Regulation', description: 'How governments are trying to keep up with AI', duration: 1680, publishedAt: '2024-12-15', audioUrl: 'https://example.com/audio/ep-3-1.mp3' },
      { id: 'ep-3-2', title: 'Climate Summit Results', description: 'What came out of COP29', duration: 1920, publishedAt: '2024-12-14', audioUrl: 'https://example.com/audio/ep-3-2.mp3' },
    ],
  },
  {
    id: 'pod-4',
    title: '故事FM',
    host: '寇爱哲',
    cover: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=400&q=80',
    description: '用你的声音，讲述你的故事。每期节目都是一个真实的中国人的亲身经历。',
    category: '社会',
    platform: '小宇宙',
    episodeCount: 680,
    subscriberCount: 1500000,
    rating: 'PG-13',
    episodes: [
      { id: 'ep-4-1', title: '我在非洲当医生的三年', description: '一位中国医生的非洲援助经历', duration: 3600, publishedAt: '2024-12-13', audioUrl: 'https://example.com/audio/ep-4-1.mp3' },
      { id: 'ep-4-2', title: '从北漂到回乡创业', description: '一个90后的人生选择', duration: 2880, publishedAt: '2024-12-06', audioUrl: 'https://example.com/audio/ep-4-2.mp3' },
    ],
  },
  {
    id: 'pod-5',
    title: 'Lex Fridman Podcast',
    host: 'Lex Fridman',
    cover: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400&q=80',
    description: 'Conversations about the nature of intelligence, consciousness, love, and power.',
    category: '科技',
    platform: 'Spotify',
    episodeCount: 420,
    subscriberCount: 3800000,
    rating: 'PG-13',
    episodes: [
      { id: 'ep-5-1', title: 'Sam Altman: Future of AI', description: 'Deep conversation about AGI and the future', duration: 10800, publishedAt: '2024-12-10', audioUrl: 'https://example.com/audio/ep-5-1.mp3' },
      { id: 'ep-5-2', title: 'Elon Musk: Mars and Beyond', description: 'SpaceX, Tesla, and the future of humanity', duration: 12600, publishedAt: '2024-12-03', audioUrl: 'https://example.com/audio/ep-5-2.mp3' },
    ],
  },
  {
    id: 'pod-6',
    title: '得意忘形',
    host: '张潇雨',
    cover: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80',
    description: '探讨如何更好地生活，涵盖心理学、哲学、个人成长等话题。',
    category: '教育',
    platform: '小宇宙',
    episodeCount: 195,
    subscriberCount: 680000,
    rating: 'PG',
    episodes: [
      { id: 'ep-6-1', title: '如何面对人生的不确定性', description: '关于焦虑、选择和自由', duration: 4200, publishedAt: '2024-12-12', audioUrl: 'https://example.com/audio/ep-6-1.mp3' },
      { id: 'ep-6-2', title: '读书的正确姿势', description: '为什么大多数人读书没有效果', duration: 3300, publishedAt: '2024-12-05', audioUrl: 'https://example.com/audio/ep-6-2.mp3' },
    ],
  },
  {
    id: 'pod-7',
    title: 'Serial',
    host: 'Sarah Koenig',
    cover: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&q=80',
    description: 'Serial tells one story — a true story — over the course of a season. Each season, a new story unfolds.',
    category: '真实犯罪',
    platform: 'Apple Podcasts',
    episodeCount: 42,
    subscriberCount: 5600000,
    rating: 'PG-13',
    episodes: [
      { id: 'ep-7-1', title: 'Season 4, Episode 1: The Beginning', description: 'A new case, a new mystery', duration: 2700, publishedAt: '2024-11-20', audioUrl: 'https://example.com/audio/ep-7-1.mp3' },
      { id: 'ep-7-2', title: 'Season 4, Episode 2: The Evidence', description: 'Examining the key evidence', duration: 3000, publishedAt: '2024-11-27', audioUrl: 'https://example.com/audio/ep-7-2.mp3' },
    ],
  },
  {
    id: 'pod-8',
    title: '日谈公园',
    host: '李叔',
    cover: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400&q=80',
    description: '一档轻松有趣的脱口秀播客，聊聊生活中那些有意思的事儿。',
    category: '喜剧',
    platform: '蜻蜓FM',
    episodeCount: 520,
    subscriberCount: 920000,
    rating: 'PG',
    episodes: [
      { id: 'ep-8-1', title: '年度最搞笑新闻盘点', description: '2024年那些让人笑出声的新闻', duration: 3900, publishedAt: '2024-12-14', audioUrl: 'https://example.com/audio/ep-8-1.mp3' },
      { id: 'ep-8-2', title: '职场奇葩故事大赏', description: '听众投稿的职场趣事', duration: 3300, publishedAt: '2024-12-07', audioUrl: 'https://example.com/audio/ep-8-2.mp3' },
    ],
  },
  {
    id: 'pod-9',
    title: '忽左忽右',
    host: '程衍樑',
    cover: 'https://images.unsplash.com/photo-1461360228754-6e81c478b882?w=400&q=80',
    description: '一档文化沙龙类播客节目，每期邀请嘉宾深度讨论历史、文化和社会议题。',
    category: '历史',
    platform: '小宇宙',
    episodeCount: 340,
    subscriberCount: 1200000,
    rating: 'PG',
    episodes: [
      { id: 'ep-9-1', title: '丝绸之路上的文明交汇', description: '从长安到罗马的文化传播', duration: 5400, publishedAt: '2024-12-11', audioUrl: 'https://example.com/audio/ep-9-1.mp3' },
      { id: 'ep-9-2', title: '二战中的密码战争', description: '图灵与恩尼格玛的故事', duration: 4800, publishedAt: '2024-12-04', audioUrl: 'https://example.com/audio/ep-9-2.mp3' },
    ],
  },
  {
    id: 'pod-10',
    title: 'Huberman Lab',
    host: 'Andrew Huberman',
    cover: 'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=400&q=80',
    description: 'Science-based tools for everyday life. Discusses neuroscience and science-based tools.',
    category: '健康',
    platform: 'Spotify',
    episodeCount: 210,
    subscriberCount: 6100000,
    rating: 'PG',
    episodes: [
      { id: 'ep-10-1', title: 'How to Optimize Sleep', description: 'Science-backed protocols for better sleep', duration: 7200, publishedAt: '2024-12-09', audioUrl: 'https://example.com/audio/ep-10-1.mp3' },
      { id: 'ep-10-2', title: 'The Science of Focus', description: 'Tools to enhance concentration and productivity', duration: 6600, publishedAt: '2024-12-02', audioUrl: 'https://example.com/audio/ep-10-2.mp3' },
    ],
  },
  {
    id: 'pod-11',
    title: '体育评书',
    host: '苏群',
    cover: 'https://images.unsplash.com/photo-1461896836934-bd45ba8fcf9b?w=400&q=80',
    description: '用评书的方式讲述体育故事，NBA、足球、奥运会，精彩赛事一网打尽。',
    category: '体育',
    platform: '喜马拉雅',
    episodeCount: 890,
    subscriberCount: 750000,
    rating: 'PG',
    episodes: [
      { id: 'ep-11-1', title: 'NBA赛季中期盘点', description: '各队表现分析与季后赛展望', duration: 2400, publishedAt: '2024-12-13', audioUrl: 'https://example.com/audio/ep-11-1.mp3' },
      { id: 'ep-11-2', title: '欧冠小组赛精彩回顾', description: '本赛季欧冠最佳进球和最佳表现', duration: 2100, publishedAt: '2024-12-06', audioUrl: 'https://example.com/audio/ep-11-2.mp3' },
    ],
  },
  {
    id: 'pod-12',
    title: '音乐无国界',
    host: '小河',
    cover: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&q=80',
    description: '探索世界各地的音乐文化，从古典到电子，从民谣到嘻哈。',
    category: '音乐',
    platform: '荔枝FM',
    episodeCount: 156,
    subscriberCount: 320000,
    rating: 'G',
    episodes: [
      { id: 'ep-12-1', title: '非洲鼓乐的魅力', description: '走进西非的音乐世界', duration: 2700, publishedAt: '2024-12-10', audioUrl: 'https://example.com/audio/ep-12-1.mp3' },
      { id: 'ep-12-2', title: '日本城市流行音乐复兴', description: 'City Pop为何在全球走红', duration: 2400, publishedAt: '2024-12-03', audioUrl: 'https://example.com/audio/ep-12-2.mp3' },
    ],
  },
  {
    id: 'pod-13',
    title: 'Crime Junkie',
    host: 'Ashley Flowers',
    cover: 'https://images.unsplash.com/photo-1453873531674-2151bcd01707?w=400&q=80',
    description: 'If you can never get enough true crime... Congratulations, you\'ve found your people.',
    category: '真实犯罪',
    platform: 'Spotify',
    episodeCount: 380,
    subscriberCount: 7200000,
    rating: 'PG-13',
    episodes: [
      { id: 'ep-13-1', title: 'MISSING: The Vanishing of Room 1046', description: 'A hotel mystery that remains unsolved', duration: 2700, publishedAt: '2024-12-12', audioUrl: 'https://example.com/audio/ep-13-1.mp3' },
    ],
  },
  {
    id: 'pod-14',
    title: '科技快报',
    host: '王自如',
    cover: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&q=80',
    description: '每日科技新闻速递，5分钟了解科技圈大事小情。',
    category: '科技',
    platform: '蜻蜓FM',
    episodeCount: 1200,
    subscriberCount: 430000,
    rating: 'G',
    episodes: [
      { id: 'ep-14-1', title: '苹果Vision Pro 2曝光', description: '下一代MR头显的最新消息', duration: 360, publishedAt: '2024-12-15', audioUrl: 'https://example.com/audio/ep-14-1.mp3' },
      { id: 'ep-14-2', title: '华为鸿蒙NEXT全面铺开', description: '鸿蒙生态最新进展', duration: 420, publishedAt: '2024-12-14', audioUrl: 'https://example.com/audio/ep-14-2.mp3' },
    ],
  },
  {
    id: 'pod-15',
    title: 'TED Talks Daily',
    host: 'TED',
    cover: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=400&q=80',
    description: 'Every weekday, TED Talks Daily brings you the latest talks in audio.',
    category: '教育',
    platform: 'Apple Podcasts',
    episodeCount: 2400,
    subscriberCount: 8500000,
    rating: 'G',
    episodes: [
      { id: 'ep-15-1', title: 'The Power of Vulnerability', description: 'Brené Brown on human connection', duration: 1200, publishedAt: '2024-12-15', audioUrl: 'https://example.com/audio/ep-15-1.mp3' },
      { id: 'ep-15-2', title: 'How to Make Stress Your Friend', description: 'Kelly McGonigal on rethinking stress', duration: 900, publishedAt: '2024-12-14', audioUrl: 'https://example.com/audio/ep-15-2.mp3' },
    ],
  },
  {
    id: 'pod-16',
    title: '娱乐大爆炸',
    host: '小明星探',
    cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80',
    description: '最新娱乐圈八卦、影视剧评、综艺点评，带你吃最新鲜的瓜。',
    category: '娱乐',
    platform: '喜马拉雅',
    episodeCount: 650,
    subscriberCount: 1100000,
    rating: 'PG',
    episodes: [
      { id: 'ep-16-1', title: '年度最佳电影盘点', description: '2024年不可错过的十部电影', duration: 3000, publishedAt: '2024-12-13', audioUrl: 'https://example.com/audio/ep-16-1.mp3' },
      { id: 'ep-16-2', title: '综艺节目新趋势', description: '2025年综艺市场预测', duration: 2400, publishedAt: '2024-12-06', audioUrl: 'https://example.com/audio/ep-16-2.mp3' },
    ],
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

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getPlatformColor(platform: string): string {
  const map: Record<string, string> = {
    'Apple Podcasts': 'bg-purple-600/20 text-purple-400 border-purple-600/30',
    'Spotify': 'bg-green-600/20 text-green-400 border-green-600/30',
    '小宇宙': 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
    '喜马拉雅': 'bg-orange-600/20 text-orange-400 border-orange-600/30',
    '蜻蜓FM': 'bg-cyan-600/20 text-cyan-400 border-cyan-600/30',
    '荔枝FM': 'bg-lime-600/20 text-lime-400 border-lime-600/30',
    'Google Podcasts': 'bg-blue-600/20 text-blue-400 border-blue-600/30',
    'Pocket Casts': 'bg-red-600/20 text-red-400 border-red-600/30',
    'Overcast': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    'Castbox': 'bg-pink-600/20 text-pink-400 border-pink-600/30',
  };
  return map[platform] || 'bg-gray-600/20 text-gray-400 border-gray-600/30';
}

// ===========================================================================
// Main Page Component
// ===========================================================================

export default function PodcastsPage() {
  // --- Filter state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activePlatform, setActivePlatform] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // --- View state ---
  const [activeTab, setActiveTab] = useState<'all' | 'subscriptions'>('all');

  // --- Detail state ---
  const [selectedShow, setSelectedShow] = useState<PodcastShow | null>(null);

  // --- Subscriptions ---
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(
    () => new Set(['pod-1', 'pod-4', 'pod-5', 'pod-10']),
  );

  // --- MusicPlayer integration ---
  const { state: playerState, actions: playerActions } = useMusicPlayer();

  // --- Toggle subscription ---
  const toggleSubscribe = useCallback((showId: string) => {
    setSubscribedIds((prev) => {
      const next = new Set(prev);
      if (next.has(showId)) {
        next.delete(showId);
      } else {
        next.add(showId);
      }
      return next;
    });
  }, []);

  // --- Play episode through MusicPlayer ---
  const playEpisode = useCallback(
    (show: PodcastShow, episode: PodcastEpisode) => {
      // Build queue from all episodes of this show
      const queue: MusicTrack[] = show.episodes.map((ep) => ({
        id: ep.id,
        title: ep.title,
        artist: show.host,
        album: show.title,
        cover: show.cover,
        source: show.platform,
        duration: ep.duration,
        streamUrl: ep.audioUrl,
        rating: show.rating,
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

  // --- Filtered shows ---
  const filteredShows = useMemo(() => {
    let list = ALL_SHOWS;

    if (activeCategory !== 'all') {
      list = list.filter((s) => s.category === activeCategory);
    }
    if (activePlatform !== 'all') {
      list = list.filter((s) => s.platform === activePlatform);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.host.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q),
      );
    }

    return list;
  }, [activeCategory, activePlatform, searchQuery]);

  // --- Subscribed shows ---
  const subscribedShows = useMemo(
    () => ALL_SHOWS.filter((s) => subscribedIds.has(s.id)),
    [subscribedIds],
  );

  // --- Active filter count ---
  const activeFilterCount =
    (activeCategory !== 'all' ? 1 : 0) + (activePlatform !== 'all' ? 1 : 0);

  // --- Stats ---
  const totalShows = ALL_SHOWS.length;
  const totalEpisodes = ALL_SHOWS.reduce((s, show) => s + show.episodeCount, 0);


  // =========================================================================
  // Show Detail View — episode list overlay
  // =========================================================================
  if (selectedShow) {
    return (
      <>
        <Header />
        <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
          {/* Back button */}
          <button
            onClick={() => setSelectedShow(null)}
            className="flex items-center gap-1.5 text-sm text-[#888] hover:text-[#3ea6ff] transition-colors mb-4"
          >
            <ChevronLeft size={16} />
            返回播客列表
          </button>

          {/* Show header */}
          <div className="flex flex-col sm:flex-row gap-5 mb-6">
            <img
              src={selectedShow.cover}
              alt={selectedShow.title}
              className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl object-cover flex-shrink-0 shadow-lg"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 mb-2">
                <h1 className="text-xl font-bold text-white">{selectedShow.title}</h1>
                <RatingBadge rating={selectedShow.rating} />
              </div>
              <p className="text-sm text-[#aaa] mb-1">{selectedShow.host}</p>
              <div className="flex items-center gap-3 mb-3 text-xs text-[#666]">
                <span className={`px-2 py-0.5 rounded border text-[10px] font-medium ${getPlatformColor(selectedShow.platform)}`}>
                  {selectedShow.platform}
                </span>
                <span className="flex items-center gap-1">
                  <ListMusic size={12} />
                  {selectedShow.episodeCount} 集
                </span>
                <span className="flex items-center gap-1">
                  <Headphones size={12} />
                  {fmtNum(selectedShow.subscriberCount)} 订阅
                </span>
                <span className="flex items-center gap-1">
                  <Tag size={12} />
                  {selectedShow.category}
                </span>
              </div>
              <p className="text-sm text-[#999] leading-relaxed mb-4 line-clamp-3">
                {selectedShow.description}
              </p>
              <button
                onClick={() => toggleSubscribe(selectedShow.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  subscribedIds.has(selectedShow.id)
                    ? 'bg-[#3ea6ff]/10 text-[#3ea6ff] border border-[#3ea6ff]/30 hover:bg-[#3ea6ff]/20'
                    : 'bg-[#3ea6ff] text-[#0f0f0f] hover:bg-[#65b8ff]'
                }`}
              >
                {subscribedIds.has(selectedShow.id) ? (
                  <>
                    <Heart size={14} className="fill-current" />
                    已订阅
                  </>
                ) : (
                  <>
                    <Rss size={14} />
                    订阅
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Episode list */}
          <div>
            <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-1.5">
              <ListMusic size={14} className="text-[#3ea6ff]" />
              单集列表
              <span className="text-[10px] text-[#666] font-normal ml-1">
                {selectedShow.episodes.length} 集
              </span>
            </h2>
            <div className="space-y-2">
              {selectedShow.episodes.map((ep) => {
                const playing = isEpisodePlaying(ep.id);
                return (
                  <div
                    key={ep.id}
                    className={`flex items-center gap-3 p-3 rounded-xl transition cursor-pointer group ${
                      playing
                        ? 'bg-[#3ea6ff]/10 border border-[#3ea6ff]/20'
                        : 'bg-[#1a1a1a] hover:bg-[#222] border border-transparent'
                    }`}
                    onClick={() => playEpisode(selectedShow, ep)}
                  >
                    {/* Episode number / play button */}
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
  // Main page render
  // =========================================================================
  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
        {/* ===== Page Title ===== */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Podcast size={22} className="text-[#3ea6ff]" />
            播客中心
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#3ea6ff]/10 border border-[#3ea6ff]/20 text-[#3ea6ff] font-semibold flex items-center gap-1">
              <Rss size={8} />
              {totalShows} 个节目
            </span>
            <span className="text-xs text-[#666]">
              {fmtNum(totalEpisodes)} 集
            </span>
          </div>
        </div>

        {/* ===== Tab Navigation ===== */}
        <div className="flex gap-1 mb-4 border-b border-[#333]/50">
          {([
            { key: 'all' as const, label: '全部播客', icon: <Podcast size={14} /> },
            { key: 'subscriptions' as const, label: '我的订阅', icon: <Heart size={14} /> },
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
              {tab.key === 'subscriptions' && subscribedIds.size > 0 && (
                <span className="ml-1 text-[10px] bg-[#3ea6ff]/20 text-[#3ea6ff] px-1.5 py-0.5 rounded-full">
                  {subscribedIds.size}
                </span>
              )}
            </button>
          ))}
          {/* Adult mode: show adult podcasts tab */}
          {ageGate.canAccess('NC-17') && (
            <a
              href="/zone/podcasts"
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-[1px] text-red-400 border-transparent hover:text-red-300 hover:border-red-500/30"
            >
              <Shield size={14} />
              成人播客
            </a>
          )}
        </div>

        {/* ===== All Podcasts Tab ===== */}
        {activeTab === 'all' && (
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
                placeholder="搜索播客节目、主播、分类..."
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

            {/* Category pills */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
              <button
                onClick={() => setActiveCategory('all')}
                className={`px-3 py-1.5 rounded-full text-[12px] whitespace-nowrap border transition shrink-0 flex items-center gap-1 ${
                  activeCategory === 'all'
                    ? 'bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold'
                    : 'bg-transparent text-[#aaa] border-[#333] hover:bg-[#2a2a2a] hover:text-white'
                }`}
              >
                <Flame size={12} />
                全部
              </button>
              {CATEGORY_FILTERS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className={`px-3 py-1.5 rounded-full text-[12px] whitespace-nowrap border transition shrink-0 flex items-center gap-1 ${
                    activeCategory === c.id
                      ? 'bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold'
                      : 'bg-transparent text-[#aaa] border-[#333] hover:bg-[#2a2a2a] hover:text-white'
                  }`}
                >
                  {c.icon}
                  {c.label}
                </button>
              ))}
            </div>

            {/* Expanded Filters — Platform */}
            {showFilters && (
              <div className="mb-4 p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50 space-y-3">
                <div>
                  <p className="text-[11px] text-[#666] mb-2 flex items-center gap-1">
                    <Globe size={11} /> 播客平台
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setActivePlatform('all')}
                      className={`px-3 py-1 rounded-full text-[12px] border transition ${
                        activePlatform === 'all'
                          ? 'bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/40 font-medium'
                          : 'bg-transparent text-[#888] border-[#333] hover:text-white hover:border-[#555]'
                      }`}
                    >
                      全部平台
                    </button>
                    {PLATFORM_FILTERS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setActivePlatform(p.id)}
                        className={`px-3 py-1 rounded-full text-[12px] border transition ${
                          activePlatform === p.id
                            ? 'bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/40 font-medium'
                            : 'bg-transparent text-[#888] border-[#333] hover:text-white hover:border-[#555]'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clear filters */}
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => {
                      setActiveCategory('all');
                      setActivePlatform('all');
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
                  {activeCategory !== 'all' && activeCategory}
                  {activePlatform !== 'all' && ` · ${activePlatform}`}
                  {searchQuery && ` · "${searchQuery}"`}
                </span>
                <span className="text-[#555]">·</span>
                <span>{filteredShows.length} 个节目</span>
              </div>
            )}

            {/* ===== Featured Banner ===== */}
            {activeCategory === 'all' && activePlatform === 'all' && !searchQuery && filteredShows.length > 0 && (
              <div className="mb-5">
                <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-1.5">
                  <Flame size={14} className="text-[#3ea6ff]" />
                  热门推荐
                </h2>
                <div
                  onClick={() => setSelectedShow(filteredShows[0])}
                  className="relative rounded-2xl overflow-hidden cursor-pointer group"
                >
                  <div className="relative aspect-[21/9] bg-[#1a1a1a]">
                    <img
                      src={filteredShows[0].cover}
                      alt={filteredShows[0].title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    {/* Top badges */}
                    <div className="absolute top-3 left-3 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#3ea6ff] text-white text-[10px] font-bold flex items-center gap-1">
                        <Podcast size={10} />
                        热门
                      </span>
                      <RatingBadge rating={filteredShows[0].rating} />
                    </div>
                    {/* Bottom info */}
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="text-lg font-bold text-white mb-1">{filteredShows[0].title}</h3>
                      <div className="flex items-center gap-3 text-xs text-white/70">
                        <span>{filteredShows[0].host}</span>
                        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-medium ${getPlatformColor(filteredShows[0].platform)}`}>
                          {filteredShows[0].platform}
                        </span>
                        <span className="flex items-center gap-1">
                          <ListMusic size={10} />
                          {filteredShows[0].episodeCount} 集
                        </span>
                        <span className="flex items-center gap-1">
                          <Headphones size={10} />
                          {fmtNum(filteredShows[0].subscriberCount)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===== Podcast Grid ===== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredShows.map((show) => (
                <PodcastCard
                  key={show.id}
                  show={show}
                  isSubscribed={subscribedIds.has(show.id)}
                  onToggleSubscribe={() => toggleSubscribe(show.id)}
                  onSelect={() => setSelectedShow(show)}
                  onPlayLatest={() => {
                    if (show.episodes.length > 0) {
                      playEpisode(show, show.episodes[0]);
                    }
                  }}
                  isPlaying={show.episodes.some((ep) => isEpisodePlaying(ep.id))}
                />
              ))}
            </div>

            {/* Empty state */}
            {filteredShows.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Podcast size={48} className="text-[#333] mb-4" />
                <p className="text-[#666] text-sm mb-2">没有找到匹配的播客</p>
                <p className="text-[#555] text-xs">试试调整筛选条件或搜索关键词</p>
              </div>
            )}
          </>
        )}

        {/* ===== Subscriptions Tab ===== */}
        {activeTab === 'subscriptions' && (
          <>
            {subscribedShows.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {subscribedShows.map((show) => (
                  <PodcastCard
                    key={show.id}
                    show={show}
                    isSubscribed
                    onToggleSubscribe={() => toggleSubscribe(show.id)}
                    onSelect={() => setSelectedShow(show)}
                    onPlayLatest={() => {
                      if (show.episodes.length > 0) {
                        playEpisode(show, show.episodes[0]);
                      }
                    }}
                    isPlaying={show.episodes.some((ep) => isEpisodePlaying(ep.id))}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Heart size={48} className="text-[#333] mb-4" />
                <p className="text-[#666] text-sm mb-2">还没有订阅任何播客</p>
                <p className="text-[#555] text-xs">浏览全部播客，找到你感兴趣的节目</p>
                <button
                  onClick={() => setActiveTab('all')}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] text-sm font-medium hover:bg-[#65b8ff] transition"
                >
                  浏览播客
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}


// ---------------------------------------------------------------------------
// PodcastCard Component
// ---------------------------------------------------------------------------

interface PodcastCardProps {
  show: PodcastShow;
  isSubscribed: boolean;
  onToggleSubscribe: () => void;
  onSelect: () => void;
  onPlayLatest: () => void;
  isPlaying: boolean;
}

function PodcastCard({
  show,
  isSubscribed,
  onToggleSubscribe,
  onSelect,
  onPlayLatest,
  isPlaying,
}: PodcastCardProps) {
  return (
    <div className="group rounded-xl bg-[#1a1a1a] border border-[#333]/30 overflow-hidden hover:border-[#3ea6ff]/30 transition-all hover:shadow-lg hover:shadow-[#3ea6ff]/5">
      {/* Cover */}
      <div
        className="relative aspect-square cursor-pointer overflow-hidden"
        onClick={onSelect}
      >
        <img
          src={show.cover}
          alt={show.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlayLatest();
            }}
            className="w-12 h-12 rounded-full bg-[#3ea6ff]/90 backdrop-blur flex items-center justify-center hover:bg-[#3ea6ff] transition shadow-lg"
            aria-label="Play latest episode"
          >
            {isPlaying ? (
              <Pause size={20} className="text-white" />
            ) : (
              <Play size={20} className="text-white ml-0.5" />
            )}
          </button>
        </div>

        {/* Top badges */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <RatingBadge rating={show.rating} />
          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-medium ${getPlatformColor(show.platform)}`}>
            {show.platform}
          </span>
        </div>

        {/* Playing indicator */}
        {isPlaying && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#3ea6ff]/90 text-white text-[10px] font-medium">
            <CircleDot size={8} className="animate-pulse" />
            播放中
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3
          className="text-sm font-bold text-white truncate cursor-pointer hover:text-[#3ea6ff] transition"
          onClick={onSelect}
        >
          {show.title}
        </h3>
        <p className="text-xs text-[#aaa] mt-0.5 truncate">{show.host}</p>
        <p className="text-xs text-[#666] mt-1 line-clamp-2 leading-relaxed">
          {show.description}
        </p>

        {/* Meta row */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2 text-[10px] text-[#666]">
            <span className="flex items-center gap-0.5">
              <ListMusic size={10} />
              {show.episodeCount}集
            </span>
            <span className="flex items-center gap-0.5">
              <Headphones size={10} />
              {fmtNum(show.subscriberCount)}
            </span>
          </div>

          {/* Subscribe button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSubscribe();
            }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
              isSubscribed
                ? 'bg-[#3ea6ff]/10 text-[#3ea6ff] hover:bg-[#3ea6ff]/20'
                : 'bg-[#2a2a2a] text-[#aaa] hover:bg-[#3ea6ff] hover:text-[#0f0f0f]'
            }`}
            aria-label={isSubscribed ? 'Unsubscribe' : 'Subscribe'}
          >
            {isSubscribed ? (
              <>
                <Heart size={11} className="fill-current" />
                已订阅
              </>
            ) : (
              <>
                <Rss size={11} />
                订阅
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
