'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Gamepad2, RefreshCw, Shuffle, ChevronRight, Monitor } from 'lucide-react';
import clsx from 'clsx';
import type { ConsolePlatform, RoomInfo } from '@/lib/types';

const PLATFORMS: ConsolePlatform[] = [
  'NES', 'SNES', 'Game_Boy', 'Game_Boy_Color', 'Game_Boy_Advance',
  'Genesis', 'Master_System', 'Arcade', 'Neo_Geo', 'PC_Engine', 'Atari_2600',
];

const REFRESH_INTERVAL = 5000;

interface LobbyBrowserProps {
  onJoinRoom?: (roomCode: string) => void;
}

export default function LobbyBrowser({ onJoinRoom }: LobbyBrowserProps) {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState<ConsolePlatform | ''>('');
  const [openSlotsOnly, setOpenSlotsOnly] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomInfo | null>(null);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch('/api/classic/room/list');
      if (res.ok) {
        const data = (await res.json()) as { items?: RoomInfo[] };
        setRooms(data.items ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + polling every 5s
  useEffect(() => {
    fetchRooms();
    const timer = setInterval(fetchRooms, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchRooms]);

  // Filtered rooms
  const filtered = rooms.filter((r) => {
    if (platformFilter && r.platform !== platformFilter) return false;
    if (openSlotsOnly && r.players.length >= r.maxPlayers) return false;
    return true;
  });

  const handleJoinRandom = () => {
    const available = filtered.filter((r) => r.players.length < r.maxPlayers);
    if (available.length === 0) return;
    const random = available[Math.floor(Math.random() * available.length)];
    onJoinRoom?.(random.roomCode);
  };

  const handleJoin = (roomCode: string) => {
    onJoinRoom?.(roomCode);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <Monitor className="h-5 w-5 text-blue-400" />
          在线大厅
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleJoinRandom}
            className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500"
          >
            <Shuffle className="h-4 w-4" />
            随机加入
          </button>
          <button
            onClick={() => { setLoading(true); fetchRooms(); }}
            className="rounded-lg bg-gray-700 p-1.5 text-gray-300 hover:bg-gray-600"
            title="刷新"
          >
            <RefreshCw className={clsx('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value as ConsolePlatform | '')}
          className="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-200"
        >
          <option value="">全部平台</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={openSlotsOnly}
            onChange={(e) => setOpenSlotsOnly(e.target.checked)}
            className="rounded"
          />
          仅显示有空位的房间
        </label>
        <span className="text-xs text-gray-500">
          {filtered.length} 个房间 · 每 5 秒刷新
        </span>
      </div>

      {/* Room list */}
      {loading && rooms.length === 0 ? (
        <div className="py-8 text-center text-gray-400">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-gray-400">暂无公开房间</div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((room) => (
            <RoomCard
              key={room.roomCode}
              room={room}
              selected={selectedRoom?.roomCode === room.roomCode}
              onSelect={() => setSelectedRoom(selectedRoom?.roomCode === room.roomCode ? null : room)}
              onJoin={() => handleJoin(room.roomCode)}
            />
          ))}
        </div>
      )}

      {/* Room detail panel */}
      {selectedRoom && (
        <RoomDetail room={selectedRoom} onJoin={() => handleJoin(selectedRoom.roomCode)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RoomCard
// ---------------------------------------------------------------------------

function RoomCard({
  room,
  selected,
  onSelect,
  onJoin,
}: {
  room: RoomInfo;
  selected: boolean;
  onSelect: () => void;
  onJoin: () => void;
}) {
  const isFull = room.players.length >= room.maxPlayers;

  return (
    <div
      onClick={onSelect}
      className={clsx(
        'flex cursor-pointer items-center justify-between rounded-lg border bg-gray-800/80 px-4 py-3 transition-colors',
        selected ? 'border-blue-500' : 'border-gray-700 hover:border-gray-600',
      )}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{room.romTitle || room.roomCode}</span>
          <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300">
            {room.platform?.replace(/_/g, ' ')}
          </span>
          {room.tags?.map((tag) => (
            <span key={tag} className="rounded bg-purple-900/40 px-1.5 py-0.5 text-xs text-purple-300">
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {room.players.length}/{room.maxPlayers}
          </span>
          <span className="flex items-center gap-1">
            <Gamepad2 className="h-3 w-3" />
            {room.mode === 'race' ? '竞速' : room.mode === 'spectator' ? '观战' : '多人'}
          </span>
          {room.hostId && <span>房主: {room.hostId.slice(0, 6)}...</span>}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onJoin(); }}
        disabled={isFull}
        className={clsx(
          'flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium',
          isFull
            ? 'bg-gray-700 text-gray-500'
            : 'bg-blue-600 text-white hover:bg-blue-500',
        )}
      >
        {isFull ? '已满' : '加入'}
        {!isFull && <ChevronRight className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RoomDetail
// ---------------------------------------------------------------------------

function RoomDetail({ room, onJoin }: { room: RoomInfo; onJoin: () => void }) {
  const isFull = room.players.length >= room.maxPlayers;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <h3 className="mb-2 text-sm font-semibold text-white">房间详情</h3>
      <div className="grid grid-cols-2 gap-2 text-sm text-gray-300">
        <div>房间号: <span className="font-mono text-blue-400">{room.roomCode}</span></div>
        <div>游戏: {room.romTitle}</div>
        <div>平台: {room.platform?.replace(/_/g, ' ')}</div>
        <div>模式: {room.mode === 'race' ? '竞速' : room.mode === 'spectator' ? '观战' : '多人'}</div>
        <div>玩家: {room.players.length}/{room.maxPlayers}</div>
        <div>观众: {room.spectatorCount ?? 0}</div>
      </div>
      {room.description && (
        <p className="mt-2 text-xs text-gray-400">{room.description}</p>
      )}
      {room.tags && room.tags.length > 0 && (
        <div className="mt-2 flex gap-1">
          {room.tags.map((t) => (
            <span key={t} className="rounded bg-purple-900/40 px-1.5 py-0.5 text-xs text-purple-300">{t}</span>
          ))}
        </div>
      )}
      {room.players.length > 0 && (
        <div className="mt-3">
          <span className="text-xs text-gray-400">在线玩家:</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {room.players.map((p) => (
              <span key={p.playerId} className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-200">
                P{p.slot + 1} {p.displayName} {p.isHost && '(房主)'}
              </span>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={onJoin}
        disabled={isFull}
        className={clsx(
          'mt-3 w-full rounded-lg py-2 text-sm font-medium',
          isFull ? 'bg-gray-700 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-500',
        )}
      >
        {isFull ? '房间已满 — 可观战' : '加入房间'}
      </button>
    </div>
  );
}
