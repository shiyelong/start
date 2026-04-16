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
import { lerp, updateShake, updateScorePopups } from "@/lib/game-engine/animation-utils";
import type { ScorePopup, ShakeState } from "@/lib/game-engine/animation-utils";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

// ─── Types ───────────────────────────────────────────────
interface GameState {
  puzzle: number[][];      // original puzzle (0 = empty)
  solution: number[][];    // full solution
  board: number[][];       // current player board
  notes: number[][][];     // notes[r][c] = array of candidate numbers
  selected: [number, number] | null;
  errors: Set<string>;     // "r,c" keys for incorrect cells
  won: boolean;
  score: number;
  difficulty: number;      // 0=easy, 1=medium, 2=hard
  notesMode: boolean;
  time: number;            // elapsed seconds
  paused: boolean;
  moves: number;
}

interface AnimState {
  time: number;
  bgHue: number;
  targetBgHue: number;
  shake: ShakeState;
  scorePopups: ScorePopup[];
  selectGlow: number;      // pulsing glow on selected cell
  winFadeIn: number;
  errorFlash: Map<string, number>; // "r,c" → remaining flash time
  lastTimestamp: number;
}

// ─── Constants ───────────────────────────────────────────
const GAME_ID = "sudoku";
const BOARD_PADDING = 8;
const THICK_LINE = 2.5;
const THIN_LINE = 0.8;

const DIFFS = ["简单", "中等", "困难"];
const REMOVE_COUNTS = [35, 45, 55];

const COLOR_CELL_BG = 0x111111;
const COLOR_CELL_SELECTED = 0x3ea6ff;
const COLOR_CELL_SAME_NUM = 0x3ea6ff;
const COLOR_CELL_RELATED = 0x1a1a2e;
const COLOR_GRID_LINE = 0x333333;
const COLOR_GRID_THICK = 0x555555;
const COLOR_ACCENT = "#3ea6ff";
const COLOR_ERROR_STR = "#ff4444";
const COLOR_PLAYER_STR = "#3ea6ff";

function hexToNum(hex: string): number {
  if (hex.startsWith("#")) return parseInt(hex.slice(1, 7), 16);
  return 0xffffff;
}

// ─── Sudoku Generator (Pure Functions) ───────────────────
function generateSudoku(difficulty: number): { puzzle: number[][]; solution: number[][] } {
  const solution: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  function isValid(board: number[][], r: number, c: number, num: number): boolean {
    for (let i = 0; i < 9; i++) { if (board[r][i] === num || board[i][c] === num) return false; }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let i = br; i < br + 3; i++) for (let j = bc; j < bc + 3; j++) { if (board[i][j] === num) return false; }
    return true;
  }
  function solve(board: number[][]): boolean {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (board[r][c] === 0) {
        const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);
        for (const n of nums) {
          if (isValid(board, r, c, n)) { board[r][c] = n; if (solve(board)) return true; board[r][c] = 0; }
        }
        return false;
      }
    }
    return true;
  }
  solve(solution);
  const puzzle = solution.map(r => [...r]);
  const remove = REMOVE_COUNTS[difficulty] ?? 35;
  const cells = Array.from({ length: 81 }, (_, i) => i).sort(() => Math.random() - 0.5);
  for (let i = 0; i < remove; i++) {
    const r = Math.floor(cells[i] / 9), c = cells[i] % 9;
    puzzle[r][c] = 0;
  }
  return { puzzle, solution };
}

function isOriginal(puzzle: number[][], r: number, c: number): boolean {
  return puzzle[r][c] !== 0;
}

function checkErrors(board: number[][], solution: number[][]): Set<string> {
  const errors = new Set<string>();
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
    if (board[i][j] !== 0 && board[i][j] !== solution[i][j]) errors.add(`${i},${j}`);
  }
  return errors;
}

function isSolved(board: number[][], solution: number[][]): boolean {
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
    if (board[i][j] !== solution[i][j]) return false;
  }
  return true;
}

function calculateScore(difficulty: number, timeSeconds: number): number {
  const base = [1000, 2000, 3000][difficulty] ?? 1000;
  const timeBonus = Math.max(0, 600 - timeSeconds);
  return Math.max(100, base + timeBonus * 2);
}

