'use client';

import { useState, useMemo } from 'react';
import Header from '@/components/layout/Header';
import {
  User,
  Mail,
  CalendarDays,
  History,
  Heart,
  Bookmark,
  ListMusic,
  Play,
  Edit,
  LogOut,
  Clock,
  ChevronRight,
  Inbox,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProfileTab = 'history' | 'favorites' | 'bookmarks' | 'playlists';

interface MockItem {
  id: string;
  title: string;
  cover: string;
  source: string;
  date: string;
  type: string;
}

// ---------------------------------------------------------------------------
// Mock user data
// ---------------------------------------------------------------------------

const MOCK_USER = {
  username: '星聚用户',
  email: 'user@starhub.app',
  joinDate: '2025-01-15',
  avatar: null as string | null,
};

const MOCK_STATS = {
  history: 128,
  favorites: 45,
  bookmarks: 23,
  playlists: 6,
};

// ---------------------------------------------------------------------------
// Mock content items
// ---------------------------------------------------------------------------

const COVER_IMAGES = [
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&q=80',
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80',
  'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=300&q=80',
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&q=80',
  'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=300&q=80',
  'https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=300&q=80',
];

function generateMockItems(tab: ProfileTab): MockItem[] {
  const sources = ['网易云音乐', 'QQ音乐', 'B站', '爱奇艺', '优酷', '芒果TV'];
  const types: Record<ProfileTab, string[]> = {
    history: ['视频', '音乐', '动漫', '播客'],
    favorites: ['音乐', '视频', '漫画', '小说'],
    bookmarks: ['动漫', '小说', '播客', '直播'],
    playlists: ['音乐合集', '视频合集', '播客合集'],
  };
  const titles: Record<ProfileTab, string[]> = {
    history: [
      '周杰伦 - 晴天', '进击的巨人 最终季', '故事FM 第128期',
      '黑神话：悟空 实况', '邓紫棋 - 光年之外', '海贼王 1089集',
      '科技美学 新品评测', '深夜电台 助眠音乐',
    ],
    favorites: [
      '平凡之路 - 朴树', '你的名字 OST', '鬼灭之刃 无限列车',
      '三体 有声书', '成都 - 赵雷', '灌篮高手 全集',
    ],
    bookmarks: [
      '咒术回战 第二季', '斗破苍穹 最新章节', '日谈公园 播客',
      '原神 3.0 直播', '一人之下 漫画', '凡人修仙传 有声书',
    ],
    playlists: [
      '深夜放松', '运动节奏', '通勤必听',
      '经典老歌', '日语学习', '工作专注',
    ],
  };

  const itemTitles = titles[tab];
  return itemTitles.map((title, i) => ({
    id: `${tab}-${i}`,
    title,
    cover: COVER_IMAGES[i % COVER_IMAGES.length],
    source: sources[i % sources.length],
    date: `2025-04-${String(15 - i).padStart(2, '0')}`,
    type: types[tab][i % types[tab].length],
  }));
}

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

interface TabConfig {
  id: ProfileTab;
  label: string;
  icon: React.ElementType;
  emptyText: string;
}

const TABS: TabConfig[] = [
  { id: 'history', label: '播放历史', icon: History, emptyText: '暂无播放历史' },
  { id: 'favorites', label: '收藏', icon: Heart, emptyText: '暂无收藏内容' },
  { id: 'bookmarks', label: '书签', icon: Bookmark, emptyText: '暂无书签' },
  { id: 'playlists', label: '播放列表', icon: ListMusic, emptyText: '暂无播放列表' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UserInfoCard() {
  return (
    <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        {/* Avatar placeholder */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#2a2a2a] border-2 border-[#3ea6ff]/30 flex items-center justify-center flex-shrink-0">
          <User className="w-8 h-8 sm:w-10 sm:h-10 text-[#3ea6ff]/60" />
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-white truncate">
            {MOCK_USER.username}
          </h2>
          <div className="flex items-center gap-1.5 mt-1 text-sm text-white/40">
            <Mail className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{MOCK_USER.email}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-sm text-white/30">
            <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
            <span>加入于 {MOCK_USER.joinDate}</span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-4">
        <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3ea6ff] text-black text-xs font-semibold hover:bg-[#3ea6ff]/90 transition">
          <Edit className="w-3.5 h-3.5" />
          编辑资料
        </button>
        <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/5 text-red-400 text-xs font-medium border border-red-500/20 hover:bg-red-500/10 transition">
          <LogOut className="w-3.5 h-3.5" />
          退出登录
        </button>
      </div>
    </div>
  );
}

function StatsRow() {
  const stats = [
    { label: '播放历史', value: MOCK_STATS.history, icon: History },
    { label: '收藏', value: MOCK_STATS.favorites, icon: Heart },
    { label: '书签', value: MOCK_STATS.bookmarks, icon: Bookmark },
    { label: '播放列表', value: MOCK_STATS.playlists, icon: ListMusic },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="bg-[#1a1a1a] rounded-xl border border-white/5 p-3 sm:p-4 text-center"
          >
            <Icon className="w-5 h-5 text-[#3ea6ff] mx-auto mb-1.5" />
            <p className="text-xl sm:text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-[11px] sm:text-xs text-white/40 mt-0.5">{stat.label}</p>
          </div>
        );
      })}
    </div>
  );
}

function ContentItem({ item }: { item: MockItem }) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/5 transition cursor-pointer group">
      {/* Cover */}
      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 relative bg-[#2a2a2a]">
        <img
          src={item.cover}
          alt={item.title}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/40">
          <Play className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate group-hover:text-[#3ea6ff] transition">
          {item.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-white/30">{item.source}</span>
          <span className="text-[11px] text-white/20">|</span>
          <span className="text-[11px] text-white/30">{item.type}</span>
        </div>
      </div>

      {/* Date */}
      <div className="flex items-center gap-1 text-[11px] text-white/20 flex-shrink-0">
        <Clock className="w-3 h-3" />
        {item.date}
      </div>

      <ChevronRight className="w-4 h-4 text-white/10 group-hover:text-white/30 transition flex-shrink-0" />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-[#1a1a1a] flex items-center justify-center mb-4">
        <Inbox className="w-8 h-8 text-white/15" />
      </div>
      <p className="text-sm text-white/30">{text}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<ProfileTab>('history');
  const [showEmpty, setShowEmpty] = useState(false);

  const items = useMemo(() => {
    if (showEmpty) return [];
    return generateMockItems(activeTab);
  }, [activeTab, showEmpty]);

  const currentTabConfig = TABS.find((t) => t.id === activeTab)!;

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0f0f0f] text-white">
        <div className="max-w-[900px] mx-auto px-4 py-6 pb-24 md:pb-8 space-y-4">
          {/* Page title */}
          <h1 className="text-xl font-bold flex items-center gap-2">
            <User className="w-5 h-5 text-[#3ea6ff]" />
            个人中心
          </h1>

          {/* User info card */}
          <UserInfoCard />

          {/* Stats row */}
          <StatsRow />

          {/* Tab navigation */}
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-white/5 overflow-x-auto">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap transition border-b-2 ${
                      isActive
                        ? 'text-[#3ea6ff] border-[#3ea6ff]'
                        : 'text-white/40 border-transparent hover:text-white/60'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="p-3 sm:p-4">
              {items.length > 0 ? (
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <ContentItem key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <EmptyState text={currentTabConfig.emptyText} />
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
