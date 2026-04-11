"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";

// ─── Types ───────────────────────────────────────────────────────────────────
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
  grid: (number | null)[][]; // tile ids
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

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "2048";
const ANIM_SLIDE_DURATION = 120; // ms
const ANIM_MERGE_DURATION = 150;
const ANIM_SPAWN_DURATION = 200;
const PADDING = 8;
const TILE_RADIUS = 8;

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

const TILE_TEXT_COLORS: Record<number, string> = {
  2: "#776e65",
  4: "#776e65",
};

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

// ─── Sound Engine (Web Audio API) ────────────────────────────────────────────
class SoundEngine {
  private ctx: AudioContext | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  playMerge(value: number) {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const baseFreq = 300 + Math.min(Math.log2(value) * 80, 800);
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.06);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, ctx.currentTime + 0.12);
      osc.type = "sine";
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch { /* ignore audio errors */ }
  }

  playGameOver() {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
      osc.type = "sawtooth";
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch { /* ignore */ }
  }

  playCombo(level: number) {
    try {
      const ctx = this.getCtx();
      const notes = [523, 659, 784, 1047];
      const freq = notes[Math.min(level - 1, notes.length - 1)];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.type = "triangle";
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch { /* ignore */ }
  }
}

// ─── Game Logic ──────────────────────────────────────────────────────────────
function createEmptyGrid(size: number): (number | null)[][] {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function addRandomTile(state: GameState): Tile | null {
  const empty: [number, number][] = [];
  for (let r = 0; r < state.boardSize; r++)
    for (let c = 0; c < state.boardSize; c++)
      if (state.grid[r][c] === null) empty.push([r, c]);
  if (!empty.length) return null;
  const [row, col] = empty[Math.floor(Math.random() * empty.length)];
  const value = Math.random() < 0.9 ? 2 : 4;
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

  // Save prev positions
  for (const t of state.tiles) {
    t.prevRow = t.row;
    t.prevCol = t.col;
    t.mergedFrom = false;
    t.isNew = false;
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

      // Find farthest position
      let nr = r, nc = c;
      while (true) {
        const nnr = nr + dr, nnc = nc + dc;
        if (nnr < 0 || nnr >= boardSize || nnc < 0 || nnc >= boardSize) break;
        const targetId = state.grid[nnr][nnc];
        if (targetId === null) {
          nr = nnr;
          nc = nnc;
        } else {
          const target = state.tiles.find(t => t.id === targetId);
          if (target && target.value === tile.value && !merged.has(targetId)) {
            // Merge
            nr = nnr;
            nc = nnc;
            const newValue = tile.value * 2;
            result.scoreGained += newValue;
            result.merges.push({ row: nr, col: nc, value: newValue });
            // Remove target tile
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
        tile.row = nr;
        tile.col = nc;
      }
    }
  }

  return result;
}

function initGameState(boardSize: number, best: number): GameState {
  const state: GameState = {
    tiles: [],
    grid: createEmptyGrid(boardSize),
    score: 0,
    best,
    over: false,
    won: false,
    boardSize,
    combo: 0,
    undosLeft: 3,
    history: [],
    tileIdCounter: 1,
    highestTile: 0,
  };
  addRandomTile(state);
  addRandomTile(state);
  state.highestTile = Math.max(...state.tiles.map(t => t.value));
  return state;
}

// ─── Canvas Renderer ─────────────────────────────────────────────────────────
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
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

function easeOutQuad(t: number): number {
  return t * (2 - t);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutElastic(t: number): number {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function renderGame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  gameState: GameState,
  animState: AnimState,
  dpr: number
) {
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.save();
  ctx.scale(dpr, dpr);

  // Screen shake
  if (animState.shakeTime > 0) {
    const intensity = animState.shakeIntensity * (animState.shakeTime / 500);
    ctx.translate(
      (Math.random() - 0.5) * intensity,
      (Math.random() - 0.5) * intensity
    );
  }

  // Clear with gradient background
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
  const cellGap = boardSize <= 4 ? 8 : boardSize <= 5 ? 6 : 5;
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

  // Helper to get cell position
  const cellPos = (row: number, col: number) => ({
    x: boardX + boardPadding + col * (cellSize + cellGap),
    y: boardY + boardPadding + row * (cellSize + cellGap),
  });

  // Draw tiles
  const slideT = animState.isSliding
    ? easeOutQuad(Math.min(animState.slideProgress / ANIM_SLIDE_DURATION, 1))
    : 1;
  const mergeT = animState.isMerging
    ? Math.min(animState.mergeProgress / ANIM_MERGE_DURATION, 1)
    : 1;
  const spawnT = animState.isSpawning
    ? easeOutBack(Math.min(animState.spawnProgress / ANIM_SPAWN_DURATION, 1))
    : 1;

  // Sort: new tiles on top, merged tiles on top
  const sortedTiles = [...gameState.tiles].sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? 1 : -1;
    if (a.mergedFrom !== b.mergedFrom) return a.mergedFrom ? 1 : -1;
    return 0;
  });

  for (const tile of sortedTiles) {
    const prev = cellPos(tile.prevRow, tile.prevCol);
    const curr = cellPos(tile.row, tile.col);

    let tx: number, ty: number;
    if (tile.isNew) {
      tx = curr.x;
      ty = curr.y;
    } else {
      tx = lerp(prev.x, curr.x, slideT);
      ty = lerp(prev.y, curr.y, slideT);
    }

    ctx.save();

    // Scale for new tiles
    let scale = 1;
    if (tile.isNew && animState.isSpawning) {
      scale = spawnT;
    }
    // Pop for merged tiles
    if (tile.mergedFrom && animState.isMerging) {
      const popT = easeOutElastic(mergeT);
      scale = 1 + 0.15 * (1 - Math.abs(popT * 2 - 1));
    }

    const centerX = tx + cellSize / 2;
    const centerY = ty + cellSize / 2;
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);

    // Glow for high tiles
    if (tile.value >= 128) {
      const glowIntensity = Math.min((Math.log2(tile.value) - 6) * 4, 25);
      const pulse = 1 + Math.sin(animState.time * 3) * 0.15;
      ctx.shadowColor = getTileGradient(tile.value)[0];
      ctx.shadowBlur = glowIntensity * pulse;
    }

    // Tile gradient
    const [c1, c2] = getTileGradient(tile.value);
    const grad = ctx.createLinearGradient(tx, ty, tx, ty + cellSize);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    drawRoundedRect(ctx, tx, ty, cellSize, cellSize, TILE_RADIUS);
    ctx.fillStyle = grad;
    ctx.fill();

    // Animated pulse border for 512+
    if (tile.value >= 512) {
      const pulseAlpha = 0.3 + Math.sin(animState.time * 4) * 0.2;
      ctx.strokeStyle = `rgba(255, 255, 255, ${pulseAlpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // Text
    const text = String(tile.value);
    const fontSize = cellSize * (text.length <= 2 ? 0.42 : text.length <= 3 ? 0.34 : 0.26);
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
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

  // Swipe visual feedback
  if (animState.swipeStart && animState.swipeCurrent) {
    const dx = animState.swipeCurrent.x - animState.swipeStart.x;
    const dy = animState.swipeCurrent.y - animState.swipeStart.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 15) {
      ctx.globalAlpha = Math.min(dist / 100, 0.4);
      ctx.strokeStyle = "#3ea6ff";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(animState.swipeStart.x, animState.swipeStart.y);
      ctx.lineTo(animState.swipeCurrent.x, animState.swipeCurrent.y);
      ctx.stroke();
      // Arrow head
      const angle = Math.atan2(dy, dx);
      const headLen = 12;
      ctx.beginPath();
      ctx.moveTo(animState.swipeCurrent.x, animState.swipeCurrent.y);
      ctx.lineTo(
        animState.swipeCurrent.x - headLen * Math.cos(angle - 0.4),
        animState.swipeCurrent.y - headLen * Math.sin(angle - 0.4)
      );
      ctx.moveTo(animState.swipeCurrent.x, animState.swipeCurrent.y);
      ctx.lineTo(
        animState.swipeCurrent.x - headLen * Math.cos(angle + 0.4),
        animState.swipeCurrent.y - headLen * Math.sin(angle + 0.4)
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Game over overlay
  if (gameState.over) {
    ctx.fillStyle = "rgba(15, 15, 15, 0.7)";
    ctx.fillRect(boardX, boardY, boardWidth, boardHeight);
    ctx.font = `bold 28px -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ff4444";
    ctx.fillText("游戏结束", boardX + boardWidth / 2, boardY + boardHeight / 2 - 14);
    ctx.font = `16px -apple-system, sans-serif`;
    ctx.fillStyle = "#aaa";
    ctx.fillText(`得分: ${gameState.score}`, boardX + boardWidth / 2, boardY + boardHeight / 2 + 18);
  }

  ctx.restore();
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function Game2048() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(null!);
  const animRef = useRef<AnimState>({
    particles: [],
    scorePopups: [],
    shakeTime: 0,
    shakeIntensity: 0,
    slideProgress: 0,
    isSliding: false,
    spawnProgress: 0,
    isSpawning: false,
    mergeProgress: 0,
    isMerging: false,
    swipeStart: null,
    swipeCurrent: null,
    bgHue: 220,
    targetBgHue: 220,
    time: 0,
  });
  const soundRef = useRef<SoundEngine>(null!);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const inputLockedRef = useRef(false);
  const scoreSubmittedRef = useRef(false);

  // React state for UI outside canvas
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [combo, setCombo] = useState(0);
  const [undosLeft, setUndosLeft] = useState(3);
  const [gameOver, setGameOver] = useState(false);
  const [boardSize, setBoardSize] = useState(4);
  const [, forceUpdate] = useState(0);

  // Initialize sound engine
  useEffect(() => {
    soundRef.current = new SoundEngine();
  }, []);

  // Load best score from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`2048_best_${boardSize}`);
      if (saved) {
        const val = parseInt(saved, 10);
        setBest(val);
        if (gameRef.current) gameRef.current.best = val;
      }
    } catch { /* ignore */ }
  }, [boardSize]);

  const saveBest = useCallback((val: number) => {
    try { localStorage.setItem(`2048_best_${boardSize}`, String(val)); } catch { /* ignore */ }
  }, [boardSize]);

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

  // Spawn particles at a position
  const spawnParticles = useCallback((x: number, y: number, color: string, count: number) => {
    const anim = animRef.current;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 60 + Math.random() * 80;
      anim.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }, []);

  // Initialize game
  const initGame = useCallback((size: number) => {
    const bestVal = (() => {
      try {
        const s = localStorage.getItem(`2048_best_${size}`);
        return s ? parseInt(s, 10) : 0;
      } catch { return 0; }
    })();
    gameRef.current = initGameState(size, bestVal);
    const anim = animRef.current;
    anim.particles = [];
    anim.scorePopups = [];
    anim.shakeTime = 0;
    anim.isSliding = false;
    anim.isMerging = false;
    anim.isSpawning = true;
    anim.spawnProgress = 0;
    anim.targetBgHue = hueForHighest(gameRef.current.highestTile);
    inputLockedRef.current = false;
    scoreSubmittedRef.current = false;
    setScore(0);
    setBest(bestVal);
    setCombo(0);
    setUndosLeft(3);
    setGameOver(false);
    forceUpdate(n => n + 1);
  }, []);

  // Handle move
  const handleMove = useCallback((direction: string) => {
    const game = gameRef.current;
    if (!game || game.over || inputLockedRef.current) return;

    // Save history for undo
    const historyEntry: HistoryEntry = {
      tiles: game.tiles.map(t => ({ ...t })),
      grid: game.grid.map(r => [...r]),
      score: game.score,
      combo: game.combo,
      highestTile: game.highestTile,
    };

    const result = performMove(game, direction);
    if (!result.moved) return;

    // Push history
    game.history.push(historyEntry);
    if (game.history.length > 3) game.history.shift();

    // Combo system
    if (result.merges.length > 0) {
      game.combo++;
      const comboMultiplier = Math.min(game.combo, 5);
      const bonusScore = result.merges.length > 1
        ? Math.floor(result.scoreGained * 0.1 * comboMultiplier)
        : 0;
      game.score += result.scoreGained + bonusScore;

      if (game.combo > 1) {
        soundRef.current?.playCombo(game.combo);
      }

      // Particles and popups for merges
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width / dpr;
        const boardWidth = Math.min(cw - 24, 420);
        const boardPadding = 12;
        const cellGap = game.boardSize <= 4 ? 8 : game.boardSize <= 5 ? 6 : 5;
        const cellSize = (boardWidth - boardPadding * 2 - cellGap * (game.boardSize - 1)) / game.boardSize;
        const boardX = (cw - boardWidth) / 2;
        const boardY = 12;

        for (const m of result.merges) {
          const px = boardX + boardPadding + m.col * (cellSize + cellGap) + cellSize / 2;
          const py = boardY + boardPadding + m.row * (cellSize + cellGap) + cellSize / 2;
          const color = getTileGradient(m.value)[0];
          spawnParticles(px, py, color, 8 + Math.min(Math.log2(m.value), 6) * 2);
          soundRef.current?.playMerge(m.value);

          // Score popup
          const popupValue = m.value + (bonusScore > 0 ? bonusScore : 0);
          animRef.current.scorePopups.push({
            x: px, y: py, value: popupValue, life: 1, combo: game.combo,
          });
        }
      }
    } else {
      game.combo = 0;
      game.score += result.scoreGained;
    }

    // Update best
    if (game.score > game.best) {
      game.best = game.score;
      saveBest(game.score);
    }

    // Start slide animation
    const anim = animRef.current;
    anim.isSliding = true;
    anim.slideProgress = 0;
    anim.isMerging = result.merges.length > 0;
    anim.mergeProgress = 0;
    anim.targetBgHue = hueForHighest(game.highestTile);
    inputLockedRef.current = true;

    // After slide, spawn new tile
    setTimeout(() => {
      addRandomTile(game);
      anim.isSpawning = true;
      anim.spawnProgress = 0;

      if (!canMove(game)) {
        game.over = true;
        soundRef.current?.playGameOver();
        anim.shakeTime = 500;
        anim.shakeIntensity = 8;
        submitScore(game.score);
        setGameOver(true);
      }

      setScore(game.score);
      setBest(game.best);
      setCombo(game.combo);
      inputLockedRef.current = false;
    }, ANIM_SLIDE_DURATION + 30);
  }, [spawnParticles, saveBest, submitScore]);

  // Undo
  const handleUndo = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.over || game.history.length === 0 || game.undosLeft <= 0) return;
    if (inputLockedRef.current) return;
    const entry = game.history.pop()!;
    game.tiles = entry.tiles;
    game.grid = entry.grid;
    game.score = entry.score;
    game.combo = entry.combo;
    game.highestTile = entry.highestTile;
    game.undosLeft--;
    animRef.current.targetBgHue = hueForHighest(game.highestTile);
    setScore(game.score);
    setCombo(game.combo);
    setUndosLeft(game.undosLeft);
    forceUpdate(n => n + 1);
  }, []);

  // Save/Load for GameSaveLoad component
  const handleSave = useCallback(() => {
    const game = gameRef.current;
    if (!game) return {};
    return {
      tiles: game.tiles.map(t => ({ ...t })),
      grid: game.grid.map(r => [...r]),
      score: game.score,
      best: game.best,
      boardSize: game.boardSize,
      combo: game.combo,
      undosLeft: game.undosLeft,
      highestTile: game.highestTile,
      tileIdCounter: game.tileIdCounter,
      over: game.over,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as {
      tiles: Tile[]; grid: (number | null)[][]; score: number; best: number;
      boardSize: number; combo: number; undosLeft: number; highestTile: number;
      tileIdCounter: number; over: boolean;
    };
    if (!d || !d.tiles) return;
    const game = gameRef.current;
    if (!game) return;
    game.tiles = d.tiles;
    game.grid = d.grid;
    game.score = d.score;
    game.best = d.best;
    game.boardSize = d.boardSize;
    game.combo = d.combo;
    game.undosLeft = d.undosLeft;
    game.highestTile = d.highestTile;
    game.tileIdCounter = d.tileIdCounter;
    game.over = d.over;
    game.history = [];
    animRef.current.targetBgHue = hueForHighest(d.highestTile);
    scoreSubmittedRef.current = false;
    setBoardSize(d.boardSize);
    setScore(d.score);
    setBest(d.best);
    setCombo(d.combo);
    setUndosLeft(d.undosLeft);
    setGameOver(d.over);
    forceUpdate(n => n + 1);
  }, []);

  // ─── Animation Loop ──────────────────────────────────────────────────────
  useEffect(() => {
    initGame(boardSize);
  }, [boardSize, initGame]);

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
      const maxBoardWidth = Math.min(w - 24, 420);
      const cellGap = (gameRef.current?.boardSize || 4) <= 4 ? 8 : (gameRef.current?.boardSize || 4) <= 5 ? 6 : 5;
      const bs = gameRef.current?.boardSize || 4;
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

      // Update animations
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
      if (anim.shakeTime > 0) {
        anim.shakeTime = Math.max(0, anim.shakeTime - dt);
      }

      // Smooth bg hue transition
      anim.bgHue = lerp(anim.bgHue, anim.targetBgHue, 0.02);

      // Update particles
      for (const p of anim.particles) {
        p.x += p.vx * (dt / 1000);
        p.y += p.vy * (dt / 1000);
        p.vy += 120 * (dt / 1000); // gravity
        p.life -= dt / 1000 * 1.5;
      }
      anim.particles = anim.particles.filter(p => p.life > 0);

      // Update score popups
      for (const sp of anim.scorePopups) {
        sp.life -= dt / 1000 * 0.8;
      }
      anim.scorePopups = anim.scorePopups.filter(sp => sp.life > 0);

      // Render
      const dpr = window.devicePixelRatio || 1;
      if (gameRef.current) {
        renderGame(ctx, canvas, gameRef.current, anim, dpr);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [boardSize]);

  // ─── Keyboard Input ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const map: Record<string, string> = {
        ArrowLeft: "left", ArrowRight: "right",
        ArrowUp: "up", ArrowDown: "down",
      };
      if (map[e.key]) {
        e.preventDefault();
        handleMove(map[e.key]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleMove]);

  // ─── Touch Input ───────────────────────────────────────────────────────
  useEffect(() => {
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

    const onTouchEnd = (e: TouchEvent) => {
      const start = animRef.current.swipeStart;
      const current = animRef.current.swipeCurrent;
      animRef.current.swipeStart = null;
      animRef.current.swipeCurrent = null;
      if (!start || !current) return;
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        handleMove(dx > 0 ? "right" : "left");
      } else {
        handleMove(dy > 0 ? "down" : "up");
      }
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [handleMove]);

  // Board size change
  const changeBoardSize = useCallback((size: number) => {
    setBoardSize(size);
  }, []);

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8">
        <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-white mb-3 inline-block transition">
          ← 返回游戏中心
        </Link>

        {/* Title + Scores */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold text-white">
            <span className="text-[#3ea6ff]">2048</span>
          </h1>
          <div className="flex gap-2">
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">分数</div>
              <div className="font-bold text-[#3ea6ff] text-sm tabular-nums">{score.toLocaleString()}</div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">最高</div>
              <div className="font-bold text-[#f0b90b] text-sm tabular-nums">{best.toLocaleString()}</div>
            </div>
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
          {/* Board size selector */}
          <div className="flex gap-1">
            {[4, 5, 6].map(size => (
              <button
                key={size}
                onClick={() => changeBoardSize(size)}
                className={`px-2.5 py-1 rounded-lg text-xs border transition ${
                  boardSize === size
                    ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-bold"
                    : "text-[#aaa] border-[#333] hover:text-white hover:border-[#555]"
                }`}
              >
                {size}×{size}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            {/* Undo button */}
            <button
              onClick={handleUndo}
              disabled={undosLeft <= 0 || gameOver || !gameRef.current?.history?.length}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              撤销 ({undosLeft})
            </button>

            {/* New game button */}
            <button
              onClick={() => initGame(boardSize)}
              className="px-3 py-1.5 rounded-lg text-xs bg-[#3ea6ff] text-[#0f0f0f] font-semibold hover:bg-[#65b8ff] transition"
            >
              新游戏
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="w-full touch-none select-none">
          <canvas
            ref={canvasRef}
            className="w-full rounded-xl"
            style={{ touchAction: "none" }}
          />
        </div>

        {gameOver && (
          <div className="text-center mt-3">
            <button
              onClick={() => initGame(boardSize)}
              className="px-6 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition shadow-lg shadow-[#3ea6ff]/25"
            >
              再来一局
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-[#666] mt-3">
          滑动或方向键操作 · 连续合并获得连击加分
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
