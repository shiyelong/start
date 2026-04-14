"use client";

import { useState, useMemo, useCallback } from "react";
import Header from "@/components/Header";
import RatingBadge from "@/components/ui/RatingBadge";
import NovelReader from "@/components/reader/NovelReader";
import type { ContentRating } from "@/lib/types";
import {
  BookText,
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
  Volume2,
  FileText,
  PenLine,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NovelChapter {
  id: string;
  title: string;
  wordCount: number;
  date: string;
}

interface MockNovel {
  id: string;
  title: string;
  cover: string;
  author: string;
  genres: string[];
  status: "连载中" | "已完结";
  source: string;
  sourceId: string;
  rating: ContentRating;
  chapters: NovelChapter[];
  totalWords: number;
  views: number;
  description: string;
  lastUpdated: string;
}

interface NovelBookmark {
  novelId: string;
  chapterId: string;
  position: number;
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
  { id: "玄幻", label: "玄幻" },
  { id: "都市", label: "都市" },
  { id: "科幻", label: "科幻" },
  { id: "历史", label: "历史" },
  { id: "言情", label: "言情" },
  { id: "武侠", label: "武侠" },
  { id: "仙侠", label: "仙侠" },
  { id: "悬疑", label: "悬疑" },
  { id: "恐怖", label: "恐怖" },
  { id: "游戏", label: "游戏" },
  { id: "体育", label: "体育" },
];

const STATUS_OPTIONS: FilterOption[] = [
  { id: "all", label: "全部状态" },
  { id: "连载中", label: "连载中" },
  { id: "已完结", label: "已完结" },
];

const SOURCE_PLATFORMS: FilterOption[] = [
  { id: "all", label: "全部来源" },
  { id: "笔趣阁", label: "笔趣阁" },
  { id: "69书吧", label: "69书吧" },
  { id: "全本小说网", label: "全本小说网" },
  { id: "Novel Updates", label: "Novel Updates" },
  { id: "起点中文网", label: "起点中文网" },
  { id: "纵横中文网", label: "纵横中文网" },
];

// ---------------------------------------------------------------------------
// Mock novel data
// ---------------------------------------------------------------------------

function makeChapters(count: number): NovelChapter[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ch-${i + 1}`,
    title: `第${i + 1}章`,
    wordCount: Math.floor(Math.random() * 3000) + 2000,
    date: `2026-0${Math.min(4, Math.floor(i / 50) + 1)}-${String(((i * 3) % 28) + 1).padStart(2, "0")}`,
  }));
}

const ALL_NOVELS: MockNovel[] = [
  {
    id: "n-1", title: "星域征途", cover: "https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=300&q=80",
    author: "银河笔客", genres: ["科幻", "玄幻"], status: "连载中", source: "笔趣阁", sourceId: "biquge",
    rating: "PG-13", chapters: makeChapters(892), totalWords: 1860000,
    views: 32000000, description: "2340年，人类踏入星际时代。退役军人陈锋意外获得远古文明遗物，卷入银河系最大的阴谋之中。",
    lastUpdated: "2026-04-10",
  },
  {
    id: "n-2", title: "九天剑帝", cover: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&q=80",
    author: "剑舞苍穹", genres: ["玄幻", "仙侠"], status: "连载中", source: "起点中文网", sourceId: "qidian",
    rating: "PG-13", chapters: makeChapters(1560), totalWords: 3200000,
    views: 58000000, description: "少年林逸身怀废脉，被家族驱逐。偶得上古剑帝传承，从此踏上逆天修炼之路，剑斩苍穹。",
    lastUpdated: "2026-04-10",
  },
  {
    id: "n-3", title: "重生之都市仙尊", cover: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&q=80",
    author: "墨染青衫", genres: ["都市", "仙侠"], status: "已完结", source: "69书吧", sourceId: "69shu",
    rating: "PG-13", chapters: makeChapters(1203), totalWords: 2450000,
    views: 41000000, description: "修仙界大能渡劫失败，重生回到都市少年时代。这一世，他要弥补所有遗憾，站在世界之巅。",
    lastUpdated: "2026-03-15",
  },
  {
    id: "n-4", title: "锦绣医妃", cover: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=300&q=80",
    author: "浅墨轻烟", genres: ["言情", "历史"], status: "已完结", source: "全本小说网", sourceId: "quanben",
    rating: "PG", chapters: makeChapters(956), totalWords: 1980000,
    views: 62000000, description: "现代女医生穿越成将军府废材嫡女，凭借医术和智慧，在后宅争斗中步步为营，收获真爱。",
    lastUpdated: "2026-02-20",
  },
  {
    id: "n-5", title: "诡秘档案", cover: "https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=300&q=80",
    author: "深渊观察者", genres: ["悬疑", "都市"], status: "连载中", source: "笔趣阁", sourceId: "biquge",
    rating: "R", chapters: makeChapters(743), totalWords: 1560000,
    views: 28000000, description: "刑警队长接手一桩离奇失踪案，随着调查深入，他发现这座城市隐藏着一个存在了百年的秘密组织。",
    lastUpdated: "2026-04-09",
  },
  {
    id: "n-6", title: "大唐风华录", cover: "https://images.unsplash.com/photo-1596727147705-61a532a659bd?w=300&q=80",
    author: "长安故人", genres: ["历史", "武侠"], status: "连载中", source: "纵横中文网", sourceId: "zongheng",
    rating: "PG", chapters: makeChapters(1024), totalWords: 2100000,
    views: 19000000, description: "开元盛世，一个落魄书生凭借超前的见识，在长安城中搅动风云，见证大唐最辉煌的时代。",
    lastUpdated: "2026-04-08",
  },
  {
    id: "n-7", title: "剑来", cover: "https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?w=300&q=80",
    author: "烽火戏诸侯", genres: ["武侠", "仙侠"], status: "已完结", source: "起点中文网", sourceId: "qidian",
    rating: "PG-13", chapters: makeChapters(2800), totalWords: 5800000,
    views: 120000000, description: "少年陈平安出身贫寒小镇，一步步走出小镇，行走天下，以一把剑问道苍天。",
    lastUpdated: "2025-12-01",
  },
  {
    id: "n-8", title: "全球游戏：开局百亿灵能", cover: "https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?w=300&q=80",
    author: "氪金大佬", genres: ["游戏", "玄幻"], status: "连载中", source: "69书吧", sourceId: "69shu",
    rating: "PG-13", chapters: makeChapters(810), totalWords: 1670000,
    views: 24000000, description: "全球进入游戏时代，林凡开局获得百亿灵能点，当别人还在新手村挣扎时，他已经碾压全服。",
    lastUpdated: "2026-04-10",
  },
  {
    id: "n-9", title: "午夜凶铃", cover: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&q=80",
    author: "暗夜行者", genres: ["恐怖", "悬疑"], status: "已完结", source: "全本小说网", sourceId: "quanben",
    rating: "R", chapters: makeChapters(420), totalWords: 890000,
    views: 15000000, description: "每到午夜十二点，手机都会收到一条来自未知号码的短信。看过短信的人，都会在七天后离奇死亡。",
    lastUpdated: "2026-01-30",
  },
  {
    id: "n-10", title: "凡人修仙传", cover: "https://images.unsplash.com/photo-1611457194403-d3f8c5154dc2?w=300&q=80",
    author: "忘语", genres: ["仙侠", "玄幻"], status: "已完结", source: "Novel Updates", sourceId: "novelupdates",
    rating: "PG", chapters: makeChapters(2446), totalWords: 7440000,
    views: 250000000, description: "一个普通山村少年韩立，偶然踏入修仙之途，历经无数艰险，最终成就仙道传奇。",
    lastUpdated: "2025-08-15",
  },
  {
    id: "n-11", title: "篮球之神", cover: "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=300&q=80",
    author: "热血灌篮", genres: ["体育", "都市"], status: "连载中", source: "纵横中文网", sourceId: "zongheng",
    rating: "G", chapters: makeChapters(560), totalWords: 1120000,
    views: 8500000, description: "穿越到平行世界的篮球天才，从街头球场打到NBA总决赛的热血传奇。",
    lastUpdated: "2026-04-07",
  },
  {
    id: "n-12", title: "诡秘之主", cover: "https://images.unsplash.com/photo-1601850494422-3cf14624b0b3?w=300&q=80",
    author: "爱潜水的乌贼", genres: ["玄幻", "悬疑"], status: "已完结", source: "笔趣阁", sourceId: "biquge",
    rating: "PG-13", chapters: makeChapters(1432), totalWords: 3980000,
    views: 180000000, description: "穿越到蒸汽与超凡并存的世界，克莱恩踏上了一条诡秘的晋升之路。",
    lastUpdated: "2025-06-20",
  },
  {
    id: "n-13", title: "斗破苍穹", cover: "https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=300&q=80",
    author: "天蚕土豆", genres: ["玄幻", "仙侠"], status: "已完结", source: "起点中文网", sourceId: "qidian",
    rating: "PG", chapters: makeChapters(1648), totalWords: 5300000,
    views: 350000000, description: "三十年河东三十年河西，莫欺少年穷！萧炎从废柴到斗帝的逆袭之路。",
    lastUpdated: "2025-03-10",
  },
  {
    id: "n-14", title: "庆余年", cover: "https://images.unsplash.com/photo-1596727147705-61a532a659bd?w=300&q=80",
    author: "猫腻", genres: ["历史", "武侠"], status: "已完结", source: "Novel Updates", sourceId: "novelupdates",
    rating: "PG-13", chapters: makeChapters(746), totalWords: 3560000,
    views: 95000000, description: "范闲从澹州走向京都，在权谋与阴谋中寻找母亲的真相，改变这个世界。",
    lastUpdated: "2025-01-05",
  },
  {
    id: "n-15", title: "天官赐福", cover: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=300&q=80",
    author: "墨香铜臭", genres: ["言情", "玄幻"], status: "已完结", source: "全本小说网", sourceId: "quanben",
    rating: "PG-13", chapters: makeChapters(244), totalWords: 1050000,
    views: 78000000, description: "仙乐国太子谢怜三次飞升三次被贬，八百年后再次飞升，与神秘鬼王花城相遇。",
    lastUpdated: "2025-04-18",
  },
];

// ---------------------------------------------------------------------------
// Mock bookmarks (continue reading)
// ---------------------------------------------------------------------------

const MOCK_BOOKMARKS: NovelBookmark[] = [
  { novelId: "n-1", chapterId: "ch-850", position: 3200, lastRead: "2026-04-10" },
  { novelId: "n-5", chapterId: "ch-720", position: 1500, lastRead: "2026-04-09" },
  { novelId: "n-2", chapterId: "ch-1400", position: 800, lastRead: "2026-04-08" },
];

// ---------------------------------------------------------------------------
// Mock chapter content for reader
// ---------------------------------------------------------------------------

function generateMockContent(): string {
  const paragraphs = [
    "深空站的警报声划破了寂静。陈锋从冷冻舱中醒来，眼前的全息屏幕上闪烁着刺眼的红色警告。",
    "「未知能量波动检测——距离：0.3光年——威胁等级：S」",
    "他揉了揉太阳穴，冷冻休眠的后遗症让他的大脑还有些迟钝。但多年的军旅生涯让他的身体比意识更快地做出了反应——他已经穿好了作战服，手指搭在了控制台上。",
    "窗外是无尽的星海，银河的光芒在远处静静流淌。这片宇宙看起来如此平静，但陈锋知道，平静之下往往隐藏着最致命的危险。",
    "「舰长，能量波动源正在接近，预计三十分钟后到达有效探测范围。」AI助手的声音在耳边响起，冷静而精确。",
    "陈锋深吸一口气，目光变得锐利。他打开了全舰广播：「全体注意，一级战备。这不是演习。」",
    "走廊里响起了急促的脚步声，船员们从各自的休眠舱中醒来，迅速奔向各自的战位。这艘「破晓号」巡洋舰虽然只是一艘中型战舰，但船上的每一个人都是经历过星际战争的老兵。",
    "「距离目标还有二十五分钟。」AI继续播报。",
    "陈锋调出了战术地图，一个巨大的红色光点正在以超光速向他们逼近。根据能量特征分析，这不是任何已知文明的飞船。",
    "「未知文明……」他喃喃自语，手指不自觉地摸向了胸前的那枚古老吊坠。那是他在一次考古任务中发现的远古遗物，上面刻着谁也看不懂的符文。",
    "就在这时，吊坠突然发出了微弱的蓝光。陈锋低头看去，那些古老的符文正在缓缓旋转，仿佛在回应着什么。",
    "「这是……」他瞪大了眼睛。在他服役的二十年里，这枚吊坠从未有过任何反应。",
    "全息屏幕上的红色光点突然停了下来，就悬停在距离他们0.1光年的位置。然后，一道强烈的光束穿透了虚空，直直地照射在「破晓号」上。",
    "警报声变得更加刺耳。但奇怪的是，那道光束并没有造成任何伤害。相反，它似乎在扫描着什么。",
    "陈锋胸前的吊坠光芒大盛，整个舰桥都被蓝色的光芒笼罩。符文从吊坠上飞出，在空中组成了一行行文字。",
    "那是一种他从未见过的语言，但不知为何，他竟然能够理解其中的含义。",
    "「继承者已确认。远古协议启动。银河守护者权限开放。」",
  ];
  return paragraphs.join("\n\n");
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

function fmtWords(n: number): string {
  if (n >= 10_000) return (n / 10_000).toFixed(0) + "万字";
  return n + "字";
}

// ===========================================================================
// Main Page Component
// ===========================================================================

export default function NovelsPage() {
  // --- Filter state ---
  const [searchQuery, setSearchQuery] = useState("");
  const [activeGenre, setActiveGenre] = useState("all");
  const [activeStatus, setActiveStatus] = useState("all");
  const [activeSource, setActiveSource] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  // --- Detail / Reader state ---
  const [selectedNovel, setSelectedNovel] = useState<MockNovel | null>(null);
  const [readingChapter, setReadingChapter] = useState<{
    novel: MockNovel;
    chapter: NovelChapter;
  } | null>(null);

  // --- Bookmarks ---
  const [bookmarks] = useState<NovelBookmark[]>(MOCK_BOOKMARKS);

  // --- Filtered novels ---
  const filteredNovels = useMemo(() => {
    let list = ALL_NOVELS;

    if (activeGenre !== "all") {
      list = list.filter((n) => n.genres.includes(activeGenre));
    }
    if (activeStatus !== "all") {
      list = list.filter((n) => n.status === activeStatus);
    }
    if (activeSource !== "all") {
      list = list.filter((n) => n.source === activeSource);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.author.toLowerCase().includes(q) ||
          n.genres.some((g) => g.includes(q))
      );
    }

    return list;
  }, [activeGenre, activeStatus, activeSource, searchQuery]);

  // --- Continue reading novels ---
  const continueReadingNovels = useMemo(() => {
    return bookmarks
      .map((bm) => {
        const novel = ALL_NOVELS.find((n) => n.id === bm.novelId);
        if (!novel) return null;
        return { novel, bookmark: bm };
      })
      .filter(Boolean) as { novel: MockNovel; bookmark: NovelBookmark }[];
  }, [bookmarks]);

  // --- Handlers ---
  const handleOpenNovel = useCallback((novel: MockNovel) => {
    setSelectedNovel(novel);
  }, []);

  const handleStartReading = useCallback(
    (novel: MockNovel, chapter?: NovelChapter) => {
      const ch = chapter ?? novel.chapters[0];
      if (ch) {
        setReadingChapter({ novel, chapter: ch });
        setSelectedNovel(null);
      }
    },
    []
  );

  const handleCloseReader = useCallback(() => {
    setReadingChapter(null);
  }, []);

  const handleChapterEnd = useCallback(() => {
    if (!readingChapter) return;
    const { novel, chapter } = readingChapter;
    const idx = novel.chapters.findIndex((ch) => ch.id === chapter.id);
    if (idx < novel.chapters.length - 1) {
      setReadingChapter({ novel, chapter: novel.chapters[idx + 1] });
    }
  }, [readingChapter]);

  // --- Active filter count ---
  const activeFilterCount =
    (activeGenre !== "all" ? 1 : 0) +
    (activeStatus !== "all" ? 1 : 0) +
    (activeSource !== "all" ? 1 : 0);

  // =========================================================================
  // Novel Reader fullscreen overlay
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
              {readingChapter.novel.title}
            </span>
            <span className="text-xs text-white/40">
              {readingChapter.chapter.title}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/30 flex items-center gap-1">
              <Volume2 size={10} />
              TTS
            </span>
            <RatingBadge rating={readingChapter.novel.rating} />
          </div>
        </div>
        {/* NovelReader component */}
        <div className="flex-1 min-h-0">
          <NovelReader
            content={generateMockContent()}
            title={`${readingChapter.novel.title} - ${readingChapter.chapter.title}`}
            mode="scroll"
            fontSize={18}
            theme="dark"
            onChapterEnd={handleChapterEnd}
            onBookmark={(pos) => {
              console.log("Bookmarked at position:", pos);
            }}
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
            <BookText size={22} className="text-[#3ea6ff]" />
            小说中心
          </h1>
          <span className="text-xs text-[#666]">
            {ALL_NOVELS.length} 部小说 · {SOURCE_PLATFORMS.length - 1} 个来源
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
            placeholder="搜索小说名称、作者、类型..."
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
        {continueReadingNovels.length > 0 && !searchQuery && activeGenre === "all" && activeStatus === "all" && activeSource === "all" && (
          <div className="mb-6">
            <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <BookMarked size={16} className="text-[#3ea6ff]" />
              继续阅读
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {continueReadingNovels.map(({ novel, bookmark }) => (
                <div
                  key={novel.id}
                  onClick={() => handleStartReading(novel)}
                  className="flex-shrink-0 w-[220px] flex gap-3 p-3 rounded-xl bg-[#1a1a1a] border border-[#333]/50 cursor-pointer hover:border-[#3ea6ff]/40 transition group"
                >
                  <div className="w-12 h-16 rounded-lg overflow-hidden bg-[#212121] shrink-0">
                    <img
                      src={novel.cover}
                      alt={novel.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-medium text-white truncate group-hover:text-[#3ea6ff] transition">
                      {novel.title}
                    </h3>
                    <p className="text-[10px] text-[#666] mt-0.5">
                      第{bookmark.chapterId.replace("ch-", "")}章
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
            <span>{filteredNovels.length} 个结果</span>
          </div>
        )}

        {/* ===== Novel Grid ===== */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
          {filteredNovels.map((novel) => (
            <div
              key={novel.id}
              onClick={() => handleOpenNovel(novel)}
              className="group cursor-pointer transition hover:-translate-y-1"
            >
              <div className="relative aspect-[3/4] bg-[#1a1a1a] rounded-xl overflow-hidden">
                <img
                  src={novel.cover}
                  alt={novel.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                {/* Source badge */}
                <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                  {novel.source}
                </span>
                {/* MPAA Rating badge */}
                <span className="absolute top-1.5 right-1.5">
                  <RatingBadge rating={novel.rating} />
                </span>
                {/* Bottom info */}
                <div className="absolute bottom-0 left-0 right-0 p-2 flex items-center justify-between">
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                      novel.status === "连载中"
                        ? "bg-[#3ea6ff] text-[#0f0f0f]"
                        : "bg-[#2ba640] text-white"
                    }`}
                  >
                    {novel.status}
                  </span>
                  <span className="text-[9px] text-white/80 flex items-center gap-0.5">
                    <FileText size={8} />
                    {fmtWords(novel.totalWords)}
                  </span>
                </div>
              </div>
              <div className="pt-2">
                <h3 className="text-sm font-medium text-white line-clamp-1 group-hover:text-[#3ea6ff] transition">
                  {novel.title}
                </h3>
                <p className="text-[11px] text-[#8a8a8a] flex items-center gap-1 mt-0.5">
                  <PenLine size={9} />
                  {novel.author}
                </p>
                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  {novel.genres.slice(0, 2).map((g) => (
                    <span
                      key={g}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-[#2a2a2a] text-[#888]"
                    >
                      {g}
                    </span>
                  ))}
                  <span className="text-[10px] text-[#555] flex items-center gap-0.5 ml-auto">
                    <Layers size={9} />
                    {novel.chapters.length}章
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ===== Empty state ===== */}
        {filteredNovels.length === 0 && (
          <div className="text-center text-[#8a8a8a] py-20">
            <BookText size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">暂无匹配的小说</p>
            <p className="text-xs mt-1 text-[#555]">
              尝试切换类型、状态或来源筛选
            </p>
          </div>
        )}
      </main>

      {/* ===== Novel Detail Modal ===== */}
      {selectedNovel && (
        <NovelDetailModal
          novel={selectedNovel}
          onClose={() => setSelectedNovel(null)}
          onStartReading={handleStartReading}
        />
      )}
    </>
  );
}

