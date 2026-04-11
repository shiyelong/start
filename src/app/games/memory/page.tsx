"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Card {
  id: number;
  pairId: number;
  symbol: string;
  row: number;
  col: number;
  flipped: boolean;
  matched: boolean;
  // animation
  flipProgress: number; // 0=face-down, 1=face-up
  flipTarget: number;
  shakeTime: number;
  glowTime: number;
  matchGlow: number;
  // entrance
  startX: number;
  startY: number;
  entranceProgress: number;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
  type: "sparkle" | "confetti";
  rotation?: number; rotSpeed?: number;
}

interface FloatingParticle {
  x: number; y: number; vx: number; vy: number;
  size: number; alpha: number; hue: number;
}

interface GameState {
  cards: Card[];
  cols: number;
  rows: number;
  totalPairs: number;
  flippedIds: number[];
  matchedCount: number;
  moves: number;
  score: number;
  combo: number;
  maxCombo: number;
  timer: number; // seconds elapsed
  running: boolean;
  won: boolean;
  hintsLeft: number;
  hintActive: boolean;
  hintTimer: number;
  difficulty: "easy" | "medium" | "hard";
  theme: "animals" | "space" | "food";
  lockInput: boolean;
  entranceDone: boolean;
}

interface AnimState {
  particles: Particle[];
  floaters: FloatingParticle[];
  time: number;
  hoverCardId: number | null;
  canvasW: number;
  canvasH: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "memory";
const ACCENT = "#a855f7";
const ACCENT_DARK = "#7c3aed";
const GOLD = "#f0b90b";
const CARD_RADIUS = 10;
const FLIP_SPEED = 0.06;
const ENTRANCE_DURATION = 800; // ms per card stagger

const DIFFICULTY_CONFIG = {
  easy:   { cols: 4, rows: 4, label: "4×4", stars3: 10, stars2: 16 },
  medium: { cols: 5, rows: 4, label: "5×4", stars3: 14, stars2: 22 },
  hard:   { cols: 6, rows: 5, label: "6×5", stars3: 20, stars2: 32 },
};

const THEMES: Record<string, { label: string; icon: string; symbols: string[] }> = {
  animals: {
    label: "动物", icon: "🐾",
    symbols: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵"],
  },
  space: {
    label: "太空", icon: "🚀",
    symbols: ["🚀","🌍","🌙","⭐","🪐","☄️","🛸","👽","🌌","🔭","🛰️","🌞","💫","🌠","🪨"],
  },
  food: {
    label: "美食", icon: "🍕",
    symbols: ["🍕","🍔","🍟","🌮","🍣","🍩","🍪","🎂","🍉","🍇","🍓","🍑","🥑","🍜","🧁"],
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
function easeOutBack(t: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }

// ─── Sound Engine ────────────────────────────────────────────────────────────
class SoundEngine {
  private ctx: AudioContext | null = null;
  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  playFlip() {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);
      osc.type = "sine";
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.08);
    } catch {}
  }

  playMatch() {
    try {
      const ctx = this.getCtx();
      const notes = [523, 659, 784];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
        osc.type = "sine";
        gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.15);
        osc.start(ctx.currentTime + i * 0.08);
        osc.stop(ctx.currentTime + i * 0.08 + 0.15);
      });
    } catch {}
  }

  playMismatch() {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.2);
      osc.type = "sawtooth";
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
    } catch {}
  }

  playWin() {
    try {
      const ctx = this.getCtx();
      const melody = [523, 587, 659, 784, 1047];
      melody.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
        osc.type = "triangle";
        gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.3);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.3);
      });
    } catch {}
  }

  playCombo(level: number) {
    try {
      const ctx = this.getCtx();
      const freq = 600 + level * 150;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + 0.1);
      osc.type = "triangle";
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
    } catch {}
  }

  playHint() {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(1000, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.3);
      osc.type = "sine";
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }
}

