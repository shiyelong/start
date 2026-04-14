'use client';

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { ContentRating } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  source: string;
  duration: number;
  streamUrl: string;
  lrcUrl?: string;
  rating: ContentRating;
}

export type PlaybackMode = 'sequential' | 'repeat-one' | 'shuffle' | 'repeat-all';

export interface MusicPlayerState {
  isPlaying: boolean;
  currentTrack: MusicTrack | null;
  queue: MusicTrack[];
  currentIndex: number;
  currentTime: number;
  duration: number;
  volume: number;
  mode: PlaybackMode;
  playbackRate: number;
}

export interface MusicPlayerActions {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  setMode: (mode: PlaybackMode) => void;
  setPlaybackRate: (rate: number) => void;
  setQueue: (tracks: MusicTrack[], startIndex?: number) => void;
  addToQueue: (track: MusicTrack) => void;
  removeFromQueue: (index: number) => void;
  playTrack: (track: MusicTrack) => void;
}

interface MusicPlayerContextValue {
  state: MusicPlayerState;
  actions: MusicPlayerActions;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'starhub_music_player';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}


interface PersistedState {
  queue: MusicTrack[];
  currentIndex: number;
  volume: number;
  mode: PlaybackMode;
  playbackRate: number;
  currentTime: number;
}

function loadPersistedState(): Partial<PersistedState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PersistedState>;
  } catch {
    return {};
  }
}