// ===========================================================================
// Novel Detail Modal
// ===========================================================================

function NovelDetailModal({
  novel,
  onClose,
  onStartReading,
}: {
  novel: MockNovel;
  onClose: () => void;
  onStartReading: (novel: MockNovel, chapter?: NovelChapter) => void;
}) {
  const [showAllChapters, setShowAllChapters] = useState(false);
  const displayedChapters = showAllChapters
    ? novel.chapters
    : novel.chapters.slice(0, 20);

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
            <h2 className="font-bold text-base truncate">{novel.title}</h2>
            <RatingBadge rating={novel.rating} />
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#212121] flex items-center justify-center text-[#8a8a8a] hover:text-white transition shrink-0 ml-3"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Novel info */}
        <div className="px-5 py-4 border-b border-[#333]/30">
          <div className="flex gap-4 mb-3">
            <div className="w-24 aspect-[3/4] rounded-xl overflow-hidden shrink-0 bg-[#212121]">
              <img
                src={novel.cover}
                alt={novel.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#aaa] mb-1.5 flex items-center gap-1">
                <PenLine size={12} />
                {novel.author}
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <span
                  className={`text-[11px] px-2 py-0.5 rounded ${
                    novel.status === "连载中"
                      ? "bg-[#3ea6ff]/15 text-[#3ea6ff]"
                      : "bg-[#2ba640]/15 text-[#2ba640]"
                  }`}
                >
                  {novel.status}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-[#333] text-[#aaa] flex items-center gap-1">
                  <Layers size={10} />
                  {novel.chapters.length} 章
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-[#333] text-[#aaa] flex items-center gap-1">
                  <FileText size={10} />
                  {fmtWords(novel.totalWords)}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-[#333] text-[#aaa] flex items-center gap-1">
                  <Eye size={10} />
                  {fmtNum(novel.views)} 阅读
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {novel.genres.map((g) => (
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
                来源: {novel.source}
              </p>
            </div>
          </div>
          {novel.description && (
            <p className="text-sm text-[#8a8a8a] leading-relaxed">
              {novel.description}
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
              更新于 {novel.lastUpdated}
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 mb-3">
            {displayedChapters.map((ch) => (
              <button
                key={ch.id}
                onClick={() => onStartReading(novel, ch)}
                className="px-2 py-2 rounded-lg bg-[#1a1a1a] border border-[#333]/50 text-[11px] text-[#aaa] hover:border-[#3ea6ff]/40 hover:text-[#3ea6ff] hover:bg-[#3ea6ff]/5 transition text-center truncate"
              >
                {ch.title}
              </button>
            ))}
          </div>

          {novel.chapters.length > 20 && (
            <button
              onClick={() => setShowAllChapters(!showAllChapters)}
              className="w-full py-2 text-center text-[12px] text-[#3ea6ff] hover:underline flex items-center justify-center gap-1"
            >
              {showAllChapters
                ? "收起"
                : `展开全部 ${novel.chapters.length} 章`}
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
            onClick={() => onStartReading(novel)}
            className="flex-1 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition flex items-center justify-center gap-1.5"
          >
            <BookText size={16} />
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
