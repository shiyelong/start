"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import {
  ArrowLeft, ArrowUp, ArrowDown, ArrowLeftIcon, ArrowRightIcon,
  RotateCcw, Play, Trophy, Clock, Infinity, Star, ChevronLeft,
  Volume2, VolumeX, Undo2, Calendar
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type GameMode = "classic" | "timed" | "endless";
type Difficulty = "easy" | "normal" | "hard";
type GameScreen = "title" | "playing" | "result";

interface Tile {
  value: number;
  row: number;
  col: number;
  prevRow: number;
  prevCol: number;
  mergedFrom: boolean;
  isNew: boolean;
  id: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface ScorePopup {
  x: number;
  y: number;
  value: number;
  life: number;
  combo: number;
}

interface GameState {
  tiles: Tile[];
  grid: (number | null)[][];
  score: number;
  best: number;
  over: boolean;
  won: boolean;
  boardSize: number;
  combo: number;
  undosLeft: number;
  history: HistoryEntry[];
  tileIdCounter: number;
  highestTile: number;
  moveCount: number;
  mergeCount: number;
  startTime: number;
  timeLeft: number; // for timed mode (ms)
  mode: GameMode;
  difficulty: Difficulty;
  dailySeed: number;
}

interface HistoryEntry {
  tiles: Tile[];
  grid: (number | null)[][];
  score: number;
  combo: number;
  highestTile: number;
}

interface AnimState {
  particles: Particle[];
  scorePopups: ScorePopup[];
  shakeTime: number;
  shakeIntensity: number;
  slideProgress: number;
  isSliding: boolean;
  spawnProgress: number;
  isSpawning: boolean;
  mergeProgress: number;
  isMerging: boolean;
  swipeStart: { x: number; y: number } | null;
  swipeCurrent: { x: number; y: number } | null;
  bgHue: number;
  targetBgHue: number;
  time: number;
}

interface LeaderboardEntry {
  score: number;
  mode: GameMode;
  difficulty: Difficulty;
  highestTile: number;
  moveCount: number;
  date: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "2048";
const ANIM_SLIDE_DURATION = 120;
const ANIM_MERGE_DURATION = 150;
const ANIM_SPAWN_DURATION = 200;
const TILE_RADIUS = 8;
const TIMED_DURATION = 180_000; // 3 minutes

const DIFFICULTY_CONFIG: Record<Difficulty, { size: number; label: string }> = {
  easy: { size: 5, label: "简单 5×5" },
  normal: { size: 4, label: "普通 4×4" },
  hard: { size: 3, label: "困难 3×3" },
};

const MODE_CONFIG: Record<GameMode, { label: string; desc: string }> = {
  classic: { label: "经典", desc: "达到2048即胜利" },
  timed: { label: "计时", desc: "3分钟内获得最高分" },
  endless: { label: "无尽", desc: "没有终点，挑战极限" },
};

const TILE_GRADIENTS: Record<number, [string, string]> = {
  2:    ["#e8ddd0", "#d6c8b5"],
  4:    ["#e8d5b5", "#d4bc96"],
  8:    ["#f5a862", "#e88a3a"],
  16:   ["#f58e4f", "#e06b2a"],
  32:   ["#f57262", "#d94a3a"],
  64:   ["#f54040", "#c92020"],
  128:  ["#f0d060", "#d4a820"],
  256:  ["#f0cc40", "#c89e10"],
  512:  ["#f0c830", "#b88800"],
  1024: ["#f0c020", "#a07000"],
  2048: ["#f0b800", "#886000"],
  4096: ["#ff6090", "#d03060"],
  8192: ["#ff4070", "#b02050"],
};

const TILE_TEXT_COLORS: Record<number, string> = { 2: "#776e65", 4: "#776e65" };

function getTileGradient(value: number): [string, string] {
  return TILE_GRADIENTS[value] || ["#3c3a32", "#2a2820"];
}
function getTileTextColor(value: number): string {
  return TILE_TEXT_COLORS[value] || "#ffffff";
}
function hueForHighest(value: number): number {
  if (value <= 4) return 220;
  if (value <= 16) return 200;
  if (value <= 64) return 180;
  if (value <= 256) return 160;
  if (value <= 1024) return 30;
  if (value <= 2048) return 45;
  return 320;
}

// ─── Seeded Random (for daily challenge) ─────────────────────────────────────
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getDailySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// ─── Sound Engine (Web Audio API) ────────────────────────────────────────────
class SoundEngine {
  private ctx: AudioContext | null = null;
  muted = false;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  playMove() {
    if (this.muted) return;
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.type = "sine";
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.06);
    } catch { /* ignore */ }
  }

  playMerge(value: number) {
    if (this.muted) return;
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      const baseFreq = 300 + Math.min(Math.log2(value) * 80, 800);
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.06);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, ctx.currentTime + 0.12);
      osc.type = "sine";
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
    } catch { /* ignore */ }
  }

  playGameOver() {
    if (this.muted) return;
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
      osc.type = "sawtooth";
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } catch { /* ignore */ }
  }

  playWin() {
    if (this.muted) return;
    try {
      const ctx = this.getCtx();
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
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
    } catch { /* ignore */ }
  }

  playCombo(level: number) {
    if (this.muted) return;
    try {
      const ctx = this.getCtx();
      const notes = [523, 659, 784, 1047];
      const freq = notes[Math.min(level - 1, notes.length - 1)];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.type = "triangle";
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
    } catch { /* ignore */ }
  }
}

