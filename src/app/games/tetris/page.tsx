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
import { lerp } from "@/lib/game-engine/animation-utils";
import { drawRoundedRect, drawGlow, drawGradientBackground } from "@/lib/game-engine/render-utils";
import VirtualDPad from "@/components/VirtualDPad";

// ─── Types ───────────────────────────────────────────────────────────────────
type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

interface Piece {
  type: PieceType;
  rotation: number; // 0-3
  row: number;
  col: number;
}

interface ScorePopup {
  x: number;
  y: number;
  value: number;
  life: number;
  combo: number;
}

interface GameState {
  board: number[][]; // 0=empty, 1-7=piece colors
  current: Piece;
  next: PieceType;
  hold: PieceType | null;
  holdUsed: boolean;
  score: number;
  level: number;
  lines: number;
  over: boolean;
  paused: boolean;
}

interface AnimState {
  time: number;
  dropTimer: number;
  lockTimer: number;
  locking: boolean;
  flashRows: number[];
  flashTime: number;
  scorePopups: ScorePopup[];
  shakeTime: number;
  shakeIntensity: number;
  bgHue: number;
  targetBgHue: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "tetris";
const COLS = 10;
const ROWS = 20;
const FLASH_DURATION = 300; // ms

const PIECE_COLORS: Record<PieceType, string> = {
  I: "#00f0f0",
  O: "#f0f000",
  T: "#a000f0",
  S: "#00f000",
  Z: "#f00000",
  J: "#0000f0",
  L: "#f0a000",
};

const PIECE_COLOR_INDEX: Record<PieceType, number> = {
  I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7,
};

const INDEX_TO_COLOR: Record<number, string> = {
  1: "#00f0f0", 2: "#f0f000", 3: "#a000f0", 4: "#00f000",
  5: "#f00000", 6: "#0000f0", 7: "#f0a000",
};

// ─── Tetromino Shapes (SRS) ──────────────────────────────────────────────────
// Each piece has 4 rotation states, each state is an array of [row, col] offsets
const SHAPES: Record<PieceType, number[][][]> = {
  I: [
    [[0,-1],[0,0],[0,1],[0,2]],
    [[-1,1],[0,1],[1,1],[2,1]],
    [[1,-1],[1,0],[1,1],[1,2]],
    [[-1,0],[0,0],[1,0],[2,0]],
  ],
  O: [
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[1,0],[1,1]],
  ],
  T: [
    [[0,-1],[0,0],[0,1],[-1,0]],
    [[-1,0],[0,0],[1,0],[0,1]],
    [[0,-1],[0,0],[0,1],[1,0]],
    [[-1,0],[0,0],[1,0],[0,-1]],
  ],
  S: [
    [[0,-1],[0,0],[-1,0],[-1,1]],
    [[-1,0],[0,0],[0,1],[1,1]],
    [[1,-1],[1,0],[0,0],[0,1]],
    [[-1,-1],[0,-1],[0,0],[1,0]],
  ],
  Z: [
    [[-1,-1],[-1,0],[0,0],[0,1]],
    [[0,0],[1,0],[-1,1],[0,1]],
    [[0,-1],[0,0],[1,0],[1,1]],
    [[0,0],[0,-1],[1,-1],[-1,0]],
  ],
  J: [
    [[-1,-1],[0,-1],[0,0],[0,1]],
    [[-1,0],[0,0],[1,0],[-1,1]],
    [[0,-1],[0,0],[0,1],[1,1]],
    [[1,0],[0,0],[-1,0],[1,-1]],
  ],
  L: [
    [[-1,1],[0,-1],[0,0],[0,1]],
    [[-1,0],[0,0],[1,0],[1,1]],
    [[0,-1],[0,0],[0,1],[1,-1]],
    [[-1,-1],[-1,0],[0,0],[1,0]],
  ],
};

// ─── SRS Wall Kick Data ──────────────────────────────────────────────────────
// Wall kick offsets for J, L, S, T, Z pieces
const WALL_KICKS_JLSTZ: Record<string, number[][]> = {
  "0>1": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  "1>0": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  "1>2": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  "2>1": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  "2>3": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  "3>2": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  "3>0": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  "0>3": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
};

