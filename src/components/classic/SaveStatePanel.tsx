'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Save, Download, Clock, ImageOff, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import type { EmulatorWrapper } from '@/lib/emulator/emulator-wrapper';
import type { SaveStateData } from '@/lib/types';

// ---------------------------------------------------------------------------
// IndexedDB helper — mirrors the emulator-wrapper's DB setup
// ---------------------------------------------------------------------------

const DB_NAME = 'fc-arcade-online';
const DB_VERSION = 3;
const SAVE_STATE_STORE = 'save-states';
const SLOTS = [0, 1, 2] as const;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('roms')) db.createObjectStore('roms', { keyPath: 'hash' });
      if (!db.objectStoreNames.contains(SAVE_STATE_STORE)) db.createObjectStore(SAVE_STATE_STORE);
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadSlotData(romHash: string, platform: string): Promise<(SaveStateData | null)[]> {
  const db = await openDB();
  return Promise.all(
    SLOTS.map(
      (slot) =>
        new Promise<SaveStateData | null>((resolve, reject) => {
          const tx = db.transaction(SAVE_STATE_STORE, 'readonly');
          const store = tx.objectStore(SAVE_STATE_STORE);
          const key = `${romHash}:${platform}:${slot}`;
          const req = store.get(key);
          req.onsuccess = () => resolve((req.result as SaveStateData) ?? null);
          req.onerror = () => reject(req.error);
        }),
    ),
  ).finally(() => db.close());
}

// ---------------------------------------------------------------------------
// Relative time formatter
// ---------------------------------------------------------------------------

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SaveStatePanelProps {
  emulator: EmulatorWrapper | null;
  isOpen: boolean;
  onClose: () => void;
  isMultiplayer: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SaveStatePanel({
  emulator,
  isOpen,
  onClose,
  isMultiplayer,
}: SaveStatePanelProps) {
  const [slots, setSlots] = useState<(SaveStateData | null)[]>([null, null, null]);
  const [thumbnailUrls, setThumbnailUrls] = useState<(string | null)[]>([null, null, null]);
  const [busySlot, setBusySlot] = useState<number | null>(null);

  // Load existing save states from IndexedDB on open
  useEffect(() => {
    if (!isOpen || !emulator) return;

    const romHash = emulator.getRomHash();
    const platform = emulator.getPlatform();
    if (!romHash || !platform) return;

    loadSlotData(romHash, platform)
      .then(setSlots)
      .catch(() => setSlots([null, null, null]));
  }, [isOpen, emulator]);

  // Generate thumbnail object URLs (and revoke old ones)
  useEffect(() => {
    // Revoke previous URLs
    thumbnailUrls.forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });

    const urls = slots.map((s) => {
      if (!s?.thumbnail || (s.thumbnail instanceof Blob && s.thumbnail.size === 0)) return null;
      return URL.createObjectURL(s.thumbnail);
    });
    setThumbnailUrls(urls);

    return () => {
      urls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const handleSave = useCallback(
    async (slot: number) => {
      if (!emulator || isMultiplayer) return;
      setBusySlot(slot);
      try {
        const data = await emulator.saveState(slot);
        setSlots((prev) => {
          const next = [...prev];
          next[slot] = data;
          return next;
        });
      } catch {
        // Save failed — silently ignore (emulator may not be running)
      } finally {
        setBusySlot(null);
      }
    },
    [emulator, isMultiplayer],
  );

  const handleLoad = useCallback(
    async (slot: number) => {
      if (!emulator || isMultiplayer) return;
      setBusySlot(slot);
      try {
        await emulator.loadState(slot);
      } catch {
        // No save in slot or load failed
      } finally {
        setBusySlot(null);
      }
    },
    [emulator, isMultiplayer],
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-in panel from right */}
      <div
        className={clsx(
          'fixed top-0 right-0 z-50 h-full w-80 max-w-[90vw] bg-bg-card border-l border-border shadow-xl',
          'flex flex-col',
          'animate-in slide-in-from-right duration-200',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-bold">存档管理</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted hover:text-white hover:bg-bg-hover transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isMultiplayer && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-xs">
              <ShieldAlert size={16} className="shrink-0 mt-0.5" />
              <span>多人游戏模式下无法使用存档功能，请在单人模式中使用。</span>
            </div>
          )}

          {SLOTS.map((slot) => {
            const data = slots[slot];
            const thumb = thumbnailUrls[slot];
            const isBusy = busySlot === slot;
            const disabled = isMultiplayer || isBusy;

            return (
              <div
                key={slot}
                className={clsx(
                  'rounded-lg border border-border p-3 transition',
                  isMultiplayer ? 'opacity-50' : 'hover:border-border-hover',
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-accent">
                    存档 {slot + 1}
                  </span>
                  {data && (
                    <span className="flex items-center gap-1 text-[10px] text-muted ml-auto">
                      <Clock size={10} />
                      {formatRelativeTime(data.savedAt)}
                    </span>
                  )}
                </div>

                {/* Thumbnail */}
                <div className="w-full aspect-video rounded bg-black/40 mb-2 overflow-hidden flex items-center justify-center">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt={`存档 ${slot + 1} 截图`}
                      className="w-full h-full object-contain image-rendering-pixelated"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted/40">
                      <ImageOff size={20} />
                      <span className="text-[10px]">{data ? '无预览' : '空存档位'}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSave(slot)}
                    disabled={disabled}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition',
                      disabled
                        ? 'bg-bg-hover text-muted cursor-not-allowed'
                        : 'bg-accent/15 text-accent hover:bg-accent/25',
                    )}
                  >
                    <Save size={13} />
                    保存
                  </button>
                  <button
                    onClick={() => handleLoad(slot)}
                    disabled={disabled || !data}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition',
                      disabled || !data
                        ? 'bg-bg-hover text-muted cursor-not-allowed'
                        : 'bg-accent/15 text-accent hover:bg-accent/25',
                    )}
                  >
                    <Download size={13} />
                    读取
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