// ─── IndexedDB Score Storage ─────────────────────────────────────────────────
function openScoreDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("game2048_scores", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("scores")) {
        const store = db.createObjectStore("scores", { keyPath: "id", autoIncrement: true });
        store.createIndex("mode", "mode", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveScoreToIDB(entry: LeaderboardEntry) {
  try {
    const db = await openScoreDB();
    const tx = db.transaction("scores", "readwrite");
    tx.objectStore("scores").add(entry);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(); });
  } catch { /* ignore */ }
}

// ─── Local Leaderboard (localStorage) ────────────────────────────────────────
function getLocalLeaderboard(mode: GameMode): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(`2048_lb_${mode}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocalLeaderboard(mode: GameMode, entries: LeaderboardEntry[]) {
  try {
    const sorted = entries.sort((a, b) => b.score - a.score).slice(0, 10);
    localStorage.setItem(`2048_lb_${mode}`, JSON.stringify(sorted));
  } catch { /* ignore */ }
}

function addToLocalLeaderboard(entry: LeaderboardEntry) {
  const lb = getLocalLeaderboard(entry.mode);
  lb.push(entry);
  saveLocalLeaderboard(entry.mode, lb);
  saveScoreToIDB(entry);
}

// ─── Game Logic ──────────────────────────────────────────────────────────────
function createEmptyGrid(size: number): (number | null)[][] {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function addRandomTile(state: GameState, rng?: () => number): Tile | null {
  const empty: [number, number][] = [];
  for (let r = 0; r < state.boardSize; r++)
    for (let c = 0; c < state.boardSize; c++)
      if (state.grid[r][c] === null) empty.push([r, c]);
  if (!empty.length) return null;
  const rand = rng || Math.random;
  const [row, col] = empty[Math.floor(rand() * empty.length)];
  const value = rand() < 0.9 ? 2 : 4;
  const id = state.tileIdCounter++;
  const tile: Tile = { value, row, col, prevRow: row, prevCol: col, mergedFrom: false, isNew: true, id };
  state.tiles.push(tile);
  state.grid[row][col] = id;
  return tile;
}

function canMove(state: GameState): boolean {
  const { boardSize, grid, tiles } = state;
  for (let r = 0; r < boardSize; r++)
    for (let c = 0; c < boardSize; c++) {
      if (grid[r][c] === null) return true;
      const tile = tiles.find(t => t.id === grid[r][c]);
      if (!tile) continue;
      if (c + 1 < boardSize) {
        const right = tiles.find(t => t.id === grid[r][c + 1]);
        if (right && right.value === tile.value) return true;
      }
      if (r + 1 < boardSize) {
        const below = tiles.find(t => t.id === grid[r + 1][c]);
        if (below && below.value === tile.value) return true;
      }
    }
  return false;
}

interface MoveResult {
  moved: boolean;
  scoreGained: number;
  merges: { row: number; col: number; value: number }[];
}

function performMove(state: GameState, direction: string): MoveResult {
  const { boardSize } = state;
  const result: MoveResult = { moved: false, scoreGained: 0, merges: [] };

  for (const t of state.tiles) {
    t.prevRow = t.row; t.prevCol = t.col;
    t.mergedFrom = false; t.isNew = false;
  }

  const getTraversals = () => {
    const rows = Array.from({ length: boardSize }, (_, i) => i);
    const cols = Array.from({ length: boardSize }, (_, i) => i);
    if (direction === "right") cols.reverse();
    if (direction === "down") rows.reverse();
    return { rows, cols };
  };

  const getVector = (): [number, number] => {
    switch (direction) {
      case "left": return [0, -1];
      case "right": return [0, 1];
      case "up": return [-1, 0];
      case "down": return [1, 0];
      default: return [0, 0];
    }
  };

  const [dr, dc] = getVector();
  const { rows, cols } = getTraversals();
  const merged = new Set<number>();

  for (const r of rows) {
    for (const c of cols) {
      const tileId = state.grid[r][c];
      if (tileId === null) continue;
      const tile = state.tiles.find(t => t.id === tileId);
      if (!tile) continue;

      let nr = r, nc = c;
      while (true) {
        const nnr = nr + dr, nnc = nc + dc;
        if (nnr < 0 || nnr >= boardSize || nnc < 0 || nnc >= boardSize) break;
        const targetId = state.grid[nnr][nnc];
        if (targetId === null) { nr = nnr; nc = nnc; }
        else {
          const target = state.tiles.find(t => t.id === targetId);
          if (target && target.value === tile.value && !merged.has(targetId)) {
            nr = nnr; nc = nnc;
            const newValue = tile.value * 2;
            result.scoreGained += newValue;
            result.merges.push({ row: nr, col: nc, value: newValue });
            state.tiles = state.tiles.filter(t => t.id !== targetId);
            tile.value = newValue;
            merged.add(tileId);
            tile.mergedFrom = true;
            if (newValue > state.highestTile) state.highestTile = newValue;
          }
          break;
        }
      }

      if (nr !== r || nc !== c) {
        result.moved = true;
        state.grid[r][c] = null;
        state.grid[nr][nc] = tileId;
        tile.row = nr; tile.col = nc;
      }
    }
  }
  return result;
}

function initGameState(
  boardSize: number, best: number, mode: GameMode, difficulty: Difficulty, dailySeed?: number
): GameState {
  const rng = dailySeed ? mulberry32(dailySeed) : undefined;
  const state: GameState = {
    tiles: [], grid: createEmptyGrid(boardSize),
    score: 0, best, over: false, won: false, boardSize,
    combo: 0, undosLeft: 3, history: [], tileIdCounter: 1, highestTile: 0,
    moveCount: 0, mergeCount: 0, startTime: Date.now(),
    timeLeft: mode === "timed" ? TIMED_DURATION : 0,
    mode, difficulty, dailySeed: dailySeed || 0,
  };
  addRandomTile(state, rng);
  addRandomTile(state, rng);
  state.highestTile = Math.max(...state.tiles.map(t => t.value));
  return state;
}

// ─── Canvas Renderer ─────────────────────────────────────────────────────────
function drawRoundedRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number
) {
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

function easeOutQuad(t: number): number { return t * (2 - t); }
function easeOutBack(t: number): number {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function easeOutElastic(t: number): number {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
}
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function renderGame(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
  gameState: GameState, animState: AnimState, dpr: number
) {
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.save();
  ctx.scale(dpr, dpr);

  if (animState.shakeTime > 0) {
    const intensity = animState.shakeIntensity * (animState.shakeTime / 500);
    ctx.translate((Math.random() - 0.5) * intensity, (Math.random() - 0.5) * intensity);
  }

  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  const hue = animState.bgHue;
  bgGrad.addColorStop(0, `hsl(${hue}, 8%, 7%)`);
  bgGrad.addColorStop(1, `hsl(${hue}, 12%, 5%)`);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  const { boardSize } = gameState;
  const boardPadding = 12;
  const maxBoardWidth = Math.min(w - 24, 420);
  const boardWidth = maxBoardWidth;
  const cellGap = boardSize <= 3 ? 10 : boardSize <= 4 ? 8 : 6;
  const cellSize = (boardWidth - boardPadding * 2 - cellGap * (boardSize - 1)) / boardSize;
  const boardHeight = boardPadding * 2 + cellSize * boardSize + cellGap * (boardSize - 1);
  const boardX = (w - boardWidth) / 2;
  const boardY = 12;

  // Board background
  drawRoundedRect(ctx, boardX, boardY, boardWidth, boardHeight, 12);
  ctx.fillStyle = "#1a1a1a";
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Empty cells
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      const cx = boardX + boardPadding + c * (cellSize + cellGap);
      const cy = boardY + boardPadding + r * (cellSize + cellGap);
      drawRoundedRect(ctx, cx, cy, cellSize, cellSize, TILE_RADIUS);
      ctx.fillStyle = "#2a2a2a";
      ctx.fill();
    }
  }

  const cellPos = (row: number, col: number) => ({
    x: boardX + boardPadding + col * (cellSize + cellGap),
    y: boardY + boardPadding + row * (cellSize + cellGap),
  });

  const slideT = animState.isSliding
    ? easeOutQuad(Math.min(animState.slideProgress / ANIM_SLIDE_DURATION, 1)) : 1;
  const mergeT = animState.isMerging
    ? Math.min(animState.mergeProgress / ANIM_MERGE_DURATION, 1) : 1;
  const spawnT = animState.isSpawning
    ? easeOutBack(Math.min(animState.spawnProgress / ANIM_SPAWN_DURATION, 1)) : 1;

  const sortedTiles = [...gameState.tiles].sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? 1 : -1;
    if (a.mergedFrom !== b.mergedFrom) return a.mergedFrom ? 1 : -1;
    return 0;
  });

  for (const tile of sortedTiles) {
    const prev = cellPos(tile.prevRow, tile.prevCol);
    const curr = cellPos(tile.row, tile.col);
    let tx: number, ty: number;
    if (tile.isNew) { tx = curr.x; ty = curr.y; }
    else { tx = lerp(prev.x, curr.x, slideT); ty = lerp(prev.y, curr.y, slideT); }

    ctx.save();
    let scale = 1;
    if (tile.isNew && animState.isSpawning) scale = spawnT;
    if (tile.mergedFrom && animState.isMerging) {
      const popT = easeOutElastic(mergeT);
      scale = 1 + 0.15 * (1 - Math.abs(popT * 2 - 1));
    }

    const centerX = tx + cellSize / 2;
    const centerY = ty + cellSize / 2;
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);

    if (tile.value >= 128) {
      const glowIntensity = Math.min((Math.log2(tile.value) - 6) * 4, 25);
      const pulse = 1 + Math.sin(animState.time * 3) * 0.15;
      ctx.shadowColor = getTileGradient(tile.value)[0];
      ctx.shadowBlur = glowIntensity * pulse;
    }

    const [c1, c2] = getTileGradient(tile.value);
    const grad = ctx.createLinearGradient(tx, ty, tx, ty + cellSize);
    grad.addColorStop(0, c1); grad.addColorStop(1, c2);
    drawRoundedRect(ctx, tx, ty, cellSize, cellSize, TILE_RADIUS);
    ctx.fillStyle = grad;
    ctx.fill();

    if (tile.value >= 512) {
      const pulseAlpha = 0.3 + Math.sin(animState.time * 4) * 0.2;
      ctx.strokeStyle = `rgba(255, 255, 255, ${pulseAlpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;

    const text = String(tile.value);
    const fontSize = cellSize * (text.length <= 2 ? 0.42 : text.length <= 3 ? 0.34 : 0.26);
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = getTileTextColor(tile.value);
    ctx.fillText(text, tx + cellSize / 2, ty + cellSize / 2 + 1);
    ctx.restore();
  }

  // Particles
  for (const p of animState.particles) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Score popups
  for (const sp of animState.scorePopups) {
    const alpha = sp.life;
    const yOff = (1 - sp.life) * 40;
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${sp.combo > 1 ? 18 : 14}px -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = sp.combo > 1 ? "#ff6090" : "#3ea6ff";
    const label = sp.combo > 1 ? `+${sp.value} x${sp.combo}` : `+${sp.value}`;
    ctx.fillText(label, sp.x, sp.y - yOff);
  }
  ctx.globalAlpha = 1;

  // Swipe visual
  if (animState.swipeStart && animState.swipeCurrent) {
    const dx = animState.swipeCurrent.x - animState.swipeStart.x;
    const dy = animState.swipeCurrent.y - animState.swipeStart.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 15) {
      ctx.globalAlpha = Math.min(dist / 100, 0.4);
      ctx.strokeStyle = "#3ea6ff"; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(animState.swipeStart.x, animState.swipeStart.y);
      ctx.lineTo(animState.swipeCurrent.x, animState.swipeCurrent.y);
      ctx.stroke();
      const angle = Math.atan2(dy, dx);
      const headLen = 12;
      ctx.beginPath();
      ctx.moveTo(animState.swipeCurrent.x, animState.swipeCurrent.y);
      ctx.lineTo(animState.swipeCurrent.x - headLen * Math.cos(angle - 0.4), animState.swipeCurrent.y - headLen * Math.sin(angle - 0.4));
      ctx.moveTo(animState.swipeCurrent.x, animState.swipeCurrent.y);
      ctx.lineTo(animState.swipeCurrent.x - headLen * Math.cos(angle + 0.4), animState.swipeCurrent.y - headLen * Math.sin(angle + 0.4));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Game over overlay on canvas
  if (gameState.over && !gameState.won) {
    ctx.fillStyle = "rgba(15, 15, 15, 0.7)";
    ctx.fillRect(boardX, boardY, boardWidth, boardHeight);
    ctx.font = `bold 28px -apple-system, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#ff4444";
    ctx.fillText("游戏结束", boardX + boardWidth / 2, boardY + boardHeight / 2 - 14);
    ctx.font = `16px -apple-system, sans-serif`;
    ctx.fillStyle = "#aaa";
    ctx.fillText(`得分: ${gameState.score}`, boardX + boardWidth / 2, boardY + boardHeight / 2 + 18);
  }

  if (gameState.won && gameState.mode === "classic") {
    ctx.fillStyle = "rgba(15, 15, 15, 0.6)";
    ctx.fillRect(boardX, boardY, boardWidth, boardHeight);
    ctx.font = `bold 28px -apple-system, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#f0b800";
    ctx.fillText("2048!", boardX + boardWidth / 2, boardY + boardHeight / 2 - 14);
    ctx.font = `16px -apple-system, sans-serif`;
    ctx.fillStyle = "#aaa";
    ctx.fillText(`得分: ${gameState.score}`, boardX + boardWidth / 2, boardY + boardHeight / 2 + 18);
  }

  ctx.restore();
}

// ─── Title Screen Component ──────────────────────────────────────────────────
function TitleScreen({ onStart }: {
  onStart: (mode: GameMode, difficulty: Difficulty, daily: boolean) => void;
}) {
  const [mode, setMode] = useState<GameMode>("classic");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-in fade-in duration-500">
      {/* Game Title */}
      <div className="text-center">
        <h2 className="text-5xl font-black text-[#3ea6ff] mb-2 tracking-tight">2048</h2>
        <p className="text-sm text-[#8a8a8a]">升级版 · 多模式挑战</p>
      </div>

      {/* Mode Selection */}
      <div className="w-full max-w-xs">
        <p className="text-xs text-[#8a8a8a] mb-2 text-center">选择模式</p>
        <div className="flex gap-2">
          {(Object.keys(MODE_CONFIG) as GameMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2.5 rounded-xl text-xs border transition flex flex-col items-center gap-1 ${
                mode === m
                  ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-bold"
                  : "text-[#aaa] border-[#333] hover:text-white hover:border-[#555]"
              }`}
            >
              {m === "classic" && <Star className="w-4 h-4" />}
              {m === "timed" && <Clock className="w-4 h-4" />}
              {m === "endless" && <Infinity className="w-4 h-4" />}
              <span>{MODE_CONFIG[m].label}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-[#666] text-center mt-1">{MODE_CONFIG[mode].desc}</p>
      </div>

      {/* Difficulty Selection */}
      <div className="w-full max-w-xs">
        <p className="text-xs text-[#8a8a8a] mb-2 text-center">选择难度</p>
        <div className="flex gap-2">
          {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map(d => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`flex-1 py-2.5 rounded-xl text-xs border transition ${
                difficulty === d
                  ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-bold"
                  : "text-[#aaa] border-[#333] hover:text-white hover:border-[#555]"
              }`}
            >
              {DIFFICULTY_CONFIG[d].label}
            </button>
          ))}
        </div>
      </div>

      {/* Start Buttons */}
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <button
          onClick={() => onStart(mode, difficulty, false)}
          className="w-full py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition shadow-lg shadow-[#3ea6ff]/25 flex items-center justify-center gap-2"
        >
          <Play className="w-4 h-4" />
          开始游戏
        </button>
        <button
          onClick={() => onStart(mode, difficulty, true)}
          className="w-full py-2.5 rounded-xl border border-[#f0b90b]/40 text-[#f0b90b] text-xs hover:bg-[#f0b90b]/10 transition flex items-center justify-center gap-2"
        >
          <Calendar className="w-3.5 h-3.5" />
          每日挑战
        </button>
      </div>

      {/* Controls hint */}
      <p className="text-[10px] text-[#555] text-center">
        方向键 / 滑动操作 · 合并相同数字
      </p>
    </div>
  );
}

// ─── Result Screen Component ─────────────────────────────────────────────────
function ResultScreen({ game, onRestart, onTitle }: {
  game: GameState;
  onRestart: () => void;
  onTitle: () => void;
}) {
  const elapsed = Math.floor((Date.now() - game.startTime) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 animate-in fade-in duration-500">
      <div className="text-center">
        {game.won ? (
          <>
            <Trophy className="w-12 h-12 text-[#f0b800] mx-auto mb-2" />
            <h2 className="text-3xl font-black text-[#f0b800]">胜利!</h2>
          </>
        ) : (
          <>
            <h2 className="text-3xl font-black text-[#ff4444]">游戏结束</h2>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
        <div className="text-center p-3 rounded-xl bg-[#1a1a1a] border border-[#333]">
          <div className="text-[10px] text-[#8a8a8a]">最终得分</div>
          <div className="font-bold text-[#3ea6ff] text-lg tabular-nums">{game.score.toLocaleString()}</div>
        </div>
        <div className="text-center p-3 rounded-xl bg-[#1a1a1a] border border-[#333]">
          <div className="text-[10px] text-[#8a8a8a]">最高方块</div>
          <div className="font-bold text-[#f0b90b] text-lg tabular-nums">{game.highestTile}</div>
        </div>
        <div className="text-center p-3 rounded-xl bg-[#1a1a1a] border border-[#333]">
          <div className="text-[10px] text-[#8a8a8a]">移动次数</div>
          <div className="font-bold text-white text-lg tabular-nums">{game.moveCount}</div>
        </div>
        <div className="text-center p-3 rounded-xl bg-[#1a1a1a] border border-[#333]">
          <div className="text-[10px] text-[#8a8a8a]">用时</div>
          <div className="font-bold text-white text-lg tabular-nums">{mins}:{secs.toString().padStart(2, "0")}</div>
        </div>
      </div>

      <div className="text-[10px] text-[#666]">
        {MODE_CONFIG[game.mode].label} · {DIFFICULTY_CONFIG[game.difficulty].label}
        {game.dailySeed ? " · 每日挑战" : ""}
      </div>

      <div className="flex gap-2 w-full max-w-xs">
        <button
          onClick={onRestart}
          className="flex-1 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          再来一局
        </button>
        <button
          onClick={onTitle}
          className="flex-1 py-2.5 rounded-xl border border-[#333] text-[#aaa] text-sm hover:text-white hover:border-[#555] transition flex items-center justify-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          返回
        </button>
      </div>
    </div>
  );
}

// ─── Local Leaderboard Component ─────────────────────────────────────────────
function LocalLeaderboardPanel() {
  const [mode, setMode] = useState<GameMode>("classic");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    setEntries(getLocalLeaderboard(mode));
  }, [mode]);

  return (
    <div className="rounded-xl bg-[#1a1a1a] border border-[#333] p-4">
      <h3 className="text-sm font-bold mb-3 text-[#3ea6ff] flex items-center gap-1.5">
        <Trophy className="w-4 h-4" />
        本地排行榜
      </h3>
      <div className="flex gap-1.5 mb-3">
        {(Object.keys(MODE_CONFIG) as GameMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1 rounded-full text-xs border transition ${
              mode === m
                ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-bold"
                : "text-[#aaa] border-[#333] hover:text-white"
            }`}
          >
            {MODE_CONFIG[m].label}
          </button>
        ))}
      </div>
      {entries.length === 0 ? (
        <div className="text-center py-4 text-[#666] text-xs">暂无记录</div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#212121] transition text-xs">
              <span className="w-6 text-center font-bold text-sm shrink-0 text-[#8a8a8a]">{i + 1}</span>
              <span className="flex-1 text-[#ccc] truncate">
                {DIFFICULTY_CONFIG[e.difficulty].label} · {e.highestTile}
              </span>
              <span className="text-[#f0b90b] font-bold tabular-nums">{e.score.toLocaleString()}</span>
              <span className="text-[#666] text-[10px] w-14 text-right shrink-0">{e.date}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function Game2048() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(null!);
  const animRef = useRef<AnimState>({
    particles: [], scorePopups: [],
    shakeTime: 0, shakeIntensity: 0,
    slideProgress: 0, isSliding: false,
    spawnProgress: 0, isSpawning: false,
    mergeProgress: 0, isMerging: false,
    swipeStart: null, swipeCurrent: null,
    bgHue: 220, targetBgHue: 220, time: 0,
  });
  const soundRef = useRef<SoundEngine>(null!);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const inputLockedRef = useRef(false);
  const scoreSubmittedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [screen, setScreen] = useState<GameScreen>("title");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [combo, setCombo] = useState(0);
  const [undosLeft, setUndosLeft] = useState(3);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [currentMode, setCurrentMode] = useState<GameMode>("classic");
  const [currentDifficulty, setCurrentDifficulty] = useState<Difficulty>("normal");
  const [timeLeft, setTimeLeft] = useState(TIMED_DURATION);
  const [muted, setMuted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [, forceUpdate] = useState(0);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768 || "ontouchstart" in window);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Initialize sound engine
  useEffect(() => {
    soundRef.current = new SoundEngine();
  }, []);

  const saveBest = useCallback((val: number, mode: GameMode, diff: Difficulty) => {
    try { localStorage.setItem(`2048_best_${mode}_${diff}`, String(val)); } catch { /* ignore */ }
  }, []);

  const loadBest = useCallback((mode: GameMode, diff: Difficulty): number => {
    try {
      const s = localStorage.getItem(`2048_best_${mode}_${diff}`);
      return s ? parseInt(s, 10) : 0;
    } catch { return 0; }
  }, []);

  // Submit score to API
  const submitScore = useCallback(async (finalScore: number) => {
    if (scoreSubmittedRef.current || finalScore === 0) return;
    scoreSubmittedRef.current = true;
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: finalScore }),
      });
    } catch { /* ignore */ }
  }, []);

  const spawnParticles = useCallback((x: number, y: number, color: string, count: number) => {
    const anim = animRef.current;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 60 + Math.random() * 80;
      anim.particles.push({
        x, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1, maxLife: 1, color, size: 2 + Math.random() * 3,
      });
    }
  }, []);

  const endGame = useCallback((game: GameState, won: boolean) => {
    game.over = true;
    game.won = won;
    if (won) soundRef.current?.playWin();
    else soundRef.current?.playGameOver();

    if (!won) {
      animRef.current.shakeTime = 500;
      animRef.current.shakeIntensity = 8;
    }

    // Save to leaderboard
    const now = new Date();
    const dateStr = `${now.getMonth() + 1}/${now.getDate()}`;
    addToLocalLeaderboard({
      score: game.score, mode: game.mode, difficulty: game.difficulty,
      highestTile: game.highestTile, moveCount: game.moveCount, date: dateStr,
    });

    submitScore(game.score);
    setGameOver(true);
    setGameWon(won);

    // Clear timer
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    // Show result screen after a short delay
    setTimeout(() => setScreen("result"), 1200);
  }, [submitScore]);

  // Initialize game
  const initGame = useCallback((mode: GameMode, difficulty: Difficulty, daily: boolean) => {
    const boardSize = DIFFICULTY_CONFIG[difficulty].size;
    const bestVal = loadBest(mode, difficulty);
    const seed = daily ? getDailySeed() : undefined;
    gameRef.current = initGameState(boardSize, bestVal, mode, difficulty, seed);
    const anim = animRef.current;
    anim.particles = []; anim.scorePopups = [];
    anim.shakeTime = 0; anim.isSliding = false; anim.isMerging = false;
    anim.isSpawning = true; anim.spawnProgress = 0;
    anim.targetBgHue = hueForHighest(gameRef.current.highestTile);
    inputLockedRef.current = false;
    scoreSubmittedRef.current = false;

    setCurrentMode(mode);
    setCurrentDifficulty(difficulty);
    setScore(0);
    setBest(bestVal);
    setCombo(0);
    setUndosLeft(3);
    setGameOver(false);
    setGameWon(false);
    setTimeLeft(mode === "timed" ? TIMED_DURATION : 0);
    setScreen("playing");
    forceUpdate(n => n + 1);

    // Timer for timed mode
    if (timerRef.current) clearInterval(timerRef.current);
    if (mode === "timed") {
      timerRef.current = setInterval(() => {
        const game = gameRef.current;
        if (!game || game.over) return;
        game.timeLeft -= 100;
        setTimeLeft(game.timeLeft);
        if (game.timeLeft <= 0) {
          game.timeLeft = 0;
          endGame(game, false);
        }
      }, 100);
    }
  }, [loadBest, endGame]);

  // Handle move
  const handleMove = useCallback((direction: string) => {
    const game = gameRef.current;
    if (!game || game.over || game.won || inputLockedRef.current) return;

    const historyEntry: HistoryEntry = {
      tiles: game.tiles.map(t => ({ ...t })),
      grid: game.grid.map(r => [...r]),
      score: game.score, combo: game.combo, highestTile: game.highestTile,
    };

    const result = performMove(game, direction);
    if (!result.moved) return;

    game.moveCount++;
    game.history.push(historyEntry);
    if (game.history.length > 3) game.history.shift();

    soundRef.current?.playMove();

    if (result.merges.length > 0) {
      game.combo++;
      game.mergeCount += result.merges.length;
      const comboMultiplier = Math.min(game.combo, 5);
      const bonusScore = result.merges.length > 1
        ? Math.floor(result.scoreGained * 0.1 * comboMultiplier) : 0;
      game.score += result.scoreGained + bonusScore;

      if (game.combo > 1) soundRef.current?.playCombo(game.combo);

      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width / dpr;
        const boardWidth = Math.min(cw - 24, 420);
        const boardPadding = 12;
        const cellGap = game.boardSize <= 3 ? 10 : game.boardSize <= 4 ? 8 : 6;
        const cellSize = (boardWidth - boardPadding * 2 - cellGap * (game.boardSize - 1)) / game.boardSize;
        const boardX = (cw - boardWidth) / 2;
        const boardY = 12;

        for (const m of result.merges) {
          const px = boardX + boardPadding + m.col * (cellSize + cellGap) + cellSize / 2;
          const py = boardY + boardPadding + m.row * (cellSize + cellGap) + cellSize / 2;
          const color = getTileGradient(m.value)[0];
          spawnParticles(px, py, color, 8 + Math.min(Math.log2(m.value), 6) * 2);
          soundRef.current?.playMerge(m.value);
          animRef.current.scorePopups.push({
            x: px, y: py, value: m.value + (bonusScore > 0 ? bonusScore : 0),
            life: 1, combo: game.combo,
          });
        }
      }
    } else {
      game.combo = 0;
      game.score += result.scoreGained;
    }

    if (game.score > game.best) {
      game.best = game.score;
      saveBest(game.score, game.mode, game.difficulty);
    }

    const anim = animRef.current;
    anim.isSliding = true; anim.slideProgress = 0;
    anim.isMerging = result.merges.length > 0; anim.mergeProgress = 0;
    anim.targetBgHue = hueForHighest(game.highestTile);
    inputLockedRef.current = true;

    setTimeout(() => {
      const rng = game.dailySeed ? mulberry32(game.dailySeed + game.moveCount) : undefined;
      addRandomTile(game, rng);
      anim.isSpawning = true; anim.spawnProgress = 0;

      // Check win condition (classic mode only)
      if (game.mode === "classic" && game.highestTile >= 2048 && !game.won) {
        endGame(game, true);
      } else if (!canMove(game)) {
        // In endless mode, game over when no moves
        endGame(game, false);
      }

      setScore(game.score);
      setBest(game.best);
      setCombo(game.combo);
      inputLockedRef.current = false;
    }, ANIM_SLIDE_DURATION + 30);
  }, [spawnParticles, saveBest, endGame]);

  // Undo
  const handleUndo = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.over || game.history.length === 0 || game.undosLeft <= 0) return;
    if (inputLockedRef.current) return;
    const entry = game.history.pop()!;
    game.tiles = entry.tiles; game.grid = entry.grid;
    game.score = entry.score; game.combo = entry.combo;
    game.highestTile = entry.highestTile; game.undosLeft--;
    animRef.current.targetBgHue = hueForHighest(game.highestTile);
    setScore(game.score); setCombo(game.combo); setUndosLeft(game.undosLeft);
    forceUpdate(n => n + 1);
  }, []);

  // Save/Load
  const handleSave = useCallback(() => {
    const game = gameRef.current;
    if (!game) return {};
    return {
      tiles: game.tiles.map(t => ({ ...t })), grid: game.grid.map(r => [...r]),
      score: game.score, best: game.best, boardSize: game.boardSize,
      combo: game.combo, undosLeft: game.undosLeft, highestTile: game.highestTile,
      tileIdCounter: game.tileIdCounter, over: game.over, won: game.won,
      mode: game.mode, difficulty: game.difficulty, moveCount: game.moveCount,
      mergeCount: game.mergeCount, startTime: game.startTime,
      timeLeft: game.timeLeft, dailySeed: game.dailySeed,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as GameState & { won?: boolean };
    if (!d || !d.tiles) return;
    const game = gameRef.current;
    if (!game) return;
    Object.assign(game, {
      tiles: d.tiles, grid: d.grid, score: d.score, best: d.best,
      boardSize: d.boardSize, combo: d.combo, undosLeft: d.undosLeft,
      highestTile: d.highestTile, tileIdCounter: d.tileIdCounter,
      over: d.over, won: d.won || false, mode: d.mode || "classic",
      difficulty: d.difficulty || "normal", moveCount: d.moveCount || 0,
      mergeCount: d.mergeCount || 0, startTime: d.startTime || Date.now(),
      timeLeft: d.timeLeft || 0, dailySeed: d.dailySeed || 0,
    });
    game.history = [];
    animRef.current.targetBgHue = hueForHighest(d.highestTile);
    scoreSubmittedRef.current = false;
    setCurrentMode(game.mode);
    setCurrentDifficulty(game.difficulty);
    setScore(d.score); setBest(d.best); setCombo(d.combo);
    setUndosLeft(d.undosLeft); setGameOver(d.over); setGameWon(d.won || false);
    setTimeLeft(game.timeLeft);
    setScreen("playing");
    forceUpdate(n => n + 1);
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    setMuted(m => {
      const next = !m;
      if (soundRef.current) soundRef.current.muted = next;
      return next;
    });
  }, []);

  // ─── Animation Loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const bs = gameRef.current?.boardSize || 4;
      const maxBoardWidth = Math.min(w - 24, 420);
      const cellGap = bs <= 3 ? 10 : bs <= 4 ? 8 : 6;
      const cellSize = (maxBoardWidth - 24 - cellGap * (bs - 1)) / bs;
      const boardHeight = 24 + cellSize * bs + cellGap * (bs - 1);
      const h = boardHeight + 24;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };

    resize();
    window.addEventListener("resize", resize);

    const loop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dt = Math.min(timestamp - lastTimeRef.current, 50);
      lastTimeRef.current = timestamp;

      const anim = animRef.current;
      anim.time += dt / 1000;

      if (anim.isSliding) {
        anim.slideProgress += dt;
        if (anim.slideProgress >= ANIM_SLIDE_DURATION) anim.isSliding = false;
      }
      if (anim.isMerging) {
        anim.mergeProgress += dt;
        if (anim.mergeProgress >= ANIM_MERGE_DURATION) anim.isMerging = false;
      }
      if (anim.isSpawning) {
        anim.spawnProgress += dt;
        if (anim.spawnProgress >= ANIM_SPAWN_DURATION) anim.isSpawning = false;
      }
      if (anim.shakeTime > 0) anim.shakeTime = Math.max(0, anim.shakeTime - dt);
      anim.bgHue = lerp(anim.bgHue, anim.targetBgHue, 0.02);

      for (const p of anim.particles) {
        p.x += p.vx * (dt / 1000);
        p.y += p.vy * (dt / 1000);
        p.vy += 120 * (dt / 1000);
        p.life -= dt / 1000 * 1.5;
      }
      anim.particles = anim.particles.filter(p => p.life > 0);

      for (const sp of anim.scorePopups) sp.life -= dt / 1000 * 0.8;
      anim.scorePopups = anim.scorePopups.filter(sp => sp.life > 0);

      const dpr = window.devicePixelRatio || 1;
      if (gameRef.current) renderGame(ctx, canvas, gameRef.current, anim, dpr);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [screen]);

  // ─── Keyboard Input ────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "playing") return;
    const handler = (e: KeyboardEvent) => {
      const map: Record<string, string> = {
        ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
      };
      if (map[e.key]) { e.preventDefault(); handleMove(map[e.key]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleMove, screen]);

  // ─── Touch Input ───────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPos = (touch: Touch) => {
      const rect = canvas.getBoundingClientRect();
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const pos = getPos(e.touches[0]);
      animRef.current.swipeStart = pos;
      animRef.current.swipeCurrent = pos;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!animRef.current.swipeStart || e.touches.length !== 1) return;
      e.preventDefault();
      animRef.current.swipeCurrent = getPos(e.touches[0]);
    };
    const onTouchEnd = () => {
      const start = animRef.current.swipeStart;
      const current = animRef.current.swipeCurrent;
      animRef.current.swipeStart = null;
      animRef.current.swipeCurrent = null;
      if (!start || !current) return;
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
      if (Math.abs(dx) > Math.abs(dy)) handleMove(dx > 0 ? "right" : "left");
      else handleMove(dy > 0 ? "down" : "up");
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [handleMove, screen]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const formatTime = (ms: number) => {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8">
        <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-white mb-3 inline-block transition">
          <span className="flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> 返回游戏中心</span>
        </Link>

        {screen === "title" && (
          <TitleScreen onStart={(mode, diff, daily) => initGame(mode, diff, daily)} />
        )}

        {screen === "result" && gameRef.current && (
          <ResultScreen
            game={gameRef.current}
            onRestart={() => initGame(currentMode, currentDifficulty, !!gameRef.current?.dailySeed)}
            onTitle={() => setScreen("title")}
          />
        )}

        {screen === "playing" && (
          <>
            {/* Title + Scores */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  <span className="text-[#3ea6ff]">2048</span>
                </h1>
                <div className="flex items-center gap-1.5 text-[10px] text-[#666]">
                  <span>{MODE_CONFIG[currentMode].label}</span>
                  <span>·</span>
                  <span>{DIFFICULTY_CONFIG[currentDifficulty].label}</span>
                  {gameRef.current?.dailySeed ? (
                    <><span>·</span><Calendar className="w-3 h-3 text-[#f0b90b]" /></>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-2">
                <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
                  <div className="text-[10px] text-[#8a8a8a]">分数</div>
                  <div className="font-bold text-[#3ea6ff] text-sm tabular-nums">{score.toLocaleString()}</div>
                </div>
                <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
                  <div className="text-[10px] text-[#8a8a8a]">最高</div>
                  <div className="font-bold text-[#f0b90b] text-sm tabular-nums">{best.toLocaleString()}</div>
                </div>
                {currentMode === "timed" && (
                  <div className={`text-center px-3 py-1.5 rounded-lg border ${
                    timeLeft < 30000 ? "bg-[#ff4444]/10 border-[#ff4444]/30" : "bg-[#1a1a1a] border-[#333]"
                  }`}>
                    <div className="text-[10px] text-[#8a8a8a]">时间</div>
                    <div className={`font-bold text-sm tabular-nums ${timeLeft < 30000 ? "text-[#ff4444]" : "text-white"}`}>
                      {formatTime(timeLeft)}
                    </div>
                  </div>
                )}
                {combo > 1 && (
                  <div className="text-center px-3 py-1.5 rounded-lg bg-[#ff6090]/10 border border-[#ff6090]/30 animate-pulse">
                    <div className="text-[10px] text-[#ff6090]">连击</div>
                    <div className="font-bold text-[#ff6090] text-sm">x{combo}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Controls Row */}
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex gap-1.5">
                <button onClick={toggleMute} className="p-1.5 rounded-lg border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition">
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleUndo}
                  disabled={undosLeft <= 0 || gameOver || !gameRef.current?.history?.length}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  撤销 ({undosLeft})
                </button>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => initGame(currentMode, currentDifficulty, !!gameRef.current?.dailySeed)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-[#3ea6ff] text-[#0f0f0f] font-semibold hover:bg-[#65b8ff] transition flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  新游戏
                </button>
                <button
                  onClick={() => { if (timerRef.current) clearInterval(timerRef.current); setScreen("title"); }}
                  className="px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Canvas */}
            <div className="w-full touch-none select-none">
              <canvas ref={canvasRef} className="w-full rounded-xl" style={{ touchAction: "none" }} />
            </div>

            {/* Mobile Virtual Controls */}
            {isMobile && !gameOver && !gameWon && (
              <div className="mt-3 flex flex-col items-center gap-1.5">
                <button
                  onTouchStart={(e) => { e.preventDefault(); handleMove("up"); }}
                  className="w-14 h-10 rounded-lg bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-[#aaa] active:bg-[#3ea6ff] active:text-[#0f0f0f] transition"
                >
                  <ArrowUp className="w-5 h-5" />
                </button>
                <div className="flex gap-1.5">
                  <button
                    onTouchStart={(e) => { e.preventDefault(); handleMove("left"); }}
                    className="w-14 h-10 rounded-lg bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-[#aaa] active:bg-[#3ea6ff] active:text-[#0f0f0f] transition"
                  >
                    <ArrowLeftIcon className="w-5 h-5" />
                  </button>
                  <button
                    onTouchStart={(e) => { e.preventDefault(); handleMove("down"); }}
                    className="w-14 h-10 rounded-lg bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-[#aaa] active:bg-[#3ea6ff] active:text-[#0f0f0f] transition"
                  >
                    <ArrowDown className="w-5 h-5" />
                  </button>
                  <button
                    onTouchStart={(e) => { e.preventDefault(); handleMove("right"); }}
                    className="w-14 h-10 rounded-lg bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-[#aaa] active:bg-[#3ea6ff] active:text-[#0f0f0f] transition"
                  >
                    <ArrowRightIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {gameOver && !gameWon && (
              <div className="text-center mt-3">
                <button
                  onClick={() => initGame(currentMode, currentDifficulty, !!gameRef.current?.dailySeed)}
                  className="px-6 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition shadow-lg shadow-[#3ea6ff]/25"
                >
                  再来一局
                </button>
              </div>
            )}

            <p className="text-center text-[10px] text-[#666] mt-3">
              滑动或方向键操作 · 连续合并获得连击加分
            </p>
          </>
        )}

        {/* Leaderboard & Save/Load — always visible */}
        <div className="mt-4 space-y-3">
          <LocalLeaderboardPanel />
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </>
  );
}
