'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  Music,
  ListMusic,
  SlidersHorizontal,
  Timer,
  Heart,
  Share2,
  Mic2,
} from 'lucide-react';
import { useMusicPlayer, type PlaybackMode } from './MusicPlayerProvider';

// ---------------------------------------------------------------------------
// LRC Parser
// ---------------------------------------------------------------------------

export interface LrcLine {
  time: number;
  text: string;
}

export function parseLrc(lrcText: string): LrcLine[] {
  const lines: LrcLine[] = [];
  const regex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/;
  for (const raw of lrcText.split('\n')) {
    const match = raw.match(regex);
    if (!match) continue;
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
    const time = minutes * 60 + seconds + ms / 1000;
    const text = match[4].trim();
    if (text) lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

export function findCurrentLrcIndex(lines: LrcLine[], currentTime: number): number {
  if (lines.length === 0) return -1;
  let lo = 0, hi = lines.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= currentTime) { idx = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
const MODE_CYCLE: PlaybackMode[] = ['sequential', 'repeat-all', 'repeat-one', 'shuffle'];

// ---------------------------------------------------------------------------
// EQ Presets
// ---------------------------------------------------------------------------

interface EQPreset {
  id: string;
  label: string;
  gains: number[]; // 10 bands: 32, 64, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz
}

const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_BAND_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

const EQ_PRESETS: EQPreset[] = [
  { id: 'flat', label: '平坦', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass-boost', label: '低音增强', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: 'treble-boost', label: '高音增强', gains: [0, 0, 0, 0, 0, 0, 2, 4, 5, 6] },
  { id: 'vocal', label: '人声', gains: [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2] },
  { id: 'rock', label: '摇滚', gains: [4, 3, 1, 0, -1, -1, 0, 2, 3, 4] },
  { id: 'pop', label: '流行', gains: [-1, 0, 2, 4, 4, 2, 0, -1, -1, -1] },
  { id: 'jazz', label: '爵士', gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  { id: 'classical', label: '古典', gains: [3, 2, 1, 0, 0, 0, 0, 1, 2, 3] },
  { id: 'electronic', label: '电子', gains: [4, 3, 1, 0, -2, 0, 1, 3, 4, 4] },
  { id: 'night', label: '夜间模式', gains: [-3, -2, 0, 2, 3, 3, 2, 0, -2, -4] },
];

// ---------------------------------------------------------------------------
// Equalizer Component
// ---------------------------------------------------------------------------

function Equalizer({
  audioRef,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
}) {
  const [activePreset, setActivePreset] = useState('flat');
  const [gains, setGains] = useState<number[]>(EQ_PRESETS[0].gains);
  const [enabled, setEnabled] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Initialize Web Audio API
  const initAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || ctxRef.current) return;

    try {
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaElementSource(audio);
      sourceRef.current = source;

      const filters = EQ_BANDS.map((freq, i) => {
        const filter = ctx.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.4;
        filter.gain.value = gains[i];
        return filter;
      });
      filtersRef.current = filters;

      // Chain: source -> filter0 -> filter1 -> ... -> destination
      source.connect(filters[0]);
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1]);
      }
      filters[filters.length - 1].connect(ctx.destination);
    } catch {
      // Web Audio not supported
    }
  }, [audioRef, gains]);

  // Apply gains to filters
  useEffect(() => {
    if (!enabled) return;
    filtersRef.current.forEach((f, i) => {
      f.gain.value = gains[i];
    });
  }, [gains, enabled]);

  // Toggle EQ
  const toggleEQ = useCallback(() => {
    if (!enabled) {
      initAudio();
      setEnabled(true);
    } else {
      // Reset to flat
      filtersRef.current.forEach((f) => { f.gain.value = 0; });
      setEnabled(false);
    }
  }, [enabled, initAudio]);

  const applyPreset = useCallback((preset: EQPreset) => {
    setActivePreset(preset.id);
    setGains([...preset.gains]);
    if (!enabled) {
      initAudio();
      setEnabled(true);
    }
  }, [enabled, initAudio]);

  const handleBandChange = useCallback((index: number, value: number) => {
    setGains(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    setActivePreset('custom');
  }, []);

  return (
    <div className="px-4 py-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[#3ea6ff]" />
          均衡器
        </h3>
        <button
          onClick={toggleEQ}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            enabled ? 'bg-[#3ea6ff] text-black' : 'bg-white/10 text-white/50'
          }`}
        >
          {enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {EQ_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p)}
            className={`px-2 py-1 rounded text-xs transition-colors ${
              activePreset === p.id
                ? 'bg-[#3ea6ff]/20 text-[#3ea6ff] border border-[#3ea6ff]/30'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Band sliders */}
      <div className="flex items-end justify-between gap-1 h-32">
        {gains.map((g, i) => (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={g}
              onChange={(e) => handleBandChange(i, Number(e.target.value))}
              className="eq-slider"
              style={{
                writingMode: 'vertical-lr' as React.CSSProperties['writingMode'],
                direction: 'rtl',
                height: '80px',
                width: '20px',
                accentColor: '#3ea6ff',
              }}
              disabled={!enabled}
            />
            <span className="text-[9px] text-white/30">{EQ_BAND_LABELS[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sleep Timer
// ---------------------------------------------------------------------------

function SleepTimer({ onSleep }: { onSleep: () => void }) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const PRESETS = [15, 30, 45, 60, 90];

  const startTimer = useCallback((mins: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setMinutes(mins);
    setRemaining(mins * 60);
    timerRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setMinutes(null);
          onSleep();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [onSleep]);

  const cancelTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setMinutes(null);
    setRemaining(0);
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return (
    <div className="px-4 py-3">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
        <Timer className="w-4 h-4 text-[#3ea6ff]" />
        睡眠定时
      </h3>
      {minutes !== null ? (
        <div className="flex items-center justify-between">
          <span className="text-sm text-white">
            {Math.floor(remaining / 60)}:{(remaining % 60).toString().padStart(2, '0')} 后停止
          </span>
          <button
            onClick={cancelTimer}
            className="px-3 py-1 rounded text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
          >
            取消
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((m) => (
            <button
              key={m}
              onClick={() => startTimer(m)}
              className="px-3 py-1.5 rounded text-xs bg-white/5 text-white/60 hover:bg-white/10 transition-colors"
            >
              {m}分钟
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enhanced LRC Lyrics Display with tap-to-seek
// ---------------------------------------------------------------------------

function LyricsDisplay({
  lrcUrl,
  currentTime,
  onSeek,
}: {
  lrcUrl?: string;
  currentTime: number;
  onSeek?: (time: number) => void;
}) {
  const [lines, setLines] = useState<LrcLine[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!lrcUrl) { setLines([]); return; }
    let cancelled = false;
    setLoading(true);
    fetch(lrcUrl)
      .then((r) => r.text())
      .then((text) => { if (!cancelled) setLines(parseLrc(text)); })
      .catch(() => { if (!cancelled) setLines([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lrcUrl]);

  const currentIdx = findCurrentLrcIndex(lines, currentTime);

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIdx]);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-white/30 text-sm">加载歌词中...</div>;
  }

  if (lines.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-white/20">
          <Mic2 className="w-10 h-10" />
          <span className="text-sm">暂无歌词</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-6 py-8 scrollbar-hide"
      style={{ maskImage: 'linear-gradient(transparent, black 15%, black 85%, transparent)' }}
    >
      <div className="space-y-3 py-20">
        {lines.map((line, i) => {
          const isCurrent = i === currentIdx;
          const isPast = i < currentIdx;
          return (
            <p
              key={`${line.time}-${i}`}
              ref={isCurrent ? activeRef : undefined}
              onClick={() => onSeek?.(line.time)}
              className={`text-center transition-all duration-300 cursor-pointer hover:text-white/60 ${
                isCurrent
                  ? 'text-[#3ea6ff] text-lg font-semibold scale-105'
                  : isPast
                    ? 'text-white/25 text-sm'
                    : 'text-white/40 text-sm'
              }`}
            >
              {line.text}
            </p>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode Icon & Label
// ---------------------------------------------------------------------------

function ModeIcon({ mode }: { mode: PlaybackMode }) {
  switch (mode) {
    case 'shuffle': return <Shuffle className="w-5 h-5" />;
    case 'repeat-one': return <Repeat1 className="w-5 h-5" />;
    case 'repeat-all': return <Repeat className="w-5 h-5" />;
    default: return <Repeat className="w-5 h-5 opacity-40" />;
  }
}

function modeLabel(mode: PlaybackMode): string {
  switch (mode) {
    case 'sequential': return '顺序播放';
    case 'repeat-all': return '列表循环';
    case 'repeat-one': return '单曲循环';
    case 'shuffle': return '随机播放';
  }
}

// ---------------------------------------------------------------------------
// Mini Player Bar
// ---------------------------------------------------------------------------

function MiniPlayerBar({ onExpand, onClose }: { onExpand: () => void; onClose: () => void }) {
  const { state, actions } = useMusicPlayer();
  const { currentTrack, isPlaying, currentTime, duration } = state;

  if (!currentTrack) return null;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-16 bg-[#0f0f0f] border-t border-white/5 z-40 flex flex-col lg:bottom-0 bottom-14">
      <div className="w-full h-0.5 bg-white/10 flex-shrink-0">
        <div className="h-full bg-[#3ea6ff] transition-[width] duration-200" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex-1 flex items-center gap-3 px-3 cursor-pointer" onClick={onExpand}>
        {currentTrack.cover ? (
          <img src={currentTrack.cover} alt={currentTrack.album} className="w-10 h-10 rounded object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center flex-shrink-0">
            <Music className="w-5 h-5 text-white/30" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{currentTrack.title}</p>
          <p className="text-xs text-white/50 truncate">{currentTrack.artist}</p>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button onClick={actions.previous} className="p-2 text-white/70 hover:text-white transition-colors" aria-label="上一首">
            <SkipBack className="w-4 h-4" />
          </button>
          <button onClick={actions.togglePlay} className="p-2 text-white hover:text-[#3ea6ff] transition-colors" aria-label={isPlaying ? '暂停' : '播放'}>
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button onClick={actions.next} className="p-2 text-white/70 hover:text-white transition-colors" aria-label="下一首">
            <SkipForward className="w-4 h-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-2 text-white/40 hover:text-white transition-colors ml-1" aria-label="关闭播放器">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full Screen Player (enhanced with EQ, sleep timer, settings tabs)
// ---------------------------------------------------------------------------

type PlayerTab = 'lyrics' | 'queue' | 'eq' | 'settings';

function FullScreenPlayer({ onCollapse }: { onCollapse: () => void }) {
  const { state, actions, audioRef } = useMusicPlayer();
  const { currentTrack, isPlaying, currentTime, duration, volume, mode, playbackRate } = state;
  const [activeTab, setActiveTab] = useState<PlayerTab>('lyrics');
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [liked, setLiked] = useState(false);

  if (!currentTrack) return null;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    actions.seek(ratio * duration);
  };

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    actions.setVolume(ratio);
  };

  const cycleMode = () => {
    const idx = MODE_CYCLE.indexOf(mode);
    actions.setMode(MODE_CYCLE[(idx + 1) % MODE_CYCLE.length]);
  };

  return (
    <div className="fixed inset-0 bg-[#0f0f0f] z-50 flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button onClick={onCollapse} className="p-2 text-white/70 hover:text-white transition-colors" aria-label="收起">
          <ChevronDown className="w-6 h-6" />
        </button>
        <div className="text-center flex-1 min-w-0">
          <p className="text-sm text-white/70 truncate">正在播放</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setLiked(!liked)} className={`p-2 transition-colors ${liked ? 'text-red-500' : 'text-white/50 hover:text-white'}`} aria-label="收藏">
            <Heart className={`w-5 h-5 ${liked ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 mb-2 flex-shrink-0">
        {([
          { id: 'lyrics' as const, label: '歌词', icon: Mic2 },
          { id: 'queue' as const, label: '队列', icon: ListMusic },
          { id: 'eq' as const, label: '均衡器', icon: SlidersHorizontal },
          { id: 'settings' as const, label: '设置', icon: Timer },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors ${
              activeTab === id ? 'bg-[#3ea6ff]/15 text-[#3ea6ff]' : 'text-white/50 hover:text-white/70'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'lyrics' && (
        <>
          {/* Album cover (smaller) */}
          <div className="flex-shrink-0 flex items-center justify-center px-8 py-4">
            {currentTrack.cover ? (
              <img
                src={currentTrack.cover}
                alt={currentTrack.album}
                className={`w-48 h-48 sm:w-56 sm:h-56 rounded-xl object-cover shadow-2xl transition-transform duration-700 ${isPlaying ? 'animate-spin-slow' : ''}`}
                style={isPlaying ? { animationDuration: '20s' } : undefined}
              />
            ) : (
              <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-xl bg-white/5 flex items-center justify-center">
                <Music className="w-16 h-16 text-white/10" />
              </div>
            )}
          </div>
          <div className="px-6 text-center flex-shrink-0">
            <h2 className="text-lg font-semibold text-white truncate">{currentTrack.title}</h2>
            <p className="text-sm text-white/50 truncate mt-1">{currentTrack.artist}</p>
          </div>
          <LyricsDisplay lrcUrl={currentTrack.lrcUrl} currentTime={currentTime} onSeek={actions.seek} />
        </>
      )}

      {activeTab === 'queue' && (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <h3 className="text-sm font-semibold text-white/70 mb-3">播放队列 ({state.queue.length} 首)</h3>
          {state.queue.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-8">队列为空</p>
          ) : (
            <div className="space-y-1">
              {state.queue.map((track, i) => (
                <div
                  key={`${track.id}-${i}`}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                    i === state.currentIndex ? 'bg-[#3ea6ff]/10 border border-[#3ea6ff]/20' : 'hover:bg-white/5'
                  }`}
                  onClick={() => actions.setQueue(state.queue, i)}
                >
                  {track.cover ? (
                    <img src={track.cover} alt="" className="w-10 h-10 rounded object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center">
                      <Music className="w-4 h-4 text-white/30" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${i === state.currentIndex ? 'text-[#3ea6ff]' : 'text-white'}`}>{track.title}</p>
                    <p className="text-xs text-white/50 truncate">{track.artist}</p>
                  </div>
                  <span className="text-xs text-white/30 tabular-nums">{formatTime(track.duration)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'eq' && (
        <div className="flex-1 overflow-y-auto">
          <Equalizer audioRef={audioRef} />
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="flex-1 overflow-y-auto">
          <SleepTimer onSleep={() => actions.pause()} />
          {/* Playback mode settings */}
          <div className="px-4 py-3 border-t border-white/5">
            <h3 className="text-sm font-semibold text-white mb-3">播放模式</h3>
            <div className="grid grid-cols-2 gap-2">
              {MODE_CYCLE.map((m) => (
                <button
                  key={m}
                  onClick={() => actions.setMode(m)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                    mode === m ? 'bg-[#3ea6ff]/15 text-[#3ea6ff] border border-[#3ea6ff]/30' : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  <ModeIcon mode={m} />
                  {modeLabel(m)}
                </button>
              ))}
            </div>
          </div>
          {/* Playback speed */}
          <div className="px-4 py-3 border-t border-white/5">
            <h3 className="text-sm font-semibold text-white mb-3">播放速度</h3>
            <div className="flex flex-wrap gap-2">
              {PLAYBACK_RATES.map((rate) => (
                <button
                  key={rate}
                  onClick={() => actions.setPlaybackRate(rate)}
                  className={`px-3 py-1.5 rounded text-xs transition-colors ${
                    playbackRate === rate ? 'bg-[#3ea6ff] text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom controls — always visible */}
      <div className="flex-shrink-0 px-6 pb-6 pt-2" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
        {/* Progress bar */}
        <div className="w-full h-1.5 bg-white/10 rounded-full cursor-pointer mb-2 group relative" onClick={handleProgressClick}>
          <div className="h-full bg-[#3ea6ff] rounded-full relative" style={{ width: `${progress}%` }}>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#3ea6ff] rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="flex justify-between text-xs text-white/40 tabular-nums mb-4">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Main controls */}
        <div className="flex items-center justify-center gap-6 mb-4">
          <button
            onClick={cycleMode}
            className={`p-2 transition-colors ${mode !== 'sequential' ? 'text-[#3ea6ff]' : 'text-white/50 hover:text-white'}`}
            aria-label={modeLabel(mode)}
            title={modeLabel(mode)}
          >
            <ModeIcon mode={mode} />
          </button>
          <button onClick={actions.previous} className="p-2 text-white hover:text-[#3ea6ff] transition-colors" aria-label="上一首">
            <SkipBack className="w-6 h-6" />
          </button>
          <button
            onClick={actions.togglePlay}
            className="w-14 h-14 rounded-full bg-[#3ea6ff] flex items-center justify-center text-black hover:bg-[#3ea6ff]/90 transition-colors"
            aria-label={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
          </button>
          <button onClick={actions.next} className="p-2 text-white hover:text-[#3ea6ff] transition-colors" aria-label="下一首">
            <SkipForward className="w-6 h-6" />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className={`p-2 text-xs font-semibold transition-colors ${playbackRate !== 1 ? 'text-[#3ea6ff]' : 'text-white/50 hover:text-white'}`}
              aria-label="播放速度"
            >
              {playbackRate}x
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-[#1a1a1a] border border-white/10 rounded-lg py-1 min-w-[80px] shadow-lg">
                {PLAYBACK_RATES.map((rate) => (
                  <button
                    key={rate}
                    onClick={() => { actions.setPlaybackRate(rate); setShowSpeedMenu(false); }}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${playbackRate === rate ? 'text-[#3ea6ff]' : 'text-white'}`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Volume slider */}
        <div className="flex items-center gap-2">
          <button onClick={() => actions.setVolume(volume > 0 ? 0 : 0.8)} className="p-1 text-white/50 hover:text-white transition-colors" aria-label={volume === 0 ? '取消静音' : '静音'}>
            {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <div className="flex-1 h-1 bg-white/10 rounded-full cursor-pointer group" onClick={handleVolumeClick}>
            <div className="h-full bg-white/40 rounded-full relative" style={{ width: `${volume * 100}%` }}>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <span className="text-xs text-white/30 tabular-nums w-8 text-right">{Math.round(volume * 100)}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main MusicPlayer Component
// ---------------------------------------------------------------------------

export default function MusicPlayer() {
  const { state, actions } = useMusicPlayer();
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (state.currentTrack && state.isPlaying) setHidden(false);
  }, [state.currentTrack, state.isPlaying]);

  if (!state.currentTrack && state.queue.length === 0) return null;

  return (
    <>
      {!expanded && !hidden && <MiniPlayerBar onExpand={() => setExpanded(true)} onClose={() => { actions.pause(); setHidden(true); }} />}
      {expanded && <FullScreenPlayer onCollapse={() => setExpanded(false)} />}
    </>
  );
}
