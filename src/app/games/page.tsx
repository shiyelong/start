'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import GameCard from '@/components/games/GameCard';
import { ageGate } from '@/lib/age-gate';
import {
  Gamepad2, Search, SlidersHorizontal,
  Sparkles, Clock, ArrowUpDown, Globe,
} from 'lucide-react';
import type {
  GameCatalogItem,
  GamePlatform,
  GameGenre,
} from '@/components/games/GameCard';

/* ========================================================================= */
/*  Mock game catalog data                                                    */
/* ========================================================================= */

const MOCK_GAMES: GameCatalogItem[] = [
  // --- Web games (playable in browser) ---
  {
    id: '2048', name: '2048', cover: 'https://images.unsplash.com/photo-1611996575749-79a3a250f948?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '益智', rating: 'G', score: 4.5, popularity: 95,
    updatedAt: '2026-04-10', featured: true, playUrl: '/games/2048',
    description: '经典数字合并益智游戏，多模式挑战',
  },
  {
    id: 'tetris', name: '俄罗斯方块', cover: 'https://images.unsplash.com/photo-1577741314755-048d8525d31e?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '益智', rating: 'G', score: 4.7, popularity: 92,
    updatedAt: '2026-04-09', featured: true, playUrl: '/games/tetris',
    description: '经典方块消除，挑战你的极限',
  },
  {
    id: 'snake', name: '贪吃蛇', cover: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '休闲', rating: 'G', score: 4.2, popularity: 88,
    updatedAt: '2026-04-08', playUrl: '/games/snake',
    description: '经典贪吃蛇，简单上手',
  },
  {
    id: 'spaceshoot', name: '太空射击', cover: 'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=400&q=80',
    platforms: ['网页游戏', 'PC'], genre: '射击', rating: 'PG', score: 4.6, popularity: 90,
    updatedAt: '2026-04-10', featured: true, playUrl: '/games/spaceshoot',
    description: '弹幕射击打Boss，紧张刺激',
  },
  {
    id: 'match3', name: '宝石消消乐', cover: 'https://images.unsplash.com/photo-1551103782-8ab07afd45c1?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '益智', rating: 'G', score: 4.3, popularity: 85,
    updatedAt: '2026-04-07', playUrl: '/games/match3',
    description: '三消益智停不下来',
  },
  {
    id: 'tower', name: '塔防守卫', cover: 'https://images.unsplash.com/photo-1563207153-f403bf289096?w=400&q=80',
    platforms: ['网页游戏', 'PC'], genre: '塔防', rating: 'PG', score: 4.4, popularity: 82,
    updatedAt: '2026-04-06', playUrl: '/games/tower',
    description: '建塔防御怪物入侵',
  },
  {
    id: 'sudoku', name: '数独', cover: 'https://images.unsplash.com/photo-1580541832626-2a7131ee809f?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '解谜', rating: 'G', score: 4.1, popularity: 70,
    updatedAt: '2026-04-05', playUrl: '/games/sudoku',
    description: '经典9宫格逻辑推理',
  },
  {
    id: 'fishing', name: '钓鱼达人', cover: 'https://images.unsplash.com/photo-1504309092620-4d0ec726efa4?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '休闲', rating: 'G', score: 3.9, popularity: 60,
    updatedAt: '2026-03-28', playUrl: '/games/fishing',
    description: '休闲钓鱼收集图鉴',
  },
  {
    id: 'pokemon', name: '宠物大冒险', cover: 'https://images.unsplash.com/photo-1542779283-429940ce8336?w=400&q=80',
    platforms: ['网页游戏', 'PC', '手机'], genre: 'RPG', rating: 'PG', score: 4.8, popularity: 98,
    updatedAt: '2026-04-10', featured: true, playUrl: '/games/pokemon',
    description: '探索世界收集宠物回合制战斗',
  },
  {
    id: 'civilization', name: '文明崛起', cover: 'https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?w=400&q=80',
    platforms: ['网页游戏', 'PC'], genre: '策略', rating: 'PG', score: 4.7, popularity: 93,
    updatedAt: '2026-04-09', featured: true, playUrl: '/games/civilization',
    description: '4X策略建城征服世界',
  },
  {
    id: 'forest', name: '森林冒险', cover: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&q=80',
    platforms: ['网页游戏', 'PC'], genre: '动作', rating: 'PG', score: 4.5, popularity: 87,
    updatedAt: '2026-04-08', featured: true, playUrl: '/games/forest',
    description: '横版闯关探索神秘森林',
  },
  {
    id: 'huarong', name: '华容道', cover: 'https://images.unsplash.com/photo-1611996575749-79a3a250f948?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '解谜', rating: 'G', score: 4.0, popularity: 65,
    updatedAt: '2026-04-04', playUrl: '/games/huarong',
    description: '滑块解谜经典益智',
  },
  {
    id: 'logic', name: '逻辑推理', cover: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '解谜', rating: 'G', score: 4.2, popularity: 68,
    updatedAt: '2026-04-03', playUrl: '/games/logic',
    description: '烧脑逻辑谜题挑战',
  },
  // --- Multi-platform games (non-web) ---
  {
    id: 'zelda-totk', name: '塞尔达传说：王国之泪', cover: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80',
    platforms: ['NS'], genre: 'RPG', rating: 'PG', score: 4.9, popularity: 99,
    updatedAt: '2026-04-10', featured: true,
    description: '开放世界冒险，探索海拉鲁大陆',
  },
  {
    id: 'elden-ring', name: '艾尔登法环', cover: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=400&q=80',
    platforms: ['PC', 'PS', 'Xbox'], genre: '动作', rating: 'PG-13', score: 4.8, popularity: 97,
    updatedAt: '2026-04-09',
    description: '宫崎英高打造的开放世界动作RPG',
  },
  {
    id: 'gta6', name: 'GTA 6', cover: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&q=80',
    platforms: ['PC', 'PS', 'Xbox'], genre: '动作', rating: 'R', score: 4.9, popularity: 100,
    updatedAt: '2026-04-10',
    description: '开放世界犯罪动作游戏',
  },
  {
    id: 'mario-wonder', name: '超级马力欧惊奇', cover: 'https://images.unsplash.com/photo-1551103782-8ab07afd45c1?w=400&q=80',
    platforms: ['NS'], genre: '动作', rating: 'G', score: 4.7, popularity: 91,
    updatedAt: '2026-04-07',
    description: '经典横版过关，全新惊奇花机制',
  },
  {
    id: 'ff7-rebirth', name: '最终幻想7 重生', cover: 'https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?w=400&q=80',
    platforms: ['PS', 'PC'], genre: 'RPG', rating: 'PG-13', score: 4.6, popularity: 89,
    updatedAt: '2026-04-06',
    description: '经典JRPG重制，壮阔冒险旅程',
  },
  {
    id: 'palworld', name: '幻兽帕鲁', cover: 'https://images.unsplash.com/photo-1542779283-429940ce8336?w=400&q=80',
    platforms: ['PC', 'Xbox'], genre: '沙盒', rating: 'PG-13', score: 4.3, popularity: 86,
    updatedAt: '2026-04-05',
    description: '开放世界生存建造+宠物收集',
  },
  {
    id: 'fc25', name: 'EA FC 25', cover: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&q=80',
    platforms: ['PC', 'PS', 'Xbox', '手机'], genre: '体育', rating: 'G', score: 4.1, popularity: 84,
    updatedAt: '2026-04-04',
    description: '最新足球模拟游戏',
  },
  {
    id: 'civ7', name: '文明7', cover: 'https://images.unsplash.com/photo-1569003339405-ea396a5a8a90?w=400&q=80',
    platforms: ['PC', 'PS', 'Xbox', 'NS'], genre: '策略', rating: 'PG', score: 4.5, popularity: 83,
    updatedAt: '2026-04-03',
    description: '回合制策略经典续作',
  },
  {
    id: 'honor-of-kings', name: '王者荣耀', cover: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=400&q=80',
    platforms: ['手机'], genre: '策略', rating: 'PG', score: 4.4, popularity: 96,
    updatedAt: '2026-04-10',
    description: '5v5 MOBA竞技手游',
  },
  {
    id: 'genshin', name: '原神', cover: 'https://images.unsplash.com/photo-1542779283-429940ce8336?w=400&q=80',
    platforms: ['PC', '手机', 'PS'], genre: 'RPG', rating: 'PG', score: 4.5, popularity: 94,
    updatedAt: '2026-04-09',
    description: '开放世界冒险RPG',
  },
  {
    id: 'pubg-mobile', name: '和平精英', cover: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&q=80',
    platforms: ['手机'], genre: '射击', rating: 'PG-13', score: 4.2, popularity: 88,
    updatedAt: '2026-04-08',
    description: '战术竞技射击手游',
  },
  {
    id: 'chess', name: '国际象棋', cover: 'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400&q=80',
    platforms: ['网页游戏', 'PC', '手机'], genre: '棋牌', rating: 'G', score: 4.6, popularity: 75,
    updatedAt: '2026-04-02', playUrl: '/games/chess',
    description: '经典棋类对战，支持AI和在线对战',
  },
  {
    id: 'rhythm-master', name: '节奏大师', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '音乐', rating: 'G', score: 4.3, popularity: 72,
    updatedAt: '2026-04-01', playUrl: '/games/rhythm',
    description: '节奏游戏，多歌曲多难度',
  },
  {
    id: 'card-battle', name: '卡牌对决', cover: 'https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=400&q=80',
    platforms: ['网页游戏', 'PC', '手机'], genre: '卡牌', rating: 'PG', score: 4.1, popularity: 71,
    updatedAt: '2026-03-30', playUrl: '/games/cards',
    description: '收集卡牌组建卡组对战',
  },
  {
    id: 'racing-fury', name: '极速狂飙', cover: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=400&q=80',
    platforms: ['PC', 'PS', 'Xbox'], genre: '赛车', rating: 'PG', score: 4.4, popularity: 80,
    updatedAt: '2026-03-29',
    description: '高速赛车竞速，多赛道挑战',
  },
  {
    id: 'farm-sim', name: '开心农场', cover: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&q=80',
    platforms: ['网页游戏', '手机'], genre: '模拟经营', rating: 'G', score: 4.0, popularity: 67,
    updatedAt: '2026-03-25', playUrl: '/games/farm',
    description: '种田养殖经营你的农场',
  },
  {
    id: 'sandbox-world', name: '沙盒世界', cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80',
    platforms: ['PC', '手机'], genre: '沙盒', rating: 'PG', score: 4.3, popularity: 78,
    updatedAt: '2026-03-20',
    description: '2D沙盒建造，自由探索',
  },
];

