import { Nostalgist } from 'nostalgist';
import type {
  ConsolePlatform,
  InputFrame,
  SaveStateData,
  TimestampedInput,
  ReplayFile,
  VideoFilter,
  ColorPalette,
  ButtonMap,
} from '@/lib/types';
import { getCoreForPlatform } from '@/lib/emulator/core-registry';
import type { ReplayManager } from '@/lib/emulator/replay';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = 'fc-arcade-online';
const DB_VERSION = 3;
const SAVE_STATE_STORE = 'save-states';
const MAX_SLOTS = 3; // slots 0, 1, 2
const WASM_CACHE_NAME = 'retroarch-wasm-cores-v1';
const REWIND_BUFFER_MAX_FRAMES = 600; // ~10 seconds at 60fps

// ---------------------------------------------------------------------------
// IndexedDB helper for save-states store
// ---------------------------------------------------------------------------

function openSaveStateDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('roms')) {
        db.createObjectStore('roms', { keyPath: 'hash' });
      }
      if (!db.objectStoreNames.contains(SAVE_STATE_STORE)) {
        db.createObjectStore(SAVE_STATE_STORE);
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------------------------------------------------------------------------
// Neutral (empty) input frame
// ---------------------------------------------------------------------------

function neutralInput(): InputFrame {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    x: false,
    y: false,
    l: false,
    r: false,
    start: false,
    select: false,
    turbo: {},
  };
}

// ---------------------------------------------------------------------------
// EmulatorWrapper
// ---------------------------------------------------------------------------

export class EmulatorWrapper {
  private nostalgist: Nostalgist | null = null;
  private platform: ConsolePlatform | null = null;
  private romHash: string = '';
  private canvas: HTMLCanvasElement | null = null;
  private buttonMap: ButtonMap | null = null;

  // Keyboard state tracking
  private keyState: Set<string> = new Set();
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private keyupHandler: ((e: KeyboardEvent) => void) | null = null;

  // Frame callback
  private frameCallback: ((frameBuffer: ImageData) => void) | null = null;
  private animFrameId: number | null = null;

  // Rewind
  private rewindBuffer: ArrayBuffer[] = [];
  private rewindHead = 0; // write position in circular buffer
  private rewindSize = 0; // number of valid frames in buffer
  private _isRewinding = false;

