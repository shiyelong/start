/**
 * Audio Manager — 音效管理系统
 *
 * 基于 Web Audio API 的音效加载、播放和管理。
 * 支持音量控制和并发播放的声音池。
 *
 * Requirements: 6.7 (音效管理)
 */

// ─── Types ───────────────────────────────────────────────

export interface SoundConfig {
  /** Unique identifier for this sound */
  id: string;
  /** URL to the audio file, or 'procedural' for generated sounds */
  url?: string;
  /** Volume multiplier for this sound (0-1, default: 1) */
  volume?: number;
  /** Maximum concurrent instances of this sound (default: 3) */
  maxInstances?: number;
  /** Whether this sound should loop (default: false) */
  loop?: boolean;
}

interface SoundEntry {
  config: SoundConfig;
  buffer: AudioBuffer | null;
  activeNodes: AudioBufferSourceNode[];
}

// ─── Procedural Sound Generators ─────────────────────────

type OscType = OscillatorType;

interface ProceduralSoundDef {
  frequency: number;
  duration: number;
  type: OscType;
  /** Optional frequency ramp target */
  frequencyEnd?: number;
  /** Volume (0-1) */
  volume?: number;
}

// ─── AudioManager ────────────────────────────────────────

export class AudioManager {
  private ctx: AudioContext | null;
  private masterGain: GainNode | null;
  private sounds: Map<string, SoundEntry>;
  private masterVolume: number;
  private muted: boolean;

  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sounds = new Map();
    this.masterVolume = 1.0;
    this.muted = false;
  }

  // ─── Initialization ────────────────────────────────────

  /** Initialize the audio context. Must be called after a user gesture. */
  init(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.ctx.destination);
    } catch {
      // Web Audio API not available
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // ─── Sound Registration ────────────────────────────────

  /** Register a sound effect for later playback */
  register(config: SoundConfig): void {
    this.sounds.set(config.id, {
      config,
      buffer: null,
      activeNodes: [],
    });
  }

  /** Load a registered sound's audio data from its URL */
  async load(id: string): Promise<void> {
    const entry = this.sounds.get(id);
    if (!entry || !entry.config.url || entry.config.url === 'procedural') return;

    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const response = await fetch(entry.config.url);
      const arrayBuffer = await response.arrayBuffer();
      entry.buffer = await ctx.decodeAudioData(arrayBuffer);
    } catch {
      // Failed to load audio — sound will be silent
    }
  }

  /** Load all registered sounds */
  async loadAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [id] of this.sounds) {
      promises.push(this.load(id));
    }
    await Promise.allSettled(promises);
  }

  // ─── Playback ──────────────────────────────────────────

  /** Play a registered sound by ID */
  play(id: string): void {
    if (this.muted) return;

    const entry = this.sounds.get(id);
    if (!entry) return;

    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    // Check max instances
    const maxInstances = entry.config.maxInstances ?? 3;
    this.cleanupFinished(entry);
    if (entry.activeNodes.length >= maxInstances) {
      // Stop the oldest instance
      const oldest = entry.activeNodes.shift();
      try { oldest?.stop(); } catch { /* already stopped */ }
    }

    if (!entry.buffer) return;

    try {
      const source = ctx.createBufferSource();
      source.buffer = entry.buffer;
      source.loop = entry.config.loop ?? false;

      const gainNode = ctx.createGain();
      gainNode.gain.value = entry.config.volume ?? 1.0;

      source.connect(gainNode);
      gainNode.connect(this.masterGain);

      source.start(0);
      entry.activeNodes.push(source);

      source.onended = () => {
        const idx = entry.activeNodes.indexOf(source);
        if (idx >= 0) entry.activeNodes.splice(idx, 1);
      };
    } catch {
      // Playback failed — silent degradation
    }
  }

  /** Stop all instances of a sound */
  stop(id: string): void {
    const entry = this.sounds.get(id);
    if (!entry) return;

    for (const node of entry.activeNodes) {
      try { node.stop(); } catch { /* already stopped */ }
    }
    entry.activeNodes = [];
  }

  /** Stop all currently playing sounds */
  stopAll(): void {
    for (const [, entry] of this.sounds) {
      for (const node of entry.activeNodes) {
        try { node.stop(); } catch { /* already stopped */ }
      }
      entry.activeNodes = [];
    }
  }

  // ─── Procedural Sound Playback ─────────────────────────

  /** Play a procedurally generated tone (no pre-loading needed) */
  playTone(def: ProceduralSoundDef): void {
    if (this.muted) return;

    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.frequency.setValueAtTime(def.frequency, ctx.currentTime);
      if (def.frequencyEnd !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(def.frequencyEnd, 0.01),
          ctx.currentTime + def.duration,
        );
      }
      osc.type = def.type;

      const vol = def.volume ?? 0.1;
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + def.duration);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + def.duration);
    } catch {
      // Silent degradation
    }
  }

  // ─── Volume Control ────────────────────────────────────

  /** Set master volume (0-1) */
  setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.masterVolume;
    }
  }

  /** Get current master volume */
  getVolume(): number {
    return this.masterVolume;
  }

  /** Toggle mute state */
  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
    }
    return this.muted;
  }

  /** Check if audio is muted */
  isMuted(): boolean {
    return this.muted;
  }

  /** Set mute state directly */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
    }
  }

  // ─── Cleanup ───────────────────────────────────────────

  /** Dispose of the audio manager and release all resources */
  dispose(): void {
    this.stopAll();
    this.sounds.clear();
    try {
      if (this.ctx) {
        this.ctx.close();
        this.ctx = null;
      }
    } catch {
      // Silent degradation
    }
    this.masterGain = null;
  }

  private cleanupFinished(entry: SoundEntry): void {
    entry.activeNodes = entry.activeNodes.filter((node) => {
      try {
        // If the node's buffer has finished, it will have been removed via onended
        // This is a safety check
        return node.context.state !== 'closed';
      } catch {
        return false;
      }
    });
  }
}
