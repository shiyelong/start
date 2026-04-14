'use client';

import { Star } from 'lucide-react';
import RatingBadge from '@/components/ui/RatingBadge';
import type { ContentRating } from '@/lib/types';

/** Platform type for game catalog */
export type GamePlatform = 'PC' | '手机' | 'NS' | 'PS' | 'Xbox' | '网页游戏';

/** Game type/genre */
export type GameGenre =
  | '益智' | '策略' | 'RPG' | '动作' | '模拟经营'
  | '赛车' | '卡牌' | '解谜' | '音乐' | '塔防'
  | '沙盒' | '体育' | '棋牌' | '射击' | '休闲';

/** Game catalog item */
export interface GameCatalogItem {
  id: string;
  name: string;
  cover: string;
  platforms: GamePlatform[];
  genre: GameGenre;
  rating: ContentRating;
  score: number;        // 0-5 star rating
  popularity: number;   // higher = more popular
  updatedAt: string;    // ISO date string
  featured?: boolean;
  description?: string;
  /** For web games, the route to play */
  playUrl?: string;
}

const PLATFORM_COLORS: Record<GamePlatform, string> = {
  'PC': 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  '手机': 'bg-green-600/20 text-green-400 border-green-600/30',
  'NS': 'bg-red-600/20 text-red-400 border-red-600/30',
  'PS': 'bg-indigo-600/20 text-indigo-400 border-indigo-600/30',
  'Xbox': 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30',
  '网页游戏': 'bg-amber-600/20 text-amber-400 border-amber-600/30',
};

interface GameCardProps {
  game: GameCatalogItem;
  onClick?: (game: GameCatalogItem) => void;
  size?: 'sm' | 'md';
}

export default function GameCard({ game, onClick, size = 'md' }: GameCardProps) {
  const handleClick = () => {
    onClick?.(game);
  };

  const imgSize = size === 'sm' ? 'h-32' : 'h-40';

  return (
    <button
      onClick={handleClick}
      className="group w-full text-left rounded-xl bg-[#1a1a1a]/60 border border-[#333]/40 hover:border-[#3ea6ff]/40 hover:-translate-y-1 transition-all duration-200 overflow-hidden"
    >
      {/* Cover image */}
      <div className={`relative w-full ${imgSize} bg-[#212121] overflow-hidden`}>
        <img
          src={game.cover}
          alt={game.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* MPAA Rating badge — top left */}
        <div className="absolute top-2 left-2">
          <RatingBadge rating={game.rating} />
        </div>

        {/* Featured tag — top right */}
        {game.featured && (
          <div className="absolute top-2 right-2">
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#f0b90b]/20 text-[#f0b90b] border border-[#f0b90b]/30 font-bold">
              精选
            </span>
          </div>
        )}

        {/* Genre label — bottom left */}
        <div className="absolute bottom-2 left-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-gray-300 font-medium">
            {game.genre}
          </span>
        </div>
      </div>

      {/* Info section */}
      <div className="p-3">
        {/* Game name */}
        <h3 className="text-sm font-semibold text-white truncate group-hover:text-[#3ea6ff] transition-colors">
          {game.name}
        </h3>

        {/* Star rating */}
        <div className="flex items-center gap-0.5 mt-1.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star
              key={s}
              size={11}
              className={
                s <= Math.round(game.score)
                  ? 'text-[#f0b90b] fill-[#f0b90b]'
                  : 'text-[#333]'
              }
            />
          ))}
          <span className="text-[10px] text-[#8a8a8a] ml-1">
            {game.score.toFixed(1)}
          </span>
        </div>

        {/* Platform tags */}
        <div className="flex flex-wrap gap-1 mt-2">
          {game.platforms.map((p) => (
            <span
              key={p}
              className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${PLATFORM_COLORS[p]}`}
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}
