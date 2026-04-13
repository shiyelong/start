"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import { ParticleSystem } from "@/lib/game-engine/particle-system";
import { InputHandler } from "@/lib/game-engine/input-handler";
import { easeOutQuad, lerp, updateShake, applyShake, updateScorePopups, renderScorePopups } from "@/lib/game-engine/animation-utils";
import type { ScorePopup, ShakeState } from "@/lib/game-engine/animation-utils";
import { drawGradientBackground, drawText, drawGlow, drawRoundedRect } from "@/lib/game-engine/render-utils";

// ─── Types ───────────────────────────────────────────────
interface Piece {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

interface SlideAnim {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
}

interface LevelDef {
  name: string;
  pieces: Piece[];
}

interface GameState {
  levelIdx: number;
  pieces: Piece[];
  moves: number;
  won: boolean;
  selected: string | null;
  paused: boolean;
  startTime: number;
  elapsed: number;
  undoStack: { pieces: Piece[]; moves: number }[];
}

interface AnimState {
  time: number;
  bgHue: number;
  targetBgHue: number;
  shake: ShakeState;
  scorePopups: ScorePopup[];
  slideAnims: SlideAnim[];
  selectedGlow: number;
  winTime: number;
  winCelebrated: boolean;
}

// ─── Constants ───────────────────────────────────────────
const GAME_ID = "huarong";
const GRID_W = 4;
const GRID_H = 5;
const CANVAS_H = 520;
const BOARD_PAD = 12;
const CELL_GAP = 4;

const LEVELS: LevelDef[] = [
  {
    name: "横刀立马",
    pieces: [
      { id: "cao", name: "曹", x: 1, y: 0, w: 2, h: 2, color: "#dc2626" },
      { id: "guan", name: "关", x: 0, y: 2, w: 2, h: 1, color: "#16a34a" },
      { id: "zhang", name: "张", x: 0, y: 0, w: 1, h: 2, color: "#2563eb" },
      { id: "zhao", name: "赵", x: 3, y: 0, w: 1, h: 2, color: "#3b82f6" },
      { id: "ma", name: "马", x: 0, y: 3, w: 1, h: 2, color: "#60a5fa" },
      { id: "huang", name: "黄", x: 3, y: 2, w: 1, h: 2, color: "#93c5fd" },
      { id: "s1", name: "兵", x: 1, y: 2, w: 1, h: 1, color: "#6b7280" },
      { id: "s2", name: "兵", x: 2, y: 2, w: 1, h: 1, color: "#6b7280" },
      { id: "s3", name: "兵", x: 1, y: 3, w: 1, h: 1, color: "#6b7280" },
      { id: "s4", name: "兵", x: 2, y: 3, w: 1, h: 1, color: "#6b7280" },
    ],
  },
  {
    name: "近在咫尺",
    pieces: [
      { id: "cao", name: "曹", x: 1, y: 0, w: 2, h: 2, color: "#dc2626" },
      { id: "guan", name: "关", x: 1, y: 2, w: 2, h: 1, color: "#16a34a" },
      { id: "zhang", name: "张", x: 0, y: 0, w: 1, h: 2, color: "#2563eb" },
      { id: "zhao", name: "赵", x: 3, y: 0, w: 1, h: 2, color: "#3b82f6" },
      { id: "ma", name: "马", x: 0, y: 2, w: 1, h: 2, color: "#60a5fa" },
      { id: "huang", name: "黄", x: 3, y: 2, w: 1, h: 2, color: "#93c5fd" },
      { id: "s1", name: "兵", x: 0, y: 4, w: 1, h: 1, color: "#6b7280" },
      { id: "s2", name: "兵", x: 1, y: 3, w: 1, h: 1, color: "#6b7280" },
      { id: "s3", name: "兵", x: 2, y: 3, w: 1, h: 1, color: "#6b7280" },
      { id: "s4", name: "兵", x: 3, y: 4, w: 1, h: 1, color: "#6b7280" },
    ],
  },
  {
    name: "兵分三路",
    pieces: [
      { id: "cao", name: "曹", x: 1, y: 0, w: 2, h: 2, color: "#dc2626" },
      { id: "guan", name: "关", x: 1, y: 3, w: 2, h: 1, color: "#16a34a" },
      { id: "zhang", name: "张", x: 0, y: 0, w: 1, h: 2, color: "#2563eb" },
      { id: "zhao", name: "赵", x: 3, y: 0, w: 1, h: 2, color: "#3b82f6" },
      { id: "ma", name: "马", x: 0, y: 2, w: 1, h: 2, color: "#60a5fa" },
      { id: "huang", name: "黄", x: 3, y: 2, w: 1, h: 2, color: "#93c5fd" },
      { id: "s1", name: "兵", x: 1, y: 2, w: 1, h: 1, color: "#6b7280" },
      { id: "s2", name: "兵", x: 2, y: 2, w: 1, h: 1, color: "#6b7280" },
      { id: "s3", name: "兵", x: 1, y: 4, w: 1, h: 1, color: "#6b7280" },
      { id: "s4", name: "兵", x: 2, y: 4, w: 1, h: 1, color: "#6b7280" },
    ],
  },
  {
    name: "四面楚歌",
    pieces: [
      { id: "cao", name: "曹", x: 1, y: 0, w: 2, h: 2, color: "#dc2626" },
      { id: "guan", name: "关", x: 0, y: 3, w: 2, h: 1, color: "#16a34a" },
      { id: "zhang", name: "张", x: 0, y: 0, w: 1, h: 2, color: "#2563eb" },
      { id: "zhao", name: "赵", x: 3, y: 0, w: 1, h: 2, color: "#3b82f6" },
      { id: "ma", name: "马", x: 0, y: 2, w: 1, h: 1, color: "#60a5fa" },
      { id: "huang", name: "黄", x: 3, y: 2, w: 1, h: 2, color: "#93c5fd" },
      { id: "s1", name: "兵", x: 1, y: 2, w: 1, h: 1, color: "#6b7280" },
      { id: "s2", name: "兵", x: 2, y: 2, w: 1, h: 1, color: "#6b7280" },
      { id: "s3", name: "兵", x: 2, y: 3, w: 1, h: 1, color: "#6b7280" },
      { id: "s4", name: "兵", x: 2, y: 4, w: 1, h: 1, color: "#6b7280" },
    ],
  },
  {
    name: "层层设防",
    pieces: [
      { id: "cao", name: "曹", x: 1, y: 0, w: 2, h: 2, color: "#dc2626" },
      { id: "guan", name: "关", x: 1, y: 4, w: 2, h: 1, color: "#16a34a" },
      { id: "zhang", name: "张", x: 0, y: 0, w: 1, h: 2, color: "#2563eb" },
      { id: "zhao", name: "赵", x: 3, y: 0, w: 1, h: 2, color: "#3b82f6" },
      { id: "ma", name: "马", x: 0, y: 2, w: 1, h: 2, color: "#60a5fa" },
      { id: "huang", name: "黄", x: 3, y: 2, w: 1, h: 2, color: "#93c5fd" },
      { id: "s1", name: "兵", x: 1, y: 2, w: 1, h: 1, color: "#6b7280" },
      { id: "s2", name: "兵", x: 2, y: 2, w: 1, h: 1, color: "#6b7280" },
      { id: "s3", name: "兵", x: 1, y: 3, w: 1, h: 1, color: "#6b7280" },
      { id: "s4", name: "兵", x: 2, y: 3, w: 1, h: 1, color: "#6b7280" },
    ],
  },
];

// ─── Game Logic (Pure Functions) ─────────────────────────
function clonePieces(pieces: Piece[]): Piece[] {
  return pieces.map(p => ({ ...p }));
}

function initGameState(levelIdx: number): GameState {
  return {
    levelIdx,
    pieces: clonePieces(LEVELS[levelIdx].pieces),
    moves: 0,
    won: false,
    selected: null,
    paused: false,
    startTime: Date.now(),
    elapsed: 0,
    undoStack: [],
  };
}

function isOccupied(pieces: Piece[], x: number, y: number, ignoreId: string): boolean {
  return pieces.some(
    p => p.id !== ignoreId && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h,
  );
}

function canMove(pieces: Piece[], piece: Piece, dx: number, dy: number): boolean {
  const nx = piece.x + dx;
  const ny = piece.y + dy;
  if (nx < 0 || nx + piece.w > GRID_W || ny < 0 || ny + piece.h > GRID_H) return false;
  for (let px = nx; px < nx + piece.w; px++) {
    for (let py = ny; py < ny + piece.h; py++) {
      if (isOccupied(pieces, px, py, piece.id)) return false;
    }
  }
  return true;
}

function checkWin(pieces: Piece[]): boolean {
  const cao = pieces.find(p => p.id === "cao");
  return !!cao && cao.x === 1 && cao.y === 3;
}

function calcScore(moves: number, elapsed: number): number {
  // Lower moves = higher score. Base 10000, minus penalties
  const movePenalty = moves * 10;
  const timePenalty = Math.floor(elapsed / 1000) * 2;
  return Math.max(100, 10000 - movePenalty - timePenalty);
}

// ─── Board Layout Helpers ────────────────────────────────
function getBoardLayout(canvasW: number) {
  const boardInnerW = canvasW - BOARD_PAD * 2;
  const cellSize = Math.floor((boardInnerW - CELL_GAP * (GRID_W + 1)) / GRID_W);
  const boardW = CELL_GAP + GRID_W * (cellSize + CELL_GAP);
  const boardH = CELL_GAP + GRID_H * (cellSize + CELL_GAP);
  const boardX = (canvasW - boardW) / 2;
  const boardY = 60;
  return { cellSize, boardW, boardH, boardX, boardY };
}

function cellToPixel(col: number, row: number, boardX: number, boardY: number, cellSize: number) {
  return {
    px: boardX + CELL_GAP + col * (cellSize + CELL_GAP),
    py: boardY + CELL_GAP + row * (cellSize + CELL_GAP),
  };
}

function pixelToCell(px: number, py: number, boardX: number, boardY: number, cellSize: number): { col: number; row: number } | null {
  const relX = px - boardX - CELL_GAP;
  const relY = py - boardY - CELL_GAP;
  if (relX < 0 || relY < 0) return null;
  const col = Math.floor(relX / (cellSize + CELL_GAP));
  const row = Math.floor(relY / (cellSize + CELL_GAP));
  if (col < 0 || col >= GRID_W || row < 0 || row >= GRID_H) return null;
  return { col, row };
}

function findPieceAt(pieces: Piece[], col: number, row: number): Piece | undefined {
  return pieces.find(p => col >= p.x && col < p.x + p.w && row >= p.y && row < p.y + p.h);
}

// ─── Renderer ────────────────────────────────────────────
function renderGame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  game: GameState,
  anim: AnimState,
  particles: ParticleSystem,
  dpr: number,
): void {
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const { cellSize, boardW, boardH, boardX, boardY } = getBoardLayout(w);

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background
  drawGradientBackground(ctx, w, h, anim.bgHue, 50);

  // Apply shake
  applyShake(ctx, anim.shake);

  // Title area
  drawText(ctx, `${LEVELS[game.levelIdx].name}`, w / 2, 22, w * 0.8, "#ffffff", 18);
  drawText(ctx, `步数: ${game.moves}  时间: ${Math.floor(game.elapsed / 1000)}s`, w / 2, 44, w * 0.8, "#8a8a8a", 12);

  // Board background
  drawRoundedRect(ctx, boardX, boardY, boardW, boardH, 10);
  ctx.fillStyle = "rgba(30, 30, 30, 0.9)";
  ctx.fill();
  ctx.strokeStyle = "rgba(100, 100, 100, 0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Grid cells (empty slots)
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const { px, py } = cellToPixel(c, r, boardX, boardY, cellSize);
      drawRoundedRect(ctx, px, py, cellSize, cellSize, 6);
      ctx.fillStyle = "rgba(50, 50, 50, 0.5)";
      ctx.fill();
    }
  }

  // Exit marker at bottom center (between columns 1 and 2, row 5)
  const exitLeft = cellToPixel(1, GRID_H - 1, boardX, boardY, cellSize);
  const exitW = 2 * cellSize + CELL_GAP;
  const exitY = boardY + boardH - 3;
  ctx.save();
  ctx.shadowColor = "#dc2626";
  ctx.shadowBlur = 10;
  drawRoundedRect(ctx, exitLeft.px, exitY, exitW, 4, 2);
  ctx.fillStyle = "#dc2626";
  ctx.fill();
  ctx.restore();

  // Build a map of animating pieces for position override
  const animMap = new Map<string, { x: number; y: number }>();
  for (const sa of anim.slideAnims) {
    const t = easeOutQuad(Math.min(1, sa.progress));
    animMap.set(sa.id, {
      x: sa.fromX + (sa.toX - sa.fromX) * t,
      y: sa.fromY + (sa.toY - sa.fromY) * t,
    });
  }

  // Draw pieces
  for (const piece of game.pieces) {
    const animPos = animMap.get(piece.id);
    const drawCol = animPos ? animPos.x : piece.x;
    const drawRow = animPos ? animPos.y : piece.y;

    const { px, py } = cellToPixel(drawCol, drawRow, boardX, boardY, cellSize);
    const pw = piece.w * cellSize + (piece.w - 1) * CELL_GAP;
    const ph = piece.h * cellSize + (piece.h - 1) * CELL_GAP;

    const isSelected = game.selected === piece.id;
    const isCao = piece.id === "cao";

    // Selected glow
    if (isSelected) {
      const glowIntensity = 0.3 + 0.2 * Math.sin(anim.selectedGlow * 4);
      drawGlow(ctx, px + pw / 2, py + ph / 2, Math.max(pw, ph) * 0.8, isCao ? "#fbbf24" : "#3ea6ff", glowIntensity);
    }

    // Piece body
    ctx.save();
    drawRoundedRect(ctx, px, py, pw, ph, 8);

    // Gradient fill
    const grad = ctx.createLinearGradient(px, py, px, py + ph);
    grad.addColorStop(0, piece.color);
    grad.addColorStop(1, darkenColor(piece.color, 0.3));
    ctx.fillStyle = grad;
    ctx.fill();

    // Border
    ctx.strokeStyle = isSelected ? (isCao ? "#fbbf24" : "#3ea6ff") : "rgba(255,255,255,0.15)";
    ctx.lineWidth = isSelected ? 2.5 : 1;
    ctx.stroke();
    ctx.restore();

    // Cao Cao special: gold inner glow
    if (isCao) {
      ctx.save();
      drawRoundedRect(ctx, px + 3, py + 3, pw - 6, ph - 6, 6);
      ctx.strokeStyle = "rgba(251, 191, 36, 0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Label
    const fontSize = isCao ? Math.min(cellSize * 0.6, 36) : Math.min(cellSize * 0.45, 24);
    drawText(ctx, piece.name, px + pw / 2, py + ph / 2, pw * 0.8, "rgba(255,255,255,0.9)", fontSize);
  }

  // Particles
  particles.render(ctx);

  // Score popups
  renderScorePopups(ctx, anim.scorePopups);

  // Win overlay
  if (game.won) {
    const alpha = Math.min(0.7, anim.winTime * 2);
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(0, 0, w, h);

    const scale = easeOutQuad(Math.min(1, anim.winTime * 2));
    ctx.save();
    ctx.translate(w / 2, h / 2 - 30);
    ctx.scale(scale, scale);
    drawText(ctx, "?", 0, -30, 100, "#ffffff", 48);
    drawText(ctx, "曹操逃出！", 0, 15, w * 0.7, "#fbbf24", 24);
    drawText(ctx, `${game.moves}步 · ${Math.floor(game.elapsed / 1000)}秒 · ${calcScore(game.moves, game.elapsed)}分`, 0, 50, w * 0.8, "#8a8a8a", 14);
    ctx.restore();
  }

  // Pause overlay
  if (game.paused && !game.won) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, "⏸ 已暂停", w / 2, h / 2, w * 0.8, "#ffffff", 28);
    drawText(ctx, "点击继续", w / 2, h / 2 + 36, w * 0.6, "#8a8a8a", 14);
  }

  ctx.restore();
}

function darkenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.round(r * (1 - amount));
  const dg = Math.round(g * (1 - amount));
  const db = Math.round(b * (1 - amount));
  return `rgb(${dr},${dg},${db})`;
}

// ─── Component ───────────────────────────────────────────
export default function HuarongPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(null!);
  const animRef = useRef<AnimState>({
    time: 0,
    bgHue: 0,
    targetBgHue: 0,
    shake: { time: 0, intensity: 0 },
    scorePopups: [],
    slideAnims: [],
    selectedGlow: 0,
    winTime: 0,
    winCelebrated: false,
  });
  const soundRef = useRef<SoundEngine>(null!);
  const particlesRef = useRef<ParticleSystem>(null!);
  const inputRef = useRef<InputHandler>(null!);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scoreSubmittedRef = useRef(false);

  // React UI state
  const [moves, setMoves] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [won, setWon] = useState(false);
  const [levelIdx, setLevelIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [, forceUpdate] = useState(0);

  // Init sound + particles
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    particlesRef.current = new ParticleSystem(400);
  }, []);

  // Submit score
  const submitScore = useCallback(async (finalScore: number) => {
    if (scoreSubmittedRef.current || finalScore === 0) return;
    scoreSubmittedRef.current = true;
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: finalScore }),
      });
    } catch { /* silent */ }
  }, []);

  // Sync UI
  const syncUI = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    setMoves(g.moves);
    setElapsed(g.elapsed);
    setWon(g.won);
    setLevelIdx(g.levelIdx);
    setPaused(g.paused);
  }, []);

  // Init game
  const initGame = useCallback((lvl: number = 0) => {
    gameRef.current = initGameState(lvl);
    const anim = animRef.current;
    anim.scorePopups = [];
    anim.slideAnims = [];
    anim.shake = { time: 0, intensity: 0 };
    anim.winTime = 0;
    anim.winCelebrated = false;
    anim.targetBgHue = 0;
    particlesRef.current?.clear();
    scoreSubmittedRef.current = false;
    syncUI();
    forceUpdate(n => n + 1);
  }, [syncUI]);

  // Move piece
  const movePiece = useCallback((id: string, dx: number, dy: number) => {
    const game = gameRef.current;
    if (!game || game.won || game.paused) return;
    const piece = game.pieces.find(p => p.id === id);
    if (!piece || !canMove(game.pieces, piece, dx, dy)) {
      soundRef.current?.playError();
      return;
    }

    // Save undo state
    game.undoStack.push({ pieces: clonePieces(game.pieces), moves: game.moves });
    if (game.undoStack.length > 50) game.undoStack.shift();

    // Start slide animation
    const anim = animRef.current;
    anim.slideAnims.push({
      id: piece.id,
      fromX: piece.x,
      fromY: piece.y,
      toX: piece.x + dx,
      toY: piece.y + dy,
      progress: 0,
    });

    piece.x += dx;
    piece.y += dy;
    game.moves++;

    soundRef.current?.playMove();

    // Check win
    if (checkWin(game.pieces)) {
      game.won = true;
      anim.winTime = 0;
      anim.winCelebrated = false;
      anim.targetBgHue = 45; // gold
      anim.shake = { time: 0.4, intensity: 5 };
      soundRef.current?.playLevelUp();
      const score = calcScore(game.moves, game.elapsed);
      submitScore(score);
    }

    syncUI();
  }, [syncUI, submitScore]);

  // Undo
  const undo = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.won || game.paused || game.undoStack.length === 0) return;
    const prev = game.undoStack.pop()!;
    game.pieces = prev.pieces;
    game.moves = prev.moves;
    animRef.current.slideAnims = [];
    soundRef.current?.playClick();
    syncUI();
  }, [syncUI]);

  // Toggle pause
  const togglePause = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.won) return;
    game.paused = !game.paused;
    setPaused(game.paused);
  }, []);

  // Handle tap on canvas
  const handleCanvasTap = useCallback((tapX: number, tapY: number) => {
    const game = gameRef.current;
    const canvas = canvasRef.current;
    if (!game || !canvas) return;

    if (game.paused) {
      togglePause();
      return;
    }
    if (game.won) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.width / dpr;
    const { cellSize, boardX, boardY } = getBoardLayout(cw);
    const cell = pixelToCell(tapX, tapY, boardX, boardY, cellSize);
    if (!cell) {
      game.selected = null;
      syncUI();
      return;
    }

    const tapped = findPieceAt(game.pieces, cell.col, cell.row);
    if (!tapped) {
      // Tapped empty cell: if a piece is selected, try to move it there
      if (game.selected) {
        const sel = game.pieces.find(p => p.id === game.selected);
        if (sel) {
          const dx = cell.col - sel.x;
          const dy = cell.row - sel.y;
          // Try single-step moves toward the tapped cell
          if (Math.abs(dx) + Math.abs(dy) === 1) {
            movePiece(sel.id, dx, dy);
          } else if (dx !== 0 && dy === 0) {
            movePiece(sel.id, dx > 0 ? 1 : -1, 0);
          } else if (dy !== 0 && dx === 0) {
            movePiece(sel.id, 0, dy > 0 ? 1 : -1);
          }
        }
      }
      return;
    }

    if (game.selected === tapped.id) {
      game.selected = null;
    } else {
      game.selected = tapped.id;
      soundRef.current?.playClick();
    }
    syncUI();
  }, [movePiece, syncUI, togglePause]);

  // Save/Load
  const handleSave = useCallback(() => {
    const game = gameRef.current;
    if (!game) return {};
    return {
      levelIdx: game.levelIdx,
      pieces: clonePieces(game.pieces),
      moves: game.moves,
      won: game.won,
      elapsed: game.elapsed,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    try {
      const d = data as {
        levelIdx: number; pieces: Piece[]; moves: number;
        won: boolean; elapsed: number;
      };
      if (!d || typeof d.levelIdx !== "number" || !Array.isArray(d.pieces) || typeof d.moves !== "number") return;
      if (d.levelIdx < 0 || d.levelIdx >= LEVELS.length) return;
      const game = gameRef.current;
      if (!game) return;
      game.levelIdx = d.levelIdx;
      game.pieces = clonePieces(d.pieces);
      game.moves = d.moves;
      game.won = d.won || false;
      game.elapsed = d.elapsed || 0;
      game.startTime = Date.now() - game.elapsed;
      game.selected = null;
      game.paused = false;
      game.undoStack = [];
      animRef.current.slideAnims = [];
      animRef.current.scorePopups = [];
      animRef.current.winTime = 0;
      animRef.current.winCelebrated = false;
      particlesRef.current?.clear();
      scoreSubmittedRef.current = d.won || false;
      syncUI();
      forceUpdate(n => n + 1);
    } catch { /* ignore malformed data */ }
  }, [syncUI]);

  // ─── Animation Loop ──────────────────────────────────────
  useEffect(() => {
    initGame(0);
  }, []);

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
      const h = CANVAS_H;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };

    resize();
    window.addEventListener("resize", resize);

    const loop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const rawDt = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;
      const dt = Math.min(rawDt, 50) / 1000;

      const anim = animRef.current;
      const game = gameRef.current;

      if (game && !game.paused) {
        anim.time += dt;
        anim.selectedGlow += dt;

        // Update elapsed time
        if (!game.won) {
          game.elapsed = Date.now() - game.startTime;
        }

        // Smooth bg hue
        anim.bgHue = lerp(anim.bgHue, anim.targetBgHue, 0.03);

        // Update shake
        updateShake(anim.shake, dt);

        // Update score popups
        updateScorePopups(anim.scorePopups, dt);

        // Update particles
        particlesRef.current?.update(dt);

        // Update slide animations
        let si = anim.slideAnims.length;
        while (si-- > 0) {
          anim.slideAnims[si].progress += dt * 6; // ~0.17s slide
          if (anim.slideAnims[si].progress >= 1) {
            anim.slideAnims[si] = anim.slideAnims[anim.slideAnims.length - 1];
            anim.slideAnims.pop();
          }
        }

        // Win celebration particles
        if (game.won) {
          anim.winTime += dt;
          if (!anim.winCelebrated && anim.winTime > 0.2) {
            anim.winCelebrated = true;
            const dpr = window.devicePixelRatio || 1;
            const cw = canvas.width / dpr;
            const ch = canvas.height / dpr;
            particlesRef.current?.emitCelebration(cw / 2, ch / 2 - 40);
            particlesRef.current?.emitCelebration(cw * 0.3, ch / 2 - 20);
            particlesRef.current?.emitCelebration(cw * 0.7, ch / 2 - 20);

            const score = calcScore(game.moves, game.elapsed);
            anim.scorePopups.push({
              x: cw / 2, y: ch / 2 - 80,
              value: score, life: 2, combo: 1,
            });
          }
        }
      }

      // Render
      if (game) {
        const dpr = window.devicePixelRatio || 1;
        renderGame(ctx, canvas, game, anim, particlesRef.current!, dpr);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [syncUI]);

  // ─── Input ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const scaleX = (canvas.width / dpr) / rect.width;
      const scaleY = (canvas.height / dpr) / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      handleCanvasTap(x, y);
    };

    canvas.addEventListener("click", onClick);

    const input = new InputHandler(canvas);
    input.onTap((x, y) => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const scaleX = (canvas.width / dpr) / rect.width;
      const scaleY = (canvas.height / dpr) / rect.height;
      handleCanvasTap(x * scaleX, y * scaleY);
    });
    input.preventDefaults();
    inputRef.current = input;

    return () => {
      canvas.removeEventListener("click", onClick);
      input.dispose();
    };
  }, [handleCanvasTap]);

  // Keyboard: arrow keys to move selected piece
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || !game.selected || game.won || game.paused) return;
      let dx = 0, dy = 0;
      if (e.key === "ArrowUp" || e.key === "w") { dy = -1; }
      else if (e.key === "ArrowDown" || e.key === "s") { dy = 1; }
      else if (e.key === "ArrowLeft" || e.key === "a") { dx = -1; }
      else if (e.key === "ArrowRight" || e.key === "d") { dx = 1; }
      else if (e.key === "z" || e.key === "Z") { undo(); return; }
      else return;
      e.preventDefault();
      movePiece(game.selected, dx, dy);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [movePiece, undo]);

  // ─── Tab visibility auto-pause ─────────────────────────
  useEffect(() => {
    const handler = () => {
      if (document.hidden && gameRef.current && !gameRef.current.won) {
        gameRef.current.paused = true;
        setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // ─── Cleanup ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      soundRef.current?.dispose();
      inputRef.current?.dispose();
      particlesRef.current?.clear();
    };
  }, []);

  const restart = useCallback(() => {
    initGame(gameRef.current?.levelIdx ?? 0);
  }, [initGame]);

  const changeLevel = useCallback((idx: number) => {
    initGame(idx);
  }, [initGame]);

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8">
        <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-white mb-3 inline-block transition">
          ← 返回游戏中心
        </Link>

        {/* Title + Stats */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-white">
            <span className="text-[#dc2626]">? 华容道</span>
          </h1>
          <div className="flex gap-2">
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">步数</div>
              <div className="font-bold text-[#3ea6ff] text-sm tabular-nums">{moves}</div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">时间</div>
              <div className="font-bold text-[#aaa] text-sm tabular-nums">{Math.floor(elapsed / 1000)}s</div>
            </div>
          </div>
        </div>

        {/* Level selector */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {LEVELS.map((l, i) => (
            <button
              key={i}
              onClick={() => changeLevel(i)}
              className={`px-3 py-1 rounded-full text-[11px] border transition ${
                levelIdx === i
                  ? "bg-[#dc2626] text-white border-[#dc2626] font-bold"
                  : "text-[#aaa] border-[#333] hover:border-[#555]"
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex gap-1.5">
            <button
              onClick={undo}
              disabled={won || (gameRef.current?.undoStack.length ?? 0) === 0}
              className={`px-3 py-1.5 rounded-lg text-xs border transition ${
                won || (gameRef.current?.undoStack.length ?? 0) === 0
                  ? "border-[#333] text-[#666]"
                  : "border-[#3ea6ff]/30 text-[#3ea6ff] hover:bg-[#3ea6ff]/10"
              }`}
            >
              ↩ 撤销
            </button>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={togglePause}
              className="px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition"
            >
              {paused ? "▶" : "⏸"}
            </button>
            <button
              onClick={() => { soundRef.current?.toggleMute(); forceUpdate(n => n + 1); }}
              className="px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition"
            >
              {soundRef.current?.isMuted() ? "?" : "?"}
            </button>
            <button
              onClick={restart}
              className="px-3 py-1.5 rounded-lg text-xs bg-[#dc2626] text-white font-semibold hover:bg-[#ef4444] transition"
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

        {/* Direction buttons for selected piece (mobile) */}
        {!won && !paused && gameRef.current?.selected && (
          <div className="flex flex-col items-center gap-1 mt-3">
            <p className="text-[11px] text-[#8a8a8a] mb-1">
              移动: <span className="text-[#3ea6ff] font-bold">{gameRef.current.pieces.find(p => p.id === gameRef.current?.selected)?.name}</span>
            </p>
            <button
              onClick={() => gameRef.current?.selected && movePiece(gameRef.current.selected, 0, -1)}
              className="w-11 h-11 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#aaa] active:bg-[#3ea6ff]/20 transition text-lg"
            >↑</button>
            <div className="flex gap-1">
              <button
                onClick={() => gameRef.current?.selected && movePiece(gameRef.current.selected, -1, 0)}
                className="w-11 h-11 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#aaa] active:bg-[#3ea6ff]/20 transition text-lg"
              >←</button>
              <button
                onClick={() => gameRef.current?.selected && movePiece(gameRef.current.selected, 0, 1)}
                className="w-11 h-11 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#aaa] active:bg-[#3ea6ff]/20 transition text-lg"
              >↓</button>
              <button
                onClick={() => gameRef.current?.selected && movePiece(gameRef.current.selected, 1, 0)}
                className="w-11 h-11 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#aaa] active:bg-[#3ea6ff]/20 transition text-lg"
              >→</button>
            </div>
          </div>
        )}

        <p className="text-center text-[10px] text-[#666] mt-2">
          点击棋子选中 · 方向键/点击空位移动 · 让曹操从底部中间逃出
        </p>

        {/* Win message */}
        {won && (
          <div className="text-center mt-3 p-4 rounded-xl bg-[#1a1a1a] border border-[#fbbf24]/30">
            <p className="text-2xl mb-1">?</p>
            <p className="text-lg font-bold text-[#fbbf24]">曹操逃出！</p>
            <p className="text-[#8a8a8a] text-sm">{moves}步 · {Math.floor(elapsed / 1000)}秒 · 得分 {calcScore(moves, elapsed)}</p>
            <button
              onClick={restart}
              className="mt-2 px-4 py-1.5 rounded-lg text-xs bg-[#dc2626] text-white font-semibold hover:bg-[#ef4444] transition"
            >
              再来一局
            </button>
          </div>
        )}

        {/* Leaderboard & Save/Load */}
        <div className="mt-4 space-y-3">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </>
  );
}
