'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, Edit3, Check, X, Music, ListMusic, Upload } from 'lucide-react';
import { useMusicPlayer, type MusicTrack } from './MusicPlayerProvider';
import { fetchAPI } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Playlist {
  id: number;
  name: string;
  type: string;
  track_ids: string[];
  created_at: string;
  updated_at: string;
}

interface PlaylistManagerProps {
  playlists: Playlist[];
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlaylistManager({ playlists, onRefresh }: PlaylistManagerProps) {
  const { actions } = useMusicPlayer();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  // Create playlist
  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    await fetchAPI('/api/music/playlist', {
      method: 'POST',
      body: { name, trackIds: [] },
    });
    setNewName('');
    setCreating(false);
    onRefresh();
  }, [newName, onRefresh]);

  // Delete playlist
  const handleDelete = useCallback(async (id: number) => {
    await fetchAPI(`/api/music/playlist/${id}`, { method: 'DELETE' });
    onRefresh();
  }, [onRefresh]);

  // Rename playlist
  const handleRename = useCallback(async (id: number) => {
    const name = editName.trim();
    if (!name) return;
    await fetchAPI(`/api/music/playlist/${id}`, {
      method: 'PUT',
      body: { name },
    });
    setEditingId(null);
    setEditName('');
    onRefresh();
  }, [editName, onRefresh]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-[#3ea6ff]" />
          My Playlists
        </h3>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 text-xs text-[#3ea6ff] hover:text-[#3ea6ff]/80 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Playlist name..."
            maxLength={50}
            className="flex-1 bg-white/5 text-white text-sm px-3 py-1.5 rounded outline-none placeholder:text-white/30 focus:ring-1 focus:ring-[#3ea6ff]"
            autoFocus
          />
          <button onClick={handleCreate} className="p-1.5 text-green-400 hover:text-green-300">
            <Check className="w-4 h-4" />
          </button>
          <button onClick={() => { setCreating(false); setNewName(''); }} className="p-1.5 text-white/50 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Playlist list */}
      {playlists.length === 0 && !creating && (
        <p className="text-white/30 text-xs text-center py-4">No playlists yet</p>
      )}

      {playlists.map((pl) => (
        <div
          key={pl.id}
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group"
        >
          <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center flex-shrink-0">
            <Music className="w-5 h-5 text-white/20" />
          </div>

          {editingId === pl.id ? (
            <div className="flex-1 flex items-center gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename(pl.id)}
                className="flex-1 bg-white/5 text-white text-sm px-2 py-1 rounded outline-none focus:ring-1 focus:ring-[#3ea6ff]"
                autoFocus
              />
              <button onClick={() => handleRename(pl.id)} className="p-1 text-green-400">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setEditingId(null)} className="p-1 text-white/50">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{pl.name}</p>
                <p className="text-xs text-white/40">{pl.track_ids.length} tracks</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => { setEditingId(pl.id); setEditName(pl.name); }}
                  className="p-1.5 text-white/50 hover:text-white"
                  aria-label="Rename"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(pl.id)}
                  className="p-1.5 text-white/50 hover:text-red-400"
                  aria-label="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
