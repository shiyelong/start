// =============================================================================
// Replay Recording & Playback — ReplayManager
// Requirements: 17.1-17.8
// =============================================================================

import type { ReplayFile, TimestampedInput, ConsolePlatform } from '@/lib/types';

const DB_NAME = 'fc-arcade-online';
const DB_VERSION = 3;
const REPLAY_STORE = 'replays';

// ---------------------------------------------------------------------------
// IndexedDB helper
// ---------------------------------------------------------------------------

function openReplayDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('roms')) db.createObjectStore('roms', { keyPath: 'hash' });
      if (!db.objectStoreNames.contains('save-states')) db.createObjectStore('save-states');
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
      if (!db.objectStoreNames.contains(REPLAY_STORE)) db.createObjectStore(REPLAY_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains('cheats')) db.createObjectStore('cheats');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// ReplayManager
// ---------------------------------------------------------------------------

export class ReplayManager {
  private recording = false;
  private inputs: TimestampedInput[] = [];
  private initialState: ArrayBuffer = new ArrayBuffer(0);
  private romHash = '';
  private platform: ConsolePlatform = 'NES';
  private startFrame = 0;
  private playbackSpeed: 0.5 | 1 | 2 | 4 = 1;
  private paused = false;
  private playing = false;
  private playbackAbort: AbortController | null = null;

  // -- Recording --

  startRecording(romHash: string, platform: ConsolePlatform, initialState: ArrayBuffer): void {
    this.recording = true;
    this.inputs = [];
    this.romHash = romHash;
    this.platform = platform;
    this.initialState = initialState;
    this.startFrame = 0;
  }

  recordInput(frame: number, input: TimestampedInput['input']): void {
    if (!this.recording) return;
    this.inputs.push({ frame, input, timestamp: Date.now() });
  }

  async stopRecording(): Promise<ReplayFile> {
    this.recording = false;
    const duration =
      this.inputs.length > 0
        ? (this.inputs[this.inputs.length - 1].timestamp - this.inputs[0].timestamp) / 1000
        : 0;

    const replay: ReplayFile = {
      id: crypto.randomUUID(),
      romHash: this.romHash,
      platform: this.platform,
      initialState: this.initialState,
      inputs: this.inputs,
      duration: Math.round(duration),
      createdAt: new Date().toISOString(),
    };

    await this.saveReplay(replay);
    return replay;
  }

  get isRecording(): boolean {
    return this.recording;
  }

  // -- Playback --

  async playReplay(
    replay: ReplayFile,
    onInput: (input: TimestampedInput['input']) => void,
    onComplete?: () => void,
  ): Promise<void> {
    this.playing = true;
    this.paused = false;
    this.playbackAbort = new AbortController();
    const { signal } = this.playbackAbort;

    const frameInterval = 1000 / 60; // ~16.67ms per frame

    for (let i = 0; i < replay.inputs.length; i++) {
      if (signal.aborted) break;

      // Handle pause
      while (this.paused && !signal.aborted) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (signal.aborted) break;

      onInput(replay.inputs[i].input);

      // Wait based on speed
      const delay = frameInterval / this.playbackSpeed;
      await new Promise((r) => setTimeout(r, delay));
    }

    this.playing = false;
    onComplete?.();
  }

  pausePlayback(): void {
    this.paused = true;
  }

  resumePlayback(): void {
    this.paused = false;
  }

  stopPlayback(): void {
    this.playing = false;
    this.paused = false;
    this.playbackAbort?.abort();
    this.playbackAbort = null;
  }

  setPlaybackSpeed(speed: 0.5 | 1 | 2 | 4): void {
    this.playbackSpeed = speed;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  // -- IndexedDB Storage --

  async saveReplay(replay: ReplayFile): Promise<void> {
    const db = await openReplayDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(REPLAY_STORE, 'readwrite');
      tx.objectStore(REPLAY_STORE).put(replay);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async getReplay(id: string): Promise<ReplayFile | null> {
    const db = await openReplayDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(REPLAY_STORE, 'readonly');
      const req = tx.objectStore(REPLAY_STORE).get(id);
      req.onsuccess = () => { db.close(); resolve((req.result as ReplayFile) ?? null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  async listReplays(romHash?: string): Promise<ReplayFile[]> {
    const db = await openReplayDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(REPLAY_STORE, 'readonly');
      const req = tx.objectStore(REPLAY_STORE).getAll();
      req.onsuccess = () => {
        db.close();
        let replays = (req.result as ReplayFile[]) ?? [];
        if (romHash) {
          replays = replays.filter((r) => r.romHash === romHash);
        }
        replays.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(replays);
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  async deleteReplay(id: string): Promise<void> {
    const db = await openReplayDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(REPLAY_STORE, 'readwrite');
      tx.objectStore(REPLAY_STORE).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  // -- Sharing API --

  async shareReplay(replayId: string, userId: string): Promise<{ shareCode: string; url: string }> {
    const res = await fetch('/api/classic/replay/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replayId, userId }),
    });
    if (!res.ok) throw new Error('Failed to share replay');
    return res.json();
  }

  async getSharedReplay(id: string): Promise<ReplayFile | null> {
    const res = await fetch(`/api/classic/replay/${id}`);
    if (!res.ok) return null;
    return res.json();
  }
}
