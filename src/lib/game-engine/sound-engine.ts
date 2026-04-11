/**
 * SoundEngine - 通用程序化音效引擎
 *
 * 基于 Web Audio API OscillatorNode + GainNode，零外部音频依赖。
 * 从 2048 游戏的 SoundEngine 提取并增强为通用版本。
 *
 * 错误处理策略：所有音效方法 try-catch 包裹，静默降级，不影响游戏运行。
 */

// 音符名称到半音偏移的映射（相对于 C）
const NOTE_OFFSETS: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1,
  D: 2, 'D#': 3, Eb: 3,
  E: 4,
  F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10,
  B: 11,
};

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean;
  private gameId: string;

  constructor(gameId: string) {
    this.gameId = gameId;
    try {
      this.muted = localStorage.getItem(`sound_muted_${gameId}`) === 'true';
    } catch {
      this.muted = false;
    }
  }

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  // ─── 通用音效方法 ─────────────────────────────────────

  playTone(freq: number, duration: number, type: OscillatorType = 'sine'): void {
    try {
      if (this.muted) return;
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.type = type;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch { /* silent degradation */ }
  }

  playMerge(value: number): void {
    try {
      if (this.muted) return;
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const baseFreq = 300 + Math.min(Math.log2(Math.max(value, 1)) * 80, 800);
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.06);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, ctx.currentTime + 0.12);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch { /* silent degradation */ }
  }

  playMove(): void {
    try {
      if (this.muted) return;
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(250, ctx.currentTime + 0.05);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } catch { /* silent degradation */ }
  }

  playScore(points: number): void {
    try {
      if (this.muted) return;
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const freq = 400 + Math.min(points, 1000) * 0.5;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.3, ctx.currentTime + 0.1);
      osc.type = 'triangle';
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch { /* silent degradation */ }
  }

  playCombo(level: number): void {
    try {
      if (this.muted) return;
      const ctx = this.getCtx();
      const notes = [523, 659, 784, 1047];
      const freq = notes[Math.min(Math.max(level - 1, 0), notes.length - 1)];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.type = 'triangle';
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch { /* silent degradation */ }
  }

  playGameOver(): void {
    try {
      if (this.muted) return;
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
      osc.type = 'sawtooth';
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch { /* silent degradation */ }
  }

  playLevelUp(): void {
    try {
      if (this.muted) return;
      const ctx = this.getCtx();
      const notes = [523, 659, 784];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.1;
        osc.frequency.setValueAtTime(freq, t);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.start(t);
        osc.stop(t + 0.15);
      });
    } catch { /* silent degradation */ }
  }

  playClick(): void {
    try {
      if (this.muted) return;
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.type = 'square';
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.03);
    } catch { /* silent degradation */ }
  }

  playError(): void {
    try {
      if (this.muted) return;
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);
      osc.type = 'sawtooth';
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch { /* silent degradation */ }
  }

  // ─── 音乐节奏类专用 ───────────────────────────────────

  playNote(note: string, octave: number, duration: number): void {
    try {
      if (this.muted) return;
      const semitone = NOTE_OFFSETS[note];
      if (semitone === undefined) return;
      // A4 = 440Hz, calculate frequency from note + octave
      const freq = 440 * Math.pow(2, (semitone - 9) / 12 + (octave - 4));
      this.playTone(freq, duration, 'sine');
    } catch { /* silent degradation */ }
  }

  playDrum(type: 'kick' | 'snare' | 'hihat'): void {
    try {
      if (this.muted) return;
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'kick') {
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.1);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'snare') {
        osc.frequency.setValueAtTime(250, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.05);
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
        // Add noise-like component via a second oscillator
        const noiseOsc = ctx.createOscillator();
        const noiseGain = ctx.createGain();
        noiseOsc.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noiseOsc.frequency.setValueAtTime(3000, ctx.currentTime);
        noiseOsc.type = 'square';
        noiseGain.gain.setValueAtTime(0.04, ctx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        noiseOsc.start(ctx.currentTime);
        noiseOsc.stop(ctx.currentTime + 0.08);
      } else {
        // hihat
        osc.frequency.setValueAtTime(6000, ctx.currentTime);
        osc.type = 'square';
        gain.gain.setValueAtTime(0.03, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.05);
      }
    } catch { /* silent degradation */ }
  }

  // ─── 控制方法 ──────────────────────────────────────────

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(`sound_muted_${this.gameId}`, String(this.muted));
    } catch { /* localStorage unavailable, still toggle in-memory */ }
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  dispose(): void {
    try {
      if (this.ctx) {
        this.ctx.close();
        this.ctx = null;
      }
    } catch { /* silent degradation */ }
  }
}