function persistState(state: PersistedState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota exceeded — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

export function useMusicPlayer(): MusicPlayerContextValue {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) {
    throw new Error('useMusicPlayer must be used within a MusicPlayerProvider');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export default function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialise state from localStorage
  const [state, setState] = useState<MusicPlayerState>(() => {
    const saved = loadPersistedState();
    return {
      isPlaying: false,
      currentTrack: saved.queue?.[saved.currentIndex ?? 0] ?? null,
      queue: saved.queue ?? [],
      currentIndex: saved.currentIndex ?? 0,
      currentTime: saved.currentTime ?? 0,
      duration: 0,
      volume: saved.volume ?? 0.8,
      mode: saved.mode ?? 'sequential',
      playbackRate: saved.playbackRate ?? 1,
    };
  });

  // Debounced persist
  const schedulePersist = useCallback((s: MusicPlayerState) => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistState({
        queue: s.queue,
        currentIndex: s.currentIndex,
        volume: s.volume,
        mode: s.mode,
        playbackRate: s.playbackRate,
        currentTime: s.currentTime,
      });
    }, 500);
  }, []);

  // Persist on meaningful state changes
  useEffect(() => {
    schedulePersist(state);
  }, [state.queue, state.currentIndex, state.volume, state.mode, state.playbackRate, schedulePersist]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Audio element event wiring
  // -----------------------------------------------------------------------

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setState((prev) => ({ ...prev, currentTime: audio.currentTime }));
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setState((prev) => ({ ...prev, duration: audio.duration }));
  }, []);

  const handleEnded = useCallback(() => {
    setState((prev) => {
      const { mode, queue, currentIndex } = prev;
      if (mode === 'repeat-one') {
        // replay same track
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        }
        return { ...prev, currentTime: 0 };
      }

      let nextIndex: number;
      if (mode === 'shuffle') {
        if (queue.length <= 1) {
          nextIndex = 0;
        } else {
          do {
            nextIndex = Math.floor(Math.random() * queue.length);
          } while (nextIndex === currentIndex && queue.length > 1);
        }
      } else {
        // sequential or repeat-all
        nextIndex = currentIndex + 1;
        if (nextIndex >= queue.length) {
          if (mode === 'repeat-all') {
            nextIndex = 0;
          } else {
            // sequential — stop at end
            return { ...prev, isPlaying: false, currentTime: 0 };
          }
        }
      }

      const nextTrack = queue[nextIndex] ?? null;
      return {
        ...prev,
        currentIndex: nextIndex,
        currentTrack: nextTrack,
        currentTime: 0,
        isPlaying: !!nextTrack,
      };
    });
  }, []);

  // When currentTrack changes, load and play
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.currentTrack) return;

    if (audio.src !== state.currentTrack.streamUrl) {
      audio.src = state.currentTrack.streamUrl;
      audio.load();
    }

    if (state.isPlaying) {
      audio.play().catch(() => {});
    }
  }, [state.currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync isPlaying
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.currentTrack) return;
    if (state.isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [state.isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync volume
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = state.volume;
  }, [state.volume]);

  // Sync playback rate
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = state.playbackRate;
  }, [state.playbackRate]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const play = useCallback(() => {
    setState((prev) => (prev.currentTrack ? { ...prev, isPlaying: true } : prev));
  }, []);

  const pause = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const togglePlay = useCallback(() => {
    setState((prev) =>
      prev.currentTrack ? { ...prev, isPlaying: !prev.isPlaying } : prev,
    );
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = clamp(time, 0, audio.duration || 0);
    audio.currentTime = t;
    setState((prev) => ({ ...prev, currentTime: t }));
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = clamp(v, 0, 1);
    setState((prev) => ({ ...prev, volume: clamped }));
  }, []);

  const setMode = useCallback((mode: PlaybackMode) => {
    setState((prev) => ({ ...prev, mode }));
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    setState((prev) => ({ ...prev, playbackRate: rate }));
  }, []);

  const next = useCallback(() => {
    setState((prev) => {
      const { queue, currentIndex, mode } = prev;
      if (queue.length === 0) return prev;

      let nextIndex: number;
      if (mode === 'shuffle') {
        if (queue.length <= 1) {
          nextIndex = 0;
        } else {
          do {
            nextIndex = Math.floor(Math.random() * queue.length);
          } while (nextIndex === currentIndex && queue.length > 1);
        }
      } else {
        nextIndex = (currentIndex + 1) % queue.length;
      }

      return {
        ...prev,
        currentIndex: nextIndex,
        currentTrack: queue[nextIndex] ?? null,
        currentTime: 0,
        isPlaying: true,
      };
    });
  }, []);

  const previous = useCallback(() => {
    setState((prev) => {
      const { queue, currentIndex } = prev;
      if (queue.length === 0) return prev;

      // If more than 3 seconds in, restart current track
      if (prev.currentTime > 3) {
        const audio = audioRef.current;
        if (audio) audio.currentTime = 0;
        return { ...prev, currentTime: 0 };
      }

      const prevIndex = (currentIndex - 1 + queue.length) % queue.length;
      return {
        ...prev,
        currentIndex: prevIndex,
        currentTrack: queue[prevIndex] ?? null,
        currentTime: 0,
        isPlaying: true,
      };
    });
  }, []);

  const setQueue = useCallback((tracks: MusicTrack[], startIndex = 0) => {
    const idx = clamp(startIndex, 0, Math.max(0, tracks.length - 1));
    setState((prev) => ({
      ...prev,
      queue: tracks,
      currentIndex: idx,
      currentTrack: tracks[idx] ?? null,
      currentTime: 0,
      isPlaying: tracks.length > 0,
    }));
  }, []);

  const addToQueue = useCallback((track: MusicTrack) => {
    setState((prev) => ({
      ...prev,
      queue: [...prev.queue, track],
    }));
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setState((prev) => {
      const newQueue = prev.queue.filter((_, i) => i !== index);
      let newIndex = prev.currentIndex;
      if (index < prev.currentIndex) {
        newIndex = prev.currentIndex - 1;
      } else if (index === prev.currentIndex) {
        // Current track removed — play next or stop
        if (newQueue.length === 0) {
          return { ...prev, queue: [], currentIndex: 0, currentTrack: null, isPlaying: false };
        }
        newIndex = Math.min(prev.currentIndex, newQueue.length - 1);
      }
      return {
        ...prev,
        queue: newQueue,
        currentIndex: newIndex,
        currentTrack: newQueue[newIndex] ?? null,
      };
    });
  }, []);

  const playTrack = useCallback((track: MusicTrack) => {
    setState((prev) => {
      const existingIndex = prev.queue.findIndex((t) => t.id === track.id);
      if (existingIndex >= 0) {
        return {
          ...prev,
          currentIndex: existingIndex,
          currentTrack: track,
          currentTime: 0,
          isPlaying: true,
        };
      }
      // Add to queue and play
      const newQueue = [...prev.queue, track];
      return {
        ...prev,
        queue: newQueue,
        currentIndex: newQueue.length - 1,
        currentTrack: track,
        currentTime: 0,
        isPlaying: true,
      };
    });
  }, []);

  const actions: MusicPlayerActions = {
    play,
    pause,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    setMode,
    setPlaybackRate,
    setQueue,
    addToQueue,
    removeFromQueue,
    playTrack,
  };

  return (
    <MusicPlayerContext.Provider value={{ state, actions, audioRef }}>
      {children}
      {/* Hidden audio element — drives all playback */}
      <audio
        ref={audioRef}
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />
    </MusicPlayerContext.Provider>
  );
}