/* ========================================================================= */
/*  Constants                                                                 */
/* ========================================================================= */

const PLATFORM_TABS: { id: GamePlatform | '全部'; label: string }[] = [
  { id: '全部', label: '全部' },
  { id: 'PC', label: 'PC' },
  { id: '手机', label: '手机' },
  { id: 'NS', label: 'NS' },
  { id: 'PS', label: 'PS' },
  { id: 'Xbox', label: 'Xbox' },
  { id: '网页游戏', label: '网页游戏' },
];

const GENRE_OPTIONS: { id: GameGenre | '全部'; label: string }[] = [
  { id: '全部', label: '全部类型' },
  { id: '益智', label: '益智' },
  { id: '策略', label: '策略' },
  { id: 'RPG', label: 'RPG' },
  { id: '动作', label: '动作' },
  { id: '模拟经营', label: '模拟经营' },
  { id: '赛车', label: '赛车' },
  { id: '卡牌', label: '卡牌' },
  { id: '解谜', label: '解谜' },
  { id: '音乐', label: '音乐' },
  { id: '塔防', label: '塔防' },
  { id: '沙盒', label: '沙盒' },
  { id: '体育', label: '体育' },
  { id: '棋牌', label: '棋牌' },
  { id: '射击', label: '射击' },
  { id: '休闲', label: '休闲' },
];

