'use client';

import { useState, useEffect, useCallback } from 'react';
import { Gamepad2, RotateCcw, Zap, X } from 'lucide-react';
import clsx from 'clsx';
import type { ConsolePlatform, ButtonMap } from '@/lib/types';
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

interface ButtonMapSettings {
  map: ButtonMap;
  turbo: Record<string, boolean>;
  turboRates: Record<string, number>;
}

async function loadButtonMapSettings(platform: ConsolePlatform): Promise<ButtonMapSettings | null> {
  const db = await openSettingsDB();
  return new Promise<ButtonMapSettings | null>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const store = tx.objectStore(SETTINGS_STORE);
    const req = store.get(`buttonmap:${platform}`);
    req.onsuccess = () => resolve((req.result as ButtonMapSettings) ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function saveButtonMapSettings(platform: ConsolePlatform, settings: ButtonMapSettings): Promise<void> {
  const db = await openSettingsDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.put(settings, `buttonmap:${platform}`);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUTTON_LABELS: Record<string, string> = {
  up: '上', down: '下', left: '左', right: '右',
  a: 'A', b: 'B', x: 'X', y: 'Y',
  l: 'L', r: 'R', start: 'Start', select: 'Select',
};

const ALL_BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'l', 'r', 'start', 'select'] as const;

const TURBO_RATES = [
  { value: 10, label: '10 Hz' },
  { value: 15, label: '15 Hz' },
  { value: 30, label: '30 Hz' },
];

function keyCodeLabel(code: string): string {
  if (!code) return '—';
  return code.replace('Key', '').replace('Arrow', '↑↓←→'.charAt(0) || '');
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ButtonMapEditorProps {
  platform: ConsolePlatform;
  isOpen: boolean;
  onClose: () => void;
  onMapChange?: (map: ButtonMap) => void;
  onTurboChange?: (button: string, enabled: boolean, rate: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ButtonMapEditor({
  platform,
  isOpen,
  onClose,
  onMapChange,
  onTurboChange,
}: ButtonMapEditorProps) {
  const defaultMap = CORE_REGISTRY[platform]?.defaultButtonMap ?? {} as ButtonMap;
  const [settings, setSettings] = useState<ButtonMapSettings>({
    map: { ...defaultMap },
    turbo: {},
    turboRates: {},
  });
  const [listeningButton, setListeningButton] = useState<string | null>(null);

  // Determine which buttons are relevant for this platform
  const relevantButtons = ALL_BUTTONS.filter((btn) => {
    const key = defaultMap[btn as keyof ButtonMap];
    return key !== undefined && key !== '';
  });

  useEffect(() => {
    if (!isOpen) return;
    loadButtonMapSettings(platform).then((saved) => {
      if (saved) setSettings(saved);
      else setSettings({ map: { ...defaultMap }, turbo: {}, turboRates: {} });
    }).catch(() => {});
  }, [isOpen, platform, defaultMap]);

  // Key listener for remapping
  useEffect(() => {
    if (!listeningButton) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setSettings((prev) => {
        const next: ButtonMapSettings = {
          ...prev,
          map: { ...prev.map, [listeningButton]: e.code },
        };
        saveButtonMapSettings(platform, next).catch(() => {});
        onMapChange?.(next.map);
        return next;
      });
      setListeningButton(null);
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [listeningButton, platform, onMapChange]);

  const persist = useCallback(
    (next: ButtonMapSettings) => {
      setSettings(next);
      saveButtonMapSettings(platform, next).catch(() => {});
    },
    [platform],
  );

  const toggleTurbo = (btn: string) => {
    const enabled = !settings.turbo[btn];
    const rate = settings.turboRates[btn] || 15;
    const next: ButtonMapSettings = {
      ...settings,
      turbo: { ...settings.turbo, [btn]: enabled },
      turboRates: { ...settings.turboRates, [btn]: rate },
    };
    persist(next);
    onTurboChange?.(btn, enabled, rate);
  };

  const setTurboRate = (btn: string, rate: number) => {
    const next: ButtonMapSettings = {
      ...settings,
      turboRates: { ...settings.turboRates, [btn]: rate },
    };
    persist(next);
    if (settings.turbo[btn]) onTurboChange?.(btn, true, rate);
  };

  const resetToDefaults = () => {
    const next: ButtonMapSettings = { map: { ...defaultMap }, turbo: {}, turboRates: {} };
    persist(next);
    onMapChange?.(next.map);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-0 right-0 z-50 h-full w-80 max-w-[90vw] bg-bg-card border-l border-border shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Gamepad2 size={16} className="text-accent" />
            按键设置
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg text-muted hover:text-white hover:bg-bg-hover transition">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Button mappings */}
          {relevantButtons.map((btn) => {
            const currentKey = settings.map[btn as keyof ButtonMap] ?? '';
            const isListening = listeningButton === btn;
            const hasTurbo = !!settings.turbo[btn];
            const turboRate = settings.turboRates[btn] || 15;

            return (
              <div key={btn} className="rounded-lg border border-border p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-accent">{BUTTON_LABELS[btn]}</span>
                  <button
                    onClick={() => setListeningButton(isListening ? null : btn)}
                    className={clsx(
                      'px-2 py-1 rounded text-xs font-mono transition',
                      isListening
                        ? 'bg-yellow-500/20 text-yellow-400 animate-pulse border border-yellow-500/30'
                        : 'bg-bg-hover text-gray-300 hover:bg-bg-hover/80',
                    )}
                  >
                    {isListening ? '按下按键...' : keyCodeLabel(currentKey)}
                  </button>
                </div>

                {/* Turbo fire */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleTurbo(btn)}
                    className={clsx(
                      'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition',
                      hasTurbo
                        ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
                        : 'bg-bg-hover text-muted hover:text-gray-300',
                    )}
                  >
                    <Zap size={10} />
                    连发
                  </button>
                  {hasTurbo && (
                    <div className="flex gap-1">
                      {TURBO_RATES.map((r) => (
                        <button
                          key={r.value}
                          onClick={() => setTurboRate(btn, r.value)}
                          className={clsx(
                            'px-1.5 py-0.5 rounded text-[10px] transition',
                            turboRate === r.value
                              ? 'bg-accent/15 text-accent'
                              : 'bg-bg-hover text-muted hover:text-gray-300',
                          )}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Reset button */}
          <button
            onClick={resetToDefaults}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
          >
            <RotateCcw size={13} />
            恢复默认设置
          </button>

          <div className="text-[10px] text-muted text-center pt-2 border-t border-border">
            当前平台: <span className="text-accent">{platform}</span>
          </div>
        </div>
      </div>
    </>
  );
}