// ─── Game Logic ──────────────────────────────────────────────────────────────
function createGame(difficulty: "easy" | "medium" | "hard", theme: "animals" | "space" | "food", canvasW: number, canvasH: number): GameState {
  const cfg = DIFFICULTY_CONFIG[difficulty];
  const totalPairs = (cfg.cols * cfg.rows) / 2;
  const symbols = shuffle(THEMES[theme].symbols).slice(0, totalPairs);
  const pairs = shuffle([...symbols, ...symbols]);

  const cards: Card[] = pairs.map((symbol, i) => {
    const row = Math.floor(i / cfg.cols);
    const col = i % cfg.cols;
    return {
      id: i,
      pairId: symbols.indexOf(symbol),
      symbol,
      row, col,
      flipped: false, matched: false,
      flipProgress: 0, flipTarget: 0,
      shakeTime: 0, glowTime: 0, matchGlow: 0,
      startX: Math.random() * canvasW,
      startY: -50 - Math.random() * 300,
      entranceProgress: 0,
    };
  });

  return {
    cards, cols: cfg.cols, rows: cfg.rows, totalPairs,
    flippedIds: [], matchedCount: 0, moves: 0, score: 0,
    combo: 0, maxCombo: 0, timer: 0, running: false, won: false,
    hintsLeft: 3, hintActive: false, hintTimer: 0,
    difficulty, theme, lockInput: true, entranceDone: false,
  };
}

function calcStars(moves: number, difficulty: "easy" | "medium" | "hard"): number {
  const cfg = DIFFICULTY_CONFIG[difficulty];
  if (moves <= cfg.stars3) return 3;
  if (moves <= cfg.stars2) return 2;
  return 1;
}

function calcScore(matchedCount: number, totalPairs: number, moves: number, timer: number, combo: number, maxCombo: number): number {
  const basePoints = matchedCount * 100;
  const comboBonus = maxCombo * 50;
  const timePenalty = Math.floor(timer * 2);
  const movePenalty = Math.max(0, (moves - totalPairs) * 10);
  return Math.max(0, basePoints + comboBonus - timePenalty - movePenalty);
}

