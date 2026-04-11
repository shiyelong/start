'use client';

import { useState, useEffect, useCallback } from 'react';
import { Volume2, VolumeX, Clock, X } from 'lucide-react';
import clsx from 'clsx';
import type { ConsolePlatform, AudioPrefs } from '@/lib/types';
import { CORE_REGISTRY } from '@/lib/emulator/core-registry';

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

const DB_NAME = 'fc-arcade-online';
const DB_VERSION = 3;
const SETTINGS_STORE = 'settings';

function openSettingsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('roms')) db.createObjectStore('roms', { keyPath: 'hash' });
      if (!db.objectStoreNames.contains('save-states')) db.createObjectStore('save-states');
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadAudioSettings(platform: ConsolePlatform): Promise<AudioPrefs | null> {
  const db = await openSettingsDB();
  return new Promise<AudioPrefs | null>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const store = tx.objectStore(SETTINGS_STORE);
    const req = store.get(`audio:${platform}`);
    req.onsuccess = () => resolve((req.result as AudioPrefs) ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function saveAudioSettings(platform: ConsolePlatform, prefs: AudioPrefs): Promise<void> {
  const db = await openSettingsDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.put(prefs, `audio:${platform}`);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Channel label map (Chinese)
// ---------------------------------------------------------------------------

const CHANNEL_LABELS: Record<string, string> = {
  pulse1: '脉冲1',
  pulse2: '脉冲2',
  triangle: '三角波',
  noise: '噪声',
  dmc: 'DMC',
  fm: 'FM合成',
  psg: 'PSG',
};

const DEFAULT_PREFS: AudioPrefs = {
  masterVolume: 100,
  channelMutes: {},
  latencyMs: 0,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AudioControlPanelProps {
  platform: ConsolePlatform;
  isOpen: boolean;
  onClose: () => void;
  onVolumeChange?: (volume: number) => void;
  onChannelMuteChange?: (channel: string, muted: boolean) => void;
  onLatencyChange?: (ms: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AudioControlPanel({
  platform,
  isOpen,
  onClose,
  onVolumeChange,
  onChannelMuteChange,
  onLatencyChange,
}: AudioControlPanelProps) {
  const [prefs, setPrefs] = useState<AudioPrefs>(DEFAULT_PREFS);

  const channels = CORE_REGISTRY[platform]?.audioChannels ?? [];

  useEffect(() => {
    if (!isOpen) return;
    loadAudioSettings(platform).then((saved) => {
      if (saved) setPrefs(saved);
      else setPrefs(DEFAULT_PREFS);
    }).catch(() => {});
  }, [isOpen, platform]);

  const update = useCallback(
    (partial: Partial<AudioPrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...partial };
        saveAudioSettings(platform, next).catch(() => {});
        if (partial.masterVolume !== undefined) onVolumeChange?.(next.masterVolume);
        if (partial.latencyMs !== undefined) onLatencyChange?.(next.latencyMs);
        return next;
      });
    },
    [platform, onVolumeChange, onLatencyChange],
  );

  const toggleChannel = useCallback(
    (channel: string) => {
      setPrefs((prev) => {
        const muted = !prev.channelMutes[channel];
        const channelMutes = { ...prev.channelMutes, [channel]: muted };
        const next = { ...prev, channelMutes };
        saveAudioSettings(platform, next).catch(() => {});
        onChannelMuteChange?.(channel, muted);
        return next;
      });
    },
    [platform, onChannelMuteChange],
  );

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-0 right-0 z-50 h-full w-80 max-w-[90vw] bg-bg-card border-l border-border shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Volume2 size={16} className="text-accent" />
            音频设置
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg text-muted hover:text-white hover:bg-bg-hover transition">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Master Volume */}
          <section>
            <h3 className="text-xs font-semibold text-muted mb-2 flex items-center gap-1.5">
              <Volume2 size={13} /> 主音量
            </h3>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={prefs.masterVolume}
                onChange={(e) => update({ masterVolume: Number(e.target.value) })}
                className="flex-1 accent-accent h-1.5"
              />
              <span className="text-xs text-accent font-mono w-8 text-right">{prefs.masterVolume}%</span>
            </div>
          </section>

          {/* Per-channel mutes */}
          {channels.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-muted mb-2 flex items-center gap-1.5">
                <VolumeX size={13} /> 声道控制
              </h3>
              <div className="space-y-1.5">
                {channels.map((ch) => {
                  const muted = !!prefs.channelMutes[ch];
                  return (
                    <button
                      key={ch}
                      onClick={() => toggleChannel(ch)}
                      className={clsx(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition',
                        muted
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                          : 'bg-bg-hover text-gray-300 hover:bg-bg-hover/80',
                      )}
                    >
                      <span>{CHANNEL_LABELS[ch] ?? ch}</span>
                      <span className="text-[10px]">{muted ? '已静音' : '播放中'}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Audio Latency */}
          <section>
            <h3 className="text-xs font-semibold text-muted mb-2 flex items-center gap-1.5">
              <Clock size={13} /> 音频延迟
            </h3>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={10}
                value={prefs.latencyMs}
                onChange={(e) => update({ latencyMs: Number(e.target.value) })}
                className="flex-1 accent-accent h-1.5"
              />
              <span className="text-xs text-accent font-mono w-12 text-right">{prefs.latencyMs}ms</span>
            </div>
            <p className="text-[10px] text-muted mt-1 px-1">
              增加延迟可减少音频爆音，0ms为最低延迟
            </p>
          </section>

          {/* Platform indicator */}
          <div className="text-[10px] text-muted text-center pt-2 border-t border-border">
            当前平台: <span className="text-accent">{platform}</span> — 设置独立保存
          </div>
        </div>
      </div>
    </>
  );
}
