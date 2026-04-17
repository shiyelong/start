'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { ageGate } from '@/lib/age-gate';
import {
  Gamepad2, Search, Crown, Swords, Spade,
  Crosshair, Puzzle, Brain, Castle, Landmark,
  Car, Music, Box, PawPrint, Trophy,
  Globe, Shield, Sparkles, Play, ChevronRight,
  Dices, Target, Fish, Cpu, Bike,
  Monitor, Smartphone, ExternalLink, Flame,
  Joystick,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ========================================================================= */
/*  Types                                                                     */
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
  color: string;
  borderColor: string;
  iconBg: string;
}

type TabId = 'all' | 'online' | 'pc' | 'console' | 'mobile';

interface WebSource {
  name: string;
  url: string;
  desc: string;
  icon: LucideIcon;
  tags: string[];
}

interface PCSource {
  name: string;
  url: string;
  desc: string;
  icon: LucideIcon;
  size?: string;
}

interface ConsoleSource {
  name: string;
  url: string;
  desc: string;
  platform: string;
  icon: LucideIcon;
}

interface MobileSource {
  name: string;
  url: string;
  desc: string;
  icon: LucideIcon;
}

/* ========================================================================= */
/*  Tabs                                                                      */
/* ========================================================================= */

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'all',     label: '全部',     icon: Gamepad2 },
  { id: 'online',  label: '在线游戏', icon: Globe },
  { id: 'pc',      label: 'PC游戏',   icon: Monitor },
  { id: 'console', label: '主机游戏', icon: Joystick },
  { id: 'mobile',  label: '手游',     icon: Smartphone },
];

/* ========================================================================= */
/*  Game catalog — all self-developed playable web games                      */
/* ========================================================================= */

