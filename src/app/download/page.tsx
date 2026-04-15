'use client';

import { useState, useCallback } from 'react';
import Header from '@/components/layout/Header';
import {
  Download,
  Pause,
  Play,
  Trash2,
  HardDrive,
  Film,
  Music,
  BookOpen,
  FileText,
  CheckCircle2,
  XCircle,
  Search,
  FolderOpen,
  Settings2,
  Wifi,
  WifiOff,
  RefreshCw,
  ChevronDown,
  Eye,
  Smartphone,
  Monitor,
  Tv,
  Apple,
  Headphones,
  WifiIcon,
  Bell,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// App Download Section — Platform data
// ---------------------------------------------------------------------------

interface PlatformApp {
  id: string;
  name: string;
  icon: typeof Smartphone;
  version: string;
  size: string;
  description: string;
  gradient: string;
}

const PLATFORM_APPS: PlatformApp[] = [
  {
    id: 'android',
    name: 'Android',
    icon: Smartphone,
    version: 'v1.0.1',
    size: '~25MB',
    description: '支持 Android 8.0+',
    gradient: 'from-green-500/20 to-green-600/5',
  },
  {
    id: 'ios',
    name: 'iOS',
    icon: Smartphone,
    version: 'v1.0.1',
    size: '~45MB',
    description: '支持 iOS 15.0+',
    gradient: 'from-blue-500/20 to-blue-600/5',
  },
  {
    id: 'windows',
    name: 'Windows',
    icon: Monitor,
    version: 'v1.0.1',
    size: '~70MB',
    description: '支持 Windows 10+',
    gradient: 'from-cyan-500/20 to-cyan-600/5',
  },
  {
    id: 'macos',
    name: 'macOS',
    icon: Apple,
    version: 'v1.0.1',
    size: '~75MB',
    description: '支持 macOS 12+',
    gradient: 'from-purple-500/20 to-purple-600/5',
  },
  {
    id: 'androidtv',
    name: 'Android TV',
    icon: Tv,
    version: 'v1.0.1',
    size: '~28MB',
    description: '支持 Android TV 10+',
    gradient: 'from-orange-500/20 to-orange-600/5',
  },
];

const FEATURES = [
  {
    icon: Headphones,
    title: '后台播放',
    desc: '音乐/播客后台持续播放',
  },
  {
    icon: Download,
    title: '离线缓存',
    desc: '下载内容离线使用',
  },
  {
    icon: Bell,
    title: '推送通知',
    desc: '追番更新/直播开播提醒',
  },
  {
    icon: Zap,
    title: '原生体验',
    desc: '流畅手势/快捷键/系统集成',
  },
];

function AppDownloadSection() {
  const handleDownload = (platform: PlatformApp) => {
    if (platform.id === 'ios') {
      alert('即将跳转到 App Store（暂未上架）');
    } else {
      alert(`${platform.name} 客户端下载即将开始（v${platform.version}）`);
    }
  };

  return (
    <section className="relative overflow-hidden">
      {/* Hero gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#3ea6ff]/8 via-[#0f0f0f] to-[#0f0f0f] pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#3ea6ff]/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-4 pt-8 pb-10">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            应用下载
          </h1>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            下载星聚客户端，享受更流畅的原生体验
          </p>
        </div>

        {/* Platform cards grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-10">
          {PLATFORM_APPS.map((platform) => {
            const Icon = platform.icon;
            return (
              <div
                key={platform.id}
                className="bg-[#1a1a1a] border border-white/5 rounded-xl p-4 flex flex-col items-center text-center hover:border-[#3ea6ff]/30 transition-all group"
              >
                {/* Icon area with gradient */}
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${platform.gradient} border border-white/5 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-0.5">{platform.name}</h3>
                <p className="text-[11px] text-gray-500 mb-1">{platform.version} · {platform.size}</p>
                <p className="text-[10px] text-gray-600 mb-3">{platform.description}</p>
                <button
                  onClick={() => handleDownload(platform)}
                  className="w-full py-2 rounded-lg bg-[#3ea6ff] hover:bg-[#5ab8ff] text-white text-xs font-medium transition-colors"
                >
                  {platform.id === 'ios' ? 'App Store' : '下载'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Why choose section */}
        <div className="text-center mb-6">
          <h2 className="text-lg font-bold text-white mb-1">为什么选择星聚客户端？</h2>
          <p className="text-xs text-gray-500">相比网页版，客户端提供更多专属功能</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="bg-[#1a1a1a] border border-white/5 rounded-xl p-4 text-center"
              >
                <div className="w-10 h-10 rounded-xl bg-[#3ea6ff]/10 flex items-center justify-center mx-auto mb-2">
                  <Icon className="w-5 h-5 text-[#3ea6ff]" />
                </div>
                <h3 className="text-sm font-medium text-white mb-0.5">{f.title}</h3>
                <p className="text-[11px] text-gray-500">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}


// ---------------------------------------------------------------------------
// Download Manager Types & Data (existing functionality)
// ---------------------------------------------------------------------------

type DownloadStatus = 'downloading' | 'paused' | 'completed' | 'failed' | 'queued';
type ContentType = 'video' | 'music' | 'comic' | 'novel';
type VideoQuality = '360p' | '720p' | '1080p';
type AudioQuality = 'standard' | 'high' | 'lossless';

interface DownloadItem {
  id: string;
  title: string;
  type: ContentType;
  status: DownloadStatus;
  progress: number;
  totalSize: number;
  downloadedSize: number;
  speed: number;
  quality: string;
  createdAt: string;
  source: string;
}

const VIDEO_QUALITIES: { value: VideoQuality; label: string }[] = [
  { value: '360p', label: '360p - 流畅' },
  { value: '720p', label: '720p - 高清' },
  { value: '1080p', label: '1080p - 超清' },
];

const AUDIO_QUALITIES: { value: AudioQuality; label: string }[] = [
  { value: 'standard', label: '标准 128kbps' },
  { value: 'high', label: '高品质 320kbps' },
  { value: 'lossless', label: '无损 FLAC' },
];

const MOCK_DOWNLOADS: DownloadItem[] = [
  {
    id: '1',
    title: '进击的巨人 最终季 EP01',
    type: 'video',
    status: 'downloading',
    progress: 67,
    totalSize: 524288000,
    downloadedSize: 351272960,
    speed: 2500000,
    quality: '1080p',
    source: '樱花动漫',
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    title: '周杰伦 - 晴天',
    type: 'music',
    status: 'completed',
    progress: 100,
    totalSize: 8388608,
    downloadedSize: 8388608,
    speed: 0,
    quality: '无损',
    source: '网易云音乐',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '3',
    title: '海贼王 第1089话',
    type: 'comic',
    status: 'paused',
    progress: 34,
    totalSize: 52428800,
    downloadedSize: 17825792,
    speed: 0,
    quality: '高清',
    source: '漫画柜',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: '4',
    title: '斗破苍穹 第1600章',
    type: 'novel',
    status: 'queued',
    progress: 0,
    totalSize: 102400,
    downloadedSize: 0,
    speed: 0,
    quality: '文本',
    source: '笔趣阁',
    createdAt: new Date(Date.now() - 10800000).toISOString(),
  },
  {
    id: '5',
    title: '鬼灭之刃 无限列车篇',
    type: 'video',
    status: 'completed',
    progress: 100,
    totalSize: 1073741824,
    downloadedSize: 1073741824,
    speed: 0,
    quality: '1080p',
    source: 'AGE动漫',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: '6',
    title: 'Bohemian Rhapsody - Queen',
    type: 'music',
    status: 'failed',
    progress: 12,
    totalSize: 12582912,
    downloadedSize: 1509949,
    speed: 0,
    quality: '高品质',
    source: 'Spotify',
    createdAt: new Date(Date.now() - 43200000).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '--';
  return `${formatBytes(bytesPerSec)}/s`;
}

function estimateTimeLeft(item: DownloadItem): string {
  if (item.speed <= 0 || item.status !== 'downloading') return '--';
  const remaining = item.totalSize - item.downloadedSize;
  const seconds = Math.ceil(remaining / item.speed);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}m`;
}

const TYPE_ICONS: Record<ContentType, typeof Film> = {
  video: Film,
  music: Music,
  comic: BookOpen,
  novel: FileText,
};

const TYPE_LABELS: Record<ContentType, string> = {
  video: '视频',
  music: '音乐',
  comic: '漫画',
  novel: '小说',
};

const STATUS_LABELS: Record<DownloadStatus, string> = {
  downloading: '下载中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
  queued: '排队中',
};

const STATUS_COLORS: Record<DownloadStatus, string> = {
  downloading: 'text-[#3ea6ff]',
  paused: 'text-yellow-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
  queued: 'text-gray-500',
};


// ---------------------------------------------------------------------------
// Quality selector component
// ---------------------------------------------------------------------------

function QualitySelector({
  type,
  videoQuality,
  audioQuality,
  onVideoChange,
  onAudioChange,
}: {
  type: 'video' | 'music';
  videoQuality: VideoQuality;
  audioQuality: AudioQuality;
  onVideoChange: (q: VideoQuality) => void;
  onAudioChange: (q: AudioQuality) => void;
}) {
  const qualities = type === 'video' ? VIDEO_QUALITIES : AUDIO_QUALITIES;
  const current = type === 'video' ? videoQuality : audioQuality;

  return (
    <div className="relative inline-block">
      <select
        value={current}
        onChange={(e) => {
          if (type === 'video') onVideoChange(e.target.value as VideoQuality);
          else onAudioChange(e.target.value as AudioQuality);
        }}
        className="appearance-none bg-[#1a1a1a] border border-white/10 rounded-lg text-xs text-gray-300 pl-3 pr-7 py-1.5 outline-none focus:border-[#3ea6ff] transition-colors cursor-pointer"
      >
        {qualities.map((q) => (
          <option key={q.value} value={q.value}>
            {q.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Storage breakdown component
// ---------------------------------------------------------------------------

function StorageBreakdown({ downloads }: { downloads: DownloadItem[] }) {
  const completed = downloads.filter((d) => d.status === 'completed');
  const byType: Record<ContentType, number> = { video: 0, music: 0, comic: 0, novel: 0 };

  for (const d of completed) {
    byType[d.type] += d.totalSize;
  }

  const total = Object.values(byType).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const typeColors: Record<ContentType, string> = {
    video: 'bg-[#3ea6ff]',
    music: 'bg-purple-500',
    comic: 'bg-green-500',
    novel: 'bg-amber-500',
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
        {(Object.keys(byType) as ContentType[]).map((type) => {
          const pct = (byType[type] / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={type}
              className={`${typeColors[type]} transition-all`}
              style={{ width: `${pct}%` }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        {(Object.keys(byType) as ContentType[]).map((type) => {
          if (byType[type] === 0) return null;
          return (
            <div key={type} className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <div className={`w-2 h-2 rounded-full ${typeColors[type]}`} />
              {TYPE_LABELS[type]} {formatBytes(byType[type])}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DownloadPage() {
  const [downloads, setDownloads] = useState<DownloadItem[]>(MOCK_DOWNLOADS);
  const [filterType, setFilterType] = useState<ContentType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<DownloadStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('1080p');
  const [audioQuality, setAudioQuality] = useState<AudioQuality>('high');
  const [showSettings, setShowSettings] = useState(false);
  const [isOnline] = useState(true);

  const totalStorage = 128 * 1024 * 1024 * 1024;
  const usedStorage = downloads
    .filter((d) => d.status === 'completed')
    .reduce((sum, d) => sum + d.totalSize, 0);
  const usedPercent = (usedStorage / totalStorage) * 100;

  const filteredDownloads = downloads.filter((d) => {
    if (filterType !== 'all' && d.type !== filterType) return false;
    if (filterStatus !== 'all' && d.status !== filterStatus) return false;
    if (searchQuery && !d.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const togglePause = useCallback((id: string) => {
    setDownloads((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        if (d.status === 'downloading') return { ...d, status: 'paused' as const, speed: 0 };
        if (d.status === 'paused') return { ...d, status: 'downloading' as const, speed: 2000000 };
        return d;
      }),
    );
  }, []);

  const retryDownload = useCallback((id: string) => {
    setDownloads((prev) =>
      prev.map((d) => {
        if (d.id !== id || d.status !== 'failed') return d;
        return { ...d, status: 'downloading' as const, speed: 1500000 };
      }),
    );
  }, []);

  const removeDownload = useCallback((id: string) => {
    setDownloads((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const removeCompleted = useCallback(() => {
    setDownloads((prev) => prev.filter((d) => d.status !== 'completed'));
  }, []);

  const activeCount = downloads.filter((d) => d.status === 'downloading').length;
  const completedCount = downloads.filter((d) => d.status === 'completed').length;
  const totalSpeed = downloads
    .filter((d) => d.status === 'downloading')
    .reduce((sum, d) => sum + d.speed, 0);

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0f0f0f] pb-20">
        {/* ===== App Download Section (NEW) ===== */}
        <AppDownloadSection />

        {/* ===== Divider ===== */}
        <div className="max-w-4xl mx-auto px-4">
          <div className="border-t border-white/5 my-2" />
        </div>

        {/* ===== Download Manager (existing) ===== */}
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Download className="w-5 h-5 text-[#3ea6ff]" />
                下载管理
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                {activeCount} 个下载中 · {completedCount} 个已完成
                {totalSpeed > 0 && (
                  <span className="text-[#3ea6ff] ml-2">
                    {formatSpeed(totalSpeed)}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1a1a1a] border border-white/5">
                {isOnline ? (
                  <Wifi className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-red-400" />
                )}
                <span className="text-[11px] text-gray-400">
                  {isOnline ? '在线' : '离线'}
                </span>
              </div>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-lg transition-colors ${
                  showSettings
                    ? 'bg-[#3ea6ff]/15 text-[#3ea6ff]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
                aria-label="下载设置"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {showSettings && (
            <div className="bg-[#1a1a1a] border border-white/5 rounded-xl p-4 mb-4 space-y-4">
              <h3 className="text-sm font-medium text-white">默认下载质量</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">视频画质</label>
                  <QualitySelector
                    type="video"
                    videoQuality={videoQuality}
                    audioQuality={audioQuality}
                    onVideoChange={setVideoQuality}
                    onAudioChange={setAudioQuality}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">音频音质</label>
                  <QualitySelector
                    type="music"
                    videoQuality={videoQuality}
                    audioQuality={audioQuality}
                    onVideoChange={setVideoQuality}
                    onAudioChange={setAudioQuality}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="bg-[#1a1a1a] border border-white/5 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-[#3ea6ff]" />
                存储空间
              </span>
              <span className="text-xs text-gray-500">
                {formatBytes(usedStorage)} / {formatBytes(totalStorage)}
                <span className="ml-1.5 text-gray-600">({usedPercent.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usedPercent > 90 ? 'bg-red-500' : usedPercent > 70 ? 'bg-yellow-500' : 'bg-[#3ea6ff]'
                }`}
                style={{ width: `${usedPercent}%` }}
              />
            </div>
            <StorageBreakdown downloads={downloads} />
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
            <div className="flex-1 relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索下载..."
                className="w-full h-9 pl-9 pr-3 bg-[#1a1a1a] border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 outline-none focus:border-[#3ea6ff] transition-colors"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {(['all', 'video', 'music', 'comic', 'novel'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    filterType === type
                      ? 'bg-[#3ea6ff]/15 text-[#3ea6ff]'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {type === 'all' ? '全部' : TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1">
              {(['all', 'downloading', 'paused', 'completed', 'failed', 'queued'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                    filterStatus === status
                      ? 'bg-white/10 text-white'
                      : 'text-gray-600 hover:text-gray-400'
                  }`}
                >
                  {status === 'all' ? '全部状态' : STATUS_LABELS[status]}
                </button>
              ))}
            </div>
            {completedCount > 0 && (
              <button
                onClick={removeCompleted}
                className="text-[11px] text-gray-600 hover:text-red-400 transition-colors"
              >
                清除已完成
              </button>
            )}
          </div>

          <div className="space-y-2">
            {filteredDownloads.length === 0 && (
              <div className="text-center py-16">
                <FolderOpen className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">暂无下载内容</p>
                <p className="text-gray-700 text-xs mt-1">
                  在视频、音乐、漫画或小说页面点击下载按钮开始
                </p>
              </div>
            )}

            {filteredDownloads.map((item) => {
              const TypeIcon = TYPE_ICONS[item.type];
              return (
                <div
                  key={item.id}
                  className="bg-[#1a1a1a] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <TypeIcon className="w-5 h-5 text-[#3ea6ff]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm text-white font-medium truncate">{item.title}</h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500 shrink-0">
                          {item.quality}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-600 shrink-0 hidden sm:inline-block">
                          {item.source}
                        </span>
                      </div>
                      {item.status !== 'completed' && (
                        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mb-1.5">
                          <div
                            className={`h-full rounded-full transition-all ${
                              item.status === 'failed'
                                ? 'bg-red-500'
                                : item.status === 'paused'
                                  ? 'bg-yellow-500'
                                  : 'bg-[#3ea6ff]'
                            }`}
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-[11px] text-gray-500">
                        <span className={STATUS_COLORS[item.status]}>
                          {STATUS_LABELS[item.status]}
                        </span>
                        <span>
                          {formatBytes(item.downloadedSize)} / {formatBytes(item.totalSize)}
                        </span>
                        {item.status === 'downloading' && (
                          <>
                            <span className="text-[#3ea6ff]">{formatSpeed(item.speed)}</span>
                            <span className="text-gray-600">
                              {estimateTimeLeft(item)} 剩余
                            </span>
                          </>
                        )}
                        {item.status === 'completed' && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                        )}
                        {item.status === 'failed' && (
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.status === 'completed' && (
                        <button
                          className="p-2 rounded-lg text-gray-400 hover:text-[#3ea6ff] hover:bg-white/5 transition-colors"
                          aria-label="离线播放"
                          title="离线播放"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      {item.status === 'failed' && (
                        <button
                          onClick={() => retryDownload(item.id)}
                          className="p-2 rounded-lg text-gray-400 hover:text-[#3ea6ff] hover:bg-white/5 transition-colors"
                          aria-label="重试"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      {(item.status === 'downloading' || item.status === 'paused') && (
                        <button
                          onClick={() => togglePause(item.id)}
                          className="p-2 rounded-lg text-gray-400 hover:text-[#3ea6ff] hover:bg-white/5 transition-colors"
                          aria-label={item.status === 'downloading' ? '暂停' : '继续'}
                        >
                          {item.status === 'downloading' ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => removeDownload(item.id)}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-white/5 transition-colors"
                        aria-label="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
