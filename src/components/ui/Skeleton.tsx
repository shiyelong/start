"use client";

/**
 * 骨架屏加载组件
 * 用于内容加载时的占位显示
 */

interface SkeletonProps {
  className?: string;
  /** 圆形骨架 */
  circle?: boolean;
}

export function Skeleton({ className = "", circle }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-white/[0.06] ${circle ? "rounded-full" : "rounded-lg"} ${className}`}
    />
  );
}

/** 视频卡片骨架 */
export function VideoCardSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="aspect-video w-full rounded-xl" />
      <div className="flex gap-2">
        <Skeleton circle className="w-8 h-8 shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}

/** 游戏卡片骨架 */
export function GameCardSkeleton() {
  return (
    <div className="p-5 rounded-2xl bg-[#1a1a1a]/40 border border-white/[0.04] text-center space-y-3">
      <Skeleton className="w-16 h-16 rounded-2xl mx-auto" />
      <Skeleton className="h-3 w-20 mx-auto" />
      <Skeleton className="h-2 w-16 mx-auto" />
    </div>
  );
}

/** 列表行骨架 */
export function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3">
      <Skeleton className="w-12 h-12 rounded-lg shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-2.5 w-1/2" />
      </div>
      <Skeleton className="h-8 w-16 rounded-lg" />
    </div>
  );
}

/** 音乐卡片骨架 */
export function MusicCardSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="aspect-square w-full rounded-xl" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-2.5 w-1/2" />
    </div>
  );
}

/** 全页骨架 */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-48" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-16 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <VideoCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