const CATEGORIES: Category[] = [
  { id: 'board',    label: '棋类',     icon: Crown,   color: 'from-amber-500/20 to-orange-600/20',  borderColor: 'border-amber-500/20',  iconBg: 'bg-amber-500' },
  { id: 'card',     label: '牌类',     icon: Spade,   color: 'from-red-500/20 to-pink-600/20',      borderColor: 'border-red-500/20',    iconBg: 'bg-red-500' },
  { id: 'action',   label: '动作冒险', icon: Swords,  color: 'from-blue-500/20 to-indigo-600/20',   borderColor: 'border-blue-500/20',   iconBg: 'bg-blue-500' },
  { id: 'puzzle',   label: '益智休闲', icon: Puzzle,  color: 'from-green-500/20 to-emerald-600/20', borderColor: 'border-green-500/20',  iconBg: 'bg-green-500' },
  { id: 'strategy', label: '策略',     icon: Brain,   color: 'from-purple-500/20 to-violet-600/20', borderColor: 'border-purple-500/20', iconBg: 'bg-purple-500' },
  { id: 'sim',      label: '模拟/其他', icon: Bike,   color: 'from-cyan-500/20 to-teal-600/20',     borderColor: 'border-cyan-500/20',   iconBg: 'bg-cyan-500' },
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
/*  External source data                                                      */
/* ========================================================================= */

const WEB_GAME_SOURCES: WebSource[] = [
  { name: '4399小游戏',  url: 'https://www.4399.com',       desc: '经典Flash/H5小游戏平台', icon: Globe, tags: ['休闲','益智','动作'] },
  { name: '7k7k小游戏',  url: 'https://www.7k7k.com',       desc: '热门H5网页游戏',         icon: Globe, tags: ['休闲','冒险'] },
  { name: '3366小游戏',  url: 'https://www.3366.com',       desc: '腾讯旗下小游戏平台',     icon: Globe, tags: ['休闲','竞技'] },
  { name: 'Y8 Games',    url: 'https://www.y8.com',         desc: '全球最大H5游戏平台',     icon: Globe, tags: ['H5','多人'] },
  { name: 'CrazyGames',  url: 'https://www.crazygames.com', desc: '高质量浏览器游戏',       icon: Globe, tags: ['3D','多人'] },
  { name: 'Poki',        url: 'https://poki.com',           desc: '免费在线游戏平台',       icon: Globe, tags: ['休闲','跑酷'] },
  { name: 'Miniclip',    url: 'https://www.miniclip.com',   desc: '经典网页游戏',           icon: Globe, tags: ['体育','动作'] },
  { name: 'Armor Games', url: 'https://armorgames.com',     desc: '独立游戏平台',           icon: Globe, tags: ['策略','RPG'] },
  { name: 'Kongregate',  url: 'https://www.kongregate.com', desc: '独立开发者游戏',         icon: Globe, tags: ['独立','创意'] },
  { name: '游侠网页游',  url: 'https://www.ali213.net/webgame/', desc: '游侠网页游戏频道',  icon: Globe, tags: ['RPG','策略'] },
];

const ADULT_WEB_SOURCES: WebSource[] = [
  { name: 'F95zone',      url: 'https://f95zone.to',            desc: '成人游戏社区',   icon: Shield, tags: ['RPG','视觉小说'] },
  { name: 'Nutaku',       url: 'https://www.nutaku.net',        desc: '成人游戏平台',   icon: Shield, tags: ['动作','策略'] },
  { name: 'DLsite',       url: 'https://www.dlsite.com',        desc: '日本同人游戏',   icon: Shield, tags: ['同人','RPG'] },
  { name: 'Itch.io NSFW', url: 'https://itch.io/games/nsfw',    desc: '独立成人游戏',   icon: Shield, tags: ['独立','创意'] },
];

const PC_GAME_SOURCES: PCSource[] = [
  { name: 'Steam',           url: 'https://store.steampowered.com', desc: '全球最大PC游戏平台', icon: Monitor, size: '免费客户端' },
  { name: 'Epic Games',      url: 'https://store.epicgames.com',    desc: '每周免费游戏',       icon: Monitor, size: '免费客户端' },
  { name: 'GOG',             url: 'https://www.gog.com',            desc: 'DRM-Free游戏商店',   icon: Monitor, size: '免费客户端' },
  { name: 'EA App',          url: 'https://www.ea.com/ea-app',      desc: 'EA游戏平台',         icon: Monitor, size: '免费客户端' },
  { name: 'Ubisoft Connect', url: 'https://ubisoftconnect.com',     desc: '育碧游戏平台',       icon: Monitor, size: '免费客户端' },
  { name: 'Battle.net',      url: 'https://battle.net',             desc: '暴雪游戏平台',       icon: Monitor, size: '免费客户端' },
  { name: 'Xbox PC',         url: 'https://www.xbox.com/games/pc',  desc: 'Xbox PC游戏',        icon: Monitor, size: 'Game Pass' },
  { name: '游侠网',          url: 'https://www.ali213.net',         desc: 'PC游戏资讯/下载',    icon: Monitor },
  { name: '3DM',             url: 'https://www.3dmgame.com',        desc: 'PC游戏资讯/MOD',     icon: Monitor },
  { name: '游民星空',        url: 'https://www.gamersky.com',       desc: '游戏资讯/攻略',      icon: Monitor },
];

const CONSOLE_SOURCES: ConsoleSource[] = [
  { name: 'PlayStation Store', url: 'https://store.playstation.com',            desc: 'PS4/PS5游戏商店', platform: 'PS',      icon: Gamepad2 },
  { name: 'Xbox Store',       url: 'https://www.xbox.com/games',               desc: 'Xbox游戏商店',    platform: 'Xbox',    icon: Gamepad2 },
  { name: 'Nintendo eShop',   url: 'https://www.nintendo.com/store/games',     desc: 'Switch游戏商店',  platform: 'Switch',  icon: Gamepad2 },
  { name: 'Xbox Game Pass',   url: 'https://www.xbox.com/xbox-game-pass',      desc: '订阅制游戏库',    platform: 'Xbox/PC', icon: Gamepad2 },
  { name: 'PS Plus',          url: 'https://www.playstation.com/ps-plus/',      desc: 'PS会员游戏库',    platform: 'PS',      icon: Gamepad2 },
  { name: 'Nintendo Online',  url: 'https://www.nintendo.com/switch/online/',   desc: 'Switch在线会员',  platform: 'Switch',  icon: Gamepad2 },
];

const MOBILE_SOURCES: MobileSource[] = [
  { name: 'TapTap',      url: 'https://www.taptap.cn',                          desc: '高品质手游社区',   icon: Smartphone },
  { name: '好游快爆',    url: 'https://www.3839.com',                            desc: '手游推荐/下载',   icon: Smartphone },
  { name: '豌豆荚',      url: 'https://www.wandoujia.com',                       desc: '安卓应用商店',    icon: Smartphone },
  { name: 'APKPure',     url: 'https://apkpure.com',                             desc: 'APK下载平台',     icon: Smartphone },
  { name: 'QooApp',      url: 'https://www.qoo-app.com',                         desc: '日韩手游下载',    icon: Smartphone },
  { name: 'App Store',   url: 'https://apps.apple.com/cn/charts/iphone/games',   desc: 'iOS游戏排行',     icon: Smartphone },
  { name: 'Google Play', url: 'https://play.google.com/store/games',             desc: '安卓游戏商店',    icon: Smartphone },
];

/* ========================================================================= */
/*  Page component                                                            */
/* ========================================================================= */

export default function GamesPage() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const tabsRef = useRef<HTMLDivElement>(null);

  /* scroll active tab into view */
  useEffect(() => {
    if (!tabsRef.current) return;
    const el = tabsRef.current.querySelector('[data-active="true"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeTab]);

  const q = search.trim().toLowerCase();

  /* featured games */
  const featuredGames = useMemo(
    () => ALL_GAMES.filter((g) => FEATURED_SLUGS.includes(g.slug)),
    [],
  );

  /* filter our games by search */
  const filteredOurGames = useMemo(() => {
    if (!q) return ALL_GAMES;
    return ALL_GAMES.filter(
      (g) => g.name.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q) || g.slug.includes(q),
    );
  }, [q]);

  /* group by category */
  const gamesByCategory = useMemo(() => {
    const map = new Map<CategoryId, OurGame[]>();
    for (const cat of CATEGORIES) map.set(cat.id, filteredOurGames.filter((g) => g.category === cat.id));
    return map;
  }, [filteredOurGames]);

  /* filter external sources by search */
  const filterSources = <T extends { name: string; desc: string }>(list: T[]): T[] => {
    if (!q) return list;
    return list.filter((s) => s.name.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q));
  };

  const filteredWebSources = useMemo(() => filterSources(WEB_GAME_SOURCES), [q]);
  const filteredAdultWebSources = useMemo(() => filterSources(ADULT_WEB_SOURCES), [q]);
  const filteredPCSources = useMemo(() => filterSources(PC_GAME_SOURCES), [q]);
  const filteredConsoleSources = useMemo(() => filterSources(CONSOLE_SOURCES), [q]);
  const filteredMobileSources = useMemo(() => filterSources(MOBILE_SOURCES), [q]);

  /* visibility helpers */
  const showOurGames    = activeTab === 'all' || activeTab === 'online';
  const showWebGames    = activeTab === 'all' || activeTab === 'online';
  const showPC          = activeTab === 'all' || activeTab === 'pc';
  const showConsole     = activeTab === 'all' || activeTab === 'console';
  const showMobile      = activeTab === 'all' || activeTab === 'mobile';
  const showClassic     = activeTab === 'all';

  /* total count for stats */
  const totalShown =
    (showOurGames ? filteredOurGames.length : 0) +
    (showWebGames ? filteredWebSources.length : 0) +
    (showPC ? filteredPCSources.length : 0) +
    (showConsole ? filteredConsoleSources.length : 0) +
    (showMobile ? filteredMobileSources.length : 0);

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0f0f0f] text-white">
        <div className="max-w-[1200px] mx-auto px-4 lg:px-6 pt-6 pb-24 md:pb-8">

          {/* ===== Page header ===== */}
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Gamepad2 size={24} className="text-[#3ea6ff]" />
              游戏中心
            </h1>
            <span className="text-xs text-[#8a8a8a]">
              {ALL_GAMES.length} 款自研 + 多平台聚合
            </span>
          </div>
          <p className="text-[#8a8a8a] text-sm mb-5">
            自研游戏在线畅玩，全网游戏平台一站直达
          </p>

          {/* ===== Featured banner ===== */}
          <section className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Flame size={16} className="text-[#f0b90b]" />
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

          {/* ===== Search bar ===== */}
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索游戏、平台..."
              className="w-full h-11 pl-10 pr-4 bg-[#1a1a1a] border border-[#333] rounded-xl text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition"
            />
          </div>

          {/* ===== Sticky tab bar ===== */}
          <div className="sticky top-0 z-30 bg-[#0f0f0f]/95 backdrop-blur-sm -mx-4 px-4 py-2">
            <div ref={tabsRef} className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  data-active={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs whitespace-nowrap border transition shrink-0 min-h-[44px] ${
                    activeTab === tab.id
                      ? 'bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-bold'
                      : 'bg-transparent text-[#aaa] border-[#333]/60 hover:bg-[#1a1a1a] hover:text-white'
                  }`}
                >
                  <tab.icon size={14} />
                  {tab.label}
                </button>
              ))}

              {/* Adult games zone link */}
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

          {/* ===== Content sections ===== */}
          <div className="mt-4 space-y-10">

            {/* --- Section: 自研游戏 --- */}
            {showOurGames && filteredOurGames.length > 0 && (
              <div>
                <SectionHeader icon={Gamepad2} iconBg="bg-[#3ea6ff]" title="自研游戏" subtitle={`${filteredOurGames.length}款在线可玩`} />
                {q ? (
                  /* flat grid when searching */
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filteredOurGames.map((g) => <GameCardInline key={g.slug} game={g} />)}
                  </div>
                ) : (
                  /* grouped by category */
                  <div className="space-y-6">
                    {CATEGORIES.map((cat) => {
                      const games = gamesByCategory.get(cat.id) || [];
                      if (games.length === 0) return null;
                      return (
                        <div key={cat.id}>
                          <div className="flex items-center gap-2 mb-3">
                            <div className={`w-7 h-7 rounded-lg ${cat.iconBg} flex items-center justify-center`}>
                              <cat.icon size={14} className="text-white" />
                            </div>
                            <h3 className="text-sm font-bold">{cat.label}</h3>
                            <span className="text-[11px] text-[#666]">{games.length}款</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {games.map((g) => <GameCardInline key={g.slug} game={g} />)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* --- Section: 网页游戏聚合 --- */}
            {showWebGames && filteredWebSources.length > 0 && (
              <div>
                <SectionHeader icon={Globe} iconBg="bg-emerald-500" title="网页游戏聚合" subtitle="热门H5/网页游戏平台" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredWebSources.map((s) => (
                    <ExternalSourceCard key={s.name} name={s.name} url={s.url} desc={s.desc} icon={s.icon} tags={s.tags} />
                  ))}
                </div>

                {/* Adult web sources */}
                {ageGate.canAccess('NC-17') && filteredAdultWebSources.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield size={16} className="text-red-400" />
                      <h3 className="text-sm font-bold text-red-400">成人网页游戏</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-400 font-semibold">NC-17</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredAdultWebSources.map((s) => (
                        <ExternalSourceCard key={s.name} name={s.name} url={s.url} desc={s.desc} icon={s.icon} tags={s.tags} adult />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* --- Section: PC游戏下载 --- */}
            {showPC && filteredPCSources.length > 0 && (
              <div>
                <SectionHeader icon={Monitor} iconBg="bg-blue-500" title="PC游戏下载" subtitle="PC平台/资讯站" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredPCSources.map((s) => (
                    <PCSourceCard key={s.name} source={s} />
                  ))}
                </div>
              </div>
            )}

            {/* --- Section: 主机游戏 --- */}
            {showConsole && filteredConsoleSources.length > 0 && (
              <div>
                <SectionHeader icon={Joystick} iconBg="bg-purple-500" title="主机游戏" subtitle="PS / Xbox / Switch" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredConsoleSources.map((s) => (
                    <ConsoleSourceCard key={s.name} source={s} />
                  ))}
                </div>
              </div>
            )}

            {/* --- Section: 手游下载 --- */}
            {showMobile && filteredMobileSources.length > 0 && (
              <div>
                <SectionHeader icon={Smartphone} iconBg="bg-orange-500" title="手游下载" subtitle="手游平台/应用商店" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredMobileSources.map((s) => (
                    <MobileSourceCard key={s.name} source={s} />
                  ))}
                </div>
              </div>
            )}

            {/* --- Section: 经典模拟器 + Homebrew --- */}
            {showClassic && (
              <div>
                <SectionHeader icon={Sparkles} iconBg="bg-indigo-500" title="经典模拟器 / Homebrew" subtitle="怀旧经典" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Link
                    href="/games/classic"
                    className="group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-purple-600/20 to-blue-600/20 border border-purple-500/20 hover:border-[#3ea6ff]/40 hover:-translate-y-0.5 transition overflow-hidden"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-lg">
                      <Gamepad2 size={20} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm">经典主机模拟器</h3>
                      <p className="text-[11px] text-[#8a8a8a] mt-0.5">FC / SFC / GBA / 街机等经典主机，上传ROM在线畅玩</p>
                    </div>
                    <ChevronRight size={18} className="text-[#3ea6ff]/50 shrink-0" />
                  </Link>
                  <Link
                    href="/games/homebrew"
                    className="group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-green-600/20 to-cyan-600/20 border border-green-500/20 hover:border-[#3ea6ff]/40 hover:-translate-y-0.5 transition overflow-hidden"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-cyan-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-lg">
                      <Globe size={20} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm">Homebrew NES 游戏</h3>
                      <p className="text-[11px] text-[#8a8a8a] mt-0.5">免费合法的自制NES游戏，下载ROM即可在浏览器中畅玩</p>
                    </div>
                    <ChevronRight size={18} className="text-[#3ea6ff]/50 shrink-0" />
                  </Link>
                </div>
              </div>
            )}

            {/* --- Adult Games Section --- */}
            {ageGate.canAccess('NC-17') && activeTab === 'all' && (
              <section>
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

            {/* Empty state */}
            {totalShown === 0 && (
              <div className="text-center text-[#8a8a8a] py-16">
                <Search size={48} className="mx-auto mb-4 opacity-20" />
                <p className="text-sm">没有找到匹配的结果</p>
                <p className="text-xs mt-1">试试调整搜索关键词或切换分类</p>
              </div>
            )}
          </div>

          {/* Stats footer */}
          <div className="mt-8 text-center text-[11px] text-[#666]">
            当前显示 {totalShown} 个结果
          </div>
        </div>
      </main>
    </>
  );
}

/* ========================================================================= */
/*  Sub-components                                                            */
/* ========================================================================= */

function SectionHeader({ icon: Icon, iconBg, title, subtitle }: { icon: LucideIcon; iconBg: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
        <Icon size={16} className="text-white" />
      </div>
      <div>
        <h2 className="text-base font-bold leading-tight">{title}</h2>
        <p className="text-[11px] text-[#8a8a8a]">{subtitle}</p>
      </div>
    </div>
  );
}

/* --- Our game card --- */
function GameCardInline({ game }: { game: OurGame }) {
  const cat = CATEGORIES.find((c) => c.id === game.category)!;
  const Icon = game.icon;
  return (
    <Link
      href={`/games/${game.slug}`}
      className="group flex flex-col rounded-xl bg-[#1a1a1a] border border-[#333] hover:border-[#3ea6ff]/50 hover:-translate-y-0.5 transition-all overflow-hidden"
    >
      <div className={`relative h-24 bg-gradient-to-br ${cat.color} flex items-center justify-center`}>
        <div className={`w-12 h-12 rounded-xl ${cat.iconBg}/80 flex items-center justify-center group-hover:scale-110 transition-transform`}>
          <Icon size={24} className="text-white" />
        </div>
        <span className="absolute top-2 left-2 text-[9px] px-1.5 py-0.5 rounded bg-black/40 text-white/70 font-medium">
          {cat.label}
        </span>
      </div>
      <div className="p-3 flex flex-col flex-1">
        <h3 className="text-sm font-semibold text-white group-hover:text-[#3ea6ff] transition-colors truncate">{game.name}</h3>
        <p className="text-[11px] text-[#8a8a8a] mt-1 line-clamp-1">{game.desc}</p>
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

/* --- External web source card --- */
function ExternalSourceCard({ name, url, desc, icon: Icon, tags, adult }: { name: string; url: string; desc: string; icon: LucideIcon; tags: string[]; adult?: boolean }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex items-start gap-3 p-4 rounded-xl bg-[#1a1a1a] border hover:-translate-y-0.5 transition-all ${
        adult ? 'border-red-500/20 hover:border-red-500/40' : 'border-[#333] hover:border-[#3ea6ff]/50'
      }`}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${adult ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
        <Icon size={18} className={adult ? 'text-red-400' : 'text-emerald-400'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className={`text-sm font-semibold truncate group-hover:transition ${adult ? 'group-hover:text-red-400' : 'group-hover:text-[#3ea6ff]'}`}>{name}</h3>
          <ExternalLink size={12} className="text-[#666] shrink-0" />
        </div>
        <p className="text-[11px] text-[#8a8a8a] mt-0.5">{desc}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {tags.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[#252525] text-[#888]">
              {t}
            </span>
          ))}
        </div>
      </div>
      <span className={`shrink-0 flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-medium min-h-[44px] transition ${
        adult
          ? 'bg-red-500/10 text-red-400 group-hover:bg-red-500/20'
          : 'bg-[#3ea6ff]/10 text-[#3ea6ff] group-hover:bg-[#3ea6ff]/20'
      }`}>
        访问
      </span>
    </a>
  );
}

