'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Upload, Gamepad2 } from 'lucide-react';
import clsx from 'clsx';
import type { ConsolePlatform, RomEntry } from '@/lib/types';
import { RomManager } from '@/lib/rom/rom-manager';
import RomUploadDialog from './RomUploadDialog';

// Platform display config
const PLATFORM_INFO: Record<ConsolePlatform, { label: string; emoji: string }> = {
  NES: { label: 'NES', emoji: '' },
  SNES: { label: 'SNES', emoji: '' },
  Game_Boy: { label: 'Game Boy', emoji: '.' },
  Game_Boy_Color: { label: 'GBC', emoji: '.' },
  Game_Boy_Advance: { label: 'GBA', emoji: '.' },
  Genesis: { label: 'Genesis', emoji: '.' },
  Master_System: { label: 'SMS', emoji: '⬜' },
  Arcade: { label: 'Arcade', emoji: '' },
  Neo_Geo: { label: 'Neo Geo', emoji: '.' },
  PC_Engine: { label: 'PC Engine', emoji: '.' },
  Atari_2600: { label: 'Atari', emoji: '.' },
};

const ALL_PLATFORMS: ConsolePlatform[] = [
  'NES', 'SNES', 'Game_Boy', 'Game_Boy_Color', 'Game_Boy_Advance',
  'Genesis', 'Master_System', 'Arcade', 'Neo_Geo', 'PC_Engine', 'Atari_2600',
];

const PLAYER_COUNT_COLORS: Record<number, string> = {
  1: 'bg-blue-500/20 text-blue-400',
  2: 'bg-green-500/20 text-green-400',
  3: 'bg-amber-500/20 text-amber-400',
  4: 'bg-red-500/20 text-red-400',
};

export default function GameBrowser() {
  const [roms, setRoms] = useState<RomEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<ConsolePlatform>>(new Set());
  const [showUpload, setShowUpload] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const romManagerRef = useRef(new RomManager());

  // Load ROMs from IndexedDB
  const loadRoms = useCallback(async () => {
    try {
      setLoading(true);
      const entries = await romManagerRef.current.listLocal();
      setRoms(entries);
    } catch {
      console.error('Failed to load ROMs from IndexedDB');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoms();
  }, [loadRoms]);

  // 200ms debounce for search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // Filter ROMs
  const filteredRoms = roms.filter((rom) => {
    if (selectedPlatforms.size > 0 && !selectedPlatforms.has(rom.platform)) {
      return false;
    }
    if (debouncedQuery) {
      return rom.title.toLowerCase().includes(debouncedQuery.toLowerCase());
    }
    return true;
  });

  const togglePlatform = (platform: ConsolePlatform) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  const handleUploadComplete = () => {
    setShowUpload(false);
    loadRoms();
  };

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="搜索游戏..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-4 bg-bg-card border border-border rounded-lg text-sm text-white placeholder-muted outline-none focus:border-accent transition"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx(
              'h-10 px-4 rounded-lg text-sm font-medium transition flex items-center gap-2',
              showFilters
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'bg-bg-card border border-border text-subtle hover:text-white hover:bg-bg-hover'
            )}
          >
            <Gamepad2 size={16} />
            <span>平台筛选</span>
            {selectedPlatforms.size > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-accent text-[10px] text-[#0f0f0f] font-bold">
                {selectedPlatforms.size}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="h-10 px-4 rounded-lg bg-accent text-[#0f0f0f] text-sm font-semibold hover:bg-accent-hover transition flex items-center gap-2"
          >
            <Upload size={16} />
            <span>上传ROM</span>
          </button>
        </div>
      </div>

      {/* Platform Filters */}
      {showFilters && (
        <div className="p-4 bg-bg-card border border-border rounded-lg animate-fade-in">
          <p className="text-xs text-muted mb-3">选择平台（可多选）</p>
          <div className="flex flex-wrap gap-2">
            {ALL_PLATFORMS.map((platform) => (
              <label
                key={platform}
                className={clsx(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition select-none',
                  selectedPlatforms.has(platform)
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'bg-bg-hover text-subtle border border-transparent hover:border-border'
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedPlatforms.has(platform)}
                  onChange={() => togglePlatform(platform)}
                  className="sr-only"
                />
                <span>{PLATFORM_INFO[platform].emoji}</span>
                <span>{PLATFORM_INFO[platform].label}</span>
              </label>
            ))}
          </div>
          {selectedPlatforms.size > 0 && (
            <button
              onClick={() => setSelectedPlatforms(new Set())}
              className="mt-3 text-xs text-muted hover:text-accent transition"
            >
              清除筛选
            </button>
          )}
        </div>
      )}

      {/* ROM Grid */}
      {loading ? (
        <div className="text-center py-16 text-muted">
          <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm">加载中...</p>
        </div>
      ) : filteredRoms.length === 0 ? (
        <div className="text-center py-16">
          <Gamepad2 size={48} className="mx-auto mb-4 text-muted/40" />
          <p className="text-muted text-sm mb-2">
            {roms.length === 0 ? '还没有ROM，上传一个开始游戏吧！' : '没有找到匹配的游戏'}
          </p>
          {roms.length === 0 && (
            <button
              onClick={() => setShowUpload(true)}
              className="mt-2 px-4 py-2 rounded-lg bg-accent text-[#0f0f0f] text-sm font-semibold hover:bg-accent-hover transition"
            >
              上传ROM
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredRoms.map((rom) => (
            <a
              key={rom.hash}
              href={`/games/classic/${rom.hash}`}
              className="group p-4 rounded-xl bg-bg-card/50 border border-border hover:border-accent/30 hover:-translate-y-0.5 transition overflow-hidden"
            >
              {/* Thumbnail placeholder */}
              <div className="w-full aspect-[4/3] rounded-lg bg-bg-hover mb-3 flex items-center justify-center overflow-hidden">
                <span className="text-4xl">{PLATFORM_INFO[rom.platform]?.emoji ?? ''}</span>
              </div>
              {/* Title */}
              <h3 className="font-semibold text-sm truncate group-hover:text-accent transition">
                {rom.title}
              </h3>
              {/* Badges */}
              <div className="flex items-center gap-2 mt-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-bg-hover text-subtle">
                  {PLATFORM_INFO[rom.platform]?.label ?? rom.platform}
                </span>
                <span className={clsx(
                  'px-2 py-0.5 rounded text-[10px] font-bold',
                  PLAYER_COUNT_COLORS[1] // Default to 1P since RomEntry doesn't have playerCount
                )}>
                  1P
                </span>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      {showUpload && (
        <RomUploadDialog
          onClose={() => setShowUpload(false)}
          onComplete={handleUploadComplete}
        />
      )}
    </div>
  );
}
