'use client';

import { useState, useEffect } from 'react';
import {
  Settings,
  Users,
  Film,
  Shield,
  Activity,
  Database,
  HardDrive,
  Search,
  Ban,
  Unlock,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogIn,
  Lock,
  BarChart3,
  Server,
  FileText,
  AlertTriangle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardStats {
  totalUsers: number;
  dailyActiveUsers: number;
  totalContent: number;
  todaySearches: number;
  cacheStatus: string;
  sourceHealthy: number;
  sourceTotal: number;
}

interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: string;
  ageMode: string;
  banned: boolean;
  createdAt: string;
}

interface ContentItem {
  id: string;
  type: string;
  title: string;
  rating: string;
  reports: number;
  createdAt: string;
}

interface SourceHealth {
  name: string;
  type: string;
  health: 'online' | 'offline' | 'degraded';
  successRate: number;
  avgResponseTime: number;
}

type AdminTab = 'dashboard' | 'users' | 'content' | 'sources';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_STATS: DashboardStats = {
  totalUsers: 12580,
  dailyActiveUsers: 3420,
  totalContent: 458000,
  todaySearches: 28900,
  cacheStatus: 'healthy',
  sourceHealthy: 42,
  sourceTotal: 48,
};

const MOCK_USERS: AdminUser[] = [
  { id: 1, username: 'user_alpha', email: 'alpha@example.com', role: 'user', ageMode: 'adult', banned: false, createdAt: '2024-01-15' },
  { id: 2, username: 'user_beta', email: 'beta@example.com', role: 'user', ageMode: 'teen', banned: false, createdAt: '2024-02-20' },
  { id: 3, username: 'user_gamma', email: 'gamma@example.com', role: 'user', ageMode: 'mature', banned: true, createdAt: '2024-03-10' },
];

const MOCK_CONTENT: ContentItem[] = [
  { id: 'c1', type: 'post', title: '测试帖子标题', rating: 'PG', reports: 0, createdAt: '2024-06-01' },
  { id: 'c2', type: 'comment', title: '一条被举报的评论...', rating: 'R', reports: 3, createdAt: '2024-06-02' },
];