/* --- PC source card --- */
function PCSourceCard({ source }: { source: PCSource }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 p-4 rounded-xl bg-[#1a1a1a] border border-[#333] hover:border-[#3ea6ff]/50 hover:-translate-y-0.5 transition-all"
    >
      <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
        <source.icon size={18} className="text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold truncate group-hover:text-[#3ea6ff] transition">{source.name}</h3>
          <ExternalLink size={12} className="text-[#666] shrink-0" />
        </div>
        <p className="text-[11px] text-[#8a8a8a] mt-0.5">{source.desc}</p>
        {source.size && (
          <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 mt-1.5">{source.size}</span>
        )}
      </div>
      <span className="shrink-0 flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-medium bg-[#3ea6ff]/10 text-[#3ea6ff] group-hover:bg-[#3ea6ff]/20 transition min-h-[44px]">
        访问
      </span>
    </a>
  );
}

/* --- Console source card --- */
function ConsoleSourceCard({ source }: { source: ConsoleSource }) {
  const platformColors: Record<string, string> = {
    PS: 'bg-blue-600/15 text-blue-400',
    Xbox: 'bg-green-600/15 text-green-400',
    Switch: 'bg-red-600/15 text-red-400',
    'Xbox/PC': 'bg-green-600/15 text-green-400',
  };
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 p-4 rounded-xl bg-[#1a1a1a] border border-[#333] hover:border-[#3ea6ff]/50 hover:-translate-y-0.5 transition-all"
    >
      <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
        <source.icon size={18} className="text-purple-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold truncate group-hover:text-[#3ea6ff] transition">{source.name}</h3>
          <ExternalLink size={12} className="text-[#666] shrink-0" />
        </div>
        <p className="text-[11px] text-[#8a8a8a] mt-0.5">{source.desc}</p>
        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded mt-1.5 ${platformColors[source.platform] || 'bg-[#252525] text-[#888]'}`}>
          {source.platform}
        </span>
      </div>
      <span className="shrink-0 flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-medium bg-[#3ea6ff]/10 text-[#3ea6ff] group-hover:bg-[#3ea6ff]/20 transition min-h-[44px]">
        访问
      </span>
    </a>
  );
}

/* --- Mobile source card --- */
function MobileSourceCard({ source }: { source: MobileSource }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 p-4 rounded-xl bg-[#1a1a1a] border border-[#333] hover:border-[#3ea6ff]/50 hover:-translate-y-0.5 transition-all"
    >
      <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
        <source.icon size={18} className="text-orange-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold truncate group-hover:text-[#3ea6ff] transition">{source.name}</h3>
          <ExternalLink size={12} className="text-[#666] shrink-0" />
        </div>
        <p className="text-[11px] text-[#8a8a8a] mt-0.5">{source.desc}</p>
      </div>
      <span className="shrink-0 flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-medium bg-[#3ea6ff]/10 text-[#3ea6ff] group-hover:bg-[#3ea6ff]/20 transition min-h-[44px]">
        访问
      </span>
    </a>
  );
}