// Wall kick offsets for I piece
const WALL_KICKS_I: Record<string, number[][]> = {
  "0>1": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  "1>0": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  "1>2": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  "2>1": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  "2>3": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  "3>2": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  "3>0": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  "0>3": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
};


// ─── Game Logic (Pure Functions) ─────────────────────────────────────────────
const PIECE_TYPES: PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];

function randomPiece(): PieceType {
  return PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
}

function createEmptyBoard(): number[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function spawnPiece(type: PieceType): Piece {
  return { type, rotation: 0, row: 0, col: Math.floor(COLS / 2) - 1 };
}

function getBlocks(piece: Piece): number[][] {
  return SHAPES[piece.type][piece.rotation].map(([r, c]) => [piece.row + r, piece.col + c]);
}

function isValid(board: number[][], piece: Piece): boolean {
  const blocks = getBlocks(piece);
  for (const [r, c] of blocks) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    if (board[r][c] !== 0) return false;
  }
  return true;
}

function placePiece(board: number[][], piece: Piece): void {
  const colorIdx = PIECE_COLOR_INDEX[piece.type];
  for (const [r, c] of getBlocks(piece)) {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      board[r][c] = colorIdx;
    }
  }
}

function clearLines(board: number[][]): number[] {
  const cleared: number[] = [];
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(cell => cell !== 0)) {
      cleared.push(r);
    }
  }
  return cleared;
}

function removeLines(board: number[][], lines: number[]): void {
  const sorted = [...lines].sort((a, b) => a - b);
  for (const row of sorted) {
    board.splice(row, 1);
    board.unshift(Array(COLS).fill(0));
  }
}

function getGhostRow(board: number[][], piece: Piece): number {
  let ghost = { ...piece };
  while (isValid(board, { ...ghost, row: ghost.row + 1 })) {
    ghost.row++;
  }
  return ghost.row;
}

function tryRotate(board: number[][], piece: Piece, dir: 1 | -1): Piece | null {
  const newRot = ((piece.rotation + dir) % 4 + 4) % 4;
  const key = `${piece.rotation}>${newRot}`;
  const kicks = piece.type === "I" ? WALL_KICKS_I : WALL_KICKS_JLSTZ;
  const offsets = kicks[key];
  if (!offsets) return null;
  for (const [dc, dr] of offsets) {
    const test: Piece = { ...piece, rotation: newRot, col: piece.col + dc, row: piece.row - dr };
    if (isValid(board, test)) return test;
  }
  return null;
}

function getDropInterval(level: number): number {
  // Speed curve: starts at 1000ms, decreases with level
  return Math.max(50, 1000 - (level - 1) * 80);
}

function calcScore(linesCleared: number, level: number): number {
  const base = [0, 100, 300, 500, 800];
  return (base[linesCleared] || 0) * level;
}

function initGameState(): GameState {
  const next = randomPiece();
  const current = spawnPiece(randomPiece());
  return {
    board: createEmptyBoard(),
    current,
    next,
    hold: null,
    holdUsed: false,
    score: 0,
    level: 1,
    lines: 0,
    over: false,
    paused: false,
  };
}

function canSpawn(board: number[][], type: PieceType): boolean {
  return isValid(board, spawnPiece(type));
}