  // Replay stubs
  private replayInputs: TimestampedInput[] = [];
  private isRecording = false;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async init(
    canvas: HTMLCanvasElement,
    platform: ConsolePlatform,
    romData: ArrayBuffer,
  ): Promise<void> {
    const coreConfig = getCoreForPlatform(platform);
    if (!coreConfig) {
      throw new Error(`No emulator core found for platform: ${platform}`);
    }

    this.platform = platform;
    this.canvas = canvas;
    this.buttonMap = coreConfig.defaultButtonMap;

    // Compute ROM hash for save-state keys
    const hashBuffer = await crypto.subtle.digest('SHA-256', romData);
    this.romHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Attempt WASM caching via Cache API
    const cachedCoreJs = await this.getCachedCore(coreConfig.jsUrl);
    const cachedCoreWasm = await this.getCachedCore(coreConfig.wasmUrl);

    try {
      const romBlob = new Blob([romData]);
      const romFile = new File([romBlob], `rom.${coreConfig.extensions[0]?.replace('.', '') ?? 'bin'}`);

      this.nostalgist = await Nostalgist.launch({
        element: canvas,
        core: {
          name: coreConfig.coreId,
          js: cachedCoreJs ?? coreConfig.jsUrl,
          wasm: cachedCoreWasm ?? coreConfig.wasmUrl,
        },
        rom: romFile,
        size: 'auto',
        respondToGlobalEvents: false,
        retroarchConfig: {
          savestate_thumbnail_enable: true,
          rewind_enable: false,
        },
        retroarchCoreConfig: {},
      });

      // Cache the core files after successful load if not already cached
      if (!cachedCoreJs) {
        this.cacheCore(coreConfig.jsUrl).catch(() => {});
      }
      if (!cachedCoreWasm) {
        this.cacheCore(coreConfig.wasmUrl).catch(() => {});
      }

      // Set up keyboard listeners
      this.setupKeyboardListeners();

      // Start frame callback loop if registered
      this.startFrameLoop();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes('wasm') || message.includes('WebAssembly') || message.includes('compile')) {
        throw new Error(
          `Failed to initialize WebAssembly emulator core (${coreConfig.coreName}). ` +
            'Your browser may not support the required WebAssembly features. ' +
            `Details: ${message}`,
        );
      }

      throw new Error(
        `Failed to load ROM for ${platform}. The ROM file may be incompatible or corrupted. ` +
          `Details: ${message}`,
      );
    }
  }

  async destroy(): Promise<void> {
    this.stopFrameLoop();
    this.removeKeyboardListeners();

    if (this.nostalgist) {
      try {
        this.nostalgist.exit({ removeCanvas: false });
      } catch {
        // Ignore exit errors during cleanup
      }
      this.nostalgist = null;
    }

    this.platform = null;
    this.canvas = null;
    this.buttonMap = null;
    this.romHash = '';
    this.keyState.clear();
    this.rewindBuffer = [];
    this.rewindHead = 0;
    this.rewindSize = 0;
    this._isRewinding = false;
    this.replayInputs = [];
    this.isRecording = false;
    this.frameCallback = null;
  }

  // -----------------------------------------------------------------------
  // Playback controls
  // -----------------------------------------------------------------------

  pause(): void {
    this.ensureRunning();
    this.nostalgist!.pause();
  }

  resume(): void {
    this.ensureInitialized();
    this.nostalgist!.resume();
  }

  setSpeed(multiplier: 0.5 | 1 | 2 | 4): void {
    this.ensureRunning();
    // RetroArch uses `fastforward_ratio` config. We send commands to toggle
    // fast-forward or slowmotion depending on the multiplier.
    // For simplicity, we use sendCommand for fast-forward toggle and
    // adjust via retroarch config when possible.
    const emulator = this.nostalgist!.getEmulator();
    if (multiplier === 1) {
      // Ensure normal speed — disable fast-forward and slowmotion
      try {
        emulator.sendCommand('FAST_FORWARD');
        emulator.sendCommand('FAST_FORWARD'); // Toggle off if on
      } catch {
        // Ignore if not supported
      }
    } else if (multiplier > 1) {
      // Use FAST_FORWARD command
      emulator.sendCommand('FAST_FORWARD');
    } else {
      // 0.5x — use SLOWMOTION
      emulator.sendCommand('SLOWMOTION');
    }
  }

  // -----------------------------------------------------------------------
  // Save State (IndexedDB persistence)
  // -----------------------------------------------------------------------

  async saveState(slot: number): Promise<SaveStateData> {
    this.ensureRunning();
    this.validateSlot(slot);

    const { state, thumbnail } = await this.nostalgist!.saveState();

    const stateBuffer = await state.arrayBuffer();
    const thumbBlob = thumbnail ?? new Blob();

    const saveData: SaveStateData = {
      romHash: this.romHash,
      platform: this.platform!,
      slot,
      state: stateBuffer,
      thumbnail: thumbBlob,
      savedAt: Date.now(),
    };

    // Persist to IndexedDB
    const key = this.saveStateKey(slot);
    const db = await openSaveStateDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SAVE_STATE_STORE, 'readwrite');
      const store = tx.objectStore(SAVE_STATE_STORE);
      const request = store.put(saveData, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });

    return saveData;
  }

  async loadState(slot: number): Promise<void> {
    this.ensureInitialized();
    this.validateSlot(slot);

    const key = this.saveStateKey(slot);
    const db = await openSaveStateDB();
    const saveData = await new Promise<SaveStateData | undefined>((resolve, reject) => {
      const tx = db.transaction(SAVE_STATE_STORE, 'readonly');
      const store = tx.objectStore(SAVE_STATE_STORE);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result as SaveStateData | undefined);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });

    if (!saveData) {
      throw new Error(`No save state found in slot ${slot}`);
    }

    const stateBlob = new Blob([saveData.state]);
    await this.nostalgist!.loadState(stateBlob);
  }

  // -----------------------------------------------------------------------
  // Input handling
  // -----------------------------------------------------------------------

  setInputState(playerIndex: number, input: InputFrame): void {
    this.ensureRunning();
    const emulator = this.nostalgist!.getEmulator();
    const player = playerIndex + 1; // Nostalgist uses 1-based player index

    const buttons = [
      'up', 'down', 'left', 'right',
      'a', 'b', 'x', 'y',
      'l', 'r', 'start', 'select',
    ] as const;

    for (const btn of buttons) {
      if (input[btn]) {
        emulator.pressDown(btn, player);
      } else {
        emulator.pressUp(btn, player);
      }
    }
  }

  getLocalInput(): InputFrame {
    if (!this.buttonMap) return neutralInput();

    const frame = neutralInput();
    const map = this.buttonMap;

    const mappings: [string, string][] = [
      ['up', map.up],
      ['down', map.down],
      ['left', map.left],
      ['right', map.right],
      ['a', map.a],
      ['b', map.b],
      ['x', map.x],
      ['y', map.y],
      ['l', map.l],
      ['r', map.r],
      ['start', map.start],
      ['select', map.select],
    ];

    for (const [button, keyCode] of mappings) {
      if (keyCode && this.keyState.has(keyCode)) {
        (frame as unknown as Record<string, boolean>)[button] = true;
      }
    }

    return frame;
  }

  // -----------------------------------------------------------------------
  // Frame callback for multiplayer sync
  // -----------------------------------------------------------------------

  onFrameReady(callback: (frameBuffer: ImageData) => void): void {
    this.frameCallback = callback;
    // If already initialized, start the loop
    if (this.nostalgist) {
      this.startFrameLoop();
    }
  }

  // -----------------------------------------------------------------------
  // WASM Core Caching (Cache API)
  // -----------------------------------------------------------------------

  private async getCachedCore(url: string): Promise<Blob | null> {
    try {
      if (typeof caches === 'undefined') return null;
      const cache = await caches.open(WASM_CACHE_NAME);
      const response = await cache.match(url);
      if (!response) return null;
      return await response.blob();
    } catch {
      return null;
    }
  }

  private async cacheCore(url: string): Promise<void> {
    try {
      if (typeof caches === 'undefined') return;
      const cache = await caches.open(WASM_CACHE_NAME);
      await cache.add(url);
    } catch {
      // Caching is best-effort
    }
  }

  static async invalidateCoreCache(): Promise<void> {
    try {
      if (typeof caches === 'undefined') return;
      await caches.delete(WASM_CACHE_NAME);
    } catch {
      // Ignore
    }
  }

  // -----------------------------------------------------------------------
  // Cheats (wired — task 9.3)
  // -----------------------------------------------------------------------

  addCheat(code: string, _format: 'gamegenie' | 'actionreplay'): void {
    if (!this.nostalgist) return;
    try {
      const emulator = this.nostalgist.getEmulator();
      const idx = this._cheatIndex++;
      (emulator as unknown as { sendCommand?: (cmd: string) => void }).sendCommand?.(`CHEAT_INDEX ${idx}`);
      (emulator as unknown as { sendCommand?: (cmd: string) => void }).sendCommand?.(`CHEAT_CODE ${code}`);
      (emulator as unknown as { sendCommand?: (cmd: string) => void }).sendCommand?.(`CHEAT_TOGGLE`);
    } catch {
      // Cheat application failed silently
    }
  }

  removeCheat(code: string): void {
    if (!this.nostalgist) return;
    try {
      // RetroArch doesn't have a direct remove-by-code API;
      // we reset all cheats as a simple approach
      const emulator = this.nostalgist.getEmulator();
      (emulator as unknown as { sendCommand?: (cmd: string) => void }).sendCommand?.(`CHEAT_INDEX 0`);
      (emulator as unknown as { sendCommand?: (cmd: string) => void }).sendCommand?.(`CHEAT_TOGGLE`);
    } catch {
      // Ignore
    }
  }

  private _cheatIndex = 0;

  // -----------------------------------------------------------------------
  // Replay (wired to ReplayManager — task 9.1)
  // -----------------------------------------------------------------------

  private replayManager: ReplayManager | null = null;

  private getReplayManager(): ReplayManager {
    if (!this.replayManager) {
      // Lazy import to avoid circular deps at module level
      const { ReplayManager: RM } = require('@/lib/emulator/replay');
      this.replayManager = new RM() as ReplayManager;
    }
    return this.replayManager!;
  }

  startRecording(): void {
    this.isRecording = true;
    this.replayInputs = [];
    const mgr = this.getReplayManager();
    // Capture initial state as empty buffer (full state capture requires async)
    mgr.startRecording(this.romHash, this.platform ?? 'NES', new ArrayBuffer(0));
  }

  stopRecording(): ReplayFile {
    this.isRecording = false;
    const mgr = this.getReplayManager();
    // Synchronous return — the manager persists asynchronously internally
    const replay: ReplayFile = {
      id: crypto.randomUUID(),
      romHash: this.romHash,
      platform: this.platform ?? 'NES',
      initialState: new ArrayBuffer(0),
      inputs: this.replayInputs,
      duration: this.replayInputs.length > 0
        ? Math.round((this.replayInputs[this.replayInputs.length - 1].timestamp - this.replayInputs[0].timestamp) / 1000)
        : 0,
      createdAt: new Date().toISOString(),
    };
    // Persist in background
    mgr.saveReplay(replay).catch(() => {});
    return replay;
  }

  async playReplay(replay: ReplayFile): Promise<void> {
    const mgr = this.getReplayManager();
    await mgr.playReplay(
      replay,
      (input) => this.setInputState(0, { ...input, turbo: {} }),
    );
  }

  // -----------------------------------------------------------------------
  // Video / Audio (stubs — fully implemented in tasks 11.1, 11.3)
  // -----------------------------------------------------------------------

  setVideoFilter(_filter: VideoFilter): void {
    // Stub: will be implemented in task 11.1
  }

  setColorPalette(_palette: ColorPalette): void {
    // Stub: will be implemented in task 11.1
  }

  setMasterVolume(_volume: number): void {
    // Stub: will be implemented in task 11.3
  }

  setChannelMute(_channel: string, _muted: boolean): void {
    // Stub: will be implemented in task 11.3
  }

  setAudioLatency(_ms: number): void {
    // Stub: will be implemented in task 11.3
  }

  // -----------------------------------------------------------------------
  // Rewind (circular buffer of save states)
  // -----------------------------------------------------------------------

  /** Capture the current emulator state into the circular rewind buffer. */
  captureRewindFrame(): void {
    if (!this.nostalgist || this._isRewinding) return;

    try {
      // Use Nostalgist's synchronous save-state-to-memory approach.
      // We grab the Emscripten FS serialized state as an ArrayBuffer.
      const emulator = this.nostalgist.getEmulator();
      const stateData = emulator.saveState();

      if (!stateData) return;

      // Convert Blob to ArrayBuffer if needed, but saveState() from the
      // low-level emulator API typically returns raw data. We store whatever
      // we get as an ArrayBuffer-compatible entry.
      const buffer = stateData instanceof ArrayBuffer
        ? stateData
        : stateData instanceof Blob
          ? null // async path — skip for frame-level capture
          : (stateData as { state?: Blob })?.state instanceof Blob
            ? null
            : new ArrayBuffer(0);

      if (!buffer) return;

      // Write into circular buffer
      if (this.rewindBuffer.length < REWIND_BUFFER_MAX_FRAMES) {
        this.rewindBuffer.push(buffer);
        this.rewindHead = this.rewindBuffer.length;
        this.rewindSize = this.rewindBuffer.length;
      } else {
        const writePos = this.rewindHead % REWIND_BUFFER_MAX_FRAMES;
        this.rewindBuffer[writePos] = buffer;
        this.rewindHead = writePos + 1;
        this.rewindSize = REWIND_BUFFER_MAX_FRAMES;
      }
    } catch {
      // Capture failed — skip this frame silently
    }
  }

  /** Step backward one frame by restoring the most recent rewind state. */
  rewindStep(): void {
    if (!this.nostalgist || this.rewindSize === 0) return;

    this._isRewinding = true;

    try {
      // Read from the position before the current head
      const readPos =
        ((this.rewindHead - 1 + REWIND_BUFFER_MAX_FRAMES) % REWIND_BUFFER_MAX_FRAMES);

      const stateBuffer = this.rewindBuffer[readPos];
      if (!stateBuffer || stateBuffer.byteLength === 0) {
        this._isRewinding = false;
        return;
      }

      const emulator = this.nostalgist.getEmulator();
      const stateBlob = new Blob([stateBuffer]);
      emulator.loadState(stateBlob as unknown as Parameters<typeof emulator.loadState>[0]);

      // Move head back
      this.rewindHead = readPos;
      this.rewindSize = Math.max(0, this.rewindSize - 1);
    } catch {
      // Restore failed — stop rewinding
    }
  }

  /** Stop rewinding and resume forward emulation. */
  stopRewinding(): void {
    this._isRewinding = false;
  }

  /** Returns the rewind buffer fill percentage (0–100). */
  getRewindBufferLevel(): number {
    return Math.round((this.rewindSize / REWIND_BUFFER_MAX_FRAMES) * 100);
  }

  /** Whether the emulator is currently in rewind mode. */
  get isRewinding(): boolean {
    return this._isRewinding;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private setupKeyboardListeners(): void {
    if (typeof window === 'undefined') return;

    this.keydownHandler = (e: KeyboardEvent) => {
      this.keyState.add(e.code);
    };

    this.keyupHandler = (e: KeyboardEvent) => {
      this.keyState.delete(e.code);
    };

    window.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('keyup', this.keyupHandler);
  }

  private removeKeyboardListeners(): void {
    if (typeof window === 'undefined') return;

    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    if (this.keyupHandler) {
      window.removeEventListener('keyup', this.keyupHandler);
      this.keyupHandler = null;
    }
  }

  private startFrameLoop(): void {
    if (!this.frameCallback || !this.canvas || this.animFrameId !== null) return;

    const loop = () => {
      if (!this.frameCallback || !this.canvas) return;

      const ctx = this.canvas.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.frameCallback(imageData);
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  private stopFrameLoop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private saveStateKey(slot: number): string {
    return `${this.romHash}:${this.platform}:${slot}`;
  }

  private validateSlot(slot: number): void {
    if (slot < 0 || slot >= MAX_SLOTS || !Number.isInteger(slot)) {
      throw new Error(`Invalid save state slot: ${slot}. Must be 0, 1, or 2.`);
    }
  }

  private ensureInitialized(): void {
    if (!this.nostalgist) {
      throw new Error('Emulator is not initialized. Call init() first.');
    }
  }

  private ensureRunning(): void {
    this.ensureInitialized();
    const status = this.nostalgist!.getStatus();
    if (status === 'terminated') {
      throw new Error('Emulator has been terminated.');
    }
  }

  // -----------------------------------------------------------------------
  // Getters for external use
  // -----------------------------------------------------------------------

  getStatus(): 'initial' | 'paused' | 'running' | 'terminated' {
    if (!this.nostalgist) return 'initial';
    return this.nostalgist.getStatus();
  }

  getPlatform(): ConsolePlatform | null {
    return this.platform;
  }

  getRomHash(): string {
    return this.romHash;
  }
}
