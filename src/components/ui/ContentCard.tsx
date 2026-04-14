'use client';

import type { ContentRating, SourceType } from '@/lib/types';
import RatingBadge from './RatingBadge';

interface ContentCardProps {
  title: string;
  cover: string;
  source?: string;
  rating: ContentRating;
  type?: SourceType;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export default function ContentCard({ title, cover, source, rating, size = 'md', onClick }: ContentCardProps) {
  const sizeClasses = {
    sm: 'w-36',
    md: 'w-44',
    lg: 'w-56',
  };

  return (
    <button
      onClick={onClick}
      className={`${sizeClasses[size]} flex-shrink-0 group cursor-pointer text-left`}
    >
      <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-white/5">
        <img
          src={cover}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute top-2 left-2">
          <RatingBadge rating={rating} />
        </div>
        {source && (
          <div className="absolute bottom-2 right-2 text-[10px] bg-black/70 text-gray-300 px-1.5 py-0.5 rounded">
            {source}
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-white truncate group-hover:text-[#3ea6ff] transition-colors">
        {title}
      </p>
    </button>
  );
}
