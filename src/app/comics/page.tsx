"use client";

import { useState, useMemo, useCallback } from "react";
import Header from "@/components/Header";
import RatingBadge from "@/components/ui/RatingBadge";
import ComicReader, { type ComicPage } from "@/components/reader/ComicReader";
import type { ContentRating } from "@/lib/types";
import { ageGate } from "@/lib/age-gate";
import {
  BookOpen,
  Search,
  Filter,
  X,
  Eye,
  BookMarked,
  Layers,
  Clock,
  ChevronRight,
  User,
  Tag,
  Library,
  Bookmark,
  Play,
  Globe,
  Shield,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComicChapter {
  id: string;
  title: string;
  pages: number;
  date: string;
}

interface MockComic {
  id: string;
  title: string;
  cover: string;
  author: string;
  genres: string[];
  status: "连载中" | "已完结";
  source: string;
  sourceId: string;
  rating: ContentRating;
  chapters: ComicChapter[];
  views: number;
  description: string;
  lastUpdated: string;
}

interface ComicBookmark {
  comicId: string;
  chapterId: string;
  page: number;
  lastRead: string;
}

// ---------------------------------------------------------------------------
// Genre / Status / Source filter definitions
// ---------------------------------------------------------------------------

interface FilterOption {
  id: string;
  label: string;
}

const GENRES: FilterOption[] = [
  { id: "all", label: "全部类型" },
  { id: "热血", label: "热血" },
  { id: "恋爱", label: "恋爱" },
  { id: "搞笑", label: "搞笑" },
  { id: "冒险", label: "冒险" },
  { id: "奇幻", label: "奇幻" },
  { id: "科幻", label: "科幻" },
  { id: "悬疑", label: "悬疑" },
  { id: "恐怖", label: "恐怖" },
  { id: "日常", label: "日常" },
  { id: "运动", label: "运动" },
];

const STATUS_OPTIONS: FilterOption[] = [
  { id: "all", label: "全部状态" },
  { id: "连载中", label: "连载中" },
  { id: "已完结", label: "已完结" },
];

const SOURCE_PLATFORMS: FilterOption[] = [
  { id: "all", label: "全部来源" },
  { id: "漫画柜", label: "漫画柜" },
  { id: "动漫之家", label: "动漫之家" },
  { id: "MangaDex", label: "MangaDex" },
  { id: "Webtoon", label: "Webtoon" },
  { id: "拷贝漫画", label: "拷贝漫画" },
  { id: "包子漫画", label: "包子漫画" },
];

// ---------------------------------------------------------------------------
// Mock comic data
// ---------------------------------------------------------------------------

const MOCK_CHAPTERS: ComicChapter[] = Array.from({ length: 20 }, (_, i) => ({
  id: `ch-${i + 1}`,
  title: `第${i + 1}话`,
  pages: Math.floor(Math.random() * 15) + 18,
  date: `2026-0${Math.min(4, Math.floor(i / 5) + 1)}-${String(((i * 3) % 28) + 1).padStart(2, "0")}`,
}));

function makeChapters(count: number): ComicChapter[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ch-${i + 1}`,
    title: `第${i + 1}话`,
    pages: Math.floor(Math.random() * 15) + 18,
    date: `2026-0${Math.min(4, Math.floor(i / 5) + 1)}-${String(((i * 3) % 28) + 1).padStart(2, "0")}`,
  }));
}

const ALL_COMICS: MockComic[] = [
  {
    id: "c-1", title: "独自升级", cover: "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?w=300&q=80",
    author: "DUBU", genres: ["热血", "冒险"], status: "连载中", source: "漫画柜", sourceId: "manhuagui",
    rating: "PG-13", chapters: makeChapters(210), views: 1520000,
    description: "一个普通猎人在获得系统后逐渐成长为最强猎人的故事。", lastUpdated: "2026-04-10",
  },
  {
    id: "c-2", title: "咒术回战", cover: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&q=80",
    author: "芥见下下", genres: ["热血", "奇幻"], status: "已完结", source: "动漫之家", sourceId: "dmzj",
    rating: "PG-13", chapters: makeChapters(271), views: 2800000,
    description: "虎杖悠仁吞下诅咒之王两面宿傩的手指后的冒险故事。", lastUpdated: "2026-02-15",
  },
  {
    id: "c-3", title: "间谍过家家", cover: "https://images.unsplash.com/photo-1601850494422-3cf14624b0b3?w=300&q=80",
    author: "远藤达哉", genres: ["搞笑", "日常"], status: "连载中", source: "MangaDex", sourceId: "mangadex",
    rating: "PG", chapters: makeChapters(105), views: 1900000,
    description: "间谍、杀手和超能力者组成的假家庭的温馨搞笑日常。", lastUpdated: "2026-04-08",
  },
  {
    id: "c-4", title: "药屋少女的呢喃", cover: "https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=300&q=80",
    author: "日向夏", genres: ["恋爱", "悬疑"], status: "连载中", source: "Webtoon", sourceId: "webtoon",
    rating: "PG", chapters: makeChapters(86), views: 980000,
    description: "后宫中的药师猫猫凭借药学知识解开一个个谜团。", lastUpdated: "2026-04-05",
  },
  {
    id: "c-5", title: "葬送的芙莉莲", cover: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&q=80",
    author: "山田�的", genres: ["奇幻", "日常"], status: "连载中", source: "拷贝漫画", sourceId: "copymanga",
    rating: "PG", chapters: makeChapters(135), views: 1650000,
    description: "魔王被勇者一行打倒后，精灵魔法使芙莉莲踏上了解人类的旅途。", lastUpdated: "2026-04-09",
  },
  {
    id: "c-6", title: "电锯人", cover: "https://images.unsplash.com/photo-1611457194403-d3f8c5154dc2?w=300&q=80",
    author: "藤本树", genres: ["热血", "恐怖"], status: "连载中", source: "漫画柜", sourceId: "manhuagui",
    rating: "R", chapters: makeChapters(178), views: 3200000,
    description: "电次与电锯恶魔波奇塔融合后成为公安猎魔人的故事。", lastUpdated: "2026-04-10",
  },
  {
    id: "c-7", title: "我推的孩子", cover: "https://images.unsplash.com/photo-1596727147705-61a532a659bd?w=300&q=80",
    author: "赤坂明", genres: ["悬疑", "日常"], status: "已完结", source: "动漫之家", sourceId: "dmzj",
    rating: "PG-13", chapters: makeChapters(162), views: 2100000,
    description: "转生为偶像双胞胎的医生在演艺圈追寻母亲被害真相。", lastUpdated: "2026-01-20",
  },
  {
    id: "c-8", title: "蓝色监狱", cover: "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=300&q=80",
    author: "金城宗幸", genres: ["运动", "热血"], status: "连载中", source: "MangaDex", sourceId: "mangadex",
    rating: "PG-13", chapters: makeChapters(280), views: 1800000,
    description: "为培养世界最强前锋而设立的蓝色监狱计划。", lastUpdated: "2026-04-07",
  },
  {
    id: "c-9", title: "怪兽8号", cover: "https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?w=300&q=80",
    author: "松本直也", genres: ["热血", "科幻"], status: "连载中", source: "包子漫画", sourceId: "baozimh",
    rating: "PG-13", chapters: makeChapters(115), views: 1200000,
    description: "日比野卡夫卡变身为怪兽8号后加入防卫队的故事。", lastUpdated: "2026-04-06",
  },
  {
    id: "c-10", title: "恋爱代行", cover: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=300&q=80",
    author: "宫岛礼吏", genres: ["恋爱", "搞笑"], status: "连载中", source: "Webtoon", sourceId: "webtoon",
    rating: "PG-13", chapters: makeChapters(340), views: 2500000,
    description: "大学生和田木和也租借女友水原千�的恋爱喜剧。", lastUpdated: "2026-04-10",
  },
  {
    id: "c-11", title: "一拳超人", cover: "https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?w=300&q=80",
    author: "ONE / 村田雄介", genres: ["热血", "搞笑"], status: "连载中", source: "漫画柜", sourceId: "manhuagui",
    rating: "PG-13", chapters: makeChapters(195), views: 4100000,
    description: "一拳就能解决所有敌人的最强英雄埼玉的故事。", lastUpdated: "2026-04-03",
  },
  {
    id: "c-12", title: "排球少年", cover: "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=300&q=80",
    author: "古馆春一", genres: ["运动", "热血"], status: "已完结", source: "动漫之家", sourceId: "dmzj",
    rating: "G", chapters: makeChapters(402), views: 3500000,
    description: "日向翔阳追逐排球梦想的热血青春故事。", lastUpdated: "2025-12-01",
  },
  {
    id: "c-13", title: "辉夜大小姐想让我告白", cover: "https://images.unsplash.com/photo-1601850494422-3cf14624b0b3?w=300&q=80",
    author: "赤坂明", genres: ["恋爱", "搞笑"], status: "已完结", source: "拷贝漫画", sourceId: "copymanga",
    rating: "PG", chapters: makeChapters(281), views: 2200000,
    description: "两个天才之间的恋爱头脑战。", lastUpdated: "2025-11-15",
  },
  {
    id: "c-14", title: "迷宫饭", cover: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&q=80",
    author: "九井谅子", genres: ["奇幻", "搞笑"], status: "已完结", source: "MangaDex", sourceId: "mangadex",
    rating: "PG", chapters: makeChapters(97), views: 1400000,
    description: "在迷宫中用魔物做料理的冒险美食漫画。", lastUpdated: "2025-10-20",
  },
  {
    id: "c-15", title: "暗杀教室", cover: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&q=80",
    author: "松井优征", genres: ["搞笑", "冒险"], status: "已完结", source: "包子漫画", sourceId: "baozimh",
    rating: "PG-13", chapters: makeChapters(180), views: 1800000,
    description: "学生们要在毕业前暗杀超生物老师的校园喜剧。", lastUpdated: "2025-09-10",
  },
];

// ---------------------------------------------------------------------------
// Mock bookmarks (continue reading)
// ---------------------------------------------------------------------------

const MOCK_BOOKMARKS: ComicBookmark[] = [
  { comicId: "c-1", chapterId: "ch-185", page: 12, lastRead: "2026-04-10" },
  { comicId: "c-6", chapterId: "ch-170", page: 5, lastRead: "2026-04-09" },
  { comicId: "c-3", chapterId: "ch-98", page: 20, lastRead: "2026-04-08" },
];

// ---------------------------------------------------------------------------
// Mock reader pages
// ---------------------------------------------------------------------------

function generateMockPages(count: number): ComicPage[] {
  const placeholders = [
    "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?w=800&q=80",
    "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&q=80",
    "https://images.unsplash.com/photo-1601850494422-3cf14624b0b3?w=800&q=80",
    "https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=800&q=80",
    "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&q=80",
  ];
  return Array.from({ length: count }, (_, i) => ({
    url: placeholders[i % placeholders.length],
    width: 800,
    height: 1200,
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + "亿";
  if (n >= 10_000) return (n / 10_000).toFixed(1) + "万";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

// ===========================================================================
// Main Page Component
// ===========================================================================

export default function ComicsPage() {
  // --- Filter state ---
  const [searchQuery, setSearchQuery] = useState("");
  const [activeGenre, setActiveGenre] = useState("all");
  const [activeStatus, setActiveStatus] = useState("all");
  const [activeSource, setActiveSource] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  // --- Detail / Reader state ---
  const [selectedComic, setSelectedComic] = useState<MockComic | null>(null);
  const [readingChapter, setReadingChapter] = useState<{
    comic: MockComic;
    chapter: ComicChapter;
  } | null>(null);

  // --- Bookmarks ---
  const [bookmarks] = useState<ComicBookmark[]>(MOCK_BOOKMARKS);

  // --- Filtered comics ---
  const filteredComics = useMemo(() => {
    let list = ALL_COMICS;

    if (activeGenre !== "all") {
      list = list.filter((c) => c.genres.includes(activeGenre));
    }
    if (activeStatus !== "all") {
      list = list.filter((c) => c.status === activeStatus);
    }
    if (activeSource !== "all") {
      list = list.filter((c) => c.source === activeSource);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.author.toLowerCase().includes(q) ||
          c.genres.some((g) => g.includes(q))
      );
    }

    return list;
  }, [activeGenre, activeStatus, activeSource, searchQuery]);

  // --- Continue reading comics ---
  const continueReadingComics = useMemo(() => {
    return bookmarks
      .map((bm) => {
        const comic = ALL_COMICS.find((c) => c.id === bm.comicId);
        if (!comic) return null;
        return { comic, bookmark: bm };
      })
      .filter(Boolean) as { comic: MockComic; bookmark: ComicBookmark }[];
  }, [bookmarks]);

  // --- Handlers ---
  const handleOpenComic = useCallback((comic: MockComic) => {
    setSelectedComic(comic);
  }, []);

  const handleStartReading = useCallback(
    (comic: MockComic, chapter?: ComicChapter) => {
      const ch = chapter ?? comic.chapters[0];
      if (ch) {
        setReadingChapter({ comic, chapter: ch });
        setSelectedComic(null);
      }
    },
    []
  );

  const handleCloseReader = useCallback(() => {
    setReadingChapter(null);
  }, []);

  const handleChapterEnd = useCallback(() => {
    if (!readingChapter) return;
    const { comic, chapter } = readingChapter;
    const idx = comic.chapters.findIndex((ch) => ch.id === chapter.id);
    if (idx < comic.chapters.length - 1) {
      setReadingChapter({ comic, chapter: comic.chapters[idx + 1] });
    }
  }, [readingChapter]);

  // --- Active filter count ---
  const activeFilterCount =
    (activeGenre !== "all" ? 1 : 0) +
    (activeStatus !== "all" ? 1 : 0) +
    (activeSource !== "all" ? 1 : 0);

  // =========================================================================
  // Comic Reader fullscreen overlay
  // =========================================================================
  if (readingChapter) {
    return (
      <div className="fixed inset-0 z-[70] bg-black flex flex-col">
        {/* Reader header */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#0f0f0f] border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={handleCloseReader}
              className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Close reader"
            >
              <X className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium text-white truncate">
              {readingChapter.comic.title}
            </span>
            <span className="text-xs text-white/40">
              {readingChapter.chapter.title}
            </span>
          </div>
          <RatingBadge rating={readingChapter.comic.rating} />
        </div>
        {/* ComicReader component */}
        <div className="flex-1 min-h-0">
          <ComicReader
            pages={generateMockPages(readingChapter.chapter.pages)}
            mode="scroll"
            currentPage={0}
            onChapterEnd={handleChapterEnd}
          />
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
            <BookOpen size={22} className="text-[#3ea6ff]" />
            漫画中心
          </h1>
          <span className="text-xs text-[#666]">
            {ALL_COMICS.length} 部漫画 · {SOURCE_PLATFORMS.length - 1} 个来源
          </span>
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
            placeholder="搜索漫画名称、作者、类型..."
            className="w-full h-9 pl-9 pr-20 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition"
          />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] transition ${
              showFilters || activeFilterCount > 0
                ? "bg-[#3ea6ff]/20 text-[#3ea6ff]"
                : "bg-[#2a2a2a] text-[#aaa] hover:text-white"
            }`}
          >
            <Filter size={11} />
            筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
        </div>

        {/* ===== Genre quick-select pills ===== */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
          {GENRES.map((g) => (
            <button
              key={g.id}
              onClick={() => setActiveGenre(g.id)}
              className={`px-4 py-1.5 rounded-full text-[13px] whitespace-nowrap border transition shrink-0 ${
                activeGenre === g.id
                  ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold"
                  : "bg-transparent text-[#aaa] border-[#333] hover:bg-[#2a2a2a] hover:text-white"
              }`}
            >
              {g.label}
            </button>
          ))}
          {/* Adult mode: show adult comics tab */}
          {ageGate.canAccess('NC-17') && (
            <a
              href="/zone/comics"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] whitespace-nowrap border transition shrink-0 bg-transparent text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
            >
              <Shield size={13} />
              成人漫画
            </a>
          )}
        </div>

        {/* ===== Expanded Filters ===== */}
        {showFilters && (
          <div className="mb-4 p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50 space-y-3">
            {/* Status filter */}
            <div>
              <p className="text-[11px] text-[#666] mb-2 flex items-center gap-1">
                <Clock size={11} /> 更新状态
              </p>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveStatus(s.id)}
                    className={`px-3 py-1 rounded-full text-[12px] border transition ${
                      activeStatus === s.id
                        ? "bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/40 font-medium"
                        : "bg-transparent text-[#888] border-[#333] hover:text-white hover:border-[#555]"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Source platform filter */}
            <div>
              <p className="text-[11px] text-[#666] mb-2 flex items-center gap-1">
                <Globe size={11} /> 来源平台
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SOURCE_PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActiveSource(p.id)}
                    className={`px-3 py-1 rounded-full text-[12px] border transition ${
                      activeSource === p.id
                        ? "bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/40 font-medium"
                        : "bg-transparent text-[#888] border-[#333] hover:text-white hover:border-[#555]"
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
                  setActiveGenre("all");
                  setActiveStatus("all");
                  setActiveSource("all");
                }}
                className="text-[11px] text-[#3ea6ff] hover:underline"
              >
                清除所有筛选
              </button>
            )}
          </div>
        )}

        {/* ===== Continue Reading Section ===== */}
        {continueReadingComics.length > 0 && !searchQuery && activeGenre === "all" && activeStatus === "all" && activeSource === "all" && (
          <div className="mb-6">
            <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <BookMarked size={16} className="text-[#3ea6ff]" />
              继续阅读
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {continueReadingComics.map(({ comic, bookmark }) => (
                <div
                  key={comic.id}
                  onClick={() => handleStartReading(comic)}
                  className="flex-shrink-0 w-[200px] flex gap-3 p-3 rounded-xl bg-[#1a1a1a] border border-[#333]/50 cursor-pointer hover:border-[#3ea6ff]/40 transition group"
                >
                  <div className="w-12 h-16 rounded-lg overflow-hidden bg-[#212121] shrink-0">
                    <img
                      src={comic.cover}
                      alt={comic.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-medium text-white truncate group-hover:text-[#3ea6ff] transition">
                      {comic.title}
                    </h3>
                    <p className="text-[10px] text-[#666] mt-0.5">
                      {bookmark.chapterId.replace("ch-", "第")}话 · 第{bookmark.page}页
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <Play size={8} className="text-[#3ea6ff]" />
                      <span className="text-[10px] text-[#3ea6ff]">继续</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== Active filter summary ===== */}
        {(activeGenre !== "all" || activeStatus !== "all" || activeSource !== "all" || searchQuery) && (
          <div className="flex items-center gap-2 mb-3 text-[12px] text-[#888]">
            <Filter size={12} />
            <span>
              {activeGenre !== "all" && `${activeGenre}`}
              {activeStatus !== "all" && ` · ${activeStatus}`}
              {activeSource !== "all" && ` · ${activeSource}`}
              {searchQuery && ` · "${searchQuery}"`}
            </span>
            <span className="text-[#555]">·</span>
            <span>{filteredComics.length} 个结果</span>
          </div>
        )}

        {/* ===== Comic Grid ===== */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
          {filteredComics.map((comic) => (
            <div
              key={comic.id}
              onClick={() => handleOpenComic(comic)}
              className="group cursor-pointer transition hover:-translate-y-1"
            >
              <div className="relative aspect-[3/4] bg-[#1a1a1a] rounded-xl overflow-hidden">
                <img
                  src={comic.cover}
                  alt={comic.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                {/* Source badge */}
                <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                  {comic.source}
                </span>
                {/* MPAA Rating badge */}
                <span className="absolute top-1.5 right-1.5">
                  <RatingBadge rating={comic.rating} />
                </span>
                {/* Bottom info */}
                <div className="absolute bottom-0 left-0 right-0 p-2 flex items-center justify-between">
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                      comic.status === "连载中"
                        ? "bg-[#3ea6ff] text-[#0f0f0f]"
                        : "bg-[#2ba640] text-white"
                    }`}
                  >
                    {comic.status}
                  </span>
                  <span className="text-[9px] text-white/80 flex items-center gap-0.5">
                    <Layers size={8} />
                    {comic.chapters.length}话
                  </span>
                </div>
              </div>
              <div className="pt-2">
                <h3 className="text-sm font-medium text-white line-clamp-1 group-hover:text-[#3ea6ff] transition">
                  {comic.title}
                </h3>
                <p className="text-[11px] text-[#8a8a8a] flex items-center gap-1 mt-0.5">
                  <User size={9} />
                  {comic.author}
                </p>
                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  {comic.genres.slice(0, 2).map((g) => (
                    <span
                      key={g}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-[#2a2a2a] text-[#888]"
                    >
                      {g}
                    </span>
                  ))}
                  <span className="text-[10px] text-[#555] flex items-center gap-0.5 ml-auto">
                    <Eye size={9} />
                    {fmtNum(comic.views)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ===== Empty state ===== */}
        {filteredComics.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <BookOpen size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">暂无匹配的漫画</p>
            <p className="text-xs mt-1 text-[#555]">
              尝试切换类型、状态或来源筛选
            </p>
          </div>
        )}
      </main>

      {/* ===== Comic Detail Modal ===== */}
      {selectedComic && (
        <ComicDetailModal
          comic={selectedComic}
          onClose={() => setSelectedComic(null)}
          onStartReading={handleStartReading}
        />
      )}
    </>
  );
}

// ===========================================================================
// Comic Detail Modal
// ===========================================================================

function ComicDetailModal({
  comic,
  onClose,
  onStartReading,
}: {
  comic: MockComic;
  onClose: () => void;
  onStartReading: (comic: MockComic, chapter?: ComicChapter) => void;
}) {
  const [showAllChapters, setShowAllChapters] = useState(false);
  const displayedChapters = showAllChapters
    ? comic.chapters
    : comic.chapters.slice(0, 20);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#141414] border border-[#333] rounded-t-2xl md:rounded-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#141414]/95 backdrop-blur-xl border-b border-[#333]/50 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-bold text-base truncate">{comic.title}</h2>
            <RatingBadge rating={comic.rating} />
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#212121] flex items-center justify-center text-[#8a8a8a] hover:text-white transition shrink-0 ml-3"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Comic info */}
        <div className="px-5 py-4 border-b border-[#333]/30">
          <div className="flex gap-4 mb-3">
            <div className="w-24 aspect-[3/4] rounded-xl overflow-hidden shrink-0 bg-[#212121]">
              <img
                src={comic.cover}
                alt={comic.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#aaa] mb-1.5 flex items-center gap-1">
                <User size={12} />
                {comic.author}
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <span
                  className={`text-[11px] px-2 py-0.5 rounded ${
                    comic.status === "连载中"
                      ? "bg-[#3ea6ff]/15 text-[#3ea6ff]"
                      : "bg-[#2ba640]/15 text-[#2ba640]"
                  }`}
                >
                  {comic.status}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-[#333] text-[#aaa] flex items-center gap-1">
                  <Layers size={10} />
                  {comic.chapters.length} 话
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-[#333] text-[#aaa] flex items-center gap-1">
                  <Eye size={10} />
                  {fmtNum(comic.views)} 阅读
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {comic.genres.map((g) => (
                  <span
                    key={g}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[#2a2a2a] text-[#888] flex items-center gap-0.5"
                  >
                    <Tag size={8} />
                    {g}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-[#666] flex items-center gap-1">
                <Globe size={10} />
                来源: {comic.source}
              </p>
            </div>
          </div>
          {comic.description && (
            <p className="text-sm text-[#8a8a8a] leading-relaxed">
              {comic.description}
            </p>
          )}
        </div>

        {/* Chapter list */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <Library size={14} className="text-[#3ea6ff]" />
              章节列表
            </h3>
            <span className="text-[11px] text-[#666]">
              更新于 {comic.lastUpdated}
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 mb-3">
            {displayedChapters.map((ch) => (
              <button
                key={ch.id}
                onClick={() => onStartReading(comic, ch)}
                className="px-2 py-2 rounded-lg bg-[#1a1a1a] border border-[#333]/50 text-[11px] text-[#aaa] hover:border-[#3ea6ff]/40 hover:text-[#3ea6ff] hover:bg-[#3ea6ff]/5 transition text-center truncate"
              >
                {ch.title}
              </button>
            ))}
          </div>

          {comic.chapters.length > 20 && (
            <button
              onClick={() => setShowAllChapters(!showAllChapters)}
              className="w-full py-2 text-center text-[12px] text-[#3ea6ff] hover:underline flex items-center justify-center gap-1"
            >
              {showAllChapters
                ? "收起"
                : `展开全部 ${comic.chapters.length} 话`}
              <ChevronRight
                size={12}
                className={`transition-transform ${showAllChapters ? "rotate-90" : ""}`}
              />
            </button>
          )}
        </div>

        {/* Bottom actions */}
        <div className="sticky bottom-0 bg-[#141414]/95 backdrop-blur-xl border-t border-[#333]/50 px-5 py-3 flex gap-2">
          <button
            onClick={() => onStartReading(comic)}
            className="flex-1 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition flex items-center justify-center gap-1.5"
          >
            <BookOpen size={16} />
            开始阅读
          </button>
          <button className="px-5 py-3 rounded-xl bg-[#212121] border border-[#333] text-sm text-[#aaa] hover:bg-[#2a2a2a] transition flex items-center gap-1.5">
            <Bookmark size={14} />
            收藏
          </button>
        </div>
      </div>
    </div>
  );
}
