'use client';

import type { ContentRating } from '@/lib/types';

const RATING_STYLES: Record<ContentRating, string> = {
  'G': 'bg-green-600/20 text-green-400 border-green-600/30',
  'PG': 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  'PG-13': 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
  'R': 'bg-orange-600/20 text-orange-400 border-orange-600/30',
  'NC-17': 'bg-red-600/20 text-red-400 border-red-600/30',
};

interface RatingBadgeProps {
  rating: ContentRating;
  size?: 'sm' | 'md';
}

export default function RatingBadge({ rating, size = 'sm' }: RatingBadgeProps) {
  const sizeClass = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';
  return (
    <span className={`inline-flex items-center rounded border font-semibold ${sizeClass} ${RATING_STYLES[rating]}`}>
      {rating}
    </span>
  );
}