function createEmptyNotes(): number[][][] {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => []));
}

function initGameState(difficulty: number): GameState {
  const { puzzle, solution } = generateSudoku(difficulty);
  return {
    puzzle,
    solution,
    board: puzzle.map(r => [...r]),
    notes: createEmptyNotes(),
    selected: null,
    errors: new Set(),
    won: false,
    score: 0,
    difficulty,
    notesMode: false,
    time: 0,
    paused: false,
    moves: 0,
  };
}

// ─── Component ───────────────────────────────────────────
export default function SudokuPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(null!);
  const animRef = useRef<AnimState>({
    time: 0,
    bgHue: 220,
    targetBgHue: 220,
    shake: { time: 0, intensity: 0 },
    scorePopups: [],
    selectGlow: 0,
    winFadeIn: 0,
    errorFlash: new Map(),
    lastTimestamp: 0,
  });
  const soundRef = useRef<SoundEngine>(null!);
  const particlesRef = useRef<ParticleSystem>(null!);
  const inputRef = useRef<InputHandler>(null!);
  const scoreSubmittedRef = useRef(false);

  // PixiJS refs
  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());
  const pixiInitRef = useRef(false);
  const canvasSizeRef = useRef({ w: 420, h: 436 });

  // React UI state (only for elements outside canvas)
  const [score, setScore] = useState(0);
  const [won, setWon] = useState(false);
  const [difficulty, setDifficulty] = useState(0);
  const [paused, setPaused] = useState(false);
  const [notesMode, setNotesMode] = useState(false);
  const [displayTime, setDisplayTime] = useState(0);
  const [, forceUpdate] = useState(0);

  // Initialize sound + particles
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    particlesRef.current = new ParticleSystem(300);
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

  // Init game
  const initGame = useCallback((diff: number) => {
    gameRef.current = initGameState(diff);
    const anim = animRef.current;
    anim.scorePopups = [];
    anim.shake = { time: 0, intensity: 0 };
    anim.winFadeIn = 0;
    anim.targetBgHue = 220;
    anim.errorFlash = new Map();
    particlesRef.current?.clear();
    scoreSubmittedRef.current = false;
    setScore(0);
    setWon(false);
    setPaused(false);
    setNotesMode(false);
    setDisplayTime(0);
    forceUpdate(n => n + 1);
  }, []);

  // Handle cell click on canvas
  const handleCellClick = useCallback((canvasX: number, canvasY: number) => {
    const game = gameRef.current;
    if (!game || game.won || game.paused) return;

    const w = canvasSizeRef.current.w;

    const maxBoardWidth = Math.min(w - 16, 420);
    const boardSize = maxBoardWidth;
    const boardX = (w - boardSize) / 2;
    const boardY = 8;
    const cellSize = (boardSize - BOARD_PADDING * 2) / 9;
    const innerX = boardX + BOARD_PADDING;
    const innerY = boardY + BOARD_PADDING;

    const relX = canvasX - innerX;
    const relY = canvasY - innerY;
    if (relX < 0 || relY < 0) return;

    const col = Math.floor(relX / cellSize);
    const row = Math.floor(relY / cellSize);
    if (row < 0 || row >= 9 || col < 0 || col >= 9) return;

    game.selected = [row, col];
    soundRef.current?.playClick();
    forceUpdate(n => n + 1);
  }, []);

  // Place number
  const placeNumber = useCallback((num: number) => {
    const game = gameRef.current;
    if (!game || !game.selected || game.won || game.paused) return;
    const [r, c] = game.selected;
    if (isOriginal(game.puzzle, r, c)) return;

    if (game.notesMode) {
      // Toggle note
      const notes = game.notes[r][c];
      const idx = notes.indexOf(num);
      if (idx >= 0) {
        notes.splice(idx, 1);
      } else {
        notes.push(num);
      }
      soundRef.current?.playClick();
      forceUpdate(n => n + 1);
      return;
    }

    // Place or toggle number
    const oldVal = game.board[r][c];
    game.board[r][c] = num === oldVal ? 0 : num;
    game.notes[r][c] = []; // clear notes when placing
    game.moves++;

    // Check errors
    game.errors = checkErrors(game.board, game.solution);

    const w = canvasSizeRef.current.w;
    const maxBoardWidth = Math.min(w - 16, 420);
    const boardSize = maxBoardWidth;
    const boardX = (w - boardSize) / 2;
    const boardY = 8;
    const cellSize = (boardSize - BOARD_PADDING * 2) / 9;
    const innerX = boardX + BOARD_PADDING;
    const innerY = boardY + BOARD_PADDING;
    const pcx = innerX + c * cellSize + cellSize / 2;
    const pcy = innerY + r * cellSize + cellSize / 2;

    if (game.board[r][c] !== 0 && game.errors.has(`${r},${c}`)) {
      // Error
      soundRef.current?.playError();
      animRef.current.errorFlash.set(`${r},${c}`, 0.5);
      animRef.current.shake = { time: 0.15, intensity: 3 };
      particlesRef.current?.emitSpark(pcx, pcy, COLOR_ERROR_STR);
    } else if (game.board[r][c] !== 0) {
      // Correct placement
      soundRef.current?.playTone(400 + num * 40, 0.1, "sine");
      particlesRef.current?.emitSpark(pcx, pcy, COLOR_PLAYER_STR);
    } else {
      // Cleared
      soundRef.current?.playClick();
    }

    // Check win
    if (isSolved(game.board, game.solution)) {
      game.won = true;
      game.score = calculateScore(game.difficulty, game.time);
      animRef.current.targetBgHue = 120;

      // Celebration
      const centerX = boardX + boardSize / 2;
      const centerY = boardY + boardSize / 2;
      particlesRef.current?.emitCelebration(centerX, centerY);
      particlesRef.current?.emitCelebration(centerX - 60, centerY - 40);
      particlesRef.current?.emitCelebration(centerX + 60, centerY - 40);

      soundRef.current?.playLevelUp();
      animRef.current.shake = { time: 0.3, intensity: 4 };
      animRef.current.scorePopups.push({
        x: centerX, y: centerY - 20,
        value: game.score, life: 1.5, combo: 1,
      });

      submitScore(game.score);
      setWon(true);
      setScore(game.score);
    }

    forceUpdate(n => n + 1);
  }, [submitScore]);

  // Clear selected cell
  const clearCell = useCallback(() => {
    const game = gameRef.current;
    if (!game || !game.selected || game.won || game.paused) return;
    const [r, c] = game.selected;
    if (isOriginal(game.puzzle, r, c)) return;
    game.board[r][c] = 0;
    game.notes[r][c] = [];
    game.errors = checkErrors(game.board, game.solution);
    soundRef.current?.playClick();
    forceUpdate(n => n + 1);
  }, []);

  // Toggle notes mode
  const toggleNotes = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    game.notesMode = !game.notesMode;
    setNotesMode(game.notesMode);
  }, []);

  // Toggle pause
  const togglePause = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.won) return;
    game.paused = !game.paused;
    setPaused(game.paused);
  }, []);

  // Save/Load
  const handleSave = useCallback(() => {
    const game = gameRef.current;
    if (!game) return {};
    return {
      puzzle: game.puzzle.map(r => [...r]),
      solution: game.solution.map(r => [...r]),
      board: game.board.map(r => [...r]),
      notes: game.notes.map(r => r.map(c => [...c])),
      difficulty: game.difficulty,
      time: game.time,
      moves: game.moves,
      won: game.won,
      score: game.score,
      selected: game.selected,
      notesMode: game.notesMode,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    try {
      const d = data as {
        puzzle: number[][]; solution: number[][]; board: number[][];
        notes: number[][][]; difficulty: number; time: number;
        moves: number; won: boolean; score: number;
        selected: [number, number] | null; notesMode: boolean;
      };
      if (!d || !Array.isArray(d.puzzle) || !Array.isArray(d.solution) || !Array.isArray(d.board)) return;
      if (typeof d.difficulty !== "number" || typeof d.time !== "number") return;
      const game = gameRef.current;
      if (!game) return;
      game.puzzle = d.puzzle;
      game.solution = d.solution;
      game.board = d.board;
      game.notes = d.notes || createEmptyNotes();
      game.difficulty = d.difficulty;
      game.time = d.time;
      game.moves = d.moves || 0;
      game.won = d.won;
      game.score = d.score;
      game.selected = d.selected || null;
      game.notesMode = d.notesMode || false;
      game.paused = false;
      game.errors = checkErrors(game.board, game.solution);
      animRef.current.scorePopups = [];
      animRef.current.errorFlash = new Map();
      animRef.current.winFadeIn = 0;
      particlesRef.current?.clear();
      scoreSubmittedRef.current = false;
      setDifficulty(d.difficulty);
      setScore(d.score);
      setWon(d.won);
      setPaused(false);
      setNotesMode(d.notesMode || false);
      setDisplayTime(d.time);
      forceUpdate(n => n + 1);
    } catch { /* ignore malformed data */ }
  }, []);

  // ─── Init game on mount ──────────────────────────────────
  useEffect(() => {
    initGame(difficulty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── PixiJS Render Loop ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;

    async function initPixi() {
      if (pixiInitRef.current || destroyed) return;
      pixiInitRef.current = true;

      const parent = canvas!.parentElement;
      if (!parent) return;
      const pw = parent.clientWidth;
      const maxBoardWidth = Math.min(pw - 16, 420);
      const W = pw;
      const H = maxBoardWidth + 16;
      canvasSizeRef.current = { w: W, h: H };

      const pixi = await loadPixi();
      if (destroyed) return;

      const app = await createPixiApp({
        canvas: canvas!,
        width: W,
        height: H,
        backgroundColor: 0x0f0f0f,
        antialias: true,
      });
      if (destroyed) { app.destroy(true); return; }
      pixiAppRef.current = app;

      const g = new pixi.Graphics();
      app.stage.addChild(g);
      pixiGfxRef.current = g;

      const textContainer = new pixi.Container();
      app.stage.addChild(textContainer);
      const texts = pixiTextsRef.current;
      texts.clear();

      const makeText = (key: string, opts: { fontSize?: number; fill?: string | number; fontWeight?: string }) => {
        const t = new pixi.Text({ text: "", style: new pixi.TextStyle({
          fontSize: opts.fontSize ?? 12,
          fill: opts.fill ?? "#ffffff",
          fontWeight: (opts.fontWeight ?? "normal") as "normal" | "bold",
          fontFamily: "sans-serif",
        })});
        t.visible = false;
        textContainer.addChild(t);
        texts.set(key, t);
      };

      // Pre-create text pool (80 objects)
      for (let i = 0; i < 80; i++) makeText(`t${i}`, { fontSize: 12 });

      let textIdx = 0;
      const showText = (text: string, x: number, y: number, opts?: {
        fill?: string; fontSize?: number; fontWeight?: string;
        ax?: number; ay?: number; alpha?: number;
      }) => {
        if (textIdx >= 80) return;
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

      app.ticker.add(() => {
        if (destroyed) return;
        g.clear();
        texts.forEach(tx => { tx.visible = false; });
        textIdx = 0;

        const game = gameRef.current;
        const anim = animRef.current;
        if (!game) return;

        // Delta time
        const now = performance.now();
        const rawDt = anim.lastTimestamp ? now - anim.lastTimestamp : 16;
        anim.lastTimestamp = now;
        const dt = Math.min(rawDt, 50) / 1000;

        if (!game.paused) {
          anim.time += dt;
          anim.selectGlow += dt;

          // Timer
          if (!game.won) {
            game.time += dt;
            if (Math.floor(game.time * 2) !== Math.floor((game.time - dt) * 2)) {
              setDisplayTime(game.time);
            }
          }

          // Update shake
          updateShake(anim.shake, dt);

          // Update score popups
          updateScorePopups(anim.scorePopups, dt);

          // Update particles
          particlesRef.current?.update(dt);

          // Update error flashes
          for (const [key, time] of Array.from(anim.errorFlash)) {
            const newTime = time - dt;
            if (newTime <= 0) anim.errorFlash.delete(key);
            else anim.errorFlash.set(key, newTime);
          }

          // Smooth bg hue
          anim.bgHue = lerp(anim.bgHue, anim.targetBgHue, 0.03);

          // Win fade in
          if (game.won && anim.winFadeIn < 1) {
            anim.winFadeIn = Math.min(1, anim.winFadeIn + dt * 2);
          }
        }

        // ─── Render ──────────────────────────────────────
        const w = canvasSizeRef.current.w;
        const h = canvasSizeRef.current.h;

        // Background gradient (approximate with rects)
        const hue = Math.floor(anim.bgHue);
        g.rect(0, 0, w, h).fill({ color: 0x0f0f0f });
        // Subtle gradient overlay
        const gradColor = hslToHex(hue, 40, 8);
        g.rect(0, 0, w, h).fill({ color: gradColor, alpha: 0.5 });

        // Apply shake offset
        const shakeX = anim.shake.time > 0 ? (Math.random() - 0.5) * anim.shake.intensity * 2 : 0;
        const shakeY = anim.shake.time > 0 ? (Math.random() - 0.5) * anim.shake.intensity * 2 : 0;

        // Board layout
        const maxBW = Math.min(w - 16, 420);
        const boardSize = maxBW;
        const boardX = (w - boardSize) / 2 + shakeX;
        const boardY = 8 + shakeY;
        const cellSize = (boardSize - BOARD_PADDING * 2) / 9;

        // Board background
        g.roundRect(boardX, boardY, boardSize, boardSize, 10).fill({ color: 0x0f0f0f, alpha: 0.6 });

        const innerX = boardX + BOARD_PADDING;
        const innerY = boardY + BOARD_PADDING;
        const innerSize = boardSize - BOARD_PADDING * 2;

        // Draw cell backgrounds
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            const cx = innerX + c * cellSize;
            const cy = innerY + r * cellSize;
            const sel = game.selected;

            let bgColor = COLOR_CELL_BG;
            let bgAlpha = 1;
            if (sel) {
              const [sr, sc] = sel;
              const isSel = sr === r && sc === c;
              const sameNum = game.board[r][c] !== 0 && game.board[r][c] === game.board[sr][sc];
              const sameRow = sr === r;
              const sameCol = sc === c;
              const sameBox = Math.floor(sr / 3) === Math.floor(r / 3) && Math.floor(sc / 3) === Math.floor(c / 3);

              if (isSel) {
                bgColor = COLOR_CELL_SELECTED;
                bgAlpha = 0.25;
              } else if (sameNum) {
                bgColor = COLOR_CELL_SAME_NUM;
                bgAlpha = 0.10;
              } else if (sameRow || sameCol || sameBox) {
                bgColor = COLOR_CELL_RELATED;
                bgAlpha = 1;
              }
            }

            g.rect(cx, cy, cellSize, cellSize).fill({ color: bgColor, alpha: bgAlpha });

            // Error flash overlay
            const errKey = `${r},${c}`;
            const flashTime = anim.errorFlash.get(errKey);
            if (flashTime && flashTime > 0) {
              const flashAlpha = Math.min(1, flashTime * 3) * 0.3;
              g.rect(cx, cy, cellSize, cellSize).fill({ color: 0xff4444, alpha: flashAlpha });
            }
          }
        }

        // Selected cell glow
        if (game.selected && !game.won) {
          const [sr, sc] = game.selected;
          const gcx = innerX + sc * cellSize + cellSize / 2;
          const gcy = innerY + sr * cellSize + cellSize / 2;
          const glowIntensity = 0.2 + 0.1 * Math.sin(anim.selectGlow * 3);
          const glowR = cellSize * 0.45;
          g.circle(gcx, gcy, glowR).fill({ color: hexToNum(COLOR_ACCENT), alpha: glowIntensity });
        }

        // Draw grid lines - thin
        for (let i = 1; i < 9; i++) {
          if (i % 3 !== 0) {
            // Thin horizontal
            g.rect(innerX, innerY + i * cellSize - THIN_LINE / 2, innerSize, THIN_LINE)
              .fill({ color: COLOR_GRID_LINE });
            // Thin vertical
            g.rect(innerX + i * cellSize - THIN_LINE / 2, innerY, THIN_LINE, innerSize)
              .fill({ color: COLOR_GRID_LINE });
          }
        }

        // Thick lines for 3×3 boxes
        for (let i = 0; i <= 3; i++) {
          // Horizontal
          g.rect(innerX, innerY + i * 3 * cellSize - THICK_LINE / 2, innerSize, THICK_LINE)
            .fill({ color: COLOR_GRID_THICK });
          // Vertical
          g.rect(innerX + i * 3 * cellSize - THICK_LINE / 2, innerY, THICK_LINE, innerSize)
            .fill({ color: COLOR_GRID_THICK });
        }

        // Draw numbers and notes
        const fontSize = Math.max(12, cellSize * 0.5);
        const noteFontSize = Math.max(6, cellSize * 0.2);

        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            const cx = innerX + c * cellSize + cellSize / 2;
            const cy = innerY + r * cellSize + cellSize / 2;
            const val = game.board[r][c];

            if (val !== 0) {
              const isOrig = isOriginal(game.puzzle, r, c);
              const isErr = game.errors.has(`${r},${c}`);
              const color = isErr ? "#ff4444" : isOrig ? "#ffffff" : "#3ea6ff";

              showText(String(val), cx, cy, {
                fill: color, fontSize, fontWeight: "bold", ax: 0.5, ay: 0.5,
              });
            } else {
              // Draw notes
              const noteArr = game.notes[r]?.[c];
              if (noteArr && noteArr.length > 0) {
                const noteSet = new Set(noteArr);
                const subCellW = cellSize / 3;
                const subCellH = cellSize / 3;
                const baseX = innerX + c * cellSize;
                const baseY = innerY + r * cellSize;
                for (let n = 1; n <= 9; n++) {
                  if (noteSet.has(n)) {
                    const nc = (n - 1) % 3;
                    const nr = Math.floor((n - 1) / 3);
                    const nx = baseX + nc * subCellW + subCellW / 2;
                    const ny = baseY + nr * subCellH + subCellH / 2;
                    showText(String(n), nx, ny, {
                      fill: "#666666", fontSize: noteFontSize, ax: 0.5, ay: 0.5,
                    });
                  }
                }
              }
            }
          }
        }

        // Score popups
        for (const popup of anim.scorePopups) {
          if (popup.life > 0) {
            const alpha = Math.min(1, popup.life * 2);
            showText(`+${popup.value}`, popup.x + shakeX, popup.y - (1.5 - popup.life) * 40 + shakeY, {
              fill: "#ffd700", fontSize: 18, fontWeight: "bold", ax: 0.5, ay: 0.5, alpha,
            });
          }
        }

        // Pause overlay
        if (game.paused && !game.won) {
          g.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.6 });
          showText("已暂停", w / 2, h / 2, {
            fill: "#ffffff", fontSize: 28, fontWeight: "bold", ax: 0.5, ay: 0.5,
          });
          showText("点击继续", w / 2, h / 2 + 36, {
            fill: "#8a8a8a", fontSize: 14, ax: 0.5, ay: 0.5,
          });
        }
      });
    }

    initPixi();

    return () => {
      destroyed = true;
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true);
        pixiAppRef.current = null;
      }
      pixiGfxRef.current = null;
      pixiTextsRef.current.clear();
      pixiInitRef.current = false;
    };
  }, [difficulty]);

  // ─── Input ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const w = canvasSizeRef.current.w;
      const h = canvasSizeRef.current.h;
      const scaleX = w / rect.width;
      const scaleY = h / rect.height;
      handleCellClick((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
    };
    canvas.addEventListener("click", onClick);

    const input = new InputHandler(canvas);
    input.onTap((x, y) => {
      const rect = canvas.getBoundingClientRect();
      const w = canvasSizeRef.current.w;
      const h = canvasSizeRef.current.h;
      const scaleX = w / rect.width;
      const scaleY = h / rect.height;
      handleCellClick(x * scaleX, y * scaleY);
    });
    input.preventDefaults();
    inputRef.current = input;

    // Keyboard: number keys to place, arrow keys to move selection
    const onKeyDown = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || game.won || game.paused) return;
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        e.preventDefault();
        placeNumber(num);
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        e.preventDefault();
        clearCell();
        return;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        toggleNotes();
        return;
      }
      // Arrow keys
      if (game.selected) {
        const [r, c] = game.selected;
        let nr = r, nc = c;
        if (e.key === "ArrowUp") nr = Math.max(0, r - 1);
        else if (e.key === "ArrowDown") nr = Math.min(8, r + 1);
        else if (e.key === "ArrowLeft") nc = Math.max(0, c - 1);
        else if (e.key === "ArrowRight") nc = Math.min(8, c + 1);
        else return;
        e.preventDefault();
        game.selected = [nr, nc];
        soundRef.current?.playClick();
        forceUpdate(n => n + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      canvas.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKeyDown);
      input.dispose();
    };
  }, [handleCellClick, placeNumber, clearCell, toggleNotes]);

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
      soundRef.current?.dispose();
      inputRef.current?.dispose();
      particlesRef.current?.clear();
    };
  }, []);

  const newGame = useCallback((diff: number) => {
    setDifficulty(diff);
    initGame(diff);
  }, [initGame]);

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

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
            <span className="text-[#3ea6ff]">? 数独</span>
          </h1>
          <div className="flex gap-2">
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">时间</div>
              <div className="font-bold text-[#3ea6ff] text-sm tabular-nums">{formatTime(displayTime)}</div>
            </div>
            {won && (
              <div className="text-center px-3 py-1.5 rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/30">
                <div className="text-[10px] text-[#22c55e]">得分</div>
                <div className="font-bold text-[#22c55e] text-sm tabular-nums">{score}</div>
              </div>
            )}
          </div>
        </div>

        {/* Difficulty + controls */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex gap-1">
            {DIFFS.map((d, i) => (
              <button
                key={i}
                onClick={() => newGame(i)}
                className={`px-2.5 py-1 rounded-lg text-xs border transition ${
                  difficulty === i
                    ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-bold"
                    : "text-[#aaa] border-[#333] hover:text-white hover:border-[#555]"
                }`}
              >
                {d}
              </button>
            ))}
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

        {/* Number pad (React buttons below canvas for better touch UX) */}
        <div className="flex justify-center gap-1.5 mt-3 mb-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button
              key={n}
              onClick={() => placeNumber(n)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#212121] border border-[#333] text-sm font-bold text-[#ccc] hover:bg-[#2a2a2a] active:scale-90 transition"
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-center gap-2 mb-3">
          <button
            onClick={clearCell}
            className="px-4 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white transition"
          >
            ? 清除
          </button>
          <button
            onClick={toggleNotes}
            className={`px-4 py-1.5 rounded-lg text-xs border transition ${
              notesMode
                ? "border-[#f0b90b]/30 text-[#f0b90b] bg-[#f0b90b]/10"
                : "border-[#333] text-[#aaa]"
            }`}
          >
            ? 笔记{notesMode ? " ON" : ""}
          </button>
          <button
            onClick={() => newGame(difficulty)}
            className="px-4 py-1.5 rounded-lg text-xs bg-[#3ea6ff] text-[#0f0f0f] font-semibold hover:bg-[#5bb8ff] transition"
          >
            新游戏
          </button>
        </div>

        {/* Win overlay */}
        {won && (
          <div className="text-center mt-2">
            <p className="text-3xl mb-1">?</p>
            <p className="text-lg font-bold text-[#22c55e]">完美解答！</p>
            <p className="text-[#8a8a8a] text-sm mb-3">
              用时 {formatTime(displayTime)} · 得分 {score}
            </p>
            <button
              onClick={() => newGame(difficulty)}
              className="px-6 py-2 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#5bb8ff] transition"
            >
              新游戏
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-[#666] mt-3">
          点击格子选中 · 数字键填入 · N键切换笔记 · 方向键移动
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

// ─── Helper: HSL to hex number ───────────────────────────
function hslToHex(h: number, s: number, l: number): number {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * Math.max(0, Math.min(1, color)));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}
