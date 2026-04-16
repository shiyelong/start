'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import GameCard from '@/components/games/GameCard';
import { ageGate } from '@/lib/age-gate';
import {
  Gamepad2, Search, Crown, Swords, Spade,
  Crosshair, Puzzle, Brain, Castle, Landmark,
  Car, Music, Box, PawPrint, Trophy,
  Globe, Shield, Sparkles, Play, ChevronRight,
  Dices, Target, Fish, Cpu, Bike,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ========================================================================= */
/*  Game catalog — all self-developed playable web games                      */
/* ========================================================================= */

interface OurGame {
  slug: string;
  name: string;
  desc: string;
  icon: LucideIcon;
  category: CategoryId;
}

type CategoryId = 'board' | 'card' | 'action' | 'puzzle' | 'strategy' | 'sim';

interface Category {
  id: CategoryId;
  label: string;
  icon: LucideIcon;
  color: string;       // tailwind gradient from
  borderColor: string;
  iconBg: string;
}

const CATEGORIES: Category[] = [
  { id: 'board',    label: '棋类',     icon: Crown,     color: 'from-amber-500/20 to-orange-600/20',   borderColor: 'border-amber-500/20',   iconBg: 'bg-amber-500' },
  { id: 'card',     label: '牌类',     icon: Spade,     color: 'from-red-500/20 to-pink-600/20',       borderColor: 'border-red-500/20',     iconBg: 'bg-red-500' },
  { id: 'action',   label: '动作冒险', icon: Swords,    color: 'from-blue-500/20 to-indigo-600/20',    borderColor: 'border-blue-500/20',    iconBg: 'bg-blue-500' },
  { id: 'puzzle',   label: '益智休闲', icon: Puzzle,    color: 'from-green-500/20 to-emerald-600/20',  borderColor: 'border-green-500/20',   iconBg: 'bg-green-500' },
  { id: 'strategy', label: '策略',     icon: Brain,     color: 'from-purple-500/20 to-violet-600/20',  borderColor: 'border-purple-500/20',  iconBg: 'bg-purple-500' },
  { id: 'sim',      label: '模拟/其他', icon: Bike,     color: 'from-cyan-500/20 to-teal-600/20',      borderColor: 'border-cyan-500/20',    iconBg: 'bg-cyan-500' },
];

const ALL_GAMES: OurGame[] = [
  // 棋类
  { slug: 'xiangqi',         name: '中国象棋',   desc: '经典象棋AI对战',     icon: Crown,     category: 'board' },
  { slug: 'chess-intl',      name: '国际象棋',   desc: '经典国际象棋',       icon: Crown,     category: 'board' },
  { slug: 'go',              name: '围棋',       desc: '9/13/19路棋盘',      icon: Target,    category: 'board' },
  { slug: 'shogi',           name: '将棋',       desc: '日本象棋',           icon: Crown,     category: 'board' },
  { slug: 'checkers',        name: '国际跳棋',   desc: '强制吃子规则',       icon: Dices,     category: 'board' },
  { slug: 'chinese-checkers', name: '中国跳棋',  desc: '六角星棋盘',         icon: Dices,     category: 'board' },
  { slug: 'niuqi',           name: '憋死牛',     desc: '传统棋类',           icon: Crown,     category: 'board' },
  { slug: 'liubo',           name: '六博棋',     desc: '古代棋类',           icon: Landmark,  category: 'board' },

  // 牌类
  { slug: 'mahjong',         name: '麻将',       desc: '四人麻将',           icon: Spade,     category: 'card' },
  { slug: 'poker-texas',     name: '德州扑克',   desc: '经典德州',           icon: Spade,     category: 'card' },
  { slug: 'poker-stud',      name: '梭哈',       desc: '五张牌梭哈',         icon: Spade,     category: 'card' },
  { slug: 'blackjack',       name: '21点',       desc: '经典21点',           icon: Spade,     category: 'card' },
  { slug: 'baccarat',        name: '百家乐',     desc: '标准百家乐',         icon: Spade,     category: 'card' },
  { slug: 'zhajinhua',       name: '炸金花',     desc: '三张牌比大小',       icon: Spade,     category: 'card' },
  { slug: 'niuniu',          name: '牛牛',       desc: '经典牛牛',           icon: Spade,     category: 'card' },
  { slug: 'bigtwo',          name: '锄大D',      desc: '大老二',             icon: Spade,     category: 'card' },
  { slug: 'shisanzhang',     name: '十三张',     desc: '中国扑克',           icon: Spade,     category: 'card' },
  { slug: 'cards',           name: '卡牌对决',   desc: '收集卡牌对战',       icon: Cpu,       category: 'card' },

  // 动作冒险
  { slug: 'pixel-rpg',       name: '像素RPG',    desc: '像素风角色扮演',     icon: Swords,    category: 'action' },
  { slug: 'spaceshoot',      name: '太空射击',   desc: '弹幕射击',           icon: Crosshair, category: 'action' },
  { slug: 'mecha',           name: '机甲城堡',   desc: '横版动作闯关',       icon: Castle,    category: 'action' },
  { slug: 'forest',          name: '森林冒险',   desc: '横版探索',           icon: Swords,    category: 'action' },
  { slug: 'escape',          name: '密室逃脱',   desc: '解谜逃脱',           icon: Puzzle,    category: 'action' },
  { slug: 'shadow',          name: '暗影忍者',   desc: '忍者动作',           icon: Swords,    category: 'action' },
  { slug: 'shooter',         name: '枪战精英',   desc: '射击游戏',           icon: Crosshair, category: 'action' },

  // 益智休闲
  { slug: 'tetris',          name: '俄罗斯方块', desc: '经典方块消除',       icon: Puzzle,    category: 'puzzle' },
  { slug: '2048',            name: '2048',       desc: '数字合并',           icon: Dices,     category: 'puzzle' },
  { slug: 'snake',           name: '贪吃蛇',     desc: '经典贪吃蛇',         icon: Puzzle,    category: 'puzzle' },
  { slug: 'match3',          name: '宝石消消乐', desc: '三消益智',           icon: Sparkles,  category: 'puzzle' },
  { slug: 'sudoku',          name: '数独',       desc: '逻辑推理',           icon: Brain,     category: 'puzzle' },
  { slug: 'huarong',         name: '华容道',     desc: '滑块解谜',           icon: Puzzle,    category: 'puzzle' },
  { slug: 'logic',           name: '逻辑推理',   desc: '烧脑谜题',           icon: Brain,     category: 'puzzle' },
  { slug: 'fishing',         name: '钓鱼达人',   desc: '休闲钓鱼',           icon: Fish,      category: 'puzzle' },

  // 策略
  { slug: 'tower-defense',   name: '塔防守卫',   desc: '建塔防御',           icon: Castle,    category: 'strategy' },
  { slug: 'tower',           name: '塔防战争',   desc: '策略塔防',           icon: Castle,    category: 'strategy' },
  { slug: 'tactics',         name: '战术策略',   desc: '回合制战术',         icon: Brain,     category: 'strategy' },
  { slug: 'civilization',    name: '文明崛起',   desc: '4X策略',             icon: Landmark,  category: 'strategy' },

  // 模拟/其他
  { slug: 'soccer',          name: '足球',       desc: '足球游戏',           icon: Trophy,    category: 'sim' },
  { slug: 'racing',          name: '赛车',       desc: '竞速赛车',           icon: Car,       category: 'sim' },
  { slug: 'rhythm',          name: '节奏大师',   desc: '音乐节奏',           icon: Music,     category: 'sim' },
  { slug: 'sandbox',         name: '沙盒世界',   desc: '自由建造',           icon: Box,       category: 'sim' },
  { slug: 'pokemon',         name: '宠物大冒险', desc: '宠物收集RPG',        icon: PawPrint,  category: 'sim' },
];

const FEATURED_SLUGS = ['tetris', 'xiangqi', 'mahjong', 'poker-texas'];

/* ========================================================================= */
/*  Page component                                                            */
/* ========================================================================= */

export default function GamesPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryId | 'all'>('all');
  const tabsRef = useRef<HTMLDivElement>(null);

  // Scroll active tab into view
  useEffect(() => {
    if (!tabsRef.current) return;
    const active = tabsRef.current.querySelector('[data-active="true"]');
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeCategory]);

  // Featured games
  const featuredGames = useMemo(
    () => ALL_GAMES.filter((g) => FEATURED_SLUGS.includes(g.slug)),
    []
  );

  // Filter games by search + category
  const filteredGames = useMemo(() => {
    let list = ALL_GAMES;
    if (activeCategory !== 'all') {
      list = list.filter((g) => g.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.desc.toLowerCase().includes(q) ||
          g.slug.toLowerCase().includes(q)
      );
    }
    return list;
  }, [search, activeCategory]);

  // Group by category for "all" view
  const gamesByCategory = useMemo(() => {
    const map = new Map<CategoryId, OurGame[]>();
    for (const cat of CATEGORIES) {
      map.set(cat.id, filteredGames.filter((g) => g.category === cat.id));
    }
    return map;
  }, [filteredGames]);

  // Category game counts
  const categoryCounts = useMemo(() => {
    const counts = new Map<CategoryId, number>();
    for (const cat of CATEGORIES) {
      counts.set(cat.id, ALL_GAMES.filter((g) => g.category === cat.id).length);
    }
    return counts;
  }, []);

  const isSearching = search.trim() !== '';

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0f0f0f] text-white">
        <div className="max-w-[1200px] mx-auto px-4 lg:px-6 pt-6 pb-24 md:pb-8">

          {/* Page header */}
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Gamepad2 size={24} className="text-[#3ea6ff]" />
              游戏中心
            </h1>
            <span className="text-xs text-[#8a8a8a]">
              {ALL_GAMES.length} 款自研游戏
            </span>
          </div>
          <p className="text-[#8a8a8a] text-sm mb-5">
            全部在线可玩，手机电脑随时开一局
          </p>

          {/* ===== Featured banner ===== */}
          <section className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-[#f0b90b]" />
              <h2 className="text-base font-bold">热门推荐</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {featuredGames.map((game) => {
                const cat = CATEGORIES.find((c) => c.id === game.category)!;
                return (
                  <Link
                    key={game.slug}
                    href={`/games/${game.slug}`}
                    className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${cat.color} border ${cat.borderColor} hover:border-[#3ea6ff]/50 hover:-translate-y-0.5 transition-all p-4`}
                  >
                    <div className={`w-10 h-10 rounded-xl ${cat.iconBg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-lg`}>
                      <game.icon size={20} className="text-white" />
                    </div>
                    <h3 className="font-semibold text-sm text-white group-hover:text-[#3ea6ff] transition-colors">
                      {game.name}
                    </h3>
                    <p className="text-[11px] text-[#8a8a8a] mt-1">{game.desc}</p>
                    <div className="mt-3 flex items-center gap-1 text-[11px] text-[#3ea6ff] font-medium">
                      <Play size={12} />
                      开始游戏
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* ===== Classic emulator + Homebrew quick links ===== */}
          <section className="mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link
                href="/games/classic"
                className="group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-purple-600/20 to-blue-600/20 border border-purple-500/20 hover:border-[#3ea6ff]/40 hover:-translate-y-0.5 transition overflow-hidden"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-lg">
                  <Gamepad2 size={20} className="text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm">经典主机模拟器</h3>
                  <p className="text-[11px] text-[#8a8a8a] mt-0.5">
                    FC / SFC / GBA / 街机等经典主机，上传ROM在线畅玩
                  </p>
                </div>
              </Link>
              <Link
                href="/games/homebrew"
                className="group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-green-600/20 to-cyan-600/20 border border-green-500/20 hover:border-[#3ea6ff]/40 hover:-translate-y-0.5 transition overflow-hidden"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-cyan-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-lg">
                  <Globe size={20} className="text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm">Homebrew NES 游戏</h3>
                  <p className="text-[11px] text-[#8a8a8a] mt-0.5">
                    免费合法的自制NES游戏，下载ROM即可在浏览器中畅玩
                  </p>
                </div>
              </Link>
            </div>
          </section>

          {/* ===== Search bar ===== */}
          <div className="relative mb-4">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索游戏名称..."
              className="w-full h-11 pl-10 pr-4 bg-[#1a1a1a] border border-[#333] rounded-xl text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition"
            />
          </div>

          {/* ===== Sticky category tabs ===== */}
          <div className="sticky top-0 z-30 bg-[#0f0f0f]/95 backdrop-blur-sm -mx-4 px-4 py-2">
            <div
              ref={tabsRef}
              className="flex gap-2 overflow-x-auto scrollbar-hide pb-1"
            >
              <button
                data-active={activeCategory === 'all'}
                onClick={() => setActiveCategory('all')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs whitespace-nowrap border transition shrink-0 min-h-[44px] ${
                  activeCategory === 'all'
                    ? 'bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-bold'
                    : 'bg-transparent text-[#aaa] border-[#333]/60 hover:bg-[#1a1a1a] hover:text-white'
                }`}
              >
                <Gamepad2 size={14} />
                全部
                <span className="text-[10px] opacity-70">{ALL_GAMES.length}</span>
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  data-active={activeCategory === cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs whitespace-nowrap border transition shrink-0 min-h-[44px] ${
                    activeCategory === cat.id
                      ? 'bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-bold'
                      : 'bg-transparent text-[#aaa] border-[#333]/60 hover:bg-[#1a1a1a] hover:text-white'
                  }`}
                >
                  <cat.icon size={14} />
                  {cat.label}
                  <span className="text-[10px] opacity-70">{categoryCounts.get(cat.id)}</span>
                </button>
              ))}

              {/* Adult games tab */}
              {ageGate.canAccess('NC-17') && (
                <a
                  href="/zone/games"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs whitespace-nowrap border transition shrink-0 min-h-[44px] bg-transparent text-red-400 border-red-500/30 hover:bg-red-500/10"
                >
                  <Shield size={14} />
                  成人游戏
                </a>
              )}
            </div>
          </div>

          {/* ===== Game sections ===== */}
          <div className="mt-4 space-y-8">
            {activeCategory === 'all' && !isSearching ? (
              /* Show all categories with headers */
              CATEGORIES.map((cat) => {
                const games = gamesByCategory.get(cat.id) || [];
                if (games.length === 0) return null;
                return (
                  <section key={cat.id} id={`cat-${cat.id}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-7 h-7 rounded-lg ${cat.iconBg} flex items-center justify-center`}>
                        <cat.icon size={14} className="text-white" />
                      </div>
                      <h2 className="text-base font-bold">{cat.label}</h2>
                      <span className="text-[11px] text-[#666]">{games.length}款</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {games.map((game) => (
                        <GameCardInline key={game.slug} game={game} />
                      ))}
                    </div>
                  </section>
                );
              })
            ) : (
              /* Filtered view — flat grid */
              <>
                {filteredGames.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filteredGames.map((game) => (
                      <GameCardInline key={game.slug} game={game} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-[#8a8a8a] py-16">
                    <Gamepad2 size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="text-sm">没有找到匹配的游戏</p>
                    <p className="text-xs mt-1">试试调整搜索关键词或分类</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Stats footer */}
          <div className="mt-8 text-center text-[11px] text-[#666]">
            显示 {filteredGames.length} / {ALL_GAMES.length} 款游戏
          </div>

          {/* ===== Adult Games Section ===== */}
          {ageGate.canAccess('NC-17') && (
            <section className="mt-10">
              <div className="flex items-center gap-2 mb-4">
                <Shield size={18} className="text-[#ff6b6b]" />
                <h2 className="text-base font-bold text-[#ff6b6b]">成人游戏</h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-400 font-semibold">NC-17</span>
              </div>
              <Link
                href="/zone/games"
                className="group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-red-900/20 to-pink-900/20 border border-red-500/20 hover:border-red-500/40 hover:-translate-y-0.5 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-lg">
                  <Gamepad2 size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-white group-hover:text-[#ff6b6b] transition">进入成人游戏专区</h3>
                  <p className="text-[11px] text-[#8a8a8a] mt-0.5">RPG、模拟、格斗等成人向游戏内容</p>
                </div>
                <ChevronRight size={18} className="text-red-400/50 shrink-0" />
              </Link>
            </section>
          )}
        </div>
      </main>
    </>
  );
}

/* ========================================================================= */
/*  Inline game card for self-developed games                                 */
/* ========================================================================= */

function GameCardInline({ game }: { game: OurGame }) {
  const cat = CATEGORIES.find((c) => c.id === game.category)!;
  const Icon = game.icon;

  return (
    <Link
      href={`/games/${game.slug}`}
      className="group flex flex-col rounded-xl bg-[#1a1a1a] border border-[#333] hover:border-[#3ea6ff]/50 hover:-translate-y-0.5 transition-all overflow-hidden"
    >
      {/* Icon area */}
      <div className={`relative h-24 bg-gradient-to-br ${cat.color} flex items-center justify-center`}>
        <div className={`w-12 h-12 rounded-xl ${cat.iconBg}/80 flex items-center justify-center group-hover:scale-110 transition-transform`}>
          <Icon size={24} className="text-white" />
        </div>
        {/* Category badge */}
        <span className="absolute top-2 left-2 text-[9px] px-1.5 py-0.5 rounded bg-black/40 text-white/70 font-medium">
          {cat.label}
        </span>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        <h3 className="text-sm font-semibold text-white group-hover:text-[#3ea6ff] transition-colors truncate">
          {game.name}
        </h3>
        <p className="text-[11px] text-[#8a8a8a] mt-1 line-clamp-1">{game.desc}</p>

        {/* CTA button */}
        <div className="mt-auto pt-3">
          <span className="flex items-center justify-center gap-1 w-full py-2 rounded-lg bg-[#3ea6ff]/10 text-[#3ea6ff] text-xs font-medium group-hover:bg-[#3ea6ff]/20 transition min-h-[44px]">
            <Play size={14} />
            开始游戏
          </span>
        </div>
      </div>
    </Link>
  );
}
