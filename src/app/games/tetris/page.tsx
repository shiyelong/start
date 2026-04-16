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
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";
import {
  ArrowLeft, ArrowRight, ArrowDown, RotateCw, ChevronsDown, Archive, Blocks,
} from "lucide-react";

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
  const ghost = { ...piece };
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

/** Convert "#rrggbb" hex to numeric 0xRRGGBB for PixiJS */
function hexToNum(hex: string): number {
  return parseInt(hex.slice(1, 7), 16);
}

/** Lighten a hex color by adding to each channel */
function lightenHex(hex: string, amount: number): number {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + amount);
  const g = Math.min(255, ((num >> 8) & 0xff) + amount);
  const b = Math.min(255, (num & 0xff) + amount);
  return (r << 16) | (g << 8) | b;
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
  const lastTimeRef = useRef<number>(0);
  const scoreSubmittedRef = useRef(false);

  // PixiJS refs
  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());
  const pixiInitRef = useRef(false);

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
        const cw = canvas.clientWidth || 480;
        const ch = canvas.clientHeight || 700;
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

  // ─── Initialization ────────────────────────────────────────────────────
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    particlesRef.current = new ParticleSystem(300);
    initGame();
  }, [initGame]);

  // ─── PixiJS Game Loop ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;

    // Input handler (independent of renderer)
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

    // Resize canvas to fit parent
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const pw = parent.clientWidth;
      const cw = Math.min(pw, 480);
      const ch = Math.min(cw * 1.6, 700);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      if (pixiAppRef.current) {
        pixiAppRef.current.renderer.resize(cw, ch);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    async function initPixi() {
      if (pixiInitRef.current || destroyed) return;
      pixiInitRef.current = true;

      const pixi = await loadPixi();
      if (destroyed) return;

      const parent = canvas!.parentElement;
      const pw = parent ? parent.clientWidth : 480;
      const cw = Math.min(pw, 480);
      const ch = Math.min(cw * 1.6, 700);

      const app = await createPixiApp({
        canvas: canvas!,
        width: cw,
        height: ch,
        backgroundColor: 0x0f0f0f,
        antialias: true,
      });
      if (destroyed) { app.destroy(true); return; }
      pixiAppRef.current = app;

      // Graphics layer
      const g = new pixi.Graphics();
      app.stage.addChild(g);
      pixiGfxRef.current = g;

      // Text pool container
      const textContainer = new pixi.Container();
      app.stage.addChild(textContainer);
      const texts = pixiTextsRef.current;
      texts.clear();

      const makeText = (key: string, opts: { fontSize?: number; fill?: string | number; fontWeight?: string }) => {
        const t = new pixi.Text({ text: "", style: new pixi.TextStyle({
          fontSize: opts.fontSize ?? 12,
          fill: opts.fill ?? "#ffffff",
          fontWeight: (opts.fontWeight ?? "normal") as "normal" | "bold",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        })});
        t.visible = false;
        textContainer.addChild(t);
        texts.set(key, t);
      };

      // Pre-create text pool (70 objects)
      for (let i = 0; i < 70; i++) makeText(`t${i}`, { fontSize: 12 });

      let textIdx = 0;
      const showText = (text: string, x: number, y: number, opts?: {
        fill?: string; fontSize?: number; fontWeight?: string;
        ax?: number; ay?: number; alpha?: number;
      }) => {
        if (textIdx >= 70) return;
        const t = texts.get(`t${textIdx}`)!;
        textIdx++;
        t.text = text;
        t.x = x; t.y = y;
        t.anchor.set(opts?.ax ?? 0, opts?.ay ?? 0);
        t.alpha = opts?.alpha ?? 1;
        t.style.fill = opts?.fill ?? "#ffffff";
        t.style.fontSize = opts?.fontSize ?? 12;
        t.style.fontWeight = (opts?.fontWeight ?? "normal") as "normal" | "bold";
        t.visible = true;
      };

      const cn = hexToNum;

      // ─── Ticker (render loop) ──────────────────────────────────────
      app.ticker.add((ticker) => {
        if (destroyed) return;

        const dt = Math.min(ticker.deltaMS, 50);
        const game = gameRef.current;
        const anim = animRef.current;
        if (!game) return;

        // Reset graphics & text pool each frame
        g.clear();
        texts.forEach(tx => { tx.visible = false; });
        textIdx = 0;

        anim.time += dt / 1000;

        // Update shake
        if (anim.shakeTime > 0) anim.shakeTime = Math.max(0, anim.shakeTime - dt);

        // Smooth bg hue
        anim.bgHue = lerp(anim.bgHue, anim.targetBgHue, 0.02);

        // Update particles
        particlesRef.current?.update(dt / 1000);

        // Update score popups
        let si = anim.scorePopups.length;
        while (si-- > 0) {
          anim.scorePopups[si].life -= dt / 1000 * 0.8;
          if (anim.scorePopups[si].life <= 0) {
            anim.scorePopups.splice(si, 1);
          }
        }

        // Flash timer
        if (anim.flashTime > 0) {
          anim.flashTime = Math.max(0, anim.flashTime - dt);
        }

        // ─── Game logic update ─────────────────────────────────────
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
              if (!anim.locking) {
                anim.locking = true;
                anim.lockTimer = 0;
              }
            }
          }

          if (anim.locking) {
            anim.lockTimer += dt;
            if (anim.lockTimer >= 500) {
              lockPiece();
            }
          }
        }

        // ─── Render with PixiJS ────────────────────────────────────
        const w = app.renderer.width / (app.renderer.resolution || 1);
        const h = app.renderer.height / (app.renderer.resolution || 1);

        // Screen shake offset
        let shakeX = 0, shakeY = 0;
        if (anim.shakeTime > 0) {
          const mag = anim.shakeIntensity * (anim.shakeTime / 500);
          shakeX = (Math.random() - 0.5) * mag;
          shakeY = (Math.random() - 0.5) * mag;
        }
        app.stage.x = shakeX;
        app.stage.y = shakeY;

        // Background gradient (approximate with two rects)
        const hue = anim.bgHue;
        const bgTop = hslToNum(hue, 10, 12);
        const bgBot = hslToNum(hue, 10, 6);
        g.rect(0, 0, w, h / 2).fill({ color: bgTop });
        g.rect(0, h / 2, w, h / 2).fill({ color: bgBot });

        // Layout calculations
        const cellSize = Math.floor(Math.min((w - 140) / COLS, (h - 20) / ROWS));
        const boardW = cellSize * COLS;
        const boardH = cellSize * ROWS;
        const boardX = Math.floor((w - boardW - 110) / 2);
        const boardY = Math.floor((h - boardH) / 2);
        const sideX = boardX + boardW + 12;

        // Board background
        g.roundRect(boardX - 4, boardY - 4, boardW + 8, boardH + 8, 6).fill({ color: 0x111111 });
        g.roundRect(boardX - 4, boardY - 4, boardW + 8, boardH + 8, 6).stroke({ color: 0x333333, width: 1 });

        // Grid lines
        for (let r = 1; r < ROWS; r++) {
          g.moveTo(boardX, boardY + r * cellSize)
           .lineTo(boardX + boardW, boardY + r * cellSize)
           .stroke({ color: 0xffffff, width: 0.5, alpha: 0.04 });
        }
        for (let c = 1; c < COLS; c++) {
          g.moveTo(boardX + c * cellSize, boardY)
           .lineTo(boardX + c * cellSize, boardY + boardH)
           .stroke({ color: 0xffffff, width: 0.5, alpha: 0.04 });
        }

        // Draw placed blocks
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const val = game.board[r][c];
            if (val === 0) continue;
            const color = INDEX_TO_COLOR[val] || "#888";
            const bx = boardX + c * cellSize;
            const by = boardY + r * cellSize;

            // Flash effect for clearing rows
            if (anim.flashRows.includes(r) && anim.flashTime > 0) {
              const flashT = anim.flashTime / FLASH_DURATION;
              const alpha = Math.sin(flashT * Math.PI * 3) * 0.5 + 0.5;
              g.roundRect(bx + 1, by + 1, cellSize - 2, cellSize - 2, 3)
               .fill({ color: 0xffffff, alpha });
              continue;
            }

            // Block with lighter top
            const lightColor = lightenHex(color, 30);
            g.roundRect(bx + 1, by + 1, cellSize - 2, (cellSize - 2) / 2, 3)
             .fill({ color: lightColor });
            g.roundRect(bx + 1, by + 1 + (cellSize - 2) / 2, cellSize - 2, (cellSize - 2) / 2, 3)
             .fill({ color: cn(color) });
            g.roundRect(bx + 1, by + 1, cellSize - 2, cellSize - 2, 3)
             .stroke({ color: 0xffffff, width: 0.5, alpha: 0.15 });
          }
        }

        // Draw ghost piece
        if (!game.over && !game.paused) {
          const ghostRow = getGhostRow(game.board, game.current);
          const ghostBlocks = SHAPES[game.current.type][game.current.rotation].map(
            ([r, c]) => [ghostRow + r, game.current.col + c]
          );
          const ghostColor = cn(PIECE_COLORS[game.current.type]);
          for (const [r, c] of ghostBlocks) {
            if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
              g.roundRect(boardX + c * cellSize + 1, boardY + r * cellSize + 1, cellSize - 2, cellSize - 2, 3)
               .fill({ color: ghostColor, alpha: 0.2 });
            }
          }
        }

        // Draw current piece
        if (!game.over) {
          const blocks = getBlocks(game.current);
          const color = PIECE_COLORS[game.current.type];
          for (const [r, c] of blocks) {
            if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
              const bx = boardX + c * cellSize;
              const by = boardY + r * cellSize;
              const lightColor = lightenHex(color, 30);
              g.roundRect(bx + 1, by + 1, cellSize - 2, (cellSize - 2) / 2, 3)
               .fill({ color: lightColor });
              g.roundRect(bx + 1, by + 1 + (cellSize - 2) / 2, cellSize - 2, (cellSize - 2) / 2, 3)
               .fill({ color: cn(color) });
              g.roundRect(bx + 1, by + 1, cellSize - 2, cellSize - 2, 3)
               .stroke({ color: 0xffffff, width: 0.5, alpha: 0.15 });
            }
          }
        }

        // ─── Side panel ────────────────────────────────────────────
        const panelCellSize = Math.floor(cellSize * 0.7);

        // Next piece preview
        showText("NEXT", sideX, boardY + 4, { fill: "#aaaaaa", fontSize: 11, fontWeight: "bold" });
        g.roundRect(sideX, boardY + 18, panelCellSize * 4 + 8, panelCellSize * 4 + 8, 6)
         .fill({ color: 0x1a1a1a });
        drawMiniPiecePixi(g, game.next, sideX + 4, boardY + 22, panelCellSize);

        // Hold piece
        showText("HOLD", sideX, boardY + panelCellSize * 4 + 36, { fill: "#aaaaaa", fontSize: 11, fontWeight: "bold" });
        g.roundRect(sideX, boardY + panelCellSize * 4 + 50, panelCellSize * 4 + 8, panelCellSize * 4 + 8, 6)
         .fill({ color: 0x1a1a1a });
        if (game.hold) {
          drawMiniPiecePixi(g, game.hold, sideX + 4, boardY + panelCellSize * 4 + 54, panelCellSize, game.holdUsed ? 0.4 : 1);
        }

        // Stats
        const statsY = boardY + panelCellSize * 8 + 80;
        showText("LEVEL", sideX, statsY, { fill: "#888888", fontSize: 10 });
        showText(String(game.level), sideX, statsY + 14, { fill: "#3ea6ff", fontSize: 16, fontWeight: "bold" });
        showText("LINES", sideX, statsY + 38, { fill: "#888888", fontSize: 10 });
        showText(String(game.lines), sideX, statsY + 52, { fill: "#6bcb77", fontSize: 16, fontWeight: "bold" });

        // ─── Particles (rendered as PixiJS rects) ──────────────────
        const particles = particlesRef.current;
        if (particles) {
          const active = (particles as unknown as { active: { x: number; y: number; life: number; maxLife: number; color: string; size: number; rotation?: number; fadeMode?: string }[] }).active;
          for (let pi = 0; pi < active.length; pi++) {
            const p = active[pi];
            const t = p.maxLife > 0 ? p.life / p.maxLife : 0;
            const alpha = p.fadeMode === "ease" ? t * t : t;
            if (alpha <= 0) continue;
            g.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
             .fill({ color: cn(p.color), alpha });
          }
        }

        // Score popups
        for (const sp of anim.scorePopups) {
          const alpha = Math.max(0, sp.life);
          const yOff = (1 - sp.life) * 40;
          showText(`+${sp.value}`, sp.x, sp.y - yOff, {
            fill: sp.combo > 1 ? "#ff6090" : "#ffd93d",
            fontSize: sp.combo > 1 ? 18 : 14,
            fontWeight: "bold",
            ax: 0.5, ay: 0.5,
            alpha,
          });
        }

        // Pause overlay
        if (game.paused && !game.over) {
          g.rect(boardX, boardY, boardW, boardH).fill({ color: 0x000000, alpha: 0.6 });
          showText("暂停", boardX + boardW / 2, boardY + boardH / 2, {
            fill: "#ffffff", fontSize: 24, fontWeight: "bold", ax: 0.5, ay: 0.5,
          });
        }

        // Game over overlay
        if (game.over) {
          g.rect(boardX, boardY, boardW, boardH).fill({ color: 0x0f0f0f, alpha: 0.75 });
          showText("游戏结束", boardX + boardW / 2, boardY + boardH / 2 - 14, {
            fill: "#ff4444", fontSize: 26, fontWeight: "bold", ax: 0.5, ay: 0.5,
          });
          showText(`得分: ${game.score}`, boardX + boardW / 2, boardY + boardH / 2 + 18, {
            fill: "#aaaaaa", fontSize: 16, ax: 0.5, ay: 0.5,
          });
        }
      });
    }

    initPixi();

    // Visibility change - auto pause
    const handleVisibility = () => {
      if (document.hidden && gameRef.current && !gameRef.current.over) {
        gameRef.current.paused = true;
        setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      destroyed = true;
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibility);
      inputRef.current?.dispose();
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true);
        pixiAppRef.current = null;
      }
      pixiGfxRef.current = null;
      pixiTextsRef.current.clear();
      pixiInitRef.current = false;
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
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Blocks className="w-6 h-6 text-purple-400" />
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

        {/* Mobile Touch Controls */}
        <div className="mt-3 md:hidden select-none" style={{ touchAction: "none" }}>
          <div className="flex items-start justify-between gap-3">
            {/* Left side: Rotate + directional row */}
            <div className="flex flex-col items-center gap-2">
              {/* Rotate button centered above */}
              <button
                className="w-[4.5rem] h-12 rounded-xl bg-[#1a1a1a] border border-[#444] text-[#ccc] flex items-center justify-center active:bg-[#3ea6ff]/30 active:border-[#3ea6ff]/60 active:text-[#3ea6ff] transition-colors"
                style={{ touchAction: "none" }}
                onTouchStart={(e) => { e.preventDefault(); rotateCW(); }}
                aria-label="旋转"
              >
                <RotateCw className="w-6 h-6" />
              </button>
              {/* ← ↓ → row */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  className="w-[3.5rem] h-14 rounded-xl bg-[#1a1a1a] border border-[#444] text-[#ccc] flex items-center justify-center active:bg-[#3ea6ff]/30 active:border-[#3ea6ff]/60 active:text-[#3ea6ff] transition-colors"
                  style={{ touchAction: "none" }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    moveLeft();
                    const id = setInterval(moveLeft, 150);
                    const stop = () => { clearInterval(id); document.removeEventListener("touchend", stop); document.removeEventListener("touchcancel", stop); };
                    document.addEventListener("touchend", stop, { once: true });
                    document.addEventListener("touchcancel", stop, { once: true });
                  }}
                  aria-label="左移"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <button
                  className="w-[3.5rem] h-14 rounded-xl bg-[#1a1a1a] border border-[#444] text-[#ccc] flex items-center justify-center active:bg-[#6bcb77]/30 active:border-[#6bcb77]/60 active:text-[#6bcb77] transition-colors"
                  style={{ touchAction: "none" }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    softDrop();
                    const id = setInterval(softDrop, 150);
                    const stop = () => { clearInterval(id); document.removeEventListener("touchend", stop); document.removeEventListener("touchcancel", stop); };
                    document.addEventListener("touchend", stop, { once: true });
                    document.addEventListener("touchcancel", stop, { once: true });
                  }}
                  aria-label="软降"
                >
                  <ArrowDown className="w-6 h-6" />
                </button>
                <button
                  className="w-[3.5rem] h-14 rounded-xl bg-[#1a1a1a] border border-[#444] text-[#ccc] flex items-center justify-center active:bg-[#3ea6ff]/30 active:border-[#3ea6ff]/60 active:text-[#3ea6ff] transition-colors"
                  style={{ touchAction: "none" }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    moveRight();
                    const id = setInterval(moveRight, 150);
                    const stop = () => { clearInterval(id); document.removeEventListener("touchend", stop); document.removeEventListener("touchcancel", stop); };
                    document.addEventListener("touchend", stop, { once: true });
                    document.addEventListener("touchcancel", stop, { once: true });
                  }}
                  aria-label="右移"
                >
                  <ArrowRight className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Right side: Hard drop + Hold */}
            <div className="flex flex-col items-center gap-2">
              <button
                className="w-24 h-[4.5rem] rounded-xl bg-[#f0b90b]/10 border-2 border-[#f0b90b]/40 text-[#f0b90b] flex flex-col items-center justify-center gap-0.5 active:bg-[#f0b90b]/30 active:border-[#f0b90b]/70 transition-colors font-bold"
                style={{ touchAction: "none" }}
                onTouchStart={(e) => { e.preventDefault(); hardDrop(); }}
                aria-label="硬降"
              >
                <ChevronsDown className="w-7 h-7" />
                <span className="text-xs">硬降</span>
              </button>
              <button
                className="w-24 h-12 rounded-xl bg-[#1a1a1a] border border-[#444] text-[#aaa] flex items-center justify-center gap-1.5 active:bg-purple-500/20 active:border-purple-400/50 active:text-purple-300 transition-colors"
                style={{ touchAction: "none" }}
                onTouchStart={(e) => { e.preventDefault(); holdPiece(); }}
                aria-label="暂存"
              >
                <Archive className="w-5 h-5" />
                <span className="text-xs font-medium">暂存</span>
              </button>
            </div>
          </div>
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

// ─── PixiJS Helper: Draw mini piece in preview box ───────────────────────────
function drawMiniPiecePixi(
  g: PixiGraphics, type: PieceType, x: number, y: number, cellSize: number, alpha: number = 1,
) {
  const blocks = SHAPES[type][0];
  const color = hexToNum(PIECE_COLORS[type]);
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
    g.roundRect(bx + 1, by + 1, cellSize - 2, cellSize - 2, 2)
     .fill({ color, alpha });
  }
}

// ─── HSL to numeric color ────────────────────────────────────────────────────
function hslToNum(h: number, s: number, l: number): number {
  const sl = s / 100;
  const ll = l / 100;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  const r = Math.round(f(0) * 255);
  const g = Math.round(f(8) * 255);
  const b = Math.round(f(4) * 255);
  return (r << 16) | (g << 8) | b;
}