// ─── Canvas Renderer ─────────────────────────────────────────────────────────
function renderGame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  game: GameState,
  anim: AnimState,
  particles: ParticleSystem,
  dpr: number,
) {
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.save();
  ctx.scale(dpr, dpr);

  // Screen shake
  if (anim.shakeTime > 0) {
    const mag = anim.shakeIntensity * (anim.shakeTime / 500);
    ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
  }

  // Background
  drawGradientBackground(ctx, w, h, anim.bgHue, 10);

  // Layout calculations
  const cellSize = Math.floor(Math.min((w - 140) / COLS, (h - 20) / ROWS));
  const boardW = cellSize * COLS;
  const boardH = cellSize * ROWS;
  const boardX = Math.floor((w - boardW - 110) / 2);
  const boardY = Math.floor((h - boardH) / 2);
  const sideX = boardX + boardW + 12;

  // Board background
  drawRoundedRect(ctx, boardX - 4, boardY - 4, boardW + 8, boardH + 8, 6);
  ctx.fillStyle = "#111";
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 0.5;
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(boardX, boardY + r * cellSize);
    ctx.lineTo(boardX + boardW, boardY + r * cellSize);
    ctx.stroke();
  }
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(boardX + c * cellSize, boardY);
    ctx.lineTo(boardX + c * cellSize, boardY + boardH);
    ctx.stroke();
  }

  // Draw placed blocks
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const val = game.board[r][c];
      if (val === 0) continue;
      const color = INDEX_TO_COLOR[val] || "#888";
      const x = boardX + c * cellSize;
      const y = boardY + r * cellSize;

      // Flash effect for clearing rows
      if (anim.flashRows.includes(r) && anim.flashTime > 0) {
        const flashT = anim.flashTime / FLASH_DURATION;
        const alpha = Math.sin(flashT * Math.PI * 3) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        continue;
      }

      drawBlock(ctx, x, y, cellSize, color, anim.time);
    }
  }

  // Draw ghost piece
  if (!game.over && !game.paused) {
    const ghostRow = getGhostRow(game.board, game.current);
    const ghostBlocks = SHAPES[game.current.type][game.current.rotation].map(
      ([r, c]) => [ghostRow + r, game.current.col + c]
    );
    ctx.globalAlpha = 0.2;
    const ghostColor = PIECE_COLORS[game.current.type];
    for (const [r, c] of ghostBlocks) {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
        const x = boardX + c * cellSize;
        const y = boardY + r * cellSize;
        drawRoundedRect(ctx, x + 1, y + 1, cellSize - 2, cellSize - 2, 3);
        ctx.fillStyle = ghostColor;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Draw current piece
  if (!game.over) {
    const blocks = getBlocks(game.current);
    const color = PIECE_COLORS[game.current.type];
    for (const [r, c] of blocks) {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
        const x = boardX + c * cellSize;
        const y = boardY + r * cellSize;
        drawBlock(ctx, x, y, cellSize, color, anim.time);
      }
    }
  }

  // Side panel
  const panelCellSize = Math.floor(cellSize * 0.7);

  // Next piece preview
  ctx.fillStyle = "#aaa";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("NEXT", sideX, boardY + 12);
  drawRoundedRect(ctx, sideX, boardY + 18, panelCellSize * 4 + 8, panelCellSize * 4 + 8, 6);
  ctx.fillStyle = "#1a1a1a";
  ctx.fill();
  drawMiniPiece(ctx, game.next, sideX + 4, boardY + 22, panelCellSize);

  // Hold piece
  ctx.fillStyle = "#aaa";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText("HOLD", sideX, boardY + panelCellSize * 4 + 44);
  drawRoundedRect(ctx, sideX, boardY + panelCellSize * 4 + 50, panelCellSize * 4 + 8, panelCellSize * 4 + 8, 6);
  ctx.fillStyle = "#1a1a1a";
  ctx.fill();
  if (game.hold) {
    ctx.globalAlpha = game.holdUsed ? 0.4 : 1;
    drawMiniPiece(ctx, game.hold, sideX + 4, boardY + panelCellSize * 4 + 54, panelCellSize);
    ctx.globalAlpha = 1;
  }

  // Stats
  const statsY = boardY + panelCellSize * 8 + 80;
  ctx.fillStyle = "#888";
  ctx.font = "10px sans-serif";
  ctx.fillText("LEVEL", sideX, statsY);
  ctx.fillStyle = "#3ea6ff";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText(String(game.level), sideX, statsY + 18);

  ctx.fillStyle = "#888";
  ctx.font = "10px sans-serif";
  ctx.fillText("LINES", sideX, statsY + 38);
  ctx.fillStyle = "#6bcb77";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText(String(game.lines), sideX, statsY + 56);

  // Particles
  particles.render(ctx);

  // Score popups
  for (const sp of anim.scorePopups) {
    const alpha = Math.max(0, sp.life);
    const yOff = (1 - sp.life) * 40;
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${sp.combo > 1 ? 18 : 14}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = sp.combo > 1 ? "#ff6090" : "#ffd93d";
    ctx.fillText(`+${sp.value}`, sp.x, sp.y - yOff);
  }
  ctx.globalAlpha = 1;

  // Pause overlay
  if (game.paused && !game.over) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(boardX, boardY, boardW, boardH);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("暂停", boardX + boardW / 2, boardY + boardH / 2);
  }

  // Game over overlay
  if (game.over) {
    ctx.fillStyle = "rgba(15,15,15,0.75)";
    ctx.fillRect(boardX, boardY, boardW, boardH);
    ctx.fillStyle = "#ff4444";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("游戏结束", boardX + boardW / 2, boardY + boardH / 2 - 14);
    ctx.fillStyle = "#aaa";
    ctx.font = "16px sans-serif";
    ctx.fillText(`得分: ${game.score}`, boardX + boardW / 2, boardY + boardH / 2 + 18);
  }

  ctx.restore();
}

