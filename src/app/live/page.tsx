'use client';

import { useState, useMemo, useCallback } from 'react';
import Header from '@/components/layout/Header';
import RatingBadge from '@/components/ui/RatingBadge';
import VideoPlayer from '@/components/player/VideoPlayer';
import type { ContentRating } from '@/lib/types';
import {
  Radio,
  Search,
  Filter,
  X,
  Heart,
  HeartOff,
  Play,
  Eye,
  Users,
  Gamepad2,
  Music,
  TreePine,
  BookOpen,
  MessageCircle,
  UtensilsCrossed,
  Dumbbell,
  Cpu,
  Palette,
  Flame,
  Globe,
  Tag,
  ChevronRight,
  Wifi,
  WifiOff,
  ExternalLink,
  CircleDot,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiveRoom {
  id: string;
  title: string;
  streamerName: string;
  streamerAvatar: string;
  category: string;
  platform: string;
  viewers: number;
  tags: string[];
  isLive: boolean;
  cover: string;
  rating: ContentRating;
  streamUrl: string;
  description: string;
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
  { id: '游戏', label: '游戏', icon: <Gamepad2 size={12} /> },
  { id: '娱乐', label: '娱乐', icon: <MessageCircle size={12} /> },
  { id: '户外', label: '户外', icon: <TreePine size={12} /> },
  { id: '学习', label: '学习', icon: <BookOpen size={12} /> },
  { id: '音乐', label: '音乐', icon: <Music size={12} /> },
  { id: '聊天', label: '聊天', icon: <Users size={12} /> },
  { id: '美食', label: '美食', icon: <UtensilsCrossed size={12} /> },
  { id: '体育', label: '体育', icon: <Dumbbell size={12} /> },
  { id: '科技', label: '科技', icon: <Cpu size={12} /> },
  { id: '创意', label: '创意', icon: <Palette size={12} /> },
];

const PLATFORM_FILTERS: FilterOption[] = [
  { id: '斗鱼', label: '斗鱼' },
  { id: '虎牙', label: '虎牙' },
  { id: 'B站直播', label: 'B站直播' },
  { id: 'Twitch', label: 'Twitch' },
  { id: 'YouTube Live', label: 'YouTube Live' },
  { id: '抖音直播', label: '抖音直播' },
  { id: '快手直播', label: '快手直播' },
  { id: '花椒直播', label: '花椒直播' },
  { id: 'CC直播', label: 'CC直播' },
  { id: 'Kick', label: 'Kick' },
];

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const ALL_ROOMS: LiveRoom[] = [
  {
    id: 'lr-1',
    title: '英雄联盟S15世界赛解说',
    streamerName: 'PDD',
    streamerAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&q=80',
    category: '游戏',
    platform: '斗鱼',
    viewers: 1850000,
    tags: ['英雄联盟', 'S15', '解说'],
    isLive: true,
    cover: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&q=80',
    rating: 'PG-13',
    streamUrl: 'https://example.com/live/lr-1',
    description: 'S15世界赛淘汰赛精彩解说，一起见证冠军诞生！',
  },
  {
    id: 'lr-2',
    title: '周末音乐会 钢琴即兴演奏',
    streamerName: '琴韵悠扬',
    streamerAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&q=80',
    category: '音乐',
    platform: 'B站直播',
    viewers: 320000,
    tags: ['钢琴', '即兴', '古典'],
    isLive: true,
    cover: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&q=80',
    rating: 'G',
    streamUrl: 'https://example.com/live/lr-2',
    description: '每周末晚8点，钢琴即兴演奏，接受点歌~',
  },
  {
    id: 'lr-3',
    title: 'Valorant Ranked Grind to Radiant',
    streamerName: 'TenZ',
    streamerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&q=80',
    category: '游戏',
    platform: 'Twitch',
    viewers: 95000,
    tags: ['Valorant', 'FPS', 'Ranked'],
    isLive: true,
    cover: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=400&q=80',
    rating: 'PG-13',
    streamUrl: 'https://example.com/live/lr-3',
    description: 'Road to Radiant! Come hang out and watch some Valorant gameplay.',
  },
  {
    id: 'lr-4',
    title: '川藏线骑行第15天 翻越折多山',
    streamerName: '骑行侠客',
    streamerAvatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&q=80',
    category: '户外',
    platform: '抖音直播',
    viewers: 580000,
    tags: ['骑行', '川藏线', '户外'],
    isLive: true,
    cover: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&q=80',
    rating: 'G',
    streamUrl: 'https://example.com/live/lr-4',
    description: '川藏线骑行挑战，今天翻越海拔4298米的折多山！',
  },
  {
    id: 'lr-5',
    title: '考研数学强化班 线性代数专题',
    streamerName: '张宇老师',
    streamerAvatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=80&q=80',
    category: '学习',
    platform: 'B站直播',
    viewers: 420000,
    tags: ['考研', '数学', '线性代数'],
    isLive: true,
    cover: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=400&q=80',
    rating: 'G',
    streamUrl: 'https://example.com/live/lr-5',
    description: '考研数学强化课程，线性代数重点题型精讲。',
  },
  {
    id: 'lr-6',
    title: '原神4.8新版本抽卡直播',
    streamerName: '大司马',
    streamerAvatar: 'https://images.unsplash.com/photo-1599566150163-29194dcabd9c?w=80&q=80',
    category: '游戏',
    platform: '虎牙',
    viewers: 760000,
    tags: ['原神', '抽卡', '新版本'],
    isLive: true,
    cover: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80',
    rating: 'PG',
    streamUrl: 'https://example.com/live/lr-6',
    description: '原神4.8版本更新，新角色抽卡挑战！',
  },
  {
    id: 'lr-7',
    title: '深夜唱歌 治愈系民谣',
    streamerName: '小鹿音乐',
    streamerAvatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&q=80',
    category: '音乐',
    platform: '快手直播',
    viewers: 180000,
    tags: ['唱歌', '民谣', '治愈'],
    isLive: true,
    cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80',
    rating: 'G',
    streamUrl: 'https://example.com/live/lr-7',
    description: '深夜治愈系民谣，陪你度过每一个夜晚。',
  },
  {
    id: 'lr-8',
    title: 'Minecraft Hardcore Day 500',
    streamerName: 'PhilzaLive',
    streamerAvatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=80&q=80',
    category: '游戏',
    platform: 'YouTube Live',
    viewers: 42000,
    tags: ['Minecraft', 'Hardcore', '生存'],
    isLive: true,
    cover: 'https://images.unsplash.com/photo-1587573089734-09cb69c0f2b4?w=400&q=80',
    rating: 'PG',
    streamUrl: 'https://example.com/live/lr-8',
    description: 'Day 500 of Hardcore Minecraft! Will we survive?',
  },
  {
    id: 'lr-9',
    title: '街头美食探店 成都篇',
    streamerName: '吃货小分队',
    streamerAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=80&q=80',
    category: '美食',
    platform: '抖音直播',
    viewers: 290000,
    tags: ['美食', '探店', '成都'],
    isLive: true,
    cover: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80',
    rating: 'G',
    streamUrl: 'https://example.com/live/lr-9',
    description: '成都街头美食探店，带你吃遍锦里和宽窄巷子！',
  },
  {
    id: 'lr-10',
    title: 'NBA季后赛实时解说',
    streamerName: '篮球风暴',
    streamerAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&q=80',
    category: '体育',
    platform: '虎牙',
    viewers: 650000,
    tags: ['NBA', '季后赛', '篮球'],
    isLive: true,
    cover: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400&q=80',
    rating: 'PG',
    streamUrl: 'https://example.com/live/lr-10',
    description: 'NBA季后赛精彩解说，一起为你的主队加油！',
  },
  {
    id: 'lr-11',
    title: 'AI绘画创作 Stable Diffusion教学',
    streamerName: '科技宅小明',
    streamerAvatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=80&q=80',
    category: '科技',
    platform: 'B站直播',
    viewers: 85000,
    tags: ['AI', '绘画', 'SD'],
    isLive: true,
    cover: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=400&q=80',
    rating: 'PG',
    streamUrl: 'https://example.com/live/lr-11',
    description: 'Stable Diffusion从入门到精通，手把手教你AI绘画。',
  },
  {
    id: 'lr-12',
    title: '水彩风景画教学 日落海滩',
    streamerName: '画画的花花',
    streamerAvatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=80&q=80',
    category: '创意',
    platform: '花椒直播',
    viewers: 45000,
    tags: ['水彩', '绘画', '教学'],
    isLive: true,
    cover: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=400&q=80',
    rating: 'G',
    streamUrl: 'https://example.com/live/lr-12',
    description: '水彩画教学，今天画一幅日落海滩风景。',
  },
  {
    id: 'lr-13',
    title: '脱口秀开放麦之夜',
    streamerName: '笑果工厂',
    streamerAvatar: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=80&q=80',
    category: '娱乐',
    platform: '斗鱼',
    viewers: 520000,
    tags: ['脱口秀', '搞笑', '开放麦'],
    isLive: true,
    cover: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=400&q=80',
    rating: 'PG-13',
    streamUrl: 'https://example.com/live/lr-13',
    description: '脱口秀开放麦，新人老手同台竞技！',
  },
  {
    id: 'lr-14',
    title: 'Just Chatting - Chill Stream',
    streamerName: 'xQcOW',
    streamerAvatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=80&q=80',
    category: '聊天',
    platform: 'Kick',
    viewers: 78000,
    tags: ['Just Chatting', 'Chill', 'React'],
    isLive: true,
    cover: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400&q=80',
    rating: 'PG-13',
    streamUrl: 'https://example.com/live/lr-14',
    description: 'Just chatting and reacting to videos. Come hang out!',
  },
  {
    id: 'lr-15',
    title: 'CSGO2 职业选手排位',
    streamerName: 's1mple',
    streamerAvatar: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=80&q=80',
    category: '游戏',
    platform: 'Twitch',
    viewers: 120000,
    tags: ['CSGO2', 'FPS', '职业'],
    isLive: false,
    cover: 'https://images.unsplash.com/photo-1552820728-8b83bb6b2b28?w=400&q=80',
    rating: 'PG-13',
    streamUrl: 'https://example.com/live/lr-15',
    description: 'CS2 ranked games with the GOAT.',
  },
  {
    id: 'lr-16',
    title: '网易云音乐DJ现场',
    streamerName: 'DJ小飞',
    streamerAvatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=80&q=80',
    category: '音乐',
    platform: 'CC直播',
    viewers: 67000,
    tags: ['DJ', '电音', '现场'],
    isLive: false,
    cover: 'https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=400&q=80',
    rating: 'PG',
    streamUrl: 'https://example.com/live/lr-16',
    description: '电音DJ现场，嗨翻全场！',
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

function getPlatformColor(platform: string): string {
  const map: Record<string, string> = {
    '斗鱼': 'bg-orange-600/20 text-orange-400 border-orange-600/30',
    '虎牙': 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
    'B站直播': 'bg-pink-600/20 text-pink-400 border-pink-600/30',
    'Twitch': 'bg-purple-600/20 text-purple-400 border-purple-600/30',
    'YouTube Live': 'bg-red-600/20 text-red-400 border-red-600/30',
    '抖音直播': 'bg-cyan-600/20 text-cyan-400 border-cyan-600/30',
    '快手直播': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    '花椒直播': 'bg-rose-600/20 text-rose-400 border-rose-600/30',
    'CC直播': 'bg-green-600/20 text-green-400 border-green-600/30',
    'Kick': 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30',
  };
  return map[platform] || 'bg-gray-600/20 text-gray-400 border-gray-600/30';
}

// ===========================================================================
// Main Page Component
// ===========================================================================

export default function LivePage() {
  // --- Filter state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activePlatform, setActivePlatform] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // --- View state ---
  const [activeTab, setActiveTab] = useState<'live' | 'following'>('live');

  // --- Player state ---
  const [watchingRoom, setWatchingRoom] = useState<LiveRoom | null>(null);

  // --- Chat state ---
  const [chatInput, setChatInput] = useState('');
  const [chatMsgs, setChatMsgs] = useState<{ user: string; msg: string; color: string }[]>([]);

  // --- Follow list ---
  const [followedIds, setFollowedIds] = useState<Set<string>>(
    () => new Set(['lr-1', 'lr-2', 'lr-5', 'lr-15']),
  );

  // --- Toggle follow ---
  const toggleFollow = useCallback((roomId: string) => {
    setFollowedIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  }, []);

  // --- Filtered rooms ---
  const filteredRooms = useMemo(() => {
    let list = ALL_ROOMS;

    if (activeCategory !== 'all') {
      list = list.filter((r) => r.category === activeCategory);
    }
    if (activePlatform !== 'all') {
      list = list.filter((r) => r.platform === activePlatform);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.streamerName.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [activeCategory, activePlatform, searchQuery]);

  // --- Currently live rooms ---
  const liveRooms = useMemo(() => filteredRooms.filter((r) => r.isLive), [filteredRooms]);

  // --- Followed streamers ---
  const followedRooms = useMemo(
    () => ALL_ROOMS.filter((r) => followedIds.has(r.id)),
    [followedIds],
  );

  // --- Active filter count ---
  const activeFilterCount =
    (activeCategory !== 'all' ? 1 : 0) + (activePlatform !== 'all' ? 1 : 0);

  // --- Stats ---
  const totalLive = ALL_ROOMS.filter((r) => r.isLive).length;
  const totalViewers = ALL_ROOMS.filter((r) => r.isLive).reduce((s, r) => s + r.viewers, 0);

  // --- Chat helpers ---
  const CHAT_COLORS = ['#3ea6ff', '#2ba640', '#f0b90b', '#ff4444', '#a855f7', '#ec4899', '#f97316'];

  const startWatching = useCallback((room: LiveRoom) => {
    setWatchingRoom(room);
    setChatMsgs([
      { user: '系统', msg: `欢迎来到 ${room.streamerName} 的直播间！`, color: '#f0b90b' },
      { user: '系统', msg: '请文明发言，友善互动', color: '#8a8a8a' },
    ]);
  }, []);

  const sendChat = useCallback(() => {
    if (!chatInput.trim()) return;
    const color = CHAT_COLORS[Math.floor(Math.random() * CHAT_COLORS.length)];
    setChatMsgs((prev) => [...prev.slice(-50), { user: '我', msg: chatInput, color }]);
    setChatInput('');
    // Simulate bot reply
    setTimeout(() => {
      const bots = ['路人甲', '小明', '观众A', '粉丝1号', '游客', '老王'];
      const replies = ['666', '好厉害！', '主播加油', '哈哈哈', '太强了', '学到了', '关注了', '第一次来'];
      setChatMsgs((prev) => [
        ...prev.slice(-50),
        {
          user: bots[Math.floor(Math.random() * bots.length)],
          msg: replies[Math.floor(Math.random() * replies.length)],
          color: CHAT_COLORS[Math.floor(Math.random() * CHAT_COLORS.length)],
        },
      ]);
    }, 500 + Math.random() * 2000);
  }, [chatInput]);

  // =========================================================================
  // Watching a live stream — fullscreen overlay
  // =========================================================================
  if (watchingRoom) {
    return (
      <div className="fixed inset-0 z-[70] bg-black flex flex-col md:flex-row">
        {/* Video area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Player header */}
          <div className="flex items-center justify-between px-4 py-2 bg-[#0f0f0f] border-b border-white/5 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setWatchingRoom(null)}
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                aria-label="Close player"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="text-sm font-medium text-white truncate">
                {watchingRoom.title}
              </span>
              <span className="text-xs text-white/40">{watchingRoom.streamerName}</span>
            </div>
            <div className="flex items-center gap-2">
              <RatingBadge rating={watchingRoom.rating} />
              <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${getPlatformColor(watchingRoom.platform)}`}>
                {watchingRoom.platform}
              </span>
              <button
                onClick={() => toggleFollow(watchingRoom.id)}
                className={`p-1.5 rounded-lg transition-colors ${
                  followedIds.has(watchingRoom.id)
                    ? 'text-red-400 hover:text-red-300'
                    : 'text-white/40 hover:text-white'
                }`}
                aria-label={followedIds.has(watchingRoom.id) ? 'Unfollow' : 'Follow'}
              >
                <Heart className={`w-4 h-4 ${followedIds.has(watchingRoom.id) ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>

          {/* Video player */}
          <div className="flex-1 min-h-0">
            <VideoPlayer
              src={watchingRoom.streamUrl}
              title={watchingRoom.title}
              source={watchingRoom.platform}
              rating={watchingRoom.rating}
              autoPlay
            />
          </div>

          {/* Stream info below player */}
          <div className="px-4 py-3 bg-[#0f0f0f] border-t border-white/5 flex-shrink-0">
            <div className="flex items-center gap-3">
              <img
                src={watchingRoom.streamerAvatar}
                alt={watchingRoom.streamerName}
                className="w-10 h-10 rounded-full object-cover border-2 border-[#3ea6ff]"
              />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-white truncate">{watchingRoom.title}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-[#aaa]">{watchingRoom.streamerName}</span>
                  <span className="text-[10px] text-[#666] flex items-center gap-1">
                    <Eye size={10} />
                    {fmtNum(watchingRoom.viewers)}
                  </span>
                  <span className="text-[10px] text-[#666]">{watchingRoom.category}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chat sidebar */}
        <div className="w-full md:w-80 lg:w-96 flex flex-col bg-[#0f0f0f] border-l border-white/5 h-64 md:h-auto">
          <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
            <span className="text-sm font-bold flex items-center gap-1.5">
              <MessageCircle size={14} className="text-[#3ea6ff]" />
              实时弹幕
            </span>
            <span className="text-[10px] text-[#8a8a8a]">{fmtNum(watchingRoom.viewers)}人在看</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0">
            {chatMsgs.map((m, i) => (
              <div key={i} className="text-[12px]">
                <span className="font-bold mr-1.5" style={{ color: m.color }}>
                  {m.user}
                </span>
                <span className="text-[#ccc]">{m.msg}</span>
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-white/5 flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendChat();
              }}
              placeholder="发送弹幕..."
              className="flex-1 h-9 px-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-xs text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition"
            />
            <button
              onClick={sendChat}
              className="px-3 h-9 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] text-xs font-bold hover:bg-[#65b8ff] transition"
            >
              发送
            </button>
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
            <Radio size={22} className="text-[#3ea6ff]" />
            直播中心
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-semibold flex items-center gap-1">
              <CircleDot size={8} className="animate-pulse" />
              {totalLive}个直播中
            </span>
            <span className="text-xs text-[#666]">
              {fmtNum(totalViewers)}人在看
            </span>
          </div>
        </div>

        {/* ===== Tab Navigation ===== */}
        <div className="flex gap-1 mb-4 border-b border-[#333]/50">
          {([
            { key: 'live' as const, label: '正在直播', icon: <Wifi size={14} /> },
            { key: 'following' as const, label: '关注主播', icon: <Heart size={14} /> },
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

        {/* ===== Live Tab ===== */}
        {activeTab === 'live' && (
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
                placeholder="搜索主播、直播间、标签..."
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
                    <Globe size={11} /> 直播平台
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
                <span>{liveRooms.length} 个直播</span>
              </div>
            )}

            {/* ===== Currently Live — Featured Banner ===== */}
            {activeCategory === 'all' && activePlatform === 'all' && !searchQuery && liveRooms.length > 0 && (
              <div className="mb-5">
                <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-1.5">
                  <Flame size={14} className="text-red-400" />
                  正在直播
                  <span className="text-[10px] text-[#666] font-normal ml-1">热门推荐</span>
                </h2>
                <div
                  onClick={() => startWatching(liveRooms[0])}
                  className="relative rounded-2xl overflow-hidden cursor-pointer group"
                >
                  <div className="relative aspect-video md:aspect-[21/9] bg-[#1a1a1a]">
                    <img
                      src={liveRooms[0].cover}
                      alt={liveRooms[0].title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    {/* Play overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-16 h-16 rounded-full bg-[#3ea6ff]/20 backdrop-blur flex items-center justify-center">
                        <Play size={28} className="text-white ml-1" />
                      </div>
                    </div>
                    {/* Top badges */}
                    <div className="absolute top-3 left-3 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-red-500 text-white text-[10px] font-bold flex items-center gap-1">
                        <CircleDot size={8} className="animate-pulse" />
                        LIVE
                      </span>
                      <span className="px-2 py-0.5 rounded bg-black/50 text-white text-[10px] flex items-center gap-1">
                        <Eye size={10} />
                        {fmtNum(liveRooms[0].viewers)}
                      </span>
                    </div>
                    <span className="absolute top-3 right-3">
                      <RatingBadge rating={liveRooms[0].rating} />
                    </span>
                    {/* Bottom info */}
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={liveRooms[0].streamerAvatar}
                          alt={liveRooms[0].streamerName}
                          className="w-12 h-12 rounded-full object-cover border-2 border-[#3ea6ff]"
                        />
                        <div>
                          <h2 className="font-bold text-white text-lg">{liveRooms[0].title}</h2>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-sm text-[#aaa]">{liveRooms[0].streamerName}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${getPlatformColor(liveRooms[0].platform)}`}>
                              {liveRooms[0].platform}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===== Live Room Grid ===== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {liveRooms.map((room) => (
                <LiveRoomCard
                  key={room.id}
                  room={room}
                  isFollowed={followedIds.has(room.id)}
                  onWatch={() => startWatching(room)}
                  onToggleFollow={() => toggleFollow(room.id)}
                />
              ))}
            </div>

            {/* Offline rooms */}
            {filteredRooms.filter((r) => !r.isLive).length > 0 && (
              <div className="mt-8">
                <h2 className="text-sm font-bold text-[#888] mb-3 flex items-center gap-1.5">
                  <WifiOff size={14} className="text-[#555]" />
                  未开播
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                  {filteredRooms
                    .filter((r) => !r.isLive)
                    .map((room) => (
                      <LiveRoomCard
                        key={room.id}
                        room={room}
                        isFollowed={followedIds.has(room.id)}
                        onWatch={() => startWatching(room)}
                        onToggleFollow={() => toggleFollow(room.id)}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {filteredRooms.length === 0 && (
              <div className="text-center text-[#8a8a8a] py-20">
                <Radio size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-sm">暂无匹配的直播</p>
                <p className="text-xs mt-1 text-[#555]">
                  尝试调整分类或平台筛选
                </p>
              </div>
            )}
          </>
        )}

        {/* ===== Following Tab ===== */}
        {activeTab === 'following' && (
          <div>
            {followedRooms.length > 0 ? (
              <div className="space-y-3">
                {/* Live followed streamers first */}
                {followedRooms.filter((r) => r.isLive).length > 0 && (
                  <div className="mb-4">
                    <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-1.5">
                      <CircleDot size={14} className="text-red-400 animate-pulse" />
                      正在直播
                    </h2>
                    <div className="space-y-3">
                      {followedRooms
                        .filter((r) => r.isLive)
                        .sort((a, b) => b.viewers - a.viewers)
                        .map((room) => (
                          <FollowedStreamerRow
                            key={room.id}
                            room={room}
                            onWatch={() => startWatching(room)}
                            onUnfollow={() => toggleFollow(room.id)}
                          />
                        ))}
                    </div>
                  </div>
                )}

                {/* Offline followed streamers */}
                {followedRooms.filter((r) => !r.isLive).length > 0 && (
                  <div>
                    <h2 className="text-sm font-bold text-[#888] mb-3 flex items-center gap-1.5">
                      <WifiOff size={14} className="text-[#555]" />
                      未开播
                    </h2>
                    <div className="space-y-3">
                      {followedRooms
                        .filter((r) => !r.isLive)
                        .map((room) => (
                          <FollowedStreamerRow
                            key={room.id}
                            room={room}
                            onWatch={() => startWatching(room)}
                            onUnfollow={() => toggleFollow(room.id)}
                          />
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-[#8a8a8a] py-20">
                <Heart size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-sm">关注列表为空</p>
                <p className="text-xs mt-1 text-[#555]">
                  浏览直播并点击关注按钮添加主播
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

// ===========================================================================
// Live Room Card Component
// ===========================================================================

function LiveRoomCard({
  room,
  isFollowed,
  onWatch,
  onToggleFollow,
}: {
  room: LiveRoom;
  isFollowed: boolean;
  onWatch: () => void;
  onToggleFollow: () => void;
}) {
  return (
    <div className="group cursor-pointer transition hover:-translate-y-1">
      <div
        className="relative aspect-video bg-[#1a1a1a] rounded-xl overflow-hidden"
        onClick={onWatch}
      >
        <img
          src={room.cover}
          alt={room.title}
          loading="lazy"
          className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
            !room.isLive ? 'opacity-50 grayscale' : ''
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full bg-[#3ea6ff]/20 backdrop-blur flex items-center justify-center">
            <Play size={20} className="text-white ml-0.5" />
          </div>
        </div>

        {/* Top-left: LIVE badge + viewer count */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          {room.isLive ? (
            <span className="px-1.5 py-0.5 rounded bg-red-500 text-white text-[9px] font-bold flex items-center gap-1">
              <CircleDot size={7} className="animate-pulse" />
              LIVE
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-[#555] text-white text-[9px] font-bold flex items-center gap-1">
              <WifiOff size={7} />
              未开播
            </span>
          )}
        </div>

        {/* Top-right: MPAA rating */}
        <span className="absolute top-2 right-2">
          <RatingBadge rating={room.rating} />
        </span>

        {/* Bottom-left: Streamer avatar */}
        <div className="absolute bottom-2 left-2">
          <img
            src={room.streamerAvatar}
            alt={room.streamerName}
            className={`w-8 h-8 rounded-full object-cover border-2 ${
              room.isLive ? 'border-red-500' : 'border-[#555]'
            }`}
          />
        </div>

        {/* Bottom-right: Viewer count */}
        {room.isLive && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] flex items-center gap-1">
            <Eye size={10} />
            {fmtNum(room.viewers)}
          </span>
        )}
      </div>

      {/* Card info */}
      <div className="pt-2">
        <div className="flex items-start justify-between gap-1">
          <h3
            className="text-sm font-medium text-white line-clamp-1 group-hover:text-[#3ea6ff] transition flex-1"
            onClick={onWatch}
          >
            {room.title}
          </h3>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFollow();
            }}
            className={`p-0.5 transition shrink-0 ${
              isFollowed ? 'text-red-400' : 'text-[#555] hover:text-red-400'
            }`}
            aria-label={isFollowed ? 'Unfollow' : 'Follow'}
          >
            <Heart size={12} className={isFollowed ? 'fill-current' : ''} />
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[11px] text-[#aaa]">{room.streamerName}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${getPlatformColor(room.platform)}`}>
            {room.platform}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {room.tags.slice(0, 2).map((t) => (
            <span
              key={t}
              className="text-[9px] px-1.5 py-0.5 rounded bg-[#2a2a2a] text-[#888]"
            >
              {t}
            </span>
          ))}
          {room.isLive && (
            <span className="text-[10px] text-[#555] flex items-center gap-0.5 ml-auto">
              <Eye size={9} />
              {fmtNum(room.viewers)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Followed Streamer Row Component
// ===========================================================================

function FollowedStreamerRow({
  room,
  onWatch,
  onUnfollow,
}: {
  room: LiveRoom;
  onWatch: () => void;
  onUnfollow: () => void;
}) {
  return (
    <div
      className={`flex gap-3 p-3 rounded-xl border transition group ${
        room.isLive
          ? 'bg-[#1a1a1a] border-red-500/20 hover:border-[#3ea6ff]/30'
          : 'bg-[#141414] border-[#333]/30 opacity-60'
      }`}
    >
      <div
        className="w-28 aspect-video rounded-lg overflow-hidden bg-[#212121] shrink-0 cursor-pointer relative"
        onClick={onWatch}
      >
        <img
          src={room.cover}
          alt={room.title}
          className={`w-full h-full object-cover ${!room.isLive ? 'grayscale opacity-50' : ''}`}
          loading="lazy"
        />
        {room.isLive && (
          <span className="absolute top-1 left-1 px-1 py-0.5 rounded bg-red-500 text-white text-[8px] font-bold flex items-center gap-0.5">
            <CircleDot size={6} className="animate-pulse" />
            LIVE
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3
              className="text-sm font-medium text-white truncate cursor-pointer group-hover:text-[#3ea6ff] transition"
              onClick={onWatch}
            >
              {room.title}
            </h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <RatingBadge rating={room.rating} />
              <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${getPlatformColor(room.platform)}`}>
                {room.platform}
              </span>
              {room.isLive && (
                <span className="text-[11px] text-[#aaa] flex items-center gap-1">
                  <Eye size={10} />
                  {fmtNum(room.viewers)}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onUnfollow}
            className="p-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition shrink-0"
            aria-label="Unfollow"
          >
            <HeartOff size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <img
            src={room.streamerAvatar}
            alt={room.streamerName}
            className={`w-5 h-5 rounded-full object-cover border ${
              room.isLive ? 'border-red-500' : 'border-[#555]'
            }`}
          />
          <span className="text-[11px] text-[#aaa]">{room.streamerName}</span>
          <span className="text-[10px] text-[#555]">{room.category}</span>
        </div>
        {room.isLive && (
          <button
            onClick={onWatch}
            className="mt-2 flex items-center gap-1 px-3 py-1 rounded-lg bg-[#3ea6ff]/15 text-[#3ea6ff] text-[11px] font-medium hover:bg-[#3ea6ff]/25 transition"
          >
            <Play size={10} />
            进入直播间
          </button>
        )}
      </div>
    </div>
  );
}
