'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, Columns, AlignJustify,
  ZoomIn, ZoomOut, Bookmark, Loader2
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComicPage {
  url: string;
  width: number;
  height: number;
}

export interface ComicReaderProps {
  pages: ComicPage[];
  mode: 'page' | 'scroll';
  currentPage: number;
  onPageChange?: (page: number) => void;
  onChapterEnd?: () => void;
  onBookmark?: (page: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ComicReader({
  pages,
  mode: initialMode,
  currentPage: initialPage,
  onPageChange,
  onChapterEnd,
  onBookmark,
}: ComicReaderProps) {
  const [mode, setMode] = useState(initialMode);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const totalPages = pages.length;

  // Page navigation
  const goToPage = useCallback((page: number) => {
    const p = Math.max(0, Math.min(page, totalPages - 1));
    setCurrentPage(p);
    onPageChange?.(p);
    if (p === totalPages - 1) {
      onChapterEnd?.();
    }
  }, [totalPages, onPageChange, onChapterEnd]);

  const nextPage = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);
  const prevPage = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (mode !== 'page') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); nextPage(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prevPage(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, nextPage, prevPage]);

  // Touch swipe for page mode
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStartRef.current;
    if (!start || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - start.x;
    touchStartRef.current = null;
    if (mode !== 'page') return;
    if (Math.abs(dx) > 50) {
      dx < 0 ? nextPage() : prevPage();
    }
  }, [mode, nextPage, prevPage]);

  // Zoom
  const zoomIn = useCallback(() => setZoom(z => Math.min(z + 0.25, 3)), []);
  const zoomOut = useCallback(() => setZoom(z => Math.max(z - 0.25, 0.5)), []);

  // Image load tracking
  const handleImageLoad = useCallback((idx: number) => {
    setLoading(prev => { const n = new Set(prev); n.delete(idx); return n; });
  }, []);

  const handleImageLoadStart = useCallback((idx: number) => {
    setLoading(prev => new Set(prev).add(idx));
  }, []);

  // Scroll mode: track current page by scroll position
  useEffect(() => {
    if (mode !== 'scroll' || !scrollRef.current) return;
    const container = scrollRef.current;
    const handleScroll = () => {
      const children = container.children;
      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        if (rect.top >= -rect.height / 2 && rect.top < window.innerHeight / 2) {
          if (i !== currentPage) {
            setCurrentPage(i);
            onPageChange?.(i);
            if (i === totalPages - 1) onChapterEnd?.();
          }
          break;
        }
      }
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [mode, currentPage, totalPages, onPageChange, onChapterEnd]);

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0f0f0f] border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode(mode === 'page' ? 'scroll' : 'page')}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            aria-label={mode === 'page' ? 'Switch to scroll mode' : 'Switch to page mode'}
          >
            {mode === 'page' ? <Columns className="w-4 h-4" /> : <AlignJustify className="w-4 h-4" />}
            {mode === 'page' ? 'Page' : 'Scroll'}
          </button>
          <button onClick={zoomOut} className="p-1 text-white/50 hover:text-white" aria-label="Zoom out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-white/50 tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} className="p-1 text-white/50 hover:text-white" aria-label="Zoom in">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50 tabular-nums">
            {currentPage + 1} / {totalPages}
          </span>
          {onBookmark && (
            <button
              onClick={() => onBookmark(currentPage)}
              className="p-1 text-white/50 hover:text-[#3ea6ff] transition-colors"
              aria-label="Bookmark"
            >
              <Bookmark className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      {mode === 'page' ? (
        /* Page mode */
        <div
          className="flex-1 flex items-center justify-center overflow-hidden relative"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {pages[currentPage] && (
            <div className="relative" style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}>
              {loading.has(currentPage) && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-[#3ea6ff] animate-spin" />
                </div>
              )}
              <img
                src={pages[currentPage].url}
                alt={`Page ${currentPage + 1}`}
                className="max-h-[calc(100vh-6rem)] max-w-full object-contain"
                loading="lazy"
                onLoadStart={() => handleImageLoadStart(currentPage)}
                onLoad={() => handleImageLoad(currentPage)}
              />
            </div>
          )}

          {/* Nav arrows */}
          {currentPage > 0 && (
            <button
              onClick={prevPage}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 rounded-full text-white/70 hover:text-white hover:bg-black/70 transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {currentPage < totalPages - 1 && (
            <button
              onClick={nextPage}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 rounded-full text-white/70 hover:text-white hover:bg-black/70 transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>
      ) : (
        /* Scroll mode */
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
          style={{ scrollBehavior: 'smooth' }}
        >
          {pages.map((page, i) => (
            <div key={i} className="flex justify-center" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
              <img
                src={page.url}
                alt={`Page ${i + 1}`}
                className="max-w-full"
                loading="lazy"
                onLoad={() => handleImageLoad(i)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