type SortOption = '热度' | '评分' | '最新' | '名称';

const SORT_OPTIONS: SortOption[] = ['热度', '评分', '最新', '名称'];

/* ========================================================================= */
/*  Page component                                                            */
/* ========================================================================= */

export default function GamesPage() {
  const router = useRouter();

  // Filter state
  const [platform, setPlatform] = useState<GamePlatform | '全部'>('全部');
  const [genre, setGenre] = useState<GameGenre | '全部'>('全部');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('热度');
  const [showSortMenu, setShowSortMenu] = useState(false);

  // AgeGate filtering — remove games above user's allowed rating
  const allowedGames = useMemo(() => {
    return ageGate.filterContent(MOCK_GAMES);
  }, []);

  // Featured games (from allowed set)
  const featuredGames = useMemo(() => {
    return allowedGames
      .filter((g) => g.featured)
      .sort((a, b) => b.popularity - a.popularity);
  }, [allowedGames]);

  // Recently updated games
  const recentGames = useMemo(() => {
    return [...allowedGames]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8);
  }, [allowedGames]);

  // Filtered + sorted game list
  const filteredGames = useMemo(() => {
    let list = [...allowedGames];

    // Platform filter
    if (platform !== '全部') {
      list = list.filter((g) => g.platforms.includes(platform));
    }

    // Genre filter
    if (genre !== '全部') {
      list = list.filter((g) => g.genre === genre);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.genre.toLowerCase().includes(q) ||
          g.description?.toLowerCase().includes(q)
      );
    }

    // Sort
    switch (sortBy) {
      case '热度':
        list.sort((a, b) => b.popularity - a.popularity);
        break;
      case '评分':
        list.sort((a, b) => b.score - a.score);
        break;
      case '最新':
        list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        break;
      case '名称':
        list.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
        break;
    }

    return list;
  }, [allowedGames, platform, genre, search, sortBy]);

  // Handle game card click
  const handleGameClick = (game: GameCatalogItem) => {
    if (game.playUrl) {
      router.push(game.playUrl);
    }
    // Non-web games: could show detail modal in the future
  };

  const isFiltering = platform !== '全部' || genre !== '全部' || search.trim() !== '';

  return (
    <>
      <Header />
      <main className="max-w-[1200px] mx-auto px-4 lg:px-6 py-6 pb-20 md:pb-8">
        {/* Page title */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gamepad2 size={24} className="text-[#3ea6ff]" />
            游戏中心
          </h1>
          <span className="text-xs text-[#8a8a8a]">
            {allowedGames.length} 款游戏
          </span>
        </div>
        <p className="text-[#8a8a8a] text-sm mb-6">
          手机电脑都能玩，随时随地开一局
        </p>

        {/* ===== Classic emulator + Homebrew quick links ===== */}
        <section className="mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href="/games/classic"
              className="group flex items-center gap-4 p-5 rounded-xl bg-gradient-to-br from-purple-600/20 to-blue-600/20 border border-purple-500/20 hover:border-[#3ea6ff]/40 hover:-translate-y-0.5 transition overflow-hidden"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-lg">
                <Gamepad2 size={24} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">经典主机模拟器</h3>
                <p className="text-xs text-[#8a8a8a] mt-1">
                  FC / SFC / GBA / 街机等11种经典主机，上传ROM在线畅玩
                </p>
              </div>
            </Link>
            <Link
              href="/games/homebrew"
              className="group flex items-center gap-4 p-5 rounded-xl bg-gradient-to-br from-green-600/20 to-cyan-600/20 border border-green-500/20 hover:border-[#3ea6ff]/40 hover:-translate-y-0.5 transition overflow-hidden"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-cyan-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-lg">
                <Globe size={24} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Homebrew NES 游戏</h3>
                <p className="text-xs text-[#8a8a8a] mt-1">
                  免费合法的自制NES游戏，下载ROM即可在浏览器中畅玩
                </p>
              </div>
            </Link>
          </div>
        </section>

        {/* ===== Featured section ===== */}
        {!isFiltering && featuredGames.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={18} className="text-[#f0b90b]" />
              <h2 className="text-lg font-bold">精选推荐</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {featuredGames.map((game) => (
                <div key={game.id} className="w-44 flex-shrink-0">
                  <GameCard game={game} onClick={handleGameClick} size="sm" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ===== Recently updated section ===== */}
        {!isFiltering && recentGames.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={18} className="text-[#3ea6ff]" />
              <h2 className="text-lg font-bold">最近更新</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {recentGames.map((game) => (
                <div key={game.id} className="w-44 flex-shrink-0">
                  <GameCard game={game} onClick={handleGameClick} size="sm" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ===== Filters section ===== */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={18} className="text-[#3ea6ff]" />
              <h2 className="text-lg font-bold">全部游戏</h2>
            </div>
          </div>

          {/* Search input */}
          <div className="relative mb-3">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索游戏名称..."
              className="w-full h-9 pl-9 pr-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition"
            />
          </div>

          {/* Platform tabs */}
          <div className="flex gap-1.5 mb-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {PLATFORM_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPlatform(tab.id)}
                className={`px-3 py-1.5 rounded-full text-[12px] whitespace-nowrap border transition shrink-0 ${
                  platform === tab.id
                    ? 'bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-semibold'
                    : 'bg-transparent text-[#aaa] border-[#333]/50 hover:bg-[#212121] hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Genre filter + Sort */}
          <div className="flex items-center gap-2 mb-5">
            {/* Genre dropdown */}
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value as GameGenre | '全部')}
              className="h-8 px-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-xs text-white outline-none focus:border-[#3ea6ff] transition appearance-none cursor-pointer"
            >
              {GENRE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Sort button */}
            <div className="relative ml-auto">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="flex items-center gap-1 h-8 px-3 bg-[#1a1a1a] border border-[#333] rounded-lg text-xs text-[#aaa] hover:text-white hover:border-[#3ea6ff] transition"
              >
                <ArrowUpDown size={12} />
                {sortBy}
              </button>
              {showSortMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowSortMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl overflow-hidden min-w-[100px]">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setSortBy(opt);
                          setShowSortMenu(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-xs transition ${
                          sortBy === opt
                            ? 'text-[#3ea6ff] bg-[#3ea6ff]/10'
                            : 'text-[#aaa] hover:text-white hover:bg-[#212121]'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Game grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filteredGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onClick={handleGameClick}
              />
            ))}
          </div>

          {/* Empty state */}
          {filteredGames.length === 0 && (
            <div className="text-center text-[#8a8a8a] py-16">
              <Gamepad2 size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-sm">没有找到匹配的游戏</p>
              <p className="text-xs mt-1">试试调整筛选条件</p>
            </div>
          )}

          {/* Stats */}
          <div className="mt-6 text-center text-[11px] text-[#666]">
            显示 {filteredGames.length} / {allowedGames.length} 款游戏
          </div>
        </section>
      </main>
    </>
  );
}
