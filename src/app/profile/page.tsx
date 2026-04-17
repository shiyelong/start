'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { useAuth, fetchWithAuth, getUser } from '@/lib/auth';
import type { User } from '@/lib/auth';
import {
  User as UserIcon,
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
  Loader2,
  RefreshCw,
  Shield,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProfileTab = 'history' | 'favorites' | 'bookmarks' | 'playlists';

interface ContentItem {
  id: string | number;
  title: string;
  cover?: string | null;
  source: string;
  date: string;
  type: string;
  content_type?: string;
  content_id?: string;
  progress?: number;
  duration?: number;
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
// API fetchers
// ---------------------------------------------------------------------------

async function fetchTabData(tab: ProfileTab): Promise<ContentItem[]> {
  try {
    let url = '';
    switch (tab) {
      case 'history':
        url = '/api/video/history?pageSize=50';
        break;
      case 'favorites':
        url = '/api/video/favorite?pageSize=50';
        break;
      case 'bookmarks':
        url = '/api/comic/bookmark';
        break;
      case 'playlists':
        url = '/api/music/playlist';
        break;
    }

    const res = await fetchWithAuth(url);
    if (!res.ok) return [];

    const data = await res.json() as Record<string, unknown>;

    // Normalize different response shapes
    if (tab === 'history') {
      const items = (data.items || data.data || []) as Record<string, unknown>[];
      return items.map((item) => ({
        id: String(item.id || item.content_id || ''),
        title: String(item.title || ''),
        cover: item.cover as string | null,
        source: String(item.source || ''),
        date: String(item.watched_at || item.created_at || ''),
        type: String(item.content_type || 'video'),
        content_type: String(item.content_type || ''),
        content_id: String(item.content_id || ''),
        progress: Number(item.progress || 0),
        duration: Number(item.duration || 0),
      }));
    }

    if (tab === 'favorites') {
      const items = (data.items || data.data || []) as Record<string, unknown>[];
      return items.map((item) => ({
        id: String(item.id || item.content_id || ''),
        title: String(item.title || ''),
        cover: item.cover as string | null,
        source: String(item.source || ''),
        date: String(item.created_at || ''),
        type: String(item.content_type || 'video'),
      }));
    }

    if (tab === 'bookmarks') {
      const items = (data.bookmarks || data.items || []) as Record<string, unknown>[];
      return items.map((item) => ({
        id: String(item.id || item.mangaId || item.novelId || ''),
        title: String(item.mangaId || item.novelId || item.content_id || ''),
        cover: null,
        source: '本地',
        date: String(item.updated_at || ''),
        type: 'comic',
      }));
    }

    if (tab === 'playlists') {
      const items = (data.playlists || data.items || []) as Record<string, unknown>[];
      return items.map((item) => ({
        id: String(item.id || ''),
        title: String(item.name || ''),
        cover: null,
        source: String(item.type || 'music'),
        date: String(item.updated_at || item.created_at || ''),
        type: String(item.type || 'music'),
      }));
    }

    return [];
  } catch {
    return [];
  }
}

async function fetchStats(): Promise<Record<string, number>> {
  try {
    const res = await fetchWithAuth('/api/users/me/sync');
    if (!res.ok) return { history: 0, favorites: 0, bookmarks: 0, playlists: 0 };
    const data = await res.json() as Record<string, unknown[]>;
    return {
      history: Array.isArray(data.history) ? data.history.length : 0,
      favorites: Array.isArray(data.favorites) ? data.favorites.length : 0,
      bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks.length : 0,
      playlists: Array.isArray(data.playlists) ? data.playlists.length : 0,
    };
  } catch {
    return { history: 0, favorites: 0, bookmarks: 0, playlists: 0 };
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UserInfoCard({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  return (
    <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#2a2a2a] border-2 border-[#3ea6ff]/30 flex items-center justify-center flex-shrink-0">
          {user?.avatar ? (
            <img src={user.avatar} alt={user.username} className="w-full h-full rounded-full object-cover" />
          ) : (
            <UserIcon className="w-8 h-8 sm:w-10 sm:h-10 text-[#3ea6ff]/60" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-white truncate">
            {user?.nickname || user?.username || '未登录'}
          </h2>
          {user?.email && (
            <div className="flex items-center gap-1.5 mt-1 text-sm text-white/40">
              <Mail className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{user.email}</span>
            </div>
          )}
          {user?.created_at && (
            <div className="flex items-center gap-1.5 mt-1 text-sm text-white/30">
              <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
              <span>加入于 {user.created_at.split('T')[0]}</span>
            </div>
          )}
          {user?.role && user.role !== 'user' && (
            <div className="flex items-center gap-1.5 mt-1 text-sm text-[#3ea6ff]/60">
              <Shield className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{user.role === 'admin' ? '管理员' : user.role}</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3ea6ff] text-black text-xs font-semibold hover:bg-[#3ea6ff]/90 transition">
          <Edit className="w-3.5 h-3.5" />
          编辑资料
        </button>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/5 text-red-400 text-xs font-medium border border-red-500/20 hover:bg-red-500/10 transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          退出登录
        </button>
      </div>
    </div>
  );
}

function StatsRow({ stats }: { stats: Record<string, number> }) {
  const items = [
    { label: '播放历史', value: stats.history || 0, icon: History },
    { label: '收藏', value: stats.favorites || 0, icon: Heart },
    { label: '书签', value: stats.bookmarks || 0, icon: Bookmark },
    { label: '播放列表', value: stats.playlists || 0, icon: ListMusic },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      {items.map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.label} className="bg-[#1a1a1a] rounded-xl border border-white/5 p-3 sm:p-4 text-center">
            <Icon className="w-5 h-5 text-[#3ea6ff] mx-auto mb-1.5" />
            <p className="text-xl sm:text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-[11px] sm:text-xs text-white/40 mt-0.5">{stat.label}</p>
          </div>
        );
      })}
    </div>
  );
}

function ContentItemRow({ item }: { item: ContentItem }) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/5 transition cursor-pointer group">
      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 relative bg-[#2a2a2a]">
        {item.cover ? (
          <img src={item.cover} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="w-4 h-4 text-white/20" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/40">
          <Play className="w-4 h-4 text-white" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate group-hover:text-[#3ea6ff] transition">{item.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-white/30">{item.source}</span>
          <span className="text-[11px] text-white/20">|</span>
          <span className="text-[11px] text-white/30">{item.type}</span>
        </div>
      </div>
      {item.date && (
        <div className="flex items-center gap-1 text-[11px] text-white/20 flex-shrink-0">
          <Clock className="w-3 h-3" />
          {item.date.split('T')[0]}
        </div>
      )}
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
  const { user, isLoggedIn, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>('history');
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Record<string, number>>({ history: 0, favorites: 0, bookmarks: 0, playlists: 0 });

  // Fetch stats on mount
  useEffect(() => {
    if (isLoggedIn) {
      fetchStats().then(setStats);
    }
  }, [isLoggedIn]);

  // Fetch tab data when tab changes
  useEffect(() => {
    if (!isLoggedIn) {
      setItems([]);
      return;
    }
    setLoading(true);
    fetchTabData(activeTab)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [activeTab, isLoggedIn]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    fetchTabData(activeTab)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [activeTab]);

  const currentTabConfig = TABS.find((t) => t.id === activeTab)!;

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0f0f0f] text-white">
        <div className="max-w-[900px] mx-auto px-4 py-6 pb-24 md:pb-8 space-y-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-[#3ea6ff]" />
            个人中心
          </h1>

          <UserInfoCard user={user} onLogout={logout} />
          <StatsRow stats={stats} />

          {/* Tab navigation */}
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 overflow-hidden">
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
                    {stats[tab.id] > 0 && (
                      <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">{stats[tab.id]}</span>
                    )}
                  </button>
                );
              })}
              <div className="flex-1" />
              <button
                onClick={handleRefresh}
                className="px-3 py-3 text-white/30 hover:text-white/60 transition"
                aria-label="刷新"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="p-3 sm:p-4">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-[#3ea6ff] animate-spin" />
                </div>
              ) : items.length > 0 ? (
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <ContentItemRow key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <EmptyState text={isLoggedIn ? currentTabConfig.emptyText : '请先登录查看'} />
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