function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, time: number) {
  const s = size - 2;
  drawRoundedRect(ctx, x + 1, y + 1, s, s, 3);
  // Gradient fill
  const grad = ctx.createLinearGradient(x, y, x, y + size);
  grad.addColorStop(0, lightenColor(color, 30));
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.fill();
  // Subtle inner highlight
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

function drawMiniPiece(ctx: CanvasRenderingContext2D, type: PieceType, x: number, y: number, cellSize: number) {
  const blocks = SHAPES[type][0];
  const color = PIECE_COLORS[type];
  // Center the piece in the preview box
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (const [r, c] of blocks) {
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }
  const pw = (maxC - minC + 1) * cellSize;
  const ph = (maxR - minR + 1) * cellSize;
  const ox = x + (cellSize * 4 - pw) / 2 - minC * cellSize;
  const oy = y + (cellSize * 4 - ph) / 2 - minR * cellSize;
  for (const [r, c] of blocks) {
    const bx = ox + c * cellSize;
    const by = oy + r * cellSize;
    drawRoundedRect(ctx, bx + 1, by + 1, cellSize - 2, cellSize - 2, 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + percent);
  const g = Math.min(255, ((num >> 8) & 0xff) + percent);
  const b = Math.min(255, (num & 0xff) + percent);
  return `rgb(${r},${g},${b})`;
}


// ─── Main Component ──────────────────────────────────────────────────────────
export default function TetrisPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(null!);
  const animRef = useRef<AnimState>({
    time: 0,
    dropTimer: 0,
    lockTimer: 0,
    locking: false,
    flashRows: [],
    flashTime: 0,
    scorePopups: [],
    shakeTime: 0,
    shakeIntensity: 0,
    bgHue: 270,
    targetBgHue: 270,
  });
  const soundRef = useRef<SoundEngine>(null!);
  const particlesRef = useRef<ParticleSystem>(null!);
  const inputRef = useRef<InputHandler>(null!);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scoreSubmittedRef = useRef(false);

  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lines, setLines] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [, forceUpdate] = useState(0);

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
    } catch { /* ignore */ }
  }, []);

  // ─── Core game actions ─────────────────────────────────────────────────
  const lockPiece = useCallback(() => {
    const game = gameRef.current;
    const anim = animRef.current;
    if (!game || game.over) return;

    placePiece(game.board, game.current);
    game.holdUsed = false;

    // Check line clears
    const cleared = clearLines(game.board);
    if (cleared.length > 0) {
      anim.flashRows = cleared;
      anim.flashTime = FLASH_DURATION;

      const pts = calcScore(cleared.length, game.level);
      game.score += pts;
      game.lines += cleared.length;
      game.level = Math.floor(game.lines / 10) + 1;

      // Sound
      if (cleared.length >= 4) {
        soundRef.current?.playCombo(4);
      } else {
        soundRef.current?.playMerge(cleared.length * 100);
      }

      // Particles for each cleared row
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width / dpr;
        const ch = canvas.height / dpr;
        const cellSize = Math.floor(Math.min((cw - 140) / COLS, (ch - 20) / ROWS));
        const boardW = cellSize * COLS;
        const boardH = cellSize * ROWS;
        const boardX = Math.floor((cw - boardW - 110) / 2);
        const boardY = Math.floor((ch - boardH) / 2);

        for (const row of cleared) {
          const py = boardY + row * cellSize + cellSize / 2;
          for (let c = 0; c < COLS; c += 2) {
            const px = boardX + c * cellSize + cellSize / 2;
            particlesRef.current?.emitExplosion(px, py, "#ffd93d", 6);
          }
        }

        // Score popup
        const midRow = cleared[Math.floor(cleared.length / 2)];
        anim.scorePopups.push({
          x: boardX + boardW / 2,
          y: boardY + midRow * cellSize,
          value: pts,
          life: 1,
          combo: cleared.length >= 4 ? 2 : 1,
        });
      }

      // Level up effect
      if (Math.floor((game.lines - cleared.length) / 10) < Math.floor(game.lines / 10)) {
        soundRef.current?.playLevelUp();
        anim.targetBgHue = (anim.targetBgHue + 40) % 360;
      }

      // Delayed line removal
      setTimeout(() => {
        removeLines(game.board, cleared);
        anim.flashRows = [];
        setScore(game.score);
        setLevel(game.level);
        setLines(game.lines);
      }, FLASH_DURATION);
    }

    // Spawn next piece
    const nextType = game.next;
    if (!canSpawn(game.board, nextType)) {
      game.over = true;
      soundRef.current?.playGameOver();
      anim.shakeTime = 500;
      anim.shakeIntensity = 8;
      submitScore(game.score);
      setGameOver(true);
      setScore(game.score);
      return;
    }

    game.current = spawnPiece(nextType);
    game.next = randomPiece();
    anim.dropTimer = 0;
    anim.locking = false;
    anim.lockTimer = 0;

    setScore(game.score);
    setLevel(game.level);
    setLines(game.lines);
    forceUpdate(n => n + 1);
  }, [submitScore]);

  const moveLeft = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.over || game.paused) return;
    const moved = { ...game.current, col: game.current.col - 1 };
    if (isValid(game.board, moved)) {
      game.current = moved;
      soundRef.current?.playMove();
      if (animRef.current.locking) animRef.current.lockTimer = 0;
    }
  }, []);

  const moveRight = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.over || game.paused) return;
    const moved = { ...game.current, col: game.current.col + 1 };
    if (isValid(game.board, moved)) {
      game.current = moved;
      soundRef.current?.playMove();
      if (animRef.current.locking) animRef.current.lockTimer = 0;
    }
  }, []);

  const softDrop = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.over || game.paused) return;
    const moved = { ...game.current, row: game.current.row + 1 };
    if (isValid(game.board, moved)) {
      game.current = moved;
      game.score += 1;
      animRef.current.dropTimer = 0;
    }
  }, []);

  const hardDrop = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.over || game.paused) return;
    const ghostRow = getGhostRow(game.board, game.current);
    const dist = ghostRow - game.current.row;
    game.current.row = ghostRow;
    game.score += dist * 2;
    soundRef.current?.playScore(dist * 2);
    lockPiece();
  }, [lockPiece]);

  const rotateCW = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.over || game.paused) return;
    const rotated = tryRotate(game.board, game.current, 1);
    if (rotated) {
      game.current = rotated;
      soundRef.current?.playClick();
      if (animRef.current.locking) animRef.current.lockTimer = 0;
    }
  }, []);

  const holdPiece = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.over || game.paused || game.holdUsed) return;
    const currentType = game.current.type;
    if (game.hold) {
      game.current = spawnPiece(game.hold);
    } else {
      game.current = spawnPiece(game.next);
      game.next = randomPiece();
    }
    game.hold = currentType;
    game.holdUsed = true;
    animRef.current.dropTimer = 0;
    animRef.current.locking = false;
    animRef.current.lockTimer = 0;
    soundRef.current?.playClick();
    forceUpdate(n => n + 1);
  }, []);

  const togglePause = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.over) return;
    game.paused = !game.paused;
    setPaused(game.paused);
  }, []);

  const initGame = useCallback(() => {
    gameRef.current = initGameState();
    const anim = animRef.current;
    anim.dropTimer = 0;
    anim.lockTimer = 0;
    anim.locking = false;
    anim.flashRows = [];
    anim.flashTime = 0;
    anim.scorePopups = [];
    anim.shakeTime = 0;
    anim.targetBgHue = 270;
    scoreSubmittedRef.current = false;
    particlesRef.current?.clear();
    setScore(0);
    setLevel(1);
    setLines(0);
    setGameOver(false);
    setPaused(false);
    forceUpdate(n => n + 1);
  }, []);

  // ─── Save / Load ───────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const game = gameRef.current;
    if (!game) return {};
    return {
      board: game.board.map(r => [...r]),
      current: { ...game.current },
      next: game.next,
      hold: game.hold,
      holdUsed: game.holdUsed,
      score: game.score,
      level: game.level,
      lines: game.lines,
      over: game.over,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    try {
      const d = data as {
        board: number[][]; current: Piece; next: PieceType;
        hold: PieceType | null; holdUsed: boolean;
        score: number; level: number; lines: number; over: boolean;
      };
      if (!d || !Array.isArray(d.board) || typeof d.score !== "number") return;
      const game = gameRef.current;
      if (!game) return;
      game.board = d.board;
      game.current = d.current;
      game.next = d.next;
      game.hold = d.hold;
      game.holdUsed = d.holdUsed;
      game.score = d.score;
      game.level = d.level;
      game.lines = d.lines;
      game.over = d.over;
      game.paused = false;
      scoreSubmittedRef.current = false;
      setScore(d.score);
      setLevel(d.level);
      setLines(d.lines);
      setGameOver(d.over);
      setPaused(false);
      forceUpdate(n => n + 1);
    } catch { /* ignore malformed data */ }
  }, []);

  // ─── Direction handler for VirtualDPad ─────────────────────────────────
  const handleDirection = useCallback((dir: "up" | "down" | "left" | "right") => {
    if (dir === "left") moveLeft();
    else if (dir === "right") moveRight();
    else if (dir === "down") softDrop();
    else if (dir === "up") rotateCW();
  }, [moveLeft, moveRight, softDrop, rotateCW]);

  // ─── Initialization ────────────────────────────────────────────────────
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    particlesRef.current = new ParticleSystem(300);
    initGame();
  }, [initGame]);

  // ─── Game Loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Input handler
    inputRef.current = new InputHandler(canvas);
    inputRef.current.preventDefaults();
    inputRef.current.bindKeys({
      ArrowLeft: moveLeft,
      ArrowRight: moveRight,
      ArrowDown: softDrop,
      ArrowUp: rotateCW,
      " ": hardDrop,
      c: holdPiece,
      C: holdPiece,
      p: togglePause,
      P: togglePause,
    });
    inputRef.current.onSwipe((result) => {
      if (result.direction === "left") moveLeft();
      else if (result.direction === "right") moveRight();
      else if (result.direction === "down") softDrop();
      else if (result.direction === "up") hardDrop();
    });
    inputRef.current.onTap(() => rotateCW());

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      if (!parent) return;
      const pw = parent.clientWidth;
      const cw = Math.min(pw, 480);
      const ch = Math.min(cw * 1.6, 700);
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dt = Math.min(timestamp - lastTimeRef.current, 50);
      lastTimeRef.current = timestamp;

      const game = gameRef.current;
      const anim = animRef.current;
      if (!game) { rafRef.current = requestAnimationFrame(loop); return; }

      anim.time += dt / 1000;

      // Update shake
      if (anim.shakeTime > 0) anim.shakeTime = Math.max(0, anim.shakeTime - dt);

      // Smooth bg hue
      anim.bgHue = lerp(anim.bgHue, anim.targetBgHue, 0.02);

      // Update particles
      particlesRef.current?.update(dt / 1000);

      // Update score popups
      let i = anim.scorePopups.length;
      while (i-- > 0) {
        anim.scorePopups[i].life -= dt / 1000 * 0.8;
        if (anim.scorePopups[i].life <= 0) {
          anim.scorePopups.splice(i, 1);
        }
      }

      // Flash timer
      if (anim.flashTime > 0) {
        anim.flashTime = Math.max(0, anim.flashTime - dt);
      }

      // Game logic update (only if not paused/over/flashing)
      if (!game.over && !game.paused && anim.flashRows.length === 0) {
        anim.dropTimer += dt;
        const interval = getDropInterval(game.level);

        if (anim.dropTimer >= interval) {
          anim.dropTimer = 0;
          const moved = { ...game.current, row: game.current.row + 1 };
          if (isValid(game.board, moved)) {
            game.current = moved;
            anim.locking = false;
            anim.lockTimer = 0;
          } else {
            // Start lock delay
            if (!anim.locking) {
              anim.locking = true;
              anim.lockTimer = 0;
            }
          }
        }

        // Lock delay
        if (anim.locking) {
          anim.lockTimer += dt;
          if (anim.lockTimer >= 500) {
            lockPiece();
          }
        }
      }

      // Render
      const dpr = window.devicePixelRatio || 1;
      renderGame(ctx, canvas, game, anim, particlesRef.current, dpr);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    // Visibility change - auto pause
    const handleVisibility = () => {
      if (document.hidden && gameRef.current && !gameRef.current.over) {
        gameRef.current.paused = true;
        setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibility);
      inputRef.current?.dispose();
    };
  }, [moveLeft, moveRight, softDrop, hardDrop, rotateCW, holdPiece, togglePause, lockPiece]);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      soundRef.current?.dispose();
    };
  }, []);

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8">
        <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-white mb-3 inline-block transition">
          ← 返回游戏中心
        </Link>

        {/* Title + Score */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold text-white">
            <i className="fas fa-cubes mr-2 text-purple-400" />
            <span className="text-purple-400">俄罗斯方块</span>
          </h1>
          <div className="flex gap-2">
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">分数</div>
              <div className="font-bold text-[#3ea6ff] text-sm tabular-nums">{score.toLocaleString()}</div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">等级</div>
              <div className="font-bold text-[#f0b90b] text-sm tabular-nums">{level}</div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">行数</div>
              <div className="font-bold text-[#6bcb77] text-sm tabular-nums">{lines}</div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex gap-1.5">
            <button
              onClick={togglePause}
              disabled={gameOver}
              className="px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition disabled:opacity-30"
            >
              {paused ? "继续" : "暂停"}
            </button>
            <button
              onClick={holdPiece}
              disabled={gameOver || paused}
              className="px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition disabled:opacity-30"
            >
              暂存(C)
            </button>
          </div>
          <button
            onClick={initGame}
            className="px-3 py-1.5 rounded-lg text-xs bg-[#3ea6ff] text-[#0f0f0f] font-semibold hover:bg-[#65b8ff] transition"
          >
            新游戏
          </button>
        </div>

        {/* Canvas */}
        <div className="w-full touch-none select-none">
          <canvas
            ref={canvasRef}
            className="w-full rounded-xl"
            style={{ touchAction: "none" }}
          />
        </div>

        {/* Virtual DPad for mobile */}
        <div className="flex justify-center mt-3 md:hidden">
          <VirtualDPad onDirection={handleDirection} onAction={hardDrop} />
        </div>

        {gameOver && (
          <div className="text-center mt-3">
            <button
              onClick={initGame}
              className="px-6 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition shadow-lg shadow-[#3ea6ff]/25"
            >
              再来一局
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-[#666] mt-3">
          方向键移动 · ↑旋转 · 空格硬降 · C暂存 · P暂停
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
