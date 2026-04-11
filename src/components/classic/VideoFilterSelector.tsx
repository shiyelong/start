'use client';

import { useState, useEffect, useCallback } from 'react';
import { Monitor, Palette, Maximize, X } from 'lucide-react';
import clsx from 'clsx';
import type { ConsolePlatform, VideoFilter, ColorPalette, VideoFilterConfig } from '@/lib/types';

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

async function loadVideoSettings(platform: ConsolePlatform): Promise<VideoFilterConfig | null> {
  const db = await openSettingsDB();
  return new Promise<VideoFilterConfig | null>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const store = tx.objectStore(SETTINGS_STORE);
    const req = store.get(`video:${platform}`);
    req.onsuccess = () => resolve((req.result as VideoFilterConfig) ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function saveVideoSettings(platform: ConsolePlatform, config: VideoFilterConfig): Promise<void> {
  const db = await openSettingsDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.put(config, `video:${platform}`);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIDEO_FILTERS: { value: VideoFilter; label: string; desc: string }[] = [
  { value: 'crt', label: 'CRT 扫描线', desc: '模拟CRT显示器效果' },
  { value: 'lcd', label: 'LCD 网格', desc: '模拟LCD屏幕像素网格' },
  { value: 'smooth', label: '平滑缩放', desc: '双线性插值平滑画面' },
  { value: 'none', label: '无滤镜', desc: '原始像素显示' },
];

const COLOR_PALETTES: { value: ColorPalette; label: string }[] = [
  { value: 'original', label: '原始色彩' },
  { value: 'vivid', label: '鲜艳色彩' },
  { value: 'grayscale', label: '灰度' },
];

const DEFAULT_CONFIG: VideoFilterConfig = {
  filter: 'none',
  palette: 'original',
  integerScaling: false,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VideoFilterSelectorProps {
  platform: ConsolePlatform;
  isOpen: boolean;
  onClose: () => void;
  onFilterChange?: (filter: VideoFilter) => void;
  onPaletteChange?: (palette: ColorPalette) => void;
  onIntegerScalingChange?: (enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VideoFilterSelector({
  platform,
  isOpen,
  onClose,
  onFilterChange,
  onPaletteChange,
  onIntegerScalingChange,
}: VideoFilterSelectorProps) {
  const [config, setConfig] = useState<VideoFilterConfig>(DEFAULT_CONFIG);

  // Load persisted settings for this platform
  useEffect(() => {
    if (!isOpen) return;
    loadVideoSettings(platform).then((saved) => {
      if (saved) setConfig(saved);
      else setConfig(DEFAULT_CONFIG);
    }).catch(() => {});
  }, [isOpen, platform]);

  const update = useCallback(
    (partial: Partial<VideoFilterConfig>) => {
      setConfig((prev) => {
        const next = { ...prev, ...partial };
        saveVideoSettings(platform, next).catch(() => {});
        if (partial.filter !== undefined) onFilterChange?.(next.filter);
        if (partial.palette !== undefined) onPaletteChange?.(next.palette);
        if (partial.integerScaling !== undefined) onIntegerScalingChange?.(next.integerScaling);
        return next;
      });
    },
    [platform, onFilterChange, onPaletteChange, onIntegerScalingChange],
  );

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-0 right-0 z-50 h-full w-80 max-w-[90vw] bg-bg-card border-l border-border shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Monitor size={16} className="text-accent" />
            显示设置
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg text-muted hover:text-white hover:bg-bg-hover transition">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Video Filter */}
          <section>
            <h3 className="text-xs font-semibold text-muted mb-2 flex items-center gap-1.5">
              <Monitor size={13} /> 视频滤镜
            </h3>
            <div className="space-y-1.5">
              {VIDEO_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => update({ filter: f.value })}
                  className={clsx(
                    'w-full text-left px-3 py-2 rounded-lg text-xs transition',
                    config.filter === f.value
                      ? 'bg-accent/15 text-accent border border-accent/30'
                      : 'bg-bg-hover text-gray-300 hover:bg-bg-hover/80',
                  )}
                >
                  <span className="font-medium">{f.label}</span>
                  <span className="block text-[10px] text-muted mt-0.5">{f.desc}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Color Palette */}
          <section>
            <h3 className="text-xs font-semibold text-muted mb-2 flex items-center gap-1.5">
              <Palette size={13} /> 色彩方案
            </h3>
            <div className="flex gap-2">
              {COLOR_PALETTES.map((p) => (
                <button
                  key={p.value}
                  onClick={() => update({ palette: p.value })}
                  className={clsx(
                    'flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition',
                    config.palette === p.value
                      ? 'bg-accent/15 text-accent border border-accent/30'
                      : 'bg-bg-hover text-gray-300 hover:bg-bg-hover/80',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          {/* Integer Scaling */}
          <section>
            <h3 className="text-xs font-semibold text-muted mb-2 flex items-center gap-1.5">
              <Maximize size={13} /> 整数缩放
            </h3>
            <button
              onClick={() => update({ integerScaling: !config.integerScaling })}
              className={clsx(
                'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition',
                config.integerScaling
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'bg-bg-hover text-gray-300 hover:bg-bg-hover/80',
              )}
            >
              <span>使用整数倍缩放</span>
              <span className={clsx(
                'w-8 h-4 rounded-full relative transition-colors',
                config.integerScaling ? 'bg-accent' : 'bg-gray-600',
              )}>
                <span className={clsx(
                  'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                  config.integerScaling ? 'translate-x-4' : 'translate-x-0.5',
                )} />
              </span>
            </button>
            <p className="text-[10px] text-muted mt-1 px-1">
              以最大整数倍数缩放画面，避免像素模糊
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
