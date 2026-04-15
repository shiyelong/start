'use client';

import Link from 'next/link';
import { Tv, Music, Mic2, Newspaper, Search, Mic } from 'lucide-react';
import { FocusProvider, useFocusable } from './FocusNavigation';
import { useState, useCallback } from 'react';
import type { ReactNode } from 'react';

// =============================================================================
// Elder Mode — super large font (24px+), simplified navigation,
// voice search stub, auto-filter PG-13+ content
// =============================================================================

// ---------------------------------------------------------------------------
// Elder navigation entries — simplified to 4 core actions
// ---------------------------------------------------------------------------

interface ElderNavEntry {
  href: string;
  label: string;
  icon: ReactNode;
  color: string;
  description: string;
}

const ELDER_NAV: ElderNavEntry[] = [
  {
    href: '/videos?mode=elder',
    label: '看电视',
    icon: <Tv size={64} />,
    color: 'bg-blue-600',
    description: '电视剧、电影、综艺',
  },
  {
    href: '/music?mode=elder',
    label: '听音乐',
    icon: <Music size={64} />,
    color: 'bg-green-600',
    description: '经典老歌、戏曲、民乐',
  },
  {
    href: '/music?genre=opera&mode=elder',
    label: '听戏曲',
    icon: <Mic2 size={64} />,
    color: 'bg-red-600',
    description: '京剧、越剧、黄梅戏',
  },
  {
    href: '/videos?type=news&mode=elder',
    label: '看新闻',
    icon: <Newspaper size={64} />,
    color: 'bg-amber-600',
    description: '新闻联播、时事热点',
  },
];

// ---------------------------------------------------------------------------
// Elder Nav Card
// ---------------------------------------------------------------------------

interface ElderNavCardProps {
  entry: ElderNavEntry;
  row: number;
  col: number;
}

function ElderNavCard({ entry, row, col }: ElderNavCardProps) {
  const { ref, isFocused, focusProps } = useFocusable({
    id: `elder-nav-${row}-${col}`,
    row,
    col,
  });

  return (
    <Link
      href={entry.href}
      ref={ref as React.Ref<HTMLAnchorElement>}
      {...focusProps}
      className={`
        flex flex-col items-center justify-center gap-6
        rounded-3xl p-8
        ${entry.color} text-white
        transition-all duration-200
        min-h-[240px]
        ${isFocused ? 'ring-6 ring-white scale-105 shadow-2xl' : 'opacity-90'}
      `}
    >
      {entry.icon}
      <span className="text-4xl font-bold">{entry.label}</span>
      <span className="text-2xl opacity-80">{entry.description}</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Voice Search Stub
// ---------------------------------------------------------------------------

interface VoiceSearchProps {
  onResult?: (text: string) => void;
}

function VoiceSearch({ onResult }: VoiceSearchProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  const startListening = useCallback(() => {
    // Web Speech API stub
    if (typeof window === 'undefined') return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('[ElderMode] SpeechRecognition not supported');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);

    recognition.onresult = (event: { results: { transcript: string }[][] }) => {
      const text = event.results[0]?.[0]?.transcript ?? '';
      setTranscript(text);
      onResult?.(text);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.start();
  }, [onResult]);

  const { ref, focusProps } = useFocusable({
    id: 'elder-voice-search',
    row: 1,
    col: 0,
    onSelect: startListening,
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        {...focusProps}
        onClick={startListening}
        className={`
          flex items-center gap-4 px-10 py-6 rounded-full
          text-3xl font-bold
          transition-all duration-200
          ${isListening
            ? 'bg-red-600 text-white animate-pulse'
            : 'bg-white/10 text-white hover:bg-white/20'
          }
          ${focusProps.className}
        `}
        aria-label="语音搜索"
      >
        {isListening ? (
          <Mic size={36} className="animate-bounce" />
        ) : (
          <Search size={36} />
        )}
        {isListening ? '正在听...' : '语音搜索'}
      </button>

      {transcript && (
        <p className="text-2xl text-gray-300">
          搜索: <span className="text-[#3ea6ff]">{transcript}</span>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Elder Mode Content Filter Notice
// ---------------------------------------------------------------------------

function ContentFilterNotice() {
  return (
    <div className="text-center text-xl text-gray-500 mt-4">
      已开启长辈模式 — 仅显示适合全年龄的内容（G/PG级）
    </div>
  );
}

// ---------------------------------------------------------------------------
// Remote Control Help
// ---------------------------------------------------------------------------

function RemoteHelp() {
  const controls = [
    { key: '上/下/左/右', action: '移动选择' },
    { key: '确认键', action: '打开/播放' },
    { key: '返回键', action: '返回上一页' },
  ];

  return (
    <div className="mt-12 p-8 rounded-2xl bg-white/5 max-w-2xl mx-auto">
      <h3 className="text-3xl font-bold text-center mb-6">遥控器操作说明</h3>
      <div className="space-y-4">
        {controls.map((c) => (
          <div key={c.key} className="flex justify-between text-2xl">
            <span className="text-[#3ea6ff] font-bold">{c.key}</span>
            <span className="text-gray-300">{c.action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Elder Mode Main Component
// ---------------------------------------------------------------------------

interface ElderModeProps {
  /** Show the remote control help section */
  showHelp?: boolean;
  /** Callback when voice search produces a result */
  onVoiceSearch?: (text: string) => void;
}

export default function ElderMode({ showHelp = true, onVoiceSearch }: ElderModeProps) {
  return (
    <FocusProvider onBack={() => window.history.back()}>
      {/* Elder mode uses a minimum 24px base font */}
      <div className="min-h-screen bg-[#0f0f0f] text-white" style={{ fontSize: '24px' }}>
        {/* Header */}
        <header className="flex items-center justify-center py-8 border-b border-white/5">
          <h1 className="text-5xl font-bold text-[#3ea6ff]">星聚 · 长辈版</h1>
        </header>

        {/* Navigation grid — 2x2 large cards */}
        <div className="grid grid-cols-2 gap-8 p-12 max-w-5xl mx-auto">
          {ELDER_NAV.map((entry, idx) => (
            <ElderNavCard
              key={entry.href}
              entry={entry}
              row={Math.floor(idx / 2)}
              col={idx % 2}
            />
          ))}
        </div>

        {/* Voice search */}
        <div className="flex justify-center py-8">
          <VoiceSearch onResult={onVoiceSearch} />
        </div>

        {/* Content filter notice */}
        <ContentFilterNotice />

        {/* Remote help */}
        {showHelp && <RemoteHelp />}
      </div>
    </FocusProvider>
  );
}
