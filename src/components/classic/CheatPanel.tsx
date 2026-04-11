'use client';

import { useState, useEffect, useCallback } from 'react';
import { Code2, Search, Plus, Trash2, ToggleLeft, ToggleRight, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import type { CheatEntry, ConsolePlatform } from '@/lib/types';

// ---------------------------------------------------------------------------
// IndexedDB helpers for cheats store
// ---------------------------------------------------------------------------

const DB_NAME = 'fc-arcade-online';
const DB_VERSION = 3;
const CHEATS_STORE = 'cheats';

function openCheatsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('roms')) db.createObjectStore('roms', { keyPath: 'hash' });
      if (!db.objectStoreNames.contains('save-states')) db.createObjectStore('save-states');
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
      if (!db.objectStoreNames.contains('replays')) db.createObjectStore('replays', { keyPath: 'id' });
      if (!db.objectStoreNames.contains(CHEATS_STORE)) db.createObjectStore(CHEATS_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadPersistedCheats(romHash: string): Promise<CheatEntry[]> {
  const db = await openCheatsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHEATS_STORE, 'readonly');
    const req = tx.objectStore(CHEATS_STORE).get(romHash);
    req.onsuccess = () => {
      db.close();
      const data = req.result as { activeCodes?: CheatEntry[] } | undefined;
      resolve(data?.activeCodes ?? []);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function persistCheats(romHash: string, cheats: CheatEntry[]): Promise<void> {
  const db = await openCheatsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHEATS_STORE, 'readwrite');
    tx.objectStore(CHEATS_STORE).put({ romHash, activeCodes: cheats }, romHash);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CheatPanelProps {
  romHash: string;
  platform: ConsolePlatform;
  isMultiplayer?: boolean;
  onAddCheat?: (code: string, format: 'gamegenie' | 'actionreplay') => void;
  onRemoveCheat?: (code: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CheatPanel({
  romHash,
  platform,
  isMultiplayer = false,
  onAddCheat,
  onRemoveCheat,
}: CheatPanelProps) {
  const [activeCheats, setActiveCheats] = useState<CheatEntry[]>([]);
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newFormat, setNewFormat] = useState<'gamegenie' | 'actionreplay'>('gamegenie');
  const [searchResults, setSearchResults] = useState<CheatEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // Load persisted cheats on mount
  useEffect(() => {
    if (!romHash) return;
    loadPersistedCheats(romHash).then(setActiveCheats).catch(() => {});
  }, [romHash]);

  // Persist cheats when they change
  const saveCheats = useCallback(
    (cheats: CheatEntry[]) => {
      setActiveCheats(cheats);
      persistCheats(romHash, cheats).catch(() => {});
    },
    [romHash],
  );

  const handleAddCheat = () => {
    if (!newCode.trim()) return;
    const entry: CheatEntry = {
      id: crypto.randomUUID(),
      romHash,
      platform,
      code: newCode.trim(),
      format: newFormat,
      description: newDesc.trim() || '自定义作弊码',
      submittedBy: 'local',
      upvotes: 0,
      createdAt: new Date().toISOString(),
    };
    saveCheats([...activeCheats, entry]);
    if (entry.format === 'gamegenie' || entry.format === 'actionreplay') {
      onAddCheat?.(entry.code, entry.format);
    }
    setNewCode('');
    setNewDesc('');
  };

  const handleRemoveCheat = (cheat: CheatEntry) => {
    saveCheats(activeCheats.filter((c) => c.id !== cheat.id));
    onRemoveCheat?.(cheat.code);
  };

  const handleToggleCheat = (cheat: CheatEntry, active: boolean) => {
    if (active && (cheat.format === 'gamegenie' || cheat.format === 'actionreplay')) {
      onAddCheat?.(cheat.code, cheat.format);
    } else if (!active) {
      onRemoveCheat?.(cheat.code);
    }
  };

  const handleSearch = async () => {
    setSearching(true);
    try {
      const res = await fetch(`/api/classic/cheats/${romHash}`);
      if (res.ok) {
        const data = (await res.json()) as { items?: CheatEntry[] };
        setSearchResults(data.items ?? []);
      }
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  };

  const handleAddFromSearch = (cheat: CheatEntry) => {
    if (activeCheats.some((c) => c.code === cheat.code)) return;
    saveCheats([...activeCheats, { ...cheat, id: crypto.randomUUID() }]);
    if (cheat.format === 'gamegenie' || cheat.format === 'actionreplay') {
      onAddCheat?.(cheat.code, cheat.format);
    }
  };

  // Multiplayer block
  if (isMultiplayer) {
    return (
      <div className="rounded-lg bg-gray-800 p-4 text-sm text-gray-300">
        <div className="flex items-center gap-2 text-yellow-400">
          <AlertCircle className="h-4 w-4" />
          <span>多人模式下无法使用作弊码</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-gray-800 p-4 text-sm text-gray-200">
      <div className="flex items-center gap-2 text-base font-semibold">
        <Code2 className="h-5 w-5 text-purple-400" />
        <span>作弊码</span>
      </div>

      {/* Add cheat form */}
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          placeholder="输入作弊码 (Game Genie / Action Replay)"
          className="rounded bg-gray-700 px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-purple-500"
        />
        <input
          type="text"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          placeholder="描述 (可选)"
          className="rounded bg-gray-700 px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-purple-500"
        />
        <div className="flex items-center gap-2">
          <select
            value={newFormat}
            onChange={(e) => setNewFormat(e.target.value as 'gamegenie' | 'actionreplay')}
            className="rounded bg-gray-700 px-2 py-1.5 text-sm"
          >
            <option value="gamegenie">Game Genie</option>
            <option value="actionreplay">Action Replay</option>
          </select>
          <button
            onClick={handleAddCheat}
            disabled={!newCode.trim()}
            className="flex items-center gap-1 rounded bg-purple-600 px-3 py-1.5 text-sm font-medium hover:bg-purple-500 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            添加
          </button>
        </div>
      </div>

      {/* Active cheats */}
      {activeCheats.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-gray-400">已激活 ({activeCheats.length})</span>
          {activeCheats.map((cheat) => (
            <div key={cheat.id} className="flex items-center justify-between rounded bg-gray-700/60 px-2 py-1.5">
              <div className="flex flex-col">
                <span className="font-mono text-xs text-green-400">{cheat.code}</span>
                <span className="text-xs text-gray-400">{cheat.description}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleToggleCheat(cheat, false)}
                  className="text-gray-400 hover:text-yellow-400"
                  title="停用"
                >
                  <ToggleRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleRemoveCheat(cheat)}
                  className="text-gray-400 hover:text-red-400"
                  title="删除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search database */}
      <div className="border-t border-gray-700 pt-2">
        <button
          onClick={() => { setShowSearch(!showSearch); if (!showSearch) handleSearch(); }}
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
        >
          <Search className="h-3.5 w-3.5" />
          {showSearch ? '隐藏数据库' : '搜索作弊码数据库'}
        </button>
        {showSearch && (
          <div className="mt-2 flex flex-col gap-1">
            {searching && <span className="text-xs text-gray-400">搜索中...</span>}
            {!searching && searchResults.length === 0 && (
              <span className="text-xs text-gray-400">暂无社区作弊码</span>
            )}
            {searchResults.map((cheat) => (
              <div key={cheat.id} className="flex items-center justify-between rounded bg-gray-700/40 px-2 py-1">
                <div className="flex flex-col">
                  <span className="font-mono text-xs">{cheat.code}</span>
                  <span className="text-xs text-gray-400">{cheat.description}</span>
                </div>
                <button
                  onClick={() => handleAddFromSearch(cheat)}
                  className="text-xs text-green-400 hover:text-green-300"
                >
                  +添加
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
