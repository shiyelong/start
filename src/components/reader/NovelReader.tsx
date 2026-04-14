'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  BookOpen, ChevronLeft, ChevronRight, Bookmark, Settings,
  Volume2, VolumeX, Sun, Moon, Leaf, ScrollText, Type
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NovelTheme = 'dark' | 'light' | 'sepia' | 'green';
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

const THEMES: Record<NovelTheme, { bg: string; text: string; label: string; icon: React.ReactNode }> = {
  dark: { bg: 'bg-[#0f0f0f]', text: 'text-gray-200', label: 'Dark', icon: <Moon className="w-4 h-4" /> },
  light: { bg: 'bg-white', text: 'text-gray-900', label: 'Light', icon: <Sun className="w-4 h-4" /> },
  sepia: { bg: 'bg-[#f4ecd8]', text: 'text-[#5b4636]', label: 'Sepia', icon: <ScrollText className="w-4 h-4" /> },
  green: { bg: 'bg-[#c7edcc]', text: 'text-[#2d4a2e]', label: 'Green', icon: <Leaf className="w-4 h-4" /> },
};

const FONT_SIZES = [14, 16, 18, 20, 24] as const;

// ---------------------------------------------------------------------------
// Component
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
  const [lineHeight, setLineHeight] = useState(initialLineHeight);
  const [theme, setTheme] = useState<NovelTheme>(initialTheme);
  const [showSettings, setShowSettings] = useState(false);
  const [ttsActive, setTtsActive] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const themeConfig = THEMES[theme];

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

  // TTS
  const toggleTTS = useCallback(() => {
    if (ttsActive) {
      speechSynthesis.cancel();
      setTtsActive(false);
    } else {
      const utterance = new SpeechSynthesisUtterance(content);
      utterance.lang = 'zh-CN';
      utterance.rate = 1;
      utterance.onend = () => setTtsActive(false);
      speechSynthesis.speak(utterance);
      setTtsActive(true);
    }
  }, [ttsActive, content]);

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => { speechSynthesis.cancel(); };
  }, []);

  // Split content into paragraphs
  const paragraphs = content.split('\n').filter(p => p.trim());

  return (
    <div className={`flex flex-col h-full ${themeConfig.bg} transition-colors duration-300`}>
      {/* Toolbar */}
      <div className={`flex items-center justify-between px-3 py-2 border-b ${
        theme === 'dark' ? 'border-white/5 bg-[#0f0f0f]' : 'border-black/10 bg-inherit'
      } flex-shrink-0`}>
        <div className="flex items-center gap-2">
          <BookOpen className={`w-4 h-4 ${theme === 'dark' ? 'text-[#3ea6ff]' : 'text-blue-600'}`} />
          <span className={`text-sm font-medium truncate max-w-[200px] ${themeConfig.text}`}>{title}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Font size */}
          <button
            onClick={() => cycleFontSize('down')}
            className={`p-1.5 rounded ${theme === 'dark' ? 'text-white/50 hover:text-white' : 'text-gray-500 hover:text-gray-800'}`}
            aria-label="Decrease font size"
          >
            <Type className="w-3.5 h-3.5" />
          </button>
          <span className={`text-xs tabular-nums w-6 text-center ${theme === 'dark' ? 'text-white/50' : 'text-gray-500'}`}>
            {fontSize}
          </span>
          <button
            onClick={() => cycleFontSize('up')}
            className={`p-1.5 rounded ${theme === 'dark' ? 'text-white/50 hover:text-white' : 'text-gray-500 hover:text-gray-800'}`}
            aria-label="Increase font size"
          >
            <Type className="w-4.5 h-4.5" />
          </button>

          {/* TTS */}
          <button
            onClick={toggleTTS}
            className={`p-1.5 rounded transition-colors ${
              ttsActive
                ? 'text-[#3ea6ff]'
                : theme === 'dark' ? 'text-white/50 hover:text-white' : 'text-gray-500 hover:text-gray-800'
            }`}
            aria-label={ttsActive ? 'Stop reading' : 'Read aloud'}
          >
            {ttsActive ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Bookmark */}
          {onBookmark && (
            <button
              onClick={() => onBookmark(scrollPosition * content.length)}
              className={`p-1.5 rounded ${theme === 'dark' ? 'text-white/50 hover:text-[#3ea6ff]' : 'text-gray-500 hover:text-blue-600'}`}
              aria-label="Bookmark"
            >
              <Bookmark className="w-4 h-4" />
            </button>
          )}

          {/* Settings */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded ${theme === 'dark' ? 'text-white/50 hover:text-white' : 'text-gray-500 hover:text-gray-800'}`}
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className={`px-4 py-3 border-b flex flex-wrap gap-3 ${
          theme === 'dark' ? 'border-white/5 bg-[#1a1a1a]' : 'border-black/10 bg-black/5'
        }`}>
          {/* Theme selector */}
          <div className="flex items-center gap-1">
            {(Object.keys(THEMES) as NovelTheme[]).map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  theme === t ? 'bg-[#3ea6ff] text-black' : theme === 'dark' ? 'bg-white/10 text-white' : 'bg-black/10 text-gray-700'
                }`}
              >
                {THEMES[t].icon}
                {THEMES[t].label}
              </button>
            ))}
          </div>

          {/* Line height */}
          <div className="flex items-center gap-2">
            <span className={`text-xs ${theme === 'dark' ? 'text-white/50' : 'text-gray-500'}`}>Line:</span>
            {[1.5, 1.8, 2.0, 2.5].map(lh => (
              <button
                key={lh}
                onClick={() => setLineHeight(lh)}
                className={`px-2 py-0.5 rounded text-xs ${
                  lineHeight === lh ? 'bg-[#3ea6ff] text-black' : theme === 'dark' ? 'bg-white/10 text-white' : 'bg-black/10 text-gray-700'
                }`}
              >
                {lh}
              </button>
            ))}
          </div>

          {/* Mode toggle */}
          <button
            onClick={() => setMode(mode === 'page' ? 'scroll' : 'page')}
            className={`px-2 py-1 rounded text-xs ${theme === 'dark' ? 'bg-white/10 text-white' : 'bg-black/10 text-gray-700'}`}
          >
            {mode === 'page' ? 'Page Mode' : 'Scroll Mode'}
          </button>
        </div>
      )}

      {/* Content */}
      <div
        ref={contentRef}
        className={`flex-1 overflow-y-auto px-4 sm:px-8 md:px-16 py-8 ${themeConfig.text}`}
        style={{ fontSize: `${fontSize}px`, lineHeight, fontFamily: initialFontFamily }}
      >
        <div className="max-w-2xl mx-auto">
          {paragraphs.map((p, i) => (
            <p key={i} className="mb-4 text-indent-8 leading-relaxed">
              {p}
            </p>
          ))}

          {/* Chapter end indicator */}
          <div className={`text-center py-8 ${theme === 'dark' ? 'text-white/20' : 'text-gray-400'}`}>
            <p className="text-sm">--- End of Chapter ---</p>
            {onChapterEnd && (
              <button
                onClick={onChapterEnd}
                className="mt-2 text-sm text-[#3ea6ff] hover:underline"
              >
                Next Chapter
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
