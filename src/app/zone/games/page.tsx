'use client';

import { useState, useMemo } from 'react';
import Header from '@/components/Header';
import Link from 'next/link';
import { ageGate } from '@/lib/age-gate';
import {
  Lock, Search, Filter, Gamepad2, Sword, Building2, Zap,
  Layers, Puzzle, Heart, Shirt, Box, Crosshair, SlidersHorizontal,
  Flame, Star, CalendarDays, Shuffle, ChevronDown, ChevronUp, X,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────
interface GameEntry {
  id: string;
  title: string;
  type: string;
  tags: string[];
  style: string;
  language: string;
  playable: boolean;
  href: string;
  icon: React.ReactNode;
  source: 'self' | 'external';
  rating: number;
  cover: string;
  desc: string;
}

// ─── Game Data ───────────────────────────────────────────
const SELF_GAMES: GameEntry[] = [
  { id: 'adult-rpg', title: '成人RPG冒险', type: 'rpg', tags: ['冒险', '战斗', '像素'], style: 'pixel', language: 'en', playable: true, href: '/games/adult-rpg', icon: <Sword size={18} />, source: 'self', rating: 4.0, cover: 'https://images.unsplash.com/photo-1614854262318-831574f15f1f?w=400&q=80', desc: '地牢探索RPG，击败怪物收集装备' },
  { id: 'adult-sim', title: '成人模拟经营', type: 'simulation', tags: ['经营', 'NPC', '建造'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-sim', icon: <Building2 size={18} />, source: 'self', rating: 3.8, cover: 'https://images.unsplash.com/photo-1596727147705-61a532a659bd?w=400&q=80', desc: '经营你的专属场所，招募员工' },
  { id: 'adult-fight', title: '成人格斗', type: 'action', tags: ['格斗', '连招', '对战'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-fight', icon: <Zap size={18} />, source: 'self', rating: 3.9, cover: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=80', desc: '1v1格斗对战，连招系统' },
  { id: 'adult-cards', title: '成人卡牌对战', type: 'card', tags: ['策略', '收集', '卡牌'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-cards', icon: <Layers size={18} />, source: 'self', rating: 4.1, cover: 'https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=400&q=80', desc: '策略卡牌战斗，收集稀有卡牌' },
  { id: 'adult-puzzle', title: '成人解谜', type: 'puzzle', tags: ['消除', '休闲', '益智'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-puzzle', icon: <Puzzle size={18} />, source: 'self', rating: 3.7, cover: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=400&q=80', desc: '消除解谜，解锁隐藏内容' },
  { id: 'adult-raise', title: '成人养成', type: 'dating', tags: ['恋爱', '养成', '互动'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-raise', icon: <Heart size={18} />, source: 'self', rating: 4.3, cover: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&q=80', desc: '恋爱养成，多角色多结局' },
  { id: 'adult-dress', title: '成人换装', type: 'dress-up', tags: ['换装', '自定义', '拍照'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-dress', icon: <Shirt size={18} />, source: 'self', rating: 3.5, cover: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&q=80', desc: '自由换装搭配，多种体型' },
  { id: 'adult-sandbox', title: '成人沙盒', type: 'sandbox', tags: ['建造', '创意', '自由'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-sandbox', icon: <Box size={18} />, source: 'self', rating: 3.6, cover: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400&q=80', desc: '开放世界沙盒，自由探索' },
  { id: 'adult-casual', title: '成人休闲合集', type: 'casual', tags: ['小游戏', '街机', '合集'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-casual', icon: <Gamepad2 size={18} />, source: 'self', rating: 3.8, cover: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80', desc: '多款休闲小游戏合集' },
  { id: 'adult-vn', title: '视觉小说', type: 'visual-novel', tags: ['剧情', '选择', '多结局'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-vn', icon: <Gamepad2 size={18} />, source: 'self', rating: 4.2, cover: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80', desc: '互动视觉小说，分支剧情' },
];

const EXTERNAL_GAMES: GameEntry[] = [
  { id: 'ext-dlsite', title: 'DLsite 精选', type: 'rpg', tags: ['日系', '同人'], style: '2d-anime', language: 'ja', playable: false, href: '#', icon: <Gamepad2 size={18} />, source: 'external', rating: 4.5, cover: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80', desc: '日本同人游戏平台精选' },
  { id: 'ext-nutaku', title: 'Nutaku 游戏', type: 'various', tags: ['网页', '免费'], style: '2d-anime', language: 'en', playable: false, href: '#', icon: <Gamepad2 size={18} />, source: 'external', rating: 4.0, cover: 'https://images.unsplash.com/photo-1601850494422-3cf14624b0b3?w=400&q=80', desc: '免费网页成人游戏平台' },
  { id: 'ext-f95', title: 'F95Zone 精选', type: 'various', tags: ['社区', '独立'], style: 'various', language: 'en', playable: false, href: '#', icon: <Gamepad2 size={18} />, source: 'external', rating: 4.2, cover: 'https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=400&q=80', desc: '最大成人游戏社区' },
  { id: 'ext-itch', title: 'Itch.io 成人区', type: 'various', tags: ['独立', '实验'], style: 'various', language: 'en', playable: false, href: '#', icon: <Gamepad2 size={18} />, source: 'external', rating: 3.9, cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80', desc: '独立开发者成人游戏' },
  { id: 'ext-newgrounds', title: 'Newgrounds 18+', type: 'flash', tags: ['经典', '网页'], style: 'various', language: 'en', playable: false, href: '#', icon: <Gamepad2 size={18} />, source: 'external', rating: 3.7, cover: 'https://images.unsplash.com/photo-1611457194403-d3f8c5154dc2?w=400&q=80', desc: '经典Flash成人游戏' },
  { id: 'ext-erogames', title: 'EroGames', type: 'various', tags: ['网页', '免费'], style: '2d-anime', language: 'en', playable: false, href: '#', icon: <Gamepad2 size={18} />, source: 'external', rating: 3.8, cover: 'https://images.unsplash.com/photo-1596727147705-61a532a659bd?w=400&q=80', desc: '免费在线成人游戏' },
  { id: 'ext-lewdzone', title: 'LewdZone', type: 'various', tags: ['下载', '合集'], style: 'various', language: 'en', playable: false, href: '#', icon: <Gamepad2 size={18} />, source: 'external', rating: 3.6, cover: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&q=80', desc: '成人游戏下载合集' },
  { id: 'ext-hanime-game', title: 'Hanime 游戏', type: 'various', tags: ['动漫', '互动'], style: '2d-anime', language: 'ja', playable: false, href: '#', icon: <Gamepad2 size={18} />, source: 'external', rating: 4.1, cover: 'https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?w=400&q=80', desc: '动漫风互动游戏' },
  { id: 'ext-kimochi', title: 'Kimochi', type: 'various', tags: ['日系', '独立'], style: '2d-anime', language: 'ja', playable: false, href: '#', icon: <Gamepad2 size={18} />, source: 'external', rating: 3.5, cover: 'https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?w=400&q=80', desc: '日系独立成人游戏' },
];

const ALL_GAMES = [...SELF_GAMES, ...EXTERNAL_GAMES];

const GAME_TYPES = ['all', 'rpg', 'simulation', 'action', 'card', 'puzzle', 'dating', 'dress-up', 'sandbox', 'casual', 'visual-novel', 'various', 'flash'];
const STYLES = ['all', '2d-anime', 'pixel', '3d', 'various'];
const LANGUAGES = ['all', 'en', 'ja', 'zh', 'ko'];
const SORT_OPTIONS = ['hot', 'rating', 'newest', 'random'] as const;

export default function AdultGameZone() {
  const [blocked] = useState(() => !ageGate.canAccess('NC-17'));
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [styleFilter, setStyleFilter] = useState('all');
  const [langFilter, setLangFilter] = useState('all');
  const [playableOnly, setPlayableOnly] = useState(false);
  const [sortBy, setSortBy] = useState<typeof SORT_OPTIONS[number]>('hot');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let games = ALL_GAMES;
    if (search) games = games.filter(g => g.title.toLowerCase().includes(search.toLowerCase()) || g.tags.some(t => t.includes(search.toLowerCase())));
    if (typeFilter !== 'all') games = games.filter(g => g.type === typeFilter);
    if (styleFilter !== 'all') games = games.filter(g => g.style === styleFilter);
    if (langFilter !== 'all') games = games.filter(g => g.language === langFilter);
    if (playableOnly) games = games.filter(g => g.playable);
    if (sortBy === 'rating') games = [...games].sort((a, b) => b.rating - a.rating);
    else if (sortBy === 'random') games = [...games].sort(() => Math.random() - 0.5);
    return games;
  }, [search, typeFilter, styleFilter, langFilter, playableOnly, sortBy]);

  if (blocked) return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <Lock size={48} className="mx-auto text-gray-600 mb-4" />
        <h1 className="text-2xl font-bold mb-2">成人游戏专区</h1>
        <p className="text-gray-400 mb-4">此区域需要开启成人模式 (NC-17) 才能访问。</p>
        <Link href="/games" className="text-[#3ea6ff] hover:underline">返回游戏中心</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Gamepad2 size={28} className="text-[#a55eea]" />
            <h1 className="text-2xl font-bold">成人游戏专区</h1>
          </div>
          <Link href="/zone" className="text-sm text-gray-400 hover:text-[#3ea6ff]">返回专区</Link>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索游戏..."
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#a55eea]" />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"><X size={14} /></button>}
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border ${showFilters ? 'border-[#a55eea] bg-[#a55eea]/10 text-[#a55eea]' : 'border-white/10 bg-white/5 text-gray-400'}`}>
            <Filter size={14} /> 筛选 {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="mb-4 p-4 bg-white/5 border border-white/10 rounded-lg space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">游戏类型</label>
              <div className="flex flex-wrap gap-1.5">
                {GAME_TYPES.map(t => (
                  <button key={t} onClick={() => setTypeFilter(t)} className={`px-2.5 py-1 rounded text-xs ${typeFilter === t ? 'bg-[#a55eea] text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}>{t}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">画风</label>
                <div className="flex flex-wrap gap-1.5">
                  {STYLES.map(s => (<button key={s} onClick={() => setStyleFilter(s)} className={`px-2.5 py-1 rounded text-xs ${styleFilter === s ? 'bg-[#a55eea] text-white' : 'bg-white/5 text-gray-400'}`}>{s}</button>))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">语言</label>
                <div className="flex flex-wrap gap-1.5">
                  {LANGUAGES.map(l => (<button key={l} onClick={() => setLangFilter(l)} className={`px-2.5 py-1 rounded text-xs ${langFilter === l ? 'bg-[#a55eea] text-white' : 'bg-white/5 text-gray-400'}`}>{l}</button>))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={playableOnly} onChange={e => setPlayableOnly(e.target.checked)} className="rounded" />
                仅显示可在线玩
              </label>
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={14} className="text-gray-400" />
                <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-gray-300">
                  <option value="hot">热门</option>
                  <option value="rating">评分</option>
                  <option value="newest">最新</option>
                  <option value="random">随机</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Results count */}
        <p className="text-sm text-gray-500 mb-4">找到 {filtered.length} 款游戏</p>

        {/* Game Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {filtered.map(game => (
            <Link key={game.id} href={game.href}
              className="group block rounded-xl bg-white/5 border border-white/10 hover:border-[#a55eea]/50 hover:-translate-y-1 transition-all overflow-hidden">
              {/* Cover image */}
              <div className="relative aspect-[4/3] bg-[#1a1a1a] overflow-hidden">
                <img
                  src={game.cover}
                  alt={game.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                {/* Rating badge */}
                <span className="absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded bg-red-500/80 text-white font-bold">NC-17</span>
                {/* Playable badge */}
                {game.playable && (
                  <span className="absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded bg-[#2ed573]/80 text-white font-bold">可在线玩</span>
                )}
                {/* Type badge */}
                <span className="absolute bottom-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded bg-[#a55eea]/80 text-white font-medium">{game.type}</span>
                {/* Star rating */}
                <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 bg-black/60 rounded px-1 py-0.5">
                  <Star size={9} className="text-[#ffd700] fill-[#ffd700]" />
                  <span className="text-[9px] text-white font-medium">{game.rating.toFixed(1)}</span>
                </div>
              </div>
              {/* Info */}
              <div className="p-2.5">
                <h3 className="text-sm font-medium text-white group-hover:text-[#a55eea] transition-colors truncate">{game.title}</h3>
                <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{game.desc}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {game.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400">{tag}</span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Gamepad2 size={48} className="mx-auto text-gray-700 mb-4" />
            <p className="text-gray-500">没有匹配的游戏，试试调整筛选条件</p>
          </div>
        )}
      </div>
    </div>
  );
}
