"use client";

import { useState, useCallback, useMemo } from "react";
import Header from "@/components/Header";
import RatingBadge from "@/components/ui/RatingBadge";
import VideoPlayer from "@/components/player/VideoPlayer";
import DanmakuLayer, { type DanmakuItem } from "@/components/player/DanmakuLayer";
import AutoPlayOverlay from "@/components/player/AutoPlayOverlay";
import type { ContentRating, AggregatedItem } from "@/lib/types";
import type { AutoPlayCandidate } from "@/lib/player/autoplay-engine";
import { hotVideos } from "@/lib/mock-data";
import { ageGate } from "@/lib/age-gate";
import {
  PlayCircle,
  Search,
  Star,
  Gamepad2,
  Music,
  Laugh,
  Tv,
  Globe,
  Film,
  Clapperboard,
  Video,
  MonitorPlay,
  Smartphone,
  Send,
  X,
  Eye,
  Clock,
  Filter,
  SlidersHorizontal,
  ExternalLink,
  Shield,
  Upload,
  Tag,
  Check,
  Plus,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Platform tabs
// ---------------------------------------------------------------------------

interface PlatformTab {
  id: string;
  label: string;
  icon: React.ElementType;
  defaultRating: ContentRating;
}

const PLATFORM_TABS: PlatformTab[] = [
  { id: "local", label: "本站", icon: Star, defaultRating: "PG" },
  { id: "bilibili", label: "B站", icon: Tv, defaultRating: "PG" },
  { id: "acfun", label: "A站", icon: MonitorPlay, defaultRating: "G" },
  { id: "youtube", label: "YouTube", icon: PlayCircle, defaultRating: "PG" },
  { id: "twitch", label: "Twitch", icon: Gamepad2, defaultRating: "PG-13" },
  { id: "douyin", label: "抖音", icon: Smartphone, defaultRating: "PG" },
  { id: "kuaishou", label: "快手", icon: Video, defaultRating: "PG" },
  { id: "telegram", label: "Telegram", icon: Send, defaultRating: "PG-13" },
  { id: "free", label: "免费影视", icon: Film, defaultRating: "PG-13" },
];

// Adult mode: add adult video tab that links to /zone/videos
// (used inline in the platform tabs rendering)

// ---------------------------------------------------------------------------
// Region filters
// ---------------------------------------------------------------------------

interface RegionOption {
  id: string;
  label: string;
}

const REGIONS: RegionOption[] = [
  { id: "all", label: "全部地区" },
  { id: "cn", label: "中国大陆" },
  { id: "hktw", label: "港台" },
  { id: "jp", label: "日本" },
  { id: "kr", label: "韩国" },
  { id: "us", label: "美国" },
  { id: "eu", label: "欧洲" },
  { id: "sea", label: "东南亚" },
  { id: "other", label: "其他" },
];

// ---------------------------------------------------------------------------
// Video type categories
// ---------------------------------------------------------------------------

interface VideoTypeOption {
  id: string;
  label: string;
  icon: React.ElementType;
}

const VIDEO_TYPES: VideoTypeOption[] = [
  { id: "all", label: "全部类型", icon: SlidersHorizontal },
  { id: "movie", label: "电影", icon: Film },
  { id: "tv", label: "电视剧", icon: Tv },
  { id: "variety", label: "综艺", icon: Laugh },
  { id: "documentary", label: "纪录片", icon: Globe },
  { id: "short", label: "短视频", icon: Smartphone },
  { id: "anime", label: "动漫", icon: Clapperboard },
  { id: "mv", label: "MV", icon: Music },
];

// ---------------------------------------------------------------------------
// Mock aggregated video data
// ---------------------------------------------------------------------------

interface MockVideo {
  id: string;
  title: string;
  cover: string;
  source: string;
  sourceId: string;
  platform: string;
  region: string;
  videoType: string;
  rating: ContentRating;
  duration: string;
  views: number;
  author: string;
  date: string;
  url: string;
  episode?: number;
  totalEpisodes?: number;
}

function generateMockVideos(): MockVideo[] {
  const platforms = PLATFORM_TABS.map((p) => p.id);
  const regions = REGIONS.filter((r) => r.id !== "all").map((r) => r.id);
  const types = VIDEO_TYPES.filter((t) => t.id !== "all").map((t) => t.id);
  const ratings: ContentRating[] = ["G", "PG", "PG-13", "R"];

  const titles: Record<string, string[]> = {
    movie: [
      "星际穿越：时空之旅",
      "暗夜追踪者",
      "海底两万里",
      "末日余晖",
      "东京物语",
      "巴黎最后的探戈",
    ],
    tv: [
      "权力的游戏 S8",
      "绝命毒师 全集",
      "三体 第二季",
      "鱿鱼游戏 S2",
      "黑镜 新季",
      "纸牌屋 重启",
    ],
    variety: [
      "奔跑吧兄弟 2026",
      "脱口秀大会 S6",
      "明星大侦探 S9",
      "中国好声音 2026",
      "向往的生活 S8",
    ],
    documentary: [
      "地球脉动 III",
      "宇宙时空之旅",
      "人生七年 63UP",
      "蓝色星球 III",
      "舌尖上的中国 S4",
    ],
    short: [
      "一分钟学做菜",
      "街头采访合集",
      "搞笑日常 Vlog",
      "旅行打卡记录",
      "宠物搞笑瞬间",
    ],
    anime: [
      "进击的巨人 最终季",
      "鬼灭之刃 柱训练篇",
      "咒术回战 S3",
      "间谍过家家 S3",
      "葬送的芙莉莲 S2",
    ],
    mv: [
      "周杰伦 - 最伟大的作品",
      "Taylor Swift - Fortnight",
      "YOASOBI - アイドル",
      "Adele - Easy On Me",
      "BTS - Dynamite",
    ],
  };

  const covers = [
    "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&q=80",
    "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&q=80",
    "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=400&q=80",
    "https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=400&q=80",
    "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=400&q=80",
    "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=400&q=80",
    "https://images.unsplash.com/photo-1524712245354-2c4e5e7121c0?w=400&q=80",
    "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=400&q=80",
  ];

  const videos: MockVideo[] = [];
  let id = 1;

  for (const vType of types) {
    const typeTitles = titles[vType] ?? titles.movie;
    for (let i = 0; i < typeTitles.length; i++) {
      const platform = platforms[id % platforms.length];
      const region = regions[id % regions.length];
      const rating = ratings[id % ratings.length];
      const isEpisodic = vType === "tv" || vType === "anime";
      videos.push({
        id: `v-${id}`,
        title: typeTitles[i],
        cover: covers[id % covers.length],
        source: PLATFORM_TABS.find((p) => p.id === platform)?.label ?? "本站",
        sourceId: platform,
        platform,
        region,
        videoType: vType,
        rating,
        duration: vType === "short" ? "00:45" : vType === "movie" ? "2:15:00" : "45:00",
        views: Math.floor(Math.random() * 5000000) + 10000,
        author: `创作者${id}`,
        date: "2026-04-09",
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        episode: isEpisodic ? ((i % 12) + 1) : undefined,
        totalEpisodes: isEpisodic ? 24 : undefined,
      });
      id++;
    }
  }

  // Add some from hotVideos mock data
  for (const hv of hotVideos) {
    videos.push({
      id: `hot-${hv.id}`,
      title: hv.title,
      cover: hv.thumb,
      source: "本站",
      sourceId: "local",
      platform: "local",
      region: "cn",
      videoType: hv.category === "game" ? "short" : hv.category === "music" ? "mv" : "short",
      rating: "PG",
      duration: hv.duration,
      views: hv.views,
      author: hv.author,
      date: hv.date,
      url: "",
    });
  }

  return videos;
}

const ALL_VIDEOS = generateMockVideos();

// Owner bilibili videos
const ownerBiliVideos = [
  { bvid: "BV1GJ411x7h7", title: "反差", duration: "00:16", views: 72 },
  { bvid: "BV1bK4y1C7yA", title: "泳池比基尼展示", duration: "01:09", views: 156 },
  { bvid: "BV1x54y1e7zf", title: "喜欢吗?", duration: "00:30", views: 280 },
  { bvid: "BV1uT4y1P7CX", title: "谁，我又没钱了", duration: "00:04", views: 156 },
  { bvid: "BV1Hx411w7X3", title: "更新看，赶紧来围观吧", duration: "00:05", views: 192 },
  { bvid: "BV1aS4y1P7Gj", title: "女生宿舍真的乱", duration: "00:12", views: 83 },
  { bvid: "BV1GJ411x7h7", title: "推沙滩", duration: "00:11", views: 43 },
  { bvid: "BV1bK4y1C7yA", title: "AI生成很多", duration: "00:36", views: 66 },
  { bvid: "BV1x54y1e7zf", title: "她爸爸说这样最好看", duration: "00:08", views: 64 },
  { bvid: "BV1uT4y1P7CX", title: "多学多看多实战", duration: "00:15", views: 56 },
  { bvid: "BV1Hx411w7X3", title: "更多精彩内容", duration: "03:20", views: 320 },
  { bvid: "BV1aS4y1P7Gj", title: "日常分享", duration: "05:10", views: 210 },
];

const coverGradients = [
  "from-[#1a0a2e] to-[#2a1a3e]",
  "from-[#0a1a2e] to-[#1a2a3e]",
  "from-[#2a0a0a] to-[#3a1a1a]",
  "from-[#0a2a1a] to-[#1a3a2a]",
  "from-[#1a1a0e] to-[#2a2a1e]",
  "from-[#2a1a0a] to-[#3a2a1a]",
  "from-[#0a0a2a] to-[#1a1a3a]",
  "from-[#2a0a1a] to-[#3a1a2a]",
  "from-[#1a0a1a] to-[#2a1a2a]",
  "from-[#0a1a1a] to-[#1a2a2a]",
  "from-[#1a1a2e] to-[#0a2a3e]",
  "from-[#2a1a1a] to-[#3a0a2a]",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + "亿";
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function toAggregatedItem(v: MockVideo): AggregatedItem {
  return {
    id: v.id,
    title: v.title,
    cover: v.cover,
    source: v.source,
    sourceId: v.sourceId,
    rating: v.rating,
    type: "video",
    url: v.url,
    metadata: {
      author: v.author,
      views: v.views,
      duration: v.duration,
      episode: v.episode,
      totalEpisodes: v.totalEpisodes,
    },
  };
}

// ---------------------------------------------------------------------------
// Mock danmaku data
// ---------------------------------------------------------------------------

const MOCK_DANMAKU: DanmakuItem[] = [
  { id: "d1", text: "好看！", time: 2, color: "#FFFFFF", position: "scroll", size: "normal" },
  { id: "d2", text: "太精彩了", time: 5, color: "#FF0000", position: "scroll", size: "normal" },
  { id: "d3", text: "前方高能", time: 8, color: "#FFFF00", position: "top", size: "large" },
  { id: "d4", text: "哈哈哈哈", time: 12, color: "#00FF00", position: "scroll", size: "normal" },
  { id: "d5", text: "泪目了", time: 18, color: "#3EA6FF", position: "scroll", size: "normal" },
  { id: "d6", text: "名场面", time: 25, color: "#FF69B4", position: "top", size: "normal" },
];

// ===========================================================================
// Main Page Component
// ===========================================================================

export default function VideosPage() {
  // --- State ---
  const [activePlatform, setActivePlatform] = useState("local");
  const [activeRegion, setActiveRegion] = useState("all");
  const [activeVideoType, setActiveVideoType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Player state
  const [playingVideo, setPlayingVideo] = useState<MockVideo | null>(null);
  const [playingBili, setPlayingBili] = useState<{ bvid: string; title: string } | null>(null);
  const [playerTime, setPlayerTime] = useState(0);
  const [danmakuList, setDanmakuList] = useState<DanmakuItem[]>(MOCK_DANMAKU);
  const [isPlaying, setIsPlaying] = useState(true);

  // AutoPlay state
  const [showAutoPlay, setShowAutoPlay] = useState(false);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState("all");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadRegion, setUploadRegion] = useState("cn");
  const [uploadRating, setUploadRating] = useState<ContentRating>("PG");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Video tagging state (per-video tags stored in component state)
  const [videoTags, setVideoTags] = useState<Record<string, string[]>>({});
  const [newTagInput, setNewTagInput] = useState("");
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  // --- Filtered videos ---
  const filteredVideos = useMemo(() => {
    let list = ALL_VIDEOS;

    // Platform filter (bilibili tab shows owner videos separately)
    if (activePlatform !== "local") {
      list = list.filter((v) => v.platform === activePlatform);
    } else {
      list = list.filter((v) => v.platform === "local");
    }

    // Region filter
    if (activeRegion !== "all") {
      list = list.filter((v) => v.region === activeRegion);
    }

    // Video type filter
    if (activeVideoType !== "all") {
      list = list.filter((v) => v.videoType === activeVideoType);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.author.toLowerCase().includes(q) ||
          v.source.toLowerCase().includes(q)
      );
    }

    // Tag filter
    if (activeTagFilter) {
      list = list.filter((v) => {
        const tags = videoTags[v.id] || [];
        return tags.includes(activeTagFilter);
      });
    }

    return list;
  }, [activePlatform, activeRegion, activeVideoType, searchQuery, activeTagFilter, videoTags]);

  // --- AutoPlay candidate ---
  const autoPlayCandidate = useMemo<AutoPlayCandidate | null>(() => {
    if (!playingVideo || filteredVideos.length < 2) return null;
    const idx = filteredVideos.findIndex((v) => v.id === playingVideo.id);
    const next = filteredVideos[idx + 1] ?? filteredVideos[0];
    if (!next || next.id === playingVideo.id) return null;
    return {
      item: toAggregatedItem(next),
      reason: next.episode ? "next-episode" : "recommended",
      priority: next.episode ? 3 : 1,
    };
  }, [playingVideo, filteredVideos]);

  const autoPlayQueue = useMemo<AutoPlayCandidate[]>(() => {
    if (!playingVideo) return [];
    const idx = filteredVideos.findIndex((v) => v.id === playingVideo.id);
    return filteredVideos
      .slice(idx + 1, idx + 6)
      .map((v) => ({
        item: toAggregatedItem(v),
        reason: (v.episode ? "next-episode" : "recommended") as AutoPlayCandidate["reason"],
        priority: v.episode ? 3 : 1,
      }));
  }, [playingVideo, filteredVideos]);

  // --- Handlers ---
  const handlePlayVideo = useCallback((video: MockVideo) => {
    setPlayingVideo(video);
    setPlayingBili(null);
    setPlayerTime(0);
    setIsPlaying(true);
    setShowAutoPlay(false);
  }, []);

  const handlePlayBili = useCallback((bvid: string, title: string) => {
    setPlayingBili({ bvid, title });
    setPlayingVideo(null);
    setShowAutoPlay(false);
  }, []);

  const handleVideoEnded = useCallback(() => {
    if (autoPlayEnabled && autoPlayCandidate) {
      setShowAutoPlay(true);
    }
  }, [autoPlayEnabled, autoPlayCandidate]);

  const handleAutoPlayNow = useCallback(() => {
    if (!autoPlayCandidate) return;
    const nextVideo = ALL_VIDEOS.find((v) => v.id === autoPlayCandidate.item.id);
    if (nextVideo) {
      handlePlayVideo(nextVideo);
    }
    setShowAutoPlay(false);
  }, [autoPlayCandidate, handlePlayVideo]);

  const handleSendDanmaku = useCallback(
    (text: string, color: string, position: string, size: string) => {
      const newDanmaku: DanmakuItem = {
        id: `d-${Date.now()}`,
        text,
        time: playerTime,
        color,
        position: position as DanmakuItem["position"],
        size: size as DanmakuItem["size"],
      };
      setDanmakuList((prev) => [...prev, newDanmaku]);
    },
    [playerTime]
  );

  const closePlayer = useCallback(() => {
    setPlayingVideo(null);
    setPlayingBili(null);
    setShowAutoPlay(false);
    setNewTagInput("");
  }, []);

  // Upload handler (mock)
  const handleUploadSubmit = useCallback(() => {
    if (!uploadTitle.trim()) return;
    setUploadSuccess(true);
    setTimeout(() => {
      setUploadSuccess(false);
      setShowUploadModal(false);
      setUploadTitle("");
      setUploadType("all");
      setUploadTags("");
      setUploadRegion("cn");
      setUploadRating("PG");
      setUploadFile(null);
    }, 1500);
  }, [uploadTitle]);

  // Tag handlers
  const addTagToVideo = useCallback((videoId: string, tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setVideoTags((prev) => {
      const existing = prev[videoId] || [];
      if (existing.includes(trimmed)) return prev;
      return { ...prev, [videoId]: [...existing, trimmed] };
    });
    setNewTagInput("");
  }, []);

  const removeTagFromVideo = useCallback((videoId: string, tag: string) => {
    setVideoTags((prev) => {
      const existing = prev[videoId] || [];
      return { ...prev, [videoId]: existing.filter((t) => t !== tag) };
    });
  }, []);

  // Is bilibili owner tab?
  const isBiliOwner = activePlatform === "bilibili";

  return (
    <>
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 pb-20 md:pb-4">
        {/* ===== Page Title ===== */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <PlayCircle size={22} className="text-[#3ea6ff]" />
            视频中心
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] text-xs font-semibold hover:bg-[#65b8ff] transition"
            >
              <Upload size={14} />
              上传视频
            </button>
            {isBiliOwner && (
              <a
                href="https://space.bilibili.com/385144618"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-[#fb7299] text-white text-xs font-semibold hover:bg-[#fc8bab] transition flex items-center gap-1.5"
              >
                <ExternalLink size={12} /> B站关注
              </a>
            )}
          </div>
        </div>

        {/* Active tag filter indicator */}
        {activeTagFilter && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-[#3ea6ff]/10 border border-[#3ea6ff]/20">
            <Tag size={12} className="text-[#3ea6ff]" />
            <span className="text-xs text-[#3ea6ff]">标签筛选: {activeTagFilter}</span>
            <button
              onClick={() => setActiveTagFilter(null)}
              className="ml-auto text-[#3ea6ff] hover:text-white transition"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* ===== Platform Tabs ===== */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
          {PLATFORM_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activePlatform === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActivePlatform(tab.id);
                  setActiveRegion("all");
                  setActiveVideoType("all");
                  setSearchQuery("");
                }}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] whitespace-nowrap border transition shrink-0 ${
                  isActive
                    ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold"
                    : "bg-transparent text-[#aaa] border-[#333] hover:bg-[#2a2a2a] hover:text-white"
                }`}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
          {/* Adult mode: show adult video tab linking to /zone/videos */}
          {ageGate.canAccess('NC-17') && (
            <a
              href="/zone/videos"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] whitespace-nowrap border transition shrink-0 bg-transparent text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
            >
              <Shield size={13} />
              成人视频
            </a>
          )}
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
            placeholder={`搜索${PLATFORM_TABS.find((p) => p.id === activePlatform)?.label ?? ""}视频...`}
            className="w-full h-9 pl-9 pr-20 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition"
          />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] transition ${
              showFilters
                ? "bg-[#3ea6ff]/20 text-[#3ea6ff]"
                : "bg-[#2a2a2a] text-[#aaa] hover:text-white"
            }`}
          >
            <Filter size={11} />
            筛选
          </button>
        </div>

        {/* ===== Filters (Region + Video Type) ===== */}
        {showFilters && (
          <div className="mb-4 p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50 space-y-3 animate-in">
            {/* Region filter */}
            <div>
              <p className="text-[11px] text-[#666] mb-2 flex items-center gap-1">
                <Globe size={11} /> 地区
              </p>
              <div className="flex flex-wrap gap-1.5">
                {REGIONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setActiveRegion(r.id)}
                    className={`px-3 py-1 rounded-full text-[12px] border transition ${
                      activeRegion === r.id
                        ? "bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/40 font-medium"
                        : "bg-transparent text-[#888] border-[#333] hover:text-white hover:border-[#555]"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Video type filter */}
            <div>
              <p className="text-[11px] text-[#666] mb-2 flex items-center gap-1">
                <Clapperboard size={11} /> 类型
              </p>
              <div className="flex flex-wrap gap-1.5">
                {VIDEO_TYPES.map((t) => {
                  const TIcon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveVideoType(t.id)}
                      className={`flex items-center gap-1 px-3 py-1 rounded-full text-[12px] border transition ${
                        activeVideoType === t.id
                          ? "bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/40 font-medium"
                          : "bg-transparent text-[#888] border-[#333] hover:text-white hover:border-[#555]"
                      }`}
                    >
                      <TIcon size={11} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ===== Bilibili Owner Section ===== */}
        {isBiliOwner && (
          <>
            {/* Owner banner */}
            <div className="mb-5 p-5 rounded-2xl bg-gradient-to-br from-[#0a0a2e] via-[#1a0a3e] to-[#0a1a3e] border border-[#333]/30 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-[#3ea6ff]/[0.05] rounded-full blur-[60px]" />
              <div className="relative flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-[#3ea6ff] flex items-center justify-center text-[#0f0f0f] text-xl font-black shrink-0 shadow-lg shadow-[#3ea6ff]/30">
                  U
                </div>
                <div>
                  <h2 className="font-bold text-lg">Undefinde_NaN</h2>
                  <p className="text-[#8a8a8a] text-xs mt-0.5">
                    {ownerBiliVideos.length} 个视频 · B站创作者
                  </p>
                </div>
                <a
                  href="https://space.bilibili.com/385144618"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto px-4 py-2 rounded-lg bg-[#fb7299] text-white text-xs font-bold hover:bg-[#fc8bab] transition shrink-0 flex items-center gap-1.5"
                >
                  <ExternalLink size={12} /> 访问B站
                </a>
              </div>
            </div>

            {/* Owner video grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
              {ownerBiliVideos.map((v, i) => (
                <div
                  key={`owner-${i}`}
                  onClick={() => handlePlayBili(v.bvid, v.title)}
                  className="group cursor-pointer rounded-xl overflow-hidden transition hover:-translate-y-1"
                >
                  <div
                    className={`relative aspect-video bg-gradient-to-br ${coverGradients[i % coverGradients.length]} rounded-xl overflow-hidden`}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 group-hover:scale-110 transition-all">
                        <PlayCircle size={20} className="text-white ml-0.5" />
                      </div>
                    </div>
                    <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                      <Clock size={8} />
                      {v.duration}
                    </span>
                    <span className="absolute top-1.5 left-1.5 bg-[#3ea6ff] text-[#0f0f0f] text-[9px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                      <Star size={8} /> 站长
                    </span>
                    <span className="absolute top-1.5 right-1.5">
                      <RatingBadge rating="PG" />
                    </span>
                  </div>
                  <div className="pt-2 pb-1">
                    <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug group-hover:text-[#3ea6ff] transition">
                      {v.title}
                    </h3>
                    <p className="text-[12px] text-[#8a8a8a] mt-1 flex items-center gap-1">
                      <Eye size={10} /> {fmtNum(v.views)} 播放
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ===== Aggregated Video Grid ===== */}
        {!isBiliOwner && (
          <>
            {/* Active filter summary */}
            {(activeRegion !== "all" || activeVideoType !== "all" || searchQuery) && (
              <div className="flex items-center gap-2 mb-3 text-[12px] text-[#888]">
                <SlidersHorizontal size={12} />
                <span>
                  {PLATFORM_TABS.find((p) => p.id === activePlatform)?.label}
                  {activeRegion !== "all" &&
                    ` · ${REGIONS.find((r) => r.id === activeRegion)?.label}`}
                  {activeVideoType !== "all" &&
                    ` · ${VIDEO_TYPES.find((t) => t.id === activeVideoType)?.label}`}
                  {searchQuery && ` · "${searchQuery}"`}
                </span>
                <span className="text-[#555]">·</span>
                <span>{filteredVideos.length} 个结果</span>
              </div>
            )}

            {/* Video grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
              {filteredVideos.map((v) => (
                <div
                  key={v.id}
                  onClick={() => handlePlayVideo(v)}
                  className="group cursor-pointer rounded-xl overflow-hidden transition hover:-translate-y-1"
                >
                  <div className="relative aspect-video bg-[#1a1a1a] overflow-hidden rounded-xl">
                    {v.cover ? (
                      <img
                        src={v.cover}
                        alt={v.title}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center">
                        <PlayCircle size={32} className="text-white/20" />
                      </div>
                    )}
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                        <PlayCircle size={24} className="text-white" />
                      </div>
                    </div>
                    {/* Duration badge */}
                    <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                      <Clock size={8} />
                      {v.duration}
                    </span>
                    {/* Source badge */}
                    <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                      {v.source}
                    </span>
                    {/* MPAA Rating badge */}
                    <span className="absolute top-1.5 right-1.5">
                      <RatingBadge rating={v.rating} />
                    </span>
                    {/* Episode badge */}
                    {v.episode && (
                      <span className="absolute bottom-1.5 left-1.5 bg-[#3ea6ff]/90 text-[#0f0f0f] text-[9px] px-1.5 py-0.5 rounded font-bold">
                        第{v.episode}集
                        {v.totalEpisodes ? ` / ${v.totalEpisodes}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="pt-2 pb-1">
                    <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug group-hover:text-[#3ea6ff] transition">
                      {v.title}
                    </h3>
                    <p className="text-[12px] text-[#8a8a8a] mt-1 flex items-center gap-1">
                      {v.author}
                      <span className="text-[#555]">·</span>
                      <Eye size={10} /> {fmtNum(v.views)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Empty state */}
            {filteredVideos.length === 0 && (
              <div className="text-center text-[#8a8a8a] py-20">
                <Film size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-sm">暂无匹配的视频</p>
                <p className="text-xs mt-1 text-[#555]">
                  尝试切换平台、地区或类型筛选
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* ===== Video Player Modal (Aggregated) ===== */}
      {playingVideo && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-3 md:p-6"
          onClick={closePlayer}
        >
          <div
            className="w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-white font-bold text-base md:text-lg truncate">
                  {playingVideo.title}
                </h2>
                <RatingBadge rating={playingVideo.rating} />
                <span className="text-[11px] text-[#888] bg-[#2a2a2a] px-2 py-0.5 rounded shrink-0">
                  {playingVideo.source}
                </span>
              </div>
              <button
                onClick={closePlayer}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition shrink-0 ml-2"
              >
                <X size={16} />
              </button>
            </div>

            {/* Player area */}
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
              <VideoPlayer
                src={playingVideo.url || "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"}
                title={playingVideo.title}
                source={playingVideo.source}
                rating={playingVideo.rating}
                autoPlay
                onEnded={handleVideoEnded}
                onProgress={(time) => {
                  setPlayerTime(time);
                }}
              />

              {/* Danmaku layer */}
              <div className="absolute inset-0 pointer-events-none">
                <DanmakuLayer
                  danmakuList={danmakuList}
                  currentTime={playerTime}
                  playing={isPlaying}
                  onSend={handleSendDanmaku}
                />
              </div>

              {/* AutoPlay overlay */}
              {showAutoPlay && autoPlayCandidate && (
                <div className="absolute inset-0 z-10">
                  <AutoPlayOverlay
                    candidate={autoPlayCandidate}
                    queue={autoPlayQueue}
                    countdownSeconds={5}
                    onPlayNow={handleAutoPlayNow}
                    onCancel={() => setShowAutoPlay(false)}
                    onToggleAutoPlay={setAutoPlayEnabled}
                    autoPlayEnabled={autoPlayEnabled}
                  />
                </div>
              )}
            </div>

            {/* Video info */}
            <div className="mt-3 flex items-center justify-between text-sm text-[#8a8a8a]">
              <div className="flex items-center gap-3">
                <span>{playingVideo.author}</span>
                <span className="flex items-center gap-1">
                  <Eye size={12} /> {fmtNum(playingVideo.views)}
                </span>
                {playingVideo.episode && (
                  <span className="text-[#3ea6ff] text-xs">
                    第{playingVideo.episode}集
                    {playingVideo.totalEpisodes
                      ? ` / ${playingVideo.totalEpisodes}`
                      : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <RatingBadge rating={playingVideo.rating} size="md" />
              </div>
            </div>

            {/* ===== Tagging Section ===== */}
            <div className="mt-4 p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50">
              <div className="flex items-center gap-2 mb-3">
                <Tag size={14} className="text-[#3ea6ff]" />
                <span className="text-sm font-medium text-white">打标签</span>
              </div>

              {/* Existing tags */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {(videoTags[playingVideo.id] || []).map((tag) => (
                  <span
                    key={tag}
                    className="group flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#3ea6ff]/10 text-[#3ea6ff] text-xs border border-[#3ea6ff]/20 cursor-pointer hover:bg-[#3ea6ff]/20 transition"
                  >
                    <button
                      onClick={() => setActiveTagFilter(tag)}
                      className="hover:underline"
                      title="通过标签找同类"
                    >
                      {tag}
                    </button>
                    <button
                      onClick={() => removeTagFromVideo(playingVideo.id, tag)}
                      className="opacity-50 hover:opacity-100 transition"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
                {(videoTags[playingVideo.id] || []).length === 0 && (
                  <span className="text-xs text-[#666]">暂无标签</span>
                )}
              </div>

              {/* Add new tag */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      addTagToVideo(playingVideo.id, newTagInput);
                    }
                  }}
                  placeholder="输入标签，回车添加..."
                  className="flex-1 h-8 px-3 bg-[#0f0f0f] border border-[#333] rounded-lg text-xs text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition"
                />
                <button
                  onClick={() => addTagToVideo(playingVideo.id, newTagInput)}
                  className="h-8 px-3 rounded-lg bg-[#3ea6ff]/15 text-[#3ea6ff] text-xs hover:bg-[#3ea6ff]/25 transition flex items-center gap-1"
                >
                  <Plus size={12} />
                  添加
                </button>
              </div>

              {(videoTags[playingVideo.id] || []).length > 0 && (
                <p className="text-[10px] text-[#555] mt-2 flex items-center gap-1">
                  <Search size={9} />
                  点击标签可筛选同类视频
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Bilibili Embed Player Modal ===== */}
      {playingBili && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-3 md:p-6"
          onClick={closePlayer}
        >
          <div
            className="w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-white font-bold text-base md:text-lg truncate">
                  {playingBili.title}
                </h2>
                <RatingBadge rating="PG" />
              </div>
              <button
                onClick={closePlayer}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition shrink-0 ml-2"
              >
                <X size={16} />
              </button>
            </div>
            <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
              <iframe
                src={`//player.bilibili.com/player.html?bvid=${playingBili.bvid}&high_quality=1&danmaku=0&autoplay=1`}
                className="w-full h-full border-0"
                allowFullScreen
                allow="autoplay; fullscreen; picture-in-picture"
                title={playingBili.title}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-[#8a8a8a]">
              <span>Undefinde_NaN</span>
              <a
                href={`https://www.bilibili.com/video/${playingBili.bvid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#fb7299] hover:text-[#fc8bab] text-xs flex items-center gap-1"
              >
                <ExternalLink size={12} /> 在B站观看
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ===== Upload Modal ===== */}
      {showUploadModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowUploadModal(false)}
        >
          <div
            className="w-full max-w-lg bg-[#1a1a1a] border border-[#333] rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#333]/50">
              <h2 className="text-white font-bold flex items-center gap-2">
                <Upload size={18} className="text-[#3ea6ff]" />
                上传视频
              </h2>
              <button
                onClick={() => setShowUploadModal(false)}
                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {uploadSuccess ? (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
                    <Check size={32} className="text-green-400" />
                  </div>
                  <p className="text-white font-medium">上传成功</p>
                  <p className="text-xs text-[#888] mt-1">视频正在处理中...</p>
                </div>
              ) : (
                <>
                  {/* File input */}
                  <div>
                    <label className="block text-xs text-[#888] mb-1.5">视频文件</label>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-[#888] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#3ea6ff]/15 file:text-[#3ea6ff] hover:file:bg-[#3ea6ff]/25 file:cursor-pointer file:transition"
                    />
                    {uploadFile && (
                      <p className="text-[10px] text-[#666] mt-1">{uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(1)} MB)</p>
                    )}
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-xs text-[#888] mb-1.5">标题</label>
                    <input
                      type="text"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder="输入视频标题..."
                      className="w-full h-9 px-3 bg-[#0f0f0f] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition"
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-xs text-[#888] mb-1.5">类型</label>
                    <select
                      value={uploadType}
                      onChange={(e) => setUploadType(e.target.value)}
                      className="w-full h-9 px-3 bg-[#0f0f0f] border border-[#333] rounded-lg text-sm text-white outline-none focus:border-[#3ea6ff] transition appearance-none cursor-pointer"
                    >
                      {VIDEO_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-xs text-[#888] mb-1.5">标签（逗号分隔）</label>
                    <input
                      type="text"
                      value={uploadTags}
                      onChange={(e) => setUploadTags(e.target.value)}
                      placeholder="搞笑, 日常, Vlog..."
                      className="w-full h-9 px-3 bg-[#0f0f0f] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Region */}
                    <div>
                      <label className="block text-xs text-[#888] mb-1.5">地区</label>
                      <select
                        value={uploadRegion}
                        onChange={(e) => setUploadRegion(e.target.value)}
                        className="w-full h-9 px-3 bg-[#0f0f0f] border border-[#333] rounded-lg text-sm text-white outline-none focus:border-[#3ea6ff] transition appearance-none cursor-pointer"
                      >
                        {REGIONS.filter((r) => r.id !== "all").map((r) => (
                          <option key={r.id} value={r.id}>{r.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Rating */}
                    <div>
                      <label className="block text-xs text-[#888] mb-1.5">分级</label>
                      <select
                        value={uploadRating}
                        onChange={(e) => setUploadRating(e.target.value as ContentRating)}
                        className="w-full h-9 px-3 bg-[#0f0f0f] border border-[#333] rounded-lg text-sm text-white outline-none focus:border-[#3ea6ff] transition appearance-none cursor-pointer"
                      >
                        <option value="G">G — 全年龄</option>
                        <option value="PG">PG — 家长指导</option>
                        <option value="PG-13">PG-13 — 13+</option>
                        <option value="R">R — 限制级</option>
                      </select>
                    </div>
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleUploadSubmit}
                    disabled={!uploadTitle.trim()}
                    className="w-full h-10 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] font-semibold text-sm hover:bg-[#65b8ff] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Upload size={16} />
                    提交上传
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