const MOCK_SOURCES: SourceHealth[] = [
  { name: 'Bilibili', type: 'video', health: 'online', successRate: 98.5, avgResponseTime: 320 },
  { name: 'YouTube Proxy', type: 'video', health: 'online', successRate: 95.2, avgResponseTime: 580 },
  { name: 'MangaDex', type: 'comic', health: 'degraded', successRate: 78.0, avgResponseTime: 1200 },
  { name: 'GoGoAnime', type: 'anime', health: 'offline', successRate: 0, avgResponseTime: 0 },
];

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({ icon: Icon, label, value, sub }: {
  icon: typeof Users;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-[#1a1a1a] border border-white/5 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-[#3ea6ff]/10 flex items-center justify-center">
          <Icon className="w-4.5 h-4.5 text-[#3ea6ff]" />
        </div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-xl font-bold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="text-[10px] text-gray-600 mt-1">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Health Badge
// ---------------------------------------------------------------------------

function HealthBadge({ health }: { health: string }) {
  const colors: Record<string, string> = {
    online: 'bg-green-500/15 text-green-400',
    degraded: 'bg-yellow-500/15 text-yellow-400',
    offline: 'bg-red-500/15 text-red-400',
    healthy: 'bg-green-500/15 text-green-400',
  };
  const labels: Record<string, string> = {
    online: '在线',
    degraded: '降级',
    offline: '离线',
    healthy: '正常',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${colors[health] || 'bg-gray-500/15 text-gray-400'}`}>
      {labels[health] || health}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Admin Login Form
// ---------------------------------------------------------------------------

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }
    // TODO: POST /api/admin/auth/login
    onLogin();
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#1a1a1a] border border-white/5 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="w-6 h-6 text-[#3ea6ff]" />
          <h1 className="text-lg font-bold text-white">管理后台</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">管理员账号</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#3ea6ff]/50"
              placeholder="输入管理员账号"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#3ea6ff]/50"
              placeholder="输入密码"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full py-2.5 bg-[#3ea6ff] text-white text-sm font-medium rounded-lg hover:bg-[#3ea6ff]/80 transition-colors flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            登录
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin Dashboard
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [stats] = useState<DashboardStats>(MOCK_STATS);
  const [users] = useState<AdminUser[]>(MOCK_USERS);
  const [content] = useState<ContentItem[]>(MOCK_CONTENT);
  const [sources] = useState<SourceHealth[]>(MOCK_SOURCES);
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);

  if (!authenticated) {
    return <AdminLogin onLogin={() => setAuthenticated(true)} />;
  }

  const tabs: { id: AdminTab; label: string; icon: typeof Users }[] = [
    { id: 'dashboard', label: '仪表盘', icon: BarChart3 },
    { id: 'users', label: '用户管理', icon: Users },
    { id: 'content', label: '内容管理', icon: FileText },
    { id: 'sources', label: '源健康', icon: Server },
  ];

  const filteredUsers = users.filter(
    (u) =>
      !userSearch ||
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#0f0f0f]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#3ea6ff]" />
            <span className="font-bold text-[#3ea6ff]">管理后台</span>
          </div>
          <div className="flex items-center gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[#3ea6ff]/15 text-[#3ea6ff]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 py-6">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div>
            <h2 className="text-lg font-semibold mb-4">平台概览</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard icon={Users} label="注册用户" value={stats.totalUsers} />
              <StatCard icon={Activity} label="日活用户" value={stats.dailyActiveUsers} />
              <StatCard icon={Film} label="内容总量" value={stats.totalContent} />
              <StatCard icon={Search} label="今日搜索" value={stats.todaySearches} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-[#1a1a1a] border border-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <HardDrive className="w-4 h-4 text-[#3ea6ff]" />
                  <span className="text-sm font-medium">NAS 缓存</span>
                </div>
                <div className="flex items-center gap-2">
                  <HealthBadge health={stats.cacheStatus} />
                  <span className="text-xs text-gray-500">缓存系统运行正常</span>
                </div>
              </div>

              <div className="bg-[#1a1a1a] border border-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Database className="w-4 h-4 text-[#3ea6ff]" />
                  <span className="text-sm font-medium">聚合源状态</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white font-medium">
                    {stats.sourceHealthy}/{stats.sourceTotal}
                  </span>
                  <span className="text-xs text-gray-500">源在线</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">用户管理</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="搜索用户..."
                  className="pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#3ea6ff]/50 w-48"
                />
              </div>
            </div>

            <div className="bg-[#1a1a1a] border border-white/5 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">ID</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">用户名</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium hidden sm:table-cell">邮箱</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">模式</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">状态</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-gray-400">{u.id}</td>
                        <td className="px-4 py-3 text-white">{u.username}</td>
                        <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">{u.email}</td>
                        <td className="px-4 py-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-gray-400">
                            {u.ageMode}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {u.banned ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/15 text-red-400">已封禁</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/15 text-green-400">正常</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-[#3ea6ff] transition-colors" title="查看">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {u.banned ? (
                              <button className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-green-400 transition-colors" title="解封">
                                <Unlock className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-red-400 transition-colors" title="封禁">
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                <span className="text-[10px] text-gray-600">{filteredUsers.length} 条记录</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setUserPage(Math.max(1, userPage - 1))}
                    className="p-1 rounded hover:bg-white/5 text-gray-500"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] text-gray-400 px-2">第 {userPage} 页</span>
                  <button
                    onClick={() => setUserPage(userPage + 1)}
                    className="p-1 rounded hover:bg-white/5 text-gray-500"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content Tab */}
        {activeTab === 'content' && (
          <div>
            <h2 className="text-lg font-semibold mb-4">内容管理</h2>
            <div className="bg-[#1a1a1a] border border-white/5 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">类型</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">标题</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">分级</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">举报</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {content.map((item) => (
                      <tr key={item.id} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-gray-400">
                            {item.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white max-w-[200px] truncate">{item.title}</td>
                        <td className="px-4 py-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#3ea6ff]/10 text-[#3ea6ff]">
                            {item.rating}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {item.reports > 0 ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/15 text-red-400">
                              {item.reports}
                            </span>
                          ) : (
                            <span className="text-gray-600">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-[#3ea6ff] transition-colors" title="查看">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-red-400 transition-colors" title="删除">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Sources Tab */}
        {activeTab === 'sources' && (
          <div>
            <h2 className="text-lg font-semibold mb-4">聚合源健康</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sources.map((source) => (
                <div
                  key={source.name}
                  className="bg-[#1a1a1a] border border-white/5 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">{source.name}</span>
                    <HealthBadge health={source.health} />
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-500">
                    <span className="px-1.5 py-0.5 rounded bg-white/5">{source.type}</span>
                    <span>成功率 {source.successRate}%</span>
                    {source.avgResponseTime > 0 && (
                      <span>延迟 {source.avgResponseTime}ms</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
