'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Columns, AlignJustify,
  ZoomIn, ZoomOut, Bookmark, Loader2, Sun, Moon,
  RotateCcw, BookOpen, Settings, Maximize, Minimize,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComicPage {
  url: string;
  width: number;
  height: number;
}

export type ReadingDirection = 'ltr' | 'rtl';
export type PageLayout = 'single' | 'double' | 'scroll' | 'webtoon';

export interface ComicReaderProps {
  pages: ComicPage[];
  mode?: PageLayout;
  currentPage?: number;
  direction?: ReadingDirection;
  onPageChange?: (page: number) => void;
  onChapterEnd?: () => void;
  onBookmark?: (page: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ComicReader({
  pages,
  mode: initialMode = 'single',
  currentPage: initialPage = 0,
  direction: initialDirection = 'ltr',
  onPageChange,
  onChapterEnd,
  onBookmark,
}: ComicReaderProps) {
  const [mode, setMode] = useState<PageLayout>(initialMode);
  const [direction, setDirection] = useState<ReadingDirection>(initialDirection);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [zoom, setZoom] = useState(1);
  const [brightness, setBrightness] = useState(100);
  const [loading, setLoading] = useState<Set<number>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const pinchStartRef = useRef<number | null>(null);

  const totalPages = pages.length;

  // Page step: 2 for double-page, 1 otherwise
  const pageStep = mode === 'double' ? 2 : 1;

  // Navigation
  const goToPage = useCallback((page: number) => {
    const p = Math.max(0, Math.min(page, totalPages - 1));
    setCurrentPage(p);
    onPageChange?.(p);
    if (p >= totalPages - 1) onChapterEnd?.();
  }, [totalPages, onPageChange, onChapterEnd]);

  const nextPage = useCallback(() => {
    if (direction === 'rtl') goToPage(currentPage - pageStep);
    else goToPage(currentPage + pageStep);
  }, [currentPage, pageStep, direction, goToPage]);

  const prevPage = useCallback(() => {
    if (direction === 'rtl') goToPage(currentPage + pageStep);
    else goToPage(currentPage - pageStep);
  }, [currentPage, pageStep, direction, goToPage]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (mode === 'scroll' || mode === 'webtoon') return;
      switch (e.key) {
        case 'ArrowRight': e.preventDefault(); direction === 'rtl' ? prevPage() : nextPage(); break;
        case 'ArrowLeft': e.preventDefault(); direction === 'rtl' ? nextPage() : prevPage(); break;
        case 'ArrowDown': case ' ': e.preventDefault(); nextPage(); break;
        case 'ArrowUp': e.preventDefault(); prevPage(); break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, direction, nextPage, prevPage]);

  // Touch swipe for page mode
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch zoom start
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      pinchStartRef.current = d;
      return;
    }
    if (e.touches.length !== 1) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartRef.current !== null) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const scale = d / pinchStartRef.current;
      setZoom(z => Math.max(0.5, Math.min(3, z * (scale > 1 ? 1.02 : 0.98))));
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    pinchStartRef.current = null;
    const start = touchStartRef.current;
    if (!start || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    const elapsed = Date.now() - start.time;
    touchStartRef.current = null;

    if (mode === 'scroll' || mode === 'webtoon') return;
    if (elapsed > 500) return;

    // Tap zones: left 1/3 = prev, right 1/3 = next, center = toggle settings
    const container = containerRef.current;
    if (container && Math.abs(dx) < 20 && Math.abs(dy) < 20) {
      const rect = container.getBoundingClientRect();
      const tapX = e.changedTouches[0].clientX - rect.left;
      const third = rect.width / 3;
      if (tapX < third) { prevPage(); return; }
      if (tapX > third * 2) { nextPage(); return; }
      setShowSettings(s => !s);
      return;
    }

    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
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

  // Fullscreen
  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) { await el.requestFullscreen(); setIsFullscreen(true); }
      else { await document.exitFullscreen(); setIsFullscreen(false); }
    } catch { /* not supported */ }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Scroll mode: track current page by scroll position
  useEffect(() => {
    if ((mode !== 'scroll' && mode !== 'webtoon') || !scrollRef.current) return;
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

  // Mode labels
  const modeOptions: { id: PageLayout; label: string; icon: React.ReactNode }[] = [
    { id: 'single', label: '单页', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: 'double', label: '双页', icon: <Columns className="w-3.5 h-3.5" /> },
    { id: 'scroll', label: '条漫', icon: <AlignJustify className="w-3.5 h-3.5" /> },
    { id: 'webtoon', label: 'Webtoon', icon: <AlignJustify className="w-3.5 h-3.5" /> },
  ];

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-black">
      {/* Toolbar */}
      <div className={`flex items-center justify-between px-3 py-2 bg-[#0f0f0f] border-b border-white/5 flex-shrink-0 transition-opacity ${
        showSettings || mode === 'scroll' || mode === 'webtoon' ? 'opacity-100' : 'opacity-0 hover:opacity-100'
      }`}>
        <div className="flex items-center gap-2">
          {/* Mode selector */}
          <div className="flex items-center gap-0.5">
            {modeOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setMode(opt.id)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  mode === opt.id ? 'bg-[#3ea6ff]/15 text-[#3ea6ff]' : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
                aria-label={opt.label}
              >
                {opt.icon}
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            ))}
          </div>

          {/* Direction toggle (for page modes) */}
          {(mode === 'single' || mode === 'double') && (
            <button
              onClick={() => setDirection(d => d === 'ltr' ? 'rtl' : 'ltr')}
              className="px-2 py-1 rounded text-xs text-white/50 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="阅读方向"
            >
              {direction === 'ltr' ? 'LTR' : 'RTL'}
            </button>
          )}

          {/* Zoom */}
          <button onClick={zoomOut} className="p-1 text-white/50 hover:text-white" aria-label="缩小">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-white/50 tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} className="p-1 text-white/50 hover:text-white" aria-label="放大">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Brightness */}
          <div className="flex items-center gap-1">
            <Moon className="w-3.5 h-3.5 text-white/30" />
            <input
              type="range"
              min={30}
              max={100}
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="w-16 h-1 accent-[#3ea6ff]"
              aria-label="亮度"
            />
            <Sun className="w-3.5 h-3.5 text-white/30" />
          </div>

          {/* Page indicator */}
          <span className="text-xs text-white/50 tabular-nums">
            {currentPage + 1}{mode === 'double' && currentPage + 1 < totalPages ? `-${Math.min(currentPage + 2, totalPages)}` : ''} / {totalPages}
          </span>

          {onBookmark && (
            <button onClick={() => onBookmark(currentPage)} className="p-1 text-white/50 hover:text-[#3ea6ff] transition-colors" aria-label="书签">
              <Bookmark className="w-4 h-4" />
            </button>
          )}

          <button onClick={toggleFullscreen} className="p-1 text-white/50 hover:text-white transition-colors" aria-label={isFullscreen ? '退出全屏' : '全屏'}>
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Content area with brightness filter */}
      <div
        className="flex-1 relative overflow-hidden"
        style={{ filter: brightness < 100 ? `brightness(${brightness / 100})` : undefined }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {(mode === 'single' || mode === 'double') ? (
          /* Page mode */
          <div className="w-full h-full flex items-center justify-center overflow-hidden">
            <div
              className="flex items-center justify-center gap-1"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
            >
              {/* Current page */}
              {pages[currentPage] && (
                <div className="relative">
                  {loading.has(currentPage) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-[#3ea6ff] animate-spin" />
                    </div>
                  )}
                  <img
                    src={pages[currentPage].url}
                    alt={`第 ${currentPage + 1} 页`}
                    className="max-h-[calc(100vh-4rem)] max-w-full object-contain"
                    loading="eager"
                    onLoad={() => handleImageLoad(currentPage)}
                  />
                </div>
              )}
              {/* Second page for double mode */}
              {mode === 'double' && pages[currentPage + 1] && (
                <div className="relative">
                  {loading.has(currentPage + 1) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-[#3ea6ff] animate-spin" />
                    </div>
                  )}
                  <img
                    src={pages[currentPage + 1].url}
                    alt={`第 ${currentPage + 2} 页`}
                    className="max-h-[calc(100vh-4rem)] max-w-full object-contain"
                    loading="eager"
                    onLoad={() => handleImageLoad(currentPage + 1)}
                  />
                </div>
              )}
            </div>

            {/* Nav arrows */}
            {currentPage > 0 && (
              <button
                onClick={prevPage}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 rounded-full text-white/70 hover:text-white hover:bg-black/70 transition-colors"
                aria-label="上一页"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            {currentPage < totalPages - 1 && (
              <button
                onClick={nextPage}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 rounded-full text-white/70 hover:text-white hover:bg-black/70 transition-colors"
                aria-label="下一页"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>
        ) : (
          /* Scroll / Webtoon mode */
          <div
            ref={scrollRef}
            className="h-full overflow-y-auto"
            style={{ scrollBehavior: 'smooth' }}
          >
            <div className={mode === 'webtoon' ? 'max-w-lg mx-auto' : ''}>
              {pages.map((page, i) => (
                <div
                  key={i}
                  className="flex justify-center"
                  style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
                >
                  <img
                    src={page.url}
                    alt={`第 ${i + 1} 页`}
                    className={mode === 'webtoon' ? 'w-full' : 'max-w-full'}
                    loading="lazy"
                    onLoad={() => handleImageLoad(i)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom page slider (page modes only) */}
      {(mode === 'single' || mode === 'double') && (
        <div className="flex items-center gap-3 px-4 py-2 bg-[#0f0f0f] border-t border-white/5 flex-shrink-0">
          <span className="text-xs text-white/40 tabular-nums w-6 text-right">{currentPage + 1}</span>
          <input
            type="range"
            min={0}
            max={totalPages - 1}
            step={pageStep}
            value={currentPage}
            onChange={(e) => goToPage(Number(e.target.value))}
            className="flex-1 h-1 accent-[#3ea6ff]"
            aria-label="页码滑块"
          />
          <span className="text-xs text-white/40 tabular-nums w-6">{totalPages}</span>
        </div>
      )}
    </div>
  );
}
