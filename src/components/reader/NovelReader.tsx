'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  BookOpen, ChevronLeft, ChevronRight, Bookmark, Settings,
  Volume2, VolumeX, Sun, Moon, Leaf, ScrollText, Type,
  Pause, Play, SkipForward, Maximize, Minimize,
  AlignJustify, BookText, Columns,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NovelTheme = 'dark' | 'light' | 'sepia' | 'green' | 'blue';
export type ReadingMode = 'page' | 'scroll';

export interface NovelReaderProps {
  content: string;
  title: string;
  mode?: ReadingMode;
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  theme?: NovelTheme;
  onChapterEnd?: () => void;
  onBookmark?: (position: number) => void;
}

// ---------------------------------------------------------------------------
// Theme configs
// ---------------------------------------------------------------------------

const THEMES: Record<NovelTheme, { bg: string; text: string; label: string; icon: React.ReactNode; bgColor: string }> = {
  dark: { bg: 'bg-[#0f0f0f]', text: 'text-gray-200', label: '暗黑', icon: <Moon className="w-4 h-4" />, bgColor: '#0f0f0f' },
  light: { bg: 'bg-white', text: 'text-gray-900', label: '明亮', icon: <Sun className="w-4 h-4" />, bgColor: '#ffffff' },
  sepia: { bg: 'bg-[#f4ecd8]', text: 'text-[#5b4636]', label: '羊皮纸', icon: <ScrollText className="w-4 h-4" />, bgColor: '#f4ecd8' },
  green: { bg: 'bg-[#c7edcc]', text: 'text-[#2d4a2e]', label: '护眼绿', icon: <Leaf className="w-4 h-4" />, bgColor: '#c7edcc' },
  blue: { bg: 'bg-[#1a2332]', text: 'text-[#a8c7e0]', label: '夜蓝', icon: <Moon className="w-4 h-4" />, bgColor: '#1a2332' },
};

const FONT_SIZES = [14, 16, 18, 20, 22, 24, 28] as const;
const FONT_FAMILIES = [
  { id: 'system-ui', label: '系统默认' },
  { id: 'serif', label: '宋体' },
  { id: 'sans-serif', label: '黑体' },
  { id: '"Noto Serif SC", serif', label: '思源宋体' },
];

const TTS_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

// ---------------------------------------------------------------------------
// TTS Controller
// ---------------------------------------------------------------------------

