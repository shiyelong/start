'use client';

import { useState, useMemo } from 'react';
import Header from '@/components/Header';
import Link from 'next/link';
import { ageGate } from '@/lib/age-gate';
import {
  Lock, Search, Filter, Gamepad2, BookOpen, Sword, Building2, Zap,
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
}

// ─── Game Data ───────────────────────────────────────────
const SELF_GAMES: GameEntry[] = [
  { id: 'adult-vn', title: 'Visual Novel', type: 'visual-novel', tags: ['romance', 'branching'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-vn', icon: <BookOpen size={18} />, source: 'self', rating: 4.2 },
  { id: 'adult-rpg', title: 'Adult RPG', type: 'rpg', tags: ['adventure', 'combat'], style: 'pixel', language: 'en', playable: true, href: '/games/adult-rpg', icon: <Sword size={18} />, source: 'self', rating: 4.0 },
  { id: 'adult-sim', title: 'Adult Sim', type: 'simulation', tags: ['management', 'npc'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-sim', icon: <Building2 size={18} />, source: 'self', rating: 3.8 },
  { id: 'adult-fight', title: 'Adult Fighter', type: 'action', tags: ['combat', 'combo'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-fight', icon: <Zap size={18} />, source: 'self', rating: 3.9 },
  { id: 'adult-cards', title: 'Adult Card Battle', type: 'card', tags: ['strategy', 'collection'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-cards', icon: <Layers size={18} />, source: 'self', rating: 4.1 },
  { id: 'adult-puzzle', title: 'Adult Puzzle', type: 'puzzle', tags: ['match-3', 'casual'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-puzzle', icon: <Puzzle size={18} />, source: 'self', rating: 3.7 },
  { id: 'adult-raise', title: 'Dating Sim', type: 'dating', tags: ['romance', 'affection'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-raise', icon: <Heart size={18} />, source: 'self', rating: 4.3 },
  { id: 'adult-dress', title: 'Dress Up', type: 'dress-up', tags: ['customization'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-dress', icon: <Shirt size={18} />, source: 'self', rating: 3.5 },
  { id: 'adult-sandbox', title: 'Adult Sandbox', type: 'sandbox', tags: ['building', 'creative'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-sandbox', icon: <Box size={18} />, source: 'self', rating: 3.6 },
  { id: 'adult-casual', title: 'Casual Mini Games', type: 'casual', tags: ['mini-games', 'arcade'], style: '2d-anime', language: 'en', playable: true, href: '/games/adult-casual', icon: <Gamepad2 size={18} />, source: 'self', rating: 3.8 },
];

const EXTERNAL_GAMES: GameEntry[] = [
  { id: 'ext-dlsite', title: 'DLsite Collection', type: 'rpg', tags: ['japanese', 'doujin'], style: '2d-anime', language: 'ja', playable: false, href: '#', icon: <Gamepad2 size={18} />, source: 'external', rating: 4.5 },
  { id: 'ext-nutaku', title: 'Nutaku Games', type: 'various', tags: ['browser', 'f2p'], style: '2d-anime', language: 'en', playable: false, href: '#', icon: <Gamepad2 size={18} />, source: 'external', rating: 4.0 },
  { id: 'ext-f95', title: 'F95Zone Picks', type: 'visual-novel', tags: ['community', 'indie'], style: 'various', language: 'en', playable: false, href: '#', icon: <Gamepad2 size={18} />, source: 'external', rating: 4.2 },
  { id: 'ext-itch', title: 'Itch.io Adult', type: 'various', tags: ['indie', 'experimental'], style: 'various', language: 'en', playable: false, href: '#', icon: <Gamepad2 size={18} />, source: 'external', rating: 3.9 },
  { id: 'ext-newgrounds', title: 'Newgrounds 18+', type: 'flash', tags: ['classic', 'browser'], style: 'various', language: 'en', playable: false, href: '#', icon: <Gamepad2 size={18} />, source: 'external', rating: 3.7 },
];

const ALL_GAMES = [...SELF_GAMES, ...EXTERNAL_GAMES];

const GAME_TYPES = ['all', 'visual-novel', 'rpg', 'simulation', 'action', 'card', 'puzzle', 'dating', 'dress-up', 'sandbox', 'casual', 'various', 'flash'];
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
        <h1 className="text-2xl font-bold mb-2">Adult Game Zone</h1>
        <p className="text-gray-400 mb-4">This section requires adult mode (NC-17).</p>
        <Link href="/games" className="text-[#3ea6ff] hover:underline">Back to Games</Link>
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
            <h1 className="text-2xl font-bold">Adult Game Zone</h1>
          </div>
          <Link href="/zone" className="text-sm text-gray-400 hover:text-[#3ea6ff]">Back to Zone</Link>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search games..."
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#a55eea]" />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"><X size={14} /></button>}
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border ${showFilters ? 'border-[#a55eea] bg-[#a55eea]/10 text-[#a55eea]' : 'border-white/10 bg-white/5 text-gray-400'}`}>
            <Filter size={14} /> Filters {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="mb-4 p-4 bg-white/5 border border-white/10 rounded-lg space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Game Type</label>
              <div className="flex flex-wrap gap-1.5">
                {GAME_TYPES.map(t => (
                  <button key={t} onClick={() => setTypeFilter(t)} className={`px-2.5 py-1 rounded text-xs ${typeFilter === t ? 'bg-[#a55eea] text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}>{t}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Art Style</label>
                <div className="flex flex-wrap gap-1.5">
                  {STYLES.map(s => (<button key={s} onClick={() => setStyleFilter(s)} className={`px-2.5 py-1 rounded text-xs ${styleFilter === s ? 'bg-[#a55eea] text-white' : 'bg-white/5 text-gray-400'}`}>{s}</button>))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Language</label>
                <div className="flex flex-wrap gap-1.5">
                  {LANGUAGES.map(l => (<button key={l} onClick={() => setLangFilter(l)} className={`px-2.5 py-1 rounded text-xs ${langFilter === l ? 'bg-[#a55eea] text-white' : 'bg-white/5 text-gray-400'}`}>{l}</button>))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={playableOnly} onChange={e => setPlayableOnly(e.target.checked)} className="rounded" />
                Web playable only
              </label>
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={14} className="text-gray-400" />
                <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-gray-300">
                  <option value="hot">Hot</option>
                  <option value="rating">Rating</option>
                  <option value="newest">Newest</option>
                  <option value="random">Random</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Results count */}
        <p className="text-sm text-gray-500 mb-4">{filtered.length} games found</p>

        {/* Game Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(game => (
            <Link key={game.id} href={game.href}
              className="group block p-4 bg-white/5 border border-white/10 rounded-xl hover:border-[#a55eea]/50 hover:bg-white/[0.07] transition-all">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#a55eea]/20 flex items-center justify-center text-[#a55eea] flex-shrink-0">
                  {game.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-white group-hover:text-[#a55eea] transition-colors truncate">{game.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[#a55eea]/20 text-[#a55eea]">{game.type}</span>
                    {game.playable && <span className="text-xs px-1.5 py-0.5 rounded bg-[#2ed573]/20 text-[#2ed573]">Playable</span>}
                    <span className="text-xs text-gray-500">{game.language.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <Star size={12} className="text-[#ffd700]" />
                    <span className="text-xs text-gray-400">{game.rating.toFixed(1)}</span>
                    <span className="text-xs text-gray-600 ml-2">{game.tags.join(', ')}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Gamepad2 size={48} className="mx-auto text-gray-700 mb-4" />
            <p className="text-gray-500">No games match your filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