// ─── Canvas Renderer ─────────────────────────────────────────────────────────
function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function renderGame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  game: GameState,
  anim: AnimState,
  dpr: number
) {
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.save();
  ctx.scale(dpr, dpr);

  // ── Background ──
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, "#0a0a12");
  bgGrad.addColorStop(1, "#0f0a18");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Floating background particles
  for (const fp of anim.floaters) {
    ctx.globalAlpha = fp.alpha * 0.4;
    ctx.fillStyle = `hsl(${fp.hue}, 70%, 60%)`;
    ctx.beginPath();
    ctx.arc(fp.x, fp.y, fp.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Card layout ──
  const { cols, rows } = game;
  const boardPadding = 12;
  const gap = 8;
  const maxBoardW = Math.min(w - 20, 460);
  const maxBoardH = h - 20;
  const cellW = Math.min((maxBoardW - boardPadding * 2 - gap * (cols - 1)) / cols, 80);
  const cellH = Math.min((maxBoardH - boardPadding * 2 - gap * (rows - 1)) / rows, cellW * 1.2);
  const boardW = boardPadding * 2 + cellW * cols + gap * (cols - 1);
  const boardH = boardPadding * 2 + cellH * rows + gap * (rows - 1);
  const boardX = (w - boardW) / 2;
  const boardY = (h - boardH) / 2;

  // Board background
  drawRoundedRect(ctx, boardX - 4, boardY - 4, boardW + 8, boardH + 8, 16);
  ctx.fillStyle = "rgba(168, 85, 247, 0.05)";
  ctx.fill();
  ctx.strokeStyle = "rgba(168, 85, 247, 0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── Draw cards ──
  for (const card of game.cards) {
    const targetX = boardX + boardPadding + card.col * (cellW + gap);
    const targetY = boardY + boardPadding + card.row * (cellH + gap);

    // Entrance animation
    let cx: number, cy: number, cardAlpha = 1;
    if (!game.entranceDone && card.entranceProgress < 1) {
      const t = easeOutBack(clamp(card.entranceProgress, 0, 1));
      cx = lerp(card.startX, targetX, t);
      cy = lerp(card.startY, targetY, t);
      cardAlpha = clamp(card.entranceProgress * 2, 0, 1);
    } else {
      cx = targetX;
      cy = targetY;
    }

    // Shake animation
    if (card.shakeTime > 0) {
      const intensity = 4 * (card.shakeTime / 0.4);
      cx += Math.sin(card.shakeTime * 40) * intensity;
    }

    ctx.save();
    ctx.globalAlpha = cardAlpha;

    const flip = card.flipProgress; // 0=back, 1=front
    const showFront = flip > 0.5;
    const scaleX = Math.abs(Math.cos(flip * Math.PI)); // 3D perspective sim

    const centerX = cx + cellW / 2;
    const centerY = cy + cellH / 2;

    ctx.translate(centerX, centerY);
    ctx.scale(Math.max(scaleX, 0.02), 1);
    ctx.translate(-centerX, -centerY);

    // Hover glow
    if (anim.hoverCardId === card.id && !card.matched && !card.flipped) {
      ctx.shadowColor = ACCENT;
      ctx.shadowBlur = 12;
    }

    // Match glow
    if (card.matchGlow > 0) {
      ctx.shadowColor = GOLD;
      ctx.shadowBlur = 20 * card.matchGlow;
    }

    // Mismatch red flash
    if (card.shakeTime > 0) {
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = 15 * (card.shakeTime / 0.4);
    }

    if (showFront) {
      // ── Face-up card ──
      const grad = ctx.createLinearGradient(cx, cy, cx, cy + cellH);
      if (card.matched) {
        grad.addColorStop(0, "rgba(168, 85, 247, 0.3)");
        grad.addColorStop(1, "rgba(124, 58, 237, 0.2)");
      } else {
        grad.addColorStop(0, "#1e1b2e");
        grad.addColorStop(1, "#16132a");
      }
      drawRoundedRect(ctx, cx, cy, cellW, cellH, CARD_RADIUS);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = card.matched ? "rgba(168, 85, 247, 0.6)" : "rgba(168, 85, 247, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Symbol
      const fontSize = Math.min(cellW, cellH) * 0.5;
      ctx.font = `${fontSize}px -apple-system, "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(card.symbol, cx + cellW / 2, cy + cellH / 2 + 2);
    } else {
      // ── Face-down card ──
      const grad = ctx.createLinearGradient(cx, cy, cx + cellW, cy + cellH);
      grad.addColorStop(0, "#2d1b69");
      grad.addColorStop(1, "#1a1040");
      drawRoundedRect(ctx, cx, cy, cellW, cellH, CARD_RADIUS);
      ctx.fillStyle = grad;
      ctx.fill();

      // Subtle pattern (diamond)
      ctx.strokeStyle = "rgba(168, 85, 247, 0.12)";
      ctx.lineWidth = 0.5;
      const patternSize = 12;
      for (let py = cy; py < cy + cellH; py += patternSize) {
        for (let px = cx; px < cx + cellW; px += patternSize) {
          ctx.beginPath();
          ctx.moveTo(px + patternSize / 2, py);
          ctx.lineTo(px + patternSize, py + patternSize / 2);
          ctx.lineTo(px + patternSize / 2, py + patternSize);
          ctx.lineTo(px, py + patternSize / 2);
          ctx.closePath();
          ctx.stroke();
        }
      }

      // Border
      drawRoundedRect(ctx, cx, cy, cellW, cellH, CARD_RADIUS);
      ctx.strokeStyle = "rgba(168, 85, 247, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Center question mark
      const qSize = Math.min(cellW, cellH) * 0.35;
      ctx.font = `bold ${qSize}px -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(168, 85, 247, 0.3)";
      ctx.fillText("?", cx + cellW / 2, cy + cellH / 2 + 1);
    }

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Particles ──
  for (const p of anim.particles) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    if (p.type === "confetti") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation || 0);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    } else {
      // sparkle
      ctx.fillStyle = p.color;
      ctx.beginPath();
      const s = p.size * alpha;
      // 4-point star
      for (let i = 0; i < 4; i++) {
        const angle = (Math.PI / 2) * i;
        ctx.lineTo(p.x + Math.cos(angle) * s, p.y + Math.sin(angle) * s);
        ctx.lineTo(p.x + Math.cos(angle + Math.PI / 4) * s * 0.3, p.y + Math.sin(angle + Math.PI / 4) * s * 0.3);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // ── Win overlay ──
  if (game.won) {
    ctx.fillStyle = "rgba(10, 10, 18, 0.6)";
    ctx.fillRect(0, 0, w, h);

    const pulse = 1 + Math.sin(anim.time * 3) * 0.03;
    ctx.save();
    ctx.translate(w / 2, h / 2 - 20);
    ctx.scale(pulse, pulse);
    ctx.font = "bold 28px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = ACCENT;
    ctx.fillText("🎉 恭喜通关！", 0, 0);
    ctx.restore();

    ctx.font = "16px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ccc";
    const stars = calcStars(game.moves, game.difficulty);
    const starStr = "⭐".repeat(stars) + "☆".repeat(3 - stars);
    ctx.fillText(`${starStr}  得分: ${game.score}`, w / 2, h / 2 + 18);
    ctx.fillText(`${game.moves} 步 · ${formatTimerText(game.timer)}`, w / 2, h / 2 + 44);
  }

  ctx.restore();
}

function formatTimerText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function MemoryGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(null!);
  const animRef = useRef<AnimState>({
    particles: [], floaters: [], time: 0,
    hoverCardId: null, canvasW: 400, canvasH: 500,
  });
  const soundRef = useRef<SoundEngine>(null!);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scoreSubmittedRef = useRef(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timer, setTimer] = useState(0);
  const [won, setWon] = useState(false);
  const [hintsLeft, setHintsLeft] = useState(3);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("easy");
  const [theme, setTheme] = useState<"animals" | "space" | "food">("animals");
  const [, forceUpdate] = useState(0);

  useEffect(() => { soundRef.current = new SoundEngine(); }, []);

  // ── Init floating particles ──
  const initFloaters = useCallback((w: number, h: number) => {
    const floaters: FloatingParticle[] = [];
    for (let i = 0; i < 30; i++) {
      floaters.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15,
        size: 1 + Math.random() * 2, alpha: 0.2 + Math.random() * 0.3,
        hue: 270 + Math.random() * 40,
      });
    }
    animRef.current.floaters = floaters;
  }, []);

  // ── Spawn sparkle particles ──
  const spawnSparkles = useCallback((x: number, y: number, count: number, color: string) => {
    const anim = animRef.current;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 80 + Math.random() * 120;
      anim.particles.push({
        x, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1, maxLife: 1, color, size: 3 + Math.random() * 4,
        type: "sparkle",
      });
    }
  }, []);

  // ── Spawn confetti ──
  const spawnConfetti = useCallback((w: number, h: number) => {
    const anim = animRef.current;
    const colors = ["#a855f7", "#f0b90b", "#ef4444", "#22c55e", "#3b82f6", "#ec4899", "#f97316"];
    for (let i = 0; i < 80; i++) {
      anim.particles.push({
        x: w / 2 + (Math.random() - 0.5) * w * 0.6,
        y: h * 0.3 + (Math.random() - 0.5) * 100,
        vx: (Math.random() - 0.5) * 300,
        vy: -200 - Math.random() * 300,
        life: 1, maxLife: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 6 + Math.random() * 6,
        type: "confetti",
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 10,
      });
    }
  }, []);

  // ── Submit score ──
  const submitScore = useCallback(async (finalScore: number) => {
    if (scoreSubmittedRef.current || finalScore === 0) return;
    scoreSubmittedRef.current = true;
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: finalScore }),
      });
    } catch {}
  }, []);

  // ── Start timer ──
  const startTimer = useCallback(() => {
    if (timerIntervalRef.current) return;
    timerIntervalRef.current = setInterval(() => {
      const game = gameRef.current;
      if (!game || game.won) return;
      game.timer += 0.1;
      setTimer(game.timer);
    }, 100);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // ── Init game ──
  const initGame = useCallback((diff: "easy" | "medium" | "hard", th: "animals" | "space" | "food") => {
    stopTimer();
    const anim = animRef.current;
    const game = createGame(diff, th, anim.canvasW, anim.canvasH);
    gameRef.current = game;
    anim.particles = [];
    anim.hoverCardId = null;
    scoreSubmittedRef.current = false;
    setScore(0); setMoves(0); setCombo(0); setTimer(0);
    setWon(false); setHintsLeft(3);
    forceUpdate(n => n + 1);
  }, [stopTimer]);

  // ── Card click handler ──
  const handleCardClick = useCallback((cardId: number) => {
    const game = gameRef.current;
    if (!game || game.won || game.lockInput || game.hintActive) return;
    const card = game.cards.find(c => c.id === cardId);
    if (!card || card.flipped || card.matched) return;
    if (game.flippedIds.length >= 2) return;

    // Start timer on first flip
    if (!game.running) {
      game.running = true;
      startTimer();
    }

    card.flipped = true;
    card.flipTarget = 1;
    game.flippedIds.push(cardId);
    soundRef.current?.playFlip();

    if (game.flippedIds.length === 2) {
      game.moves++;
      setMoves(game.moves);
      game.lockInput = true;

      const c1 = game.cards.find(c => c.id === game.flippedIds[0])!;
      const c2 = game.cards.find(c => c.id === game.flippedIds[1])!;

      if (c1.symbol === c2.symbol) {
        // Match!
        setTimeout(() => {
          c1.matched = true;
          c2.matched = true;
          c1.matchGlow = 1;
          c2.matchGlow = 1;
          game.matchedCount++;
          game.combo++;
          if (game.combo > game.maxCombo) game.maxCombo = game.combo;

          soundRef.current?.playMatch();
          if (game.combo > 1) soundRef.current?.playCombo(game.combo);

          // Sparkle particles on matched cards
          const canvas = canvasRef.current;
          if (canvas) {
            const dpr = window.devicePixelRatio || 1;
            const cw = canvas.width / dpr;
            const ch = canvas.height / dpr;
            const cfg = DIFFICULTY_CONFIG[game.difficulty];
            const maxBW = Math.min(cw - 20, 460);
            const maxBH = ch - 20;
            const cellW = Math.min((maxBW - 24 - 8 * (cfg.cols - 1)) / cfg.cols, 80);
            const cellH = Math.min((maxBH - 24 - 8 * (cfg.rows - 1)) / cfg.rows, cellW * 1.2);
            const bw = 24 + cellW * cfg.cols + 8 * (cfg.cols - 1);
            const bh = 24 + cellH * cfg.rows + 8 * (cfg.rows - 1);
            const bx = (cw - bw) / 2;
            const by = (ch - bh) / 2;
            for (const c of [c1, c2]) {
              const px = bx + 12 + c.col * (cellW + 8) + cellW / 2;
              const py = by + 12 + c.row * (cellH + 8) + cellH / 2;
              spawnSparkles(px, py, 12, GOLD);
            }
          }

          // Update score
          const comboMultiplier = Math.min(game.combo, 5);
          const matchScore = 100 + (comboMultiplier - 1) * 50;
          game.score += matchScore;
          setScore(game.score);
          setCombo(game.combo);

          // Check win
          if (game.matchedCount === game.totalPairs) {
            game.won = true;
            game.score = calcScore(game.matchedCount, game.totalPairs, game.moves, game.timer, game.combo, game.maxCombo);
            setScore(game.score);
            setWon(true);
            stopTimer();
            soundRef.current?.playWin();
            submitScore(game.score);
            // Confetti
            const canvas2 = canvasRef.current;
            if (canvas2) {
              const dpr2 = window.devicePixelRatio || 1;
              spawnConfetti(canvas2.width / dpr2, canvas2.height / dpr2);
            }
          }

          game.flippedIds = [];
          game.lockInput = false;
        }, 400);
      } else {
        // Mismatch
        setTimeout(() => {
          c1.shakeTime = 0.4;
          c2.shakeTime = 0.4;
          soundRef.current?.playMismatch();
          game.combo = 0;
          setCombo(0);

          setTimeout(() => {
            c1.flipped = false;
            c1.flipTarget = 0;
            c2.flipped = false;
            c2.flipTarget = 0;
            game.flippedIds = [];
            game.lockInput = false;
          }, 500);
        }, 600);
      }
    }
  }, [startTimer, stopTimer, spawnSparkles, spawnConfetti, submitScore]);

  // ── Hint ──
  const handleHint = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.won || game.hintsLeft <= 0 || game.hintActive) return;
    game.hintsLeft--;
    game.hintActive = true;
    game.hintTimer = 1.5;
    setHintsLeft(game.hintsLeft);
    soundRef.current?.playHint();

    // Briefly flip all unmatched cards
    for (const c of game.cards) {
      if (!c.matched) {
        c.flipTarget = 1;
      }
    }

    setTimeout(() => {
      const g = gameRef.current;
      if (!g) return;
      for (const c of g.cards) {
        if (!c.matched && !g.flippedIds.includes(c.id)) {
          c.flipTarget = 0;
          c.flipped = false;
        }
      }
      g.hintActive = false;
    }, 1500);
  }, []);

  // ── Save / Load ──
  const handleSave = useCallback(() => {
    const game = gameRef.current;
    if (!game) return {};
    return {
      cards: game.cards.map(c => ({
        id: c.id, pairId: c.pairId, symbol: c.symbol,
        row: c.row, col: c.col, flipped: c.flipped, matched: c.matched,
      })),
      cols: game.cols, rows: game.rows, totalPairs: game.totalPairs,
      matchedCount: game.matchedCount, moves: game.moves, score: game.score,
      combo: game.combo, maxCombo: game.maxCombo, timer: game.timer,
      hintsLeft: game.hintsLeft, difficulty: game.difficulty, theme: game.theme,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as {
      cards: { id: number; pairId: number; symbol: string; row: number; col: number; flipped: boolean; matched: boolean }[];
      cols: number; rows: number; totalPairs: number;
      matchedCount: number; moves: number; score: number;
      combo: number; maxCombo: number; timer: number;
      hintsLeft: number; difficulty: "easy" | "medium" | "hard"; theme: "animals" | "space" | "food";
    };
    if (!d || !d.cards) return;
    stopTimer();
    const game = gameRef.current;
    if (!game) return;
    game.cards = d.cards.map(c => ({
      ...c,
      flipProgress: c.flipped || c.matched ? 1 : 0,
      flipTarget: c.flipped || c.matched ? 1 : 0,
      shakeTime: 0, glowTime: 0, matchGlow: c.matched ? 0.3 : 0,
      startX: 0, startY: 0, entranceProgress: 1,
    }));
    game.cols = d.cols; game.rows = d.rows; game.totalPairs = d.totalPairs;
    game.matchedCount = d.matchedCount; game.moves = d.moves; game.score = d.score;
    game.combo = d.combo; game.maxCombo = d.maxCombo; game.timer = d.timer;
    game.hintsLeft = d.hintsLeft; game.difficulty = d.difficulty; game.theme = d.theme;
    game.flippedIds = []; game.won = false; game.lockInput = false;
    game.running = true; game.entranceDone = true; game.hintActive = false;
    scoreSubmittedRef.current = false;
    setDifficulty(d.difficulty); setTheme(d.theme);
    setScore(d.score); setMoves(d.moves); setCombo(d.combo);
    setTimer(d.timer); setHintsLeft(d.hintsLeft); setWon(false);
    startTimer();
    forceUpdate(n => n + 1);
  }, [stopTimer, startTimer]);

  // ── Init on difficulty/theme change ──
  useEffect(() => {
    initGame(difficulty, theme);
  }, [difficulty, theme, initGame]);

  // ── Cleanup timer ──
  useEffect(() => {
    return () => { stopTimer(); };
  }, [stopTimer]);

  // ── Canvas setup + animation loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const cfg = DIFFICULTY_CONFIG[gameRef.current?.difficulty || "easy"];
      const maxBW = Math.min(w - 20, 460);
      const maxBH = 600;
      const cellW = Math.min((maxBW - 24 - 8 * (cfg.cols - 1)) / cfg.cols, 80);
      const cellH = Math.min((maxBH - 24 - 8 * (cfg.rows - 1)) / cfg.rows, cellW * 1.2);
      const boardH = 24 + cellH * cfg.rows + 8 * (cfg.rows - 1);
      const h = boardH + 40;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      animRef.current.canvasW = w;
      animRef.current.canvasH = h;
      initFloaters(w, h);
    };

    resize();
    window.addEventListener("resize", resize);

    const loop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dt = Math.min(timestamp - lastTimeRef.current, 50);
      lastTimeRef.current = timestamp;
      const dtSec = dt / 1000;
      const anim = animRef.current;
      anim.time += dtSec;
      const game = gameRef.current;

      if (game) {
        // Entrance animation
        if (!game.entranceDone) {
          let allDone = true;
          for (let i = 0; i < game.cards.length; i++) {
            const card = game.cards[i];
            const delay = i * 40; // stagger
            const elapsed = anim.time * 1000 - delay;
            if (elapsed > 0) {
              card.entranceProgress = clamp(elapsed / ENTRANCE_DURATION, 0, 1);
            }
            if (card.entranceProgress < 1) allDone = false;
          }
          if (allDone) {
            game.entranceDone = true;
            game.lockInput = false;
          }
        }

        // Flip animation
        for (const card of game.cards) {
          if (card.flipProgress < card.flipTarget) {
            card.flipProgress = Math.min(card.flipProgress + FLIP_SPEED * (dt / 16), card.flipTarget);
          } else if (card.flipProgress > card.flipTarget) {
            card.flipProgress = Math.max(card.flipProgress - FLIP_SPEED * (dt / 16), card.flipTarget);
          }
          // Shake decay
          if (card.shakeTime > 0) card.shakeTime = Math.max(0, card.shakeTime - dtSec);
          // Match glow decay
          if (card.matchGlow > 0.3 && card.matched) {
            card.matchGlow = Math.max(0.3, card.matchGlow - dtSec * 0.5);
          }
        }
      }

      // Update particles
      for (const p of anim.particles) {
        p.x += p.vx * dtSec;
        p.y += p.vy * dtSec;
        p.vy += 200 * dtSec; // gravity
        p.life -= dtSec * (p.type === "confetti" ? 0.6 : 1.2);
        if (p.rotation !== undefined && p.rotSpeed !== undefined) {
          p.rotation += p.rotSpeed * dtSec;
        }
      }
      anim.particles = anim.particles.filter(p => p.life > 0);

      // Update floating particles
      const cw = anim.canvasW;
      const ch = anim.canvasH;
      for (const fp of anim.floaters) {
        fp.x += fp.vx * dtSec;
        fp.y += fp.vy * dtSec;
        if (fp.x < 0) fp.x = cw;
        if (fp.x > cw) fp.x = 0;
        if (fp.y < 0) fp.y = ch;
        if (fp.y > ch) fp.y = 0;
      }

      // Render
      const dpr = window.devicePixelRatio || 1;
      if (game) {
        renderGame(ctx, canvas, game, anim, dpr);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [difficulty, theme, initFloaters]);

  // ── Mouse/Touch input on canvas ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getCardAtPos = (clientX: number, clientY: number): number | null => {
      const game = gameRef.current;
      if (!game) return null;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const cw = canvas.width / dpr;
      const ch = canvas.height / dpr;
      const cfg = DIFFICULTY_CONFIG[game.difficulty];
      const maxBW = Math.min(cw - 20, 460);
      const maxBH = ch - 20;
      const cellW = Math.min((maxBW - 24 - 8 * (cfg.cols - 1)) / cfg.cols, 80);
      const cellH = Math.min((maxBH - 24 - 8 * (cfg.rows - 1)) / cfg.rows, cellW * 1.2);
      const bw = 24 + cellW * cfg.cols + 8 * (cfg.cols - 1);
      const bh = 24 + cellH * cfg.rows + 8 * (cfg.rows - 1);
      const bx = (cw - bw) / 2;
      const by = (ch - bh) / 2;

      for (const card of game.cards) {
        const cx = bx + 12 + card.col * (cellW + 8);
        const cy = by + 12 + card.row * (cellH + 8);
        if (x >= cx && x <= cx + cellW && y >= cy && y <= cy + cellH) {
          return card.id;
        }
      }
      return null;
    };

    const onClick = (e: MouseEvent) => {
      const id = getCardAtPos(e.clientX, e.clientY);
      if (id !== null) handleCardClick(id);
    };

    const onMouseMove = (e: MouseEvent) => {
      animRef.current.hoverCardId = getCardAtPos(e.clientX, e.clientY);
    };

    const onMouseLeave = () => {
      animRef.current.hoverCardId = null;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        const id = getCardAtPos(touch.clientX, touch.clientY);
        if (id !== null) handleCardClick(id);
      }
    };

    canvas.addEventListener("click", onClick);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [handleCardClick, difficulty]);

  // ── Derived UI values ──
  const stars = won ? calcStars(moves, difficulty) : calcStars(moves || 999, difficulty);
  const timerStr = formatTimerText(timer);
  const lowStars = moves > 0 && stars <= 1 && !won;

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8">
        <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-white mb-3 inline-block transition">
          ← 返回游戏中心
        </Link>

        {/* Title + Stats */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold text-white">
            <span className="text-[#a855f7]">记忆翻牌</span>
          </h1>
          <div className="flex gap-2">
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">分数</div>
              <div className="font-bold text-[#a855f7] text-sm tabular-nums">{score.toLocaleString()}</div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">步数</div>
              <div className="font-bold text-[#ccc] text-sm tabular-nums">{moves}</div>
            </div>
            <div className={`text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333] ${lowStars ? "animate-pulse border-[#ef4444]/40" : ""}`}>
              <div className="text-[10px] text-[#8a8a8a]">时间</div>
              <div className={`font-bold text-sm tabular-nums ${lowStars ? "text-[#ef4444]" : "text-[#f0b90b]"}`}>{timerStr}</div>
            </div>
            {combo > 1 && (
              <div className="text-center px-3 py-1.5 rounded-lg bg-[#a855f7]/10 border border-[#a855f7]/30 animate-pulse">
                <div className="text-[10px] text-[#a855f7]">连击</div>
                <div className="font-bold text-[#a855f7] text-sm">x{combo}</div>
              </div>
            )}
          </div>
        </div>

        {/* Star rating */}
        <div className="flex items-center justify-center gap-1 mb-2">
          {[1, 2, 3].map(s => (
            <span key={s} className={`text-lg transition-all ${s <= stars ? "opacity-100 scale-100" : "opacity-30 scale-90"}`}>
              ⭐
            </span>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          {/* Difficulty */}
          <div className="flex gap-1">
            {(["easy", "medium", "hard"] as const).map(d => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`px-2.5 py-1 rounded-lg text-xs border transition ${
                  difficulty === d
                    ? "bg-[#a855f7] text-white border-[#a855f7] font-bold"
                    : "text-[#aaa] border-[#333] hover:text-white hover:border-[#555]"
                }`}
              >
                {DIFFICULTY_CONFIG[d].label}
              </button>
            ))}
          </div>

          {/* Theme */}
          <div className="flex gap-1">
            {(Object.keys(THEMES) as ("animals" | "space" | "food")[]).map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-2 py-1 rounded-lg text-xs border transition ${
                  theme === t
                    ? "bg-[#a855f7]/20 text-white border-[#a855f7]/50 font-bold"
                    : "text-[#aaa] border-[#333] hover:text-white hover:border-[#555]"
                }`}
              >
                {THEMES[t].icon}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            {/* Hint */}
            <button
              onClick={handleHint}
              disabled={hintsLeft <= 0 || won}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              💡 提示 ({hintsLeft})
            </button>

            {/* New game */}
            <button
              onClick={() => initGame(difficulty, theme)}
              className="px-3 py-1.5 rounded-lg text-xs bg-[#a855f7] text-white font-semibold hover:bg-[#9333ea] transition"
            >
              新游戏
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="w-full touch-none select-none">
          <canvas
            ref={canvasRef}
            className="w-full rounded-xl cursor-pointer"
            style={{ touchAction: "none" }}
          />
        </div>

        {won && (
          <div className="text-center mt-3">
            <button
              onClick={() => initGame(difficulty, theme)}
              className="px-6 py-2.5 rounded-xl bg-[#a855f7] text-white font-bold text-sm hover:bg-[#9333ea] transition shadow-lg shadow-[#a855f7]/25"
            >
              再来一局
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-[#666] mt-3">
          点击翻牌 · 连续配对获得连击加分 · 💡提示可短暂显示所有牌
        </p>

        {/* Leaderboard & Save/Load */}
        <div className="mt-4 space-y-3">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </>
  );
}