function TTSController({
  content,
  paragraphs,
  theme,
  onHighlight,
}: {
  content: string;
  paragraphs: string[];
  theme: NovelTheme;
  onHighlight: (index: number) => void;
}) {
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const [currentParagraph, setCurrentParagraph] = useState(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isDark = theme === 'dark' || theme === 'blue';

  const speakParagraph = useCallback((index: number) => {
    if (index >= paragraphs.length) {
      setActive(false);
      setCurrentParagraph(0);
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(paragraphs[index]);
    utterance.lang = 'zh-CN';
    utterance.rate = rate;
    utterance.onend = () => {
      const next = index + 1;
      setCurrentParagraph(next);
      onHighlight(next);
      speakParagraph(next);
    };
    utteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
    setCurrentParagraph(index);
    onHighlight(index);
  }, [paragraphs, rate, onHighlight]);

  const start = useCallback(() => {
    setActive(true);
    setPaused(false);
    speakParagraph(currentParagraph);
  }, [currentParagraph, speakParagraph]);

  const stop = useCallback(() => {
    speechSynthesis.cancel();
    setActive(false);
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (paused) { speechSynthesis.resume(); setPaused(false); }
    else { speechSynthesis.pause(); setPaused(true); }
  }, [paused]);

  const skipForward = useCallback(() => {
    const next = Math.min(currentParagraph + 1, paragraphs.length - 1);
    speakParagraph(next);
  }, [currentParagraph, paragraphs.length, speakParagraph]);

  useEffect(() => {
    return () => { speechSynthesis.cancel(); };
  }, []);

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
      {!active ? (
        <button onClick={start} className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs ${isDark ? 'text-[#3ea6ff] hover:bg-white/10' : 'text-blue-600 hover:bg-black/5'} transition-colors`}>
          <Volume2 className="w-4 h-4" />
          朗读
        </button>
      ) : (
        <>
          <button onClick={togglePause} className={`p-1.5 rounded ${isDark ? 'text-white hover:bg-white/10' : 'text-gray-700 hover:bg-black/5'}`} aria-label={paused ? '继续' : '暂停'}>
            {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          <button onClick={skipForward} className={`p-1.5 rounded ${isDark ? 'text-white/70 hover:bg-white/10' : 'text-gray-500 hover:bg-black/5'}`} aria-label="下一段">
            <SkipForward className="w-4 h-4" />
          </button>
          <button onClick={stop} className={`p-1.5 rounded ${isDark ? 'text-red-400 hover:bg-white/10' : 'text-red-500 hover:bg-black/5'}`} aria-label="停止">
            <VolumeX className="w-4 h-4" />
          </button>
          <span className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
            {currentParagraph + 1}/{paragraphs.length}
          </span>
        </>
      )}
      {/* Rate selector */}
      <div className="ml-auto flex items-center gap-1">
        {TTS_RATES.map((r) => (
          <button
            key={r}
            onClick={() => setRate(r)}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              rate === r
                ? 'bg-[#3ea6ff] text-black'
                : isDark ? 'text-white/40 hover:text-white/60' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {r}x
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function NovelReader({
  content,
  title,
  mode: initialMode = 'scroll',
  fontSize: initialFontSize = 18,
  fontFamily: initialFontFamily = 'system-ui',
  lineHeight: initialLineHeight = 1.8,
  theme: initialTheme = 'dark',
  onChapterEnd,
  onBookmark,
}: NovelReaderProps) {
  const [mode, setMode] = useState<ReadingMode>(initialMode);
  const [fontSize, setFontSize] = useState(initialFontSize);
  const [fontFamily, setFontFamily] = useState(initialFontFamily);
  const [lineHeight, setLineHeight] = useState(initialLineHeight);
  const [theme, setTheme] = useState<NovelTheme>(initialTheme);
  const [showSettings, setShowSettings] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [highlightParagraph, setHighlightParagraph] = useState(-1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const themeConfig = THEMES[theme];
  const isDark = theme === 'dark' || theme === 'blue';
  const paragraphs = useMemo(() => content.split('\n').filter(p => p.trim()), [content]);

  // Font size cycling
  const cycleFontSize = useCallback((direction: 'up' | 'down') => {
    setFontSize(prev => {
      const idx = FONT_SIZES.indexOf(prev as typeof FONT_SIZES[number]);
      if (idx === -1) return prev;
      const next = direction === 'up' ? Math.min(idx + 1, FONT_SIZES.length - 1) : Math.max(idx - 1, 0);
      return FONT_SIZES[next];
    });
  }, []);

  // Scroll tracking
  useEffect(() => {
    if (mode !== 'scroll' || !contentRef.current) return;
    const el = contentRef.current;
    const handleScroll = () => {
      const pos = el.scrollTop / (el.scrollHeight - el.clientHeight);
      setScrollPosition(pos);
      if (pos > 0.98) onChapterEnd?.();
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [mode, onChapterEnd]);

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

  // Auto-scroll to highlighted paragraph (TTS)
  useEffect(() => {
    if (highlightParagraph < 0 || !contentRef.current) return;
    const el = contentRef.current.children[0]?.children[highlightParagraph] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightParagraph]);

  return (
    <div ref={containerRef} className={`flex flex-col h-full ${themeConfig.bg} transition-colors duration-300`}>
      {/* Toolbar */}
      <div className={`flex items-center justify-between px-3 py-2 border-b ${
        isDark ? 'border-white/5 bg-[#0f0f0f]' : 'border-black/10 bg-inherit'
      } flex-shrink-0`}>
        <div className="flex items-center gap-2">
          <BookOpen className={`w-4 h-4 ${isDark ? 'text-[#3ea6ff]' : 'text-blue-600'}`} />
          <span className={`text-sm font-medium truncate max-w-[200px] ${themeConfig.text}`}>{title}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Font size */}
          <button onClick={() => cycleFontSize('down')} className={`p-1.5 rounded ${isDark ? 'text-white/50 hover:text-white' : 'text-gray-500 hover:text-gray-800'}`} aria-label="减小字号">
            <Type className="w-3.5 h-3.5" />
          </button>
          <span className={`text-xs tabular-nums w-6 text-center ${isDark ? 'text-white/50' : 'text-gray-500'}`}>{fontSize}</span>
          <button onClick={() => cycleFontSize('up')} className={`p-1.5 rounded ${isDark ? 'text-white/50 hover:text-white' : 'text-gray-500 hover:text-gray-800'}`} aria-label="增大字号">
            <Type className="w-4.5 h-4.5" />
          </button>

          {/* Bookmark */}
          {onBookmark && (
            <button onClick={() => onBookmark(scrollPosition * content.length)} className={`p-1.5 rounded ${isDark ? 'text-white/50 hover:text-[#3ea6ff]' : 'text-gray-500 hover:text-blue-600'}`} aria-label="书签">
              <Bookmark className="w-4 h-4" />
            </button>
          )}

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} className={`p-1.5 rounded ${isDark ? 'text-white/50 hover:text-white' : 'text-gray-500 hover:text-gray-800'}`} aria-label={isFullscreen ? '退出全屏' : '全屏'}>
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>

          {/* Settings */}
          <button onClick={() => setShowSettings(!showSettings)} className={`p-1.5 rounded ${isDark ? 'text-white/50 hover:text-white' : 'text-gray-500 hover:text-gray-800'}`} aria-label="设置">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className={`px-4 py-3 border-b flex flex-col gap-3 ${
          isDark ? 'border-white/5 bg-[#1a1a1a]' : 'border-black/10 bg-black/5'
        }`}>
          {/* Theme selector */}
          <div>
            <span className={`text-xs mb-1.5 block ${isDark ? 'text-white/40' : 'text-gray-500'}`}>主题</span>
            <div className="flex items-center gap-1">
              {(Object.keys(THEMES) as NovelTheme[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                    theme === t ? 'bg-[#3ea6ff] text-black' : isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-gray-700'
                  }`}
                >
                  {THEMES[t].icon}
                  {THEMES[t].label}
                </button>
              ))}
            </div>
          </div>

          {/* Font family */}
          <div>
            <span className={`text-xs mb-1.5 block ${isDark ? 'text-white/40' : 'text-gray-500'}`}>字体</span>
            <div className="flex items-center gap-1 flex-wrap">
              {FONT_FAMILIES.map(f => (
                <button
                  key={f.id}
                  onClick={() => setFontFamily(f.id)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    fontFamily === f.id ? 'bg-[#3ea6ff] text-black' : isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-gray-700'
                  }`}
                  style={{ fontFamily: f.id }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Line height */}
          <div>
            <span className={`text-xs mb-1.5 block ${isDark ? 'text-white/40' : 'text-gray-500'}`}>行距</span>
            <div className="flex items-center gap-1">
              {[1.5, 1.8, 2.0, 2.5, 3.0].map(lh => (
                <button
                  key={lh}
                  onClick={() => setLineHeight(lh)}
                  className={`px-2 py-0.5 rounded text-xs ${
                    lineHeight === lh ? 'bg-[#3ea6ff] text-black' : isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-gray-700'
                  }`}
                >
                  {lh}
                </button>
              ))}
            </div>
          </div>

          {/* Mode toggle */}
          <button
            onClick={() => setMode(mode === 'page' ? 'scroll' : 'page')}
            className={`self-start px-2 py-1 rounded text-xs ${isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-gray-700'}`}
          >
            {mode === 'page' ? '翻页模式' : '滚动模式'}
          </button>
        </div>
      )}

      {/* TTS Controller */}
      <div className="px-4 py-2 flex-shrink-0">
        <TTSController
          content={content}
          paragraphs={paragraphs}
          theme={theme}
          onHighlight={setHighlightParagraph}
        />
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        className={`flex-1 overflow-y-auto px-4 sm:px-8 md:px-16 py-8 ${themeConfig.text}`}
        style={{ fontSize: `${fontSize}px`, lineHeight, fontFamily }}
      >
        <div className="max-w-2xl mx-auto">
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className={`mb-4 leading-relaxed transition-colors duration-300 ${
                highlightParagraph === i
                  ? isDark ? 'bg-[#3ea6ff]/10 rounded px-2 py-1 -mx-2' : 'bg-blue-100 rounded px-2 py-1 -mx-2'
                  : ''
              }`}
              style={{ textIndent: '2em' }}
            >
              {p}
            </p>
          ))}

          {/* Chapter end */}
          <div className={`text-center py-8 ${isDark ? 'text-white/20' : 'text-gray-400'}`}>
            <p className="text-sm">--- 本章完 ---</p>
            {onChapterEnd && (
              <button onClick={onChapterEnd} className="mt-2 text-sm text-[#3ea6ff] hover:underline">
                下一章
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Reading progress bar */}
      <div className={`h-0.5 flex-shrink-0 ${isDark ? 'bg-white/5' : 'bg-black/5'}`}>
        <div className="h-full bg-[#3ea6ff] transition-[width] duration-200" style={{ width: `${scrollPosition * 100}%` }} />
      </div>
    </div>
  );
}
