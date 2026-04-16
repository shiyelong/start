"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics } from "pixi.js";
import {
  ArrowLeft, Hand, Flag, RotateCcw, Settings2, Volume2, VolumeX,
  Plus, Trophy,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
const GAME_ID = "go";

type Stone = 0 | 1 | 2; // 0=empty, 1=black, 2=white
type BoardSize = 9 | 13 | 19;
type Difficulty = "easy" | "normal" | "hard";

interface Position { r: number; c: number; }

interface GoState {
  size: BoardSize;
  board: Stone[][];
  turn: Stone; // 1=black, 2=white
  captures: [number, number]; // [black captured, white captured]
  koPoint: Position | null;
  lastMove: Position | null;
  moveHistory: { board: Stone[][]; turn: Stone; captures: [number, number]; koPoint: Position | null }[];
  consecutivePasses: number;
  gameOver: boolean;
  winner: string;
  blackTerritory: number;
  whiteTerritory: number;
  moveCount: number;
}

// ─── Star points (hoshi) ─────────────────────────────────────────────────────
const HOSHI: Record<BoardSize, Position[]> = {
  9: [
    { r: 2, c: 2 }, { r: 2, c: 6 }, { r: 6, c: 2 }, { r: 6, c: 6 }, { r: 4, c: 4 },
  ],
  13: [
    { r: 3, c: 3 }, { r: 3, c: 9 }, { r: 9, c: 3 }, { r: 9, c: 9 },
    { r: 3, c: 6 }, { r: 6, c: 3 }, { r: 6, c: 9 }, { r: 9, c: 6 }, { r: 6, c: 6 },
  ],
  19: [
    { r: 3, c: 3 }, { r: 3, c: 9 }, { r: 3, c: 15 },
    { r: 9, c: 3 }, { r: 9, c: 9 }, { r: 9, c: 15 },
    { r: 15, c: 3 }, { r: 15, c: 9 }, { r: 15, c: 15 },
  ],
};

// ─── Go Logic ────────────────────────────────────────────────────────────────
function createBoard(size: BoardSize): Stone[][] {
  return Array.from({ length: size }, () => Array(size).fill(0) as Stone[]);
}

function cloneBoard(board: Stone[][]): Stone[][] {
  return board.map(row => [...row]);
}

function boardsEqual(a: Stone[][], b: Stone[][]): boolean {
  for (let r = 0; r < a.length; r++) {
    for (let c = 0; c < a[r].length; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

function getNeighbors(r: number, c: number, size: number): Position[] {
  const n: Position[] = [];
  if (r > 0) n.push({ r: r - 1, c });
  if (r < size - 1) n.push({ r: r + 1, c });
  if (c > 0) n.push({ r, c: c - 1 });
  if (c < size - 1) n.push({ r, c: c + 1 });
  return n;
}

function getGroup(board: Stone[][], r: number, c: number): { stones: Position[]; liberties: Set<string> } {
  const size = board.length;
  const color = board[r][c];
  if (color === 0) return { stones: [], liberties: new Set() };
  const visited = new Set<string>();
  const stones: Position[] = [];
  const liberties = new Set<string>();
  const stack: Position[] = [{ r, c }];
  while (stack.length > 0) {
    const pos = stack.pop()!;
    const key = `${pos.r},${pos.c}`;
    if (visited.has(key)) continue;
    visited.add(key);
    stones.push(pos);
    for (const nb of getNeighbors(pos.r, pos.c, size)) {
      const nbKey = `${nb.r},${nb.c}`;
      if (board[nb.r][nb.c] === 0) {
        liberties.add(nbKey);
      } else if (board[nb.r][nb.c] === color && !visited.has(nbKey)) {
        stack.push(nb);
      }
    }
  }
  return { stones, liberties };
}

function removeGroup(board: Stone[][], stones: Position[]): number {
  for (const s of stones) board[s.r][s.c] = 0;
  return stones.length;
}

function opponent(s: Stone): Stone {
  return s === 1 ? 2 : 1;
}

/** Try placing a stone. Returns { valid, board, captured } or { valid: false } */
function tryPlace(
  board: Stone[][], r: number, c: number, color: Stone, koPoint: Position | null,
): { valid: boolean; newBoard: Stone[][]; captured: number; capturedSingle: Position | null } {
  if (board[r][c] !== 0) return { valid: false, newBoard: board, captured: 0, capturedSingle: null };
  // Ko check
  if (koPoint && koPoint.r === r && koPoint.c === c) {
    return { valid: false, newBoard: board, captured: 0, capturedSingle: null };
  }
  const size = board.length;
  const newBoard = cloneBoard(board);
  newBoard[r][c] = color;
  let totalCaptured = 0;
  let capturedSingle: Position | null = null;
  const opp = opponent(color);
  // Check captures of opponent groups
  for (const nb of getNeighbors(r, c, size)) {
    if (newBoard[nb.r][nb.c] === opp) {
      const group = getGroup(newBoard, nb.r, nb.c);
      if (group.liberties.size === 0) {
        if (group.stones.length === 1) capturedSingle = group.stones[0];
        totalCaptured += removeGroup(newBoard, group.stones);
      }
    }
  }
  // Suicide check
  const selfGroup = getGroup(newBoard, r, c);
  if (selfGroup.liberties.size === 0) {
    return { valid: false, newBoard: board, captured: 0, capturedSingle: null };
  }
  // If exactly one stone captured, potential ko
  if (totalCaptured === 1 && capturedSingle) {
    return { valid: true, newBoard, captured: totalCaptured, capturedSingle };
  }
  return { valid: true, newBoard, captured: totalCaptured, capturedSingle: null };
}

/** Chinese scoring: count stones + territory */
function chineseScore(board: Stone[][]): { black: number; white: number; territory: Stone[][] } {
  const size = board.length;
  const territory: Stone[][] = Array.from({ length: size }, () => Array(size).fill(0) as Stone[]);
  const visited = new Set<string>();

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== 0 || visited.has(`${r},${c}`)) continue;
      // BFS to find empty region
      const region: Position[] = [];
      const borders = new Set<Stone>();
      const stack: Position[] = [{ r, c }];
      const regionVisited = new Set<string>();
      while (stack.length > 0) {
        const pos = stack.pop()!;
        const key = `${pos.r},${pos.c}`;
        if (regionVisited.has(key)) continue;
        regionVisited.add(key);
        visited.add(key);
        region.push(pos);
        for (const nb of getNeighbors(pos.r, pos.c, size)) {
          const nbKey = `${nb.r},${nb.c}`;
          if (board[nb.r][nb.c] === 0 && !regionVisited.has(nbKey)) {
            stack.push(nb);
          } else if (board[nb.r][nb.c] !== 0) {
            borders.add(board[nb.r][nb.c]);
          }
        }
      }
      // If bordered by only one color, it's that color's territory
      if (borders.size === 1) {
        const owner = [...borders][0];
        for (const pos of region) territory[pos.r][pos.c] = owner;
      }
    }
  }

  let black = 0, white = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === 1) black++;
      else if (board[r][c] === 2) white++;
      if (territory[r][c] === 1) black++;
      else if (territory[r][c] === 2) white++;
    }
  }
  // Komi: 6.5 for white
  return { black, white: white + 6.5, territory };
}

// ─── AI ──────────────────────────────────────────────────────────────────────
function getValidMoves(board: Stone[][], color: Stone, koPoint: Position | null): Position[] {
  const size = board.length;
  const moves: Position[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== 0) continue;
      const result = tryPlace(board, r, c, color, koPoint);
      if (result.valid) moves.push({ r, c });
    }
  }
  return moves;
}

function aiMoveEasy(board: Stone[][], color: Stone, koPoint: Position | null): Position | null {
  const moves = getValidMoves(board, color, koPoint);
  if (moves.length === 0) return null;
  return moves[Math.floor(Math.random() * moves.length)];
}

function aiMoveNormal(board: Stone[][], color: Stone, koPoint: Position | null): Position | null {
  const moves = getValidMoves(board, color, koPoint);
  if (moves.length === 0) return null;
  const size = board.length;
  const opp = opponent(color);
  // Greedy: prefer moves that capture
  let bestMove: Position | null = null;
  let bestCapture = 0;
  for (const m of moves) {
    const result = tryPlace(board, m.r, m.c, color, koPoint);
    if (result.captured > bestCapture) {
      bestCapture = result.captured;
      bestMove = m;
    }
  }
  if (bestMove && bestCapture > 0) return bestMove;
  // Otherwise prefer moves near center and existing stones
  const center = Math.floor(size / 2);
  const scored = moves.map(m => {
    let score = 0;
    // Prefer near center
    const dist = Math.abs(m.r - center) + Math.abs(m.c - center);
    score -= dist * 0.5;
    // Prefer adjacent to own stones
    for (const nb of getNeighbors(m.r, m.c, size)) {
      if (board[nb.r][nb.c] === color) score += 2;
      if (board[nb.r][nb.c] === opp) score += 1;
    }
    // Avoid edges early
    if (m.r === 0 || m.r === size - 1 || m.c === 0 || m.c === size - 1) score -= 3;
    // Random factor
    score += Math.random() * 2;
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.m ?? null;
}

function aiMoveHard(board: Stone[][], color: Stone, koPoint: Position | null): Position | null {
  const moves = getValidMoves(board, color, koPoint);
  if (moves.length === 0) return null;
  const size = board.length;
  const opp = opponent(color);

  const scored = moves.map(m => {
    let score = 0;
    const result = tryPlace(board, m.r, m.c, color, koPoint);
    // Captures
    score += result.captured * 10;
    // Territory evaluation on resulting board
    if (result.valid) {
      const { black: bScore, white: wScore } = chineseScore(result.newBoard);
      score += color === 1 ? (bScore - wScore) : (wScore - bScore);
    }
    // Liberties of own group after placement
    if (result.valid) {
      const group = getGroup(result.newBoard, m.r, m.c);
      score += group.liberties.size * 0.5;
    }
    // Threaten opponent groups with few liberties
    for (const nb of getNeighbors(m.r, m.c, size)) {
      if (board[nb.r][nb.c] === opp) {
        const group = getGroup(board, nb.r, nb.c);
        if (group.liberties.size <= 2) score += (3 - group.liberties.size) * 5;
      }
    }
    // Avoid self-atari
    if (result.valid) {
      const selfGroup = getGroup(result.newBoard, m.r, m.c);
      if (selfGroup.liberties.size === 1) score -= 8;
    }
    // Center preference
    const center = Math.floor(size / 2);
    const dist = Math.abs(m.r - center) + Math.abs(m.c - center);
    score -= dist * 0.3;
    // Star point bonus
    if (HOSHI[size as BoardSize]?.some(h => h.r === m.r && h.c === m.c)) score += 2;
    // Random factor
    score += Math.random() * 1.5;
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.m ?? null;
}

function getAiMove(board: Stone[][], color: Stone, koPoint: Position | null, difficulty: Difficulty): Position | null {
  switch (difficulty) {
    case "easy": return aiMoveEasy(board, color, koPoint);
    case "normal": return aiMoveNormal(board, color, koPoint);
    case "hard": return aiMoveHard(board, color, koPoint);
  }
}

// ─── Sound helpers (Web Audio API) ───────────────────────────────────────────
class GoSound {
  private ctx: AudioContext | null = null;
  private muted = false;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  playPlace(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  }

  playCapture(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    // Two-tone capture sound
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(600 + i * 200, ctx.currentTime + i * 0.06);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + i * 0.06 + 0.15);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.06 + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.06);
      osc.stop(ctx.currentTime + i * 0.06 + 0.15);
    }
  }

  playPass(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  }

  playGameEnd(): void {
    if (this.muted) return;
    const ctx = this.getCtx();
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
      gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.3);
    });
  }

  toggleMute(): boolean { this.muted = !this.muted; return this.muted; }
  isMuted(): boolean { return this.muted; }
  dispose(): void { this.ctx?.close(); this.ctx = null; }
}



// ─── Main Component ──────────────────────────────────────────────────────────
export default function GoPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GoState>(null!);
  const soundRef = useRef<GoSound>(null!);
  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiInitRef = useRef(false);
  const scoreSubmittedRef = useRef(false);
  const animFrameRef = useRef<number>(0);
  const territoryRef = useRef<Stone[][] | null>(null);

  const [boardSize, setBoardSize] = useState<BoardSize>(9);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [playerColor] = useState<Stone>(1); // player is always black
  const [turn, setTurn] = useState<Stone>(1);
  const [captures, setCaptures] = useState<[number, number]>([0, 0]);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState("");
  const [blackScore, setBlackScore] = useState(0);
  const [whiteScore, setWhiteScore] = useState(0);
  const [moveCount, setMoveCount] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [thinking, setThinking] = useState(false);

  // ─── Init game state ─────────────────────────────────────────────────
  const initGameState = useCallback((size: BoardSize): GoState => {
    return {
      size,
      board: createBoard(size),
      turn: 1,
      captures: [0, 0],
      koPoint: null,
      lastMove: null,
      moveHistory: [],
      consecutivePasses: 0,
      gameOver: false,
      winner: "",
      blackTerritory: 0,
      whiteTerritory: 0,
      moveCount: 0,
    };
  }, []);

  // ─── Submit score ────────────────────────────────────────────────────
  const submitScore = useCallback(async (finalScore: number) => {
    if (scoreSubmittedRef.current || finalScore <= 0) return;
    scoreSubmittedRef.current = true;
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: finalScore }),
      });
    } catch { /* ignore */ }
  }, []);

  // ─── End game ────────────────────────────────────────────────────────
  const endGame = useCallback((game: GoState, reason: "score" | "resign") => {
    game.gameOver = true;
    if (reason === "resign") {
      const resignedColor = game.turn;
      game.winner = resignedColor === 1 ? "白方胜（黑方认输）" : "黑方胜（白方认输）";
      const playerWon = resignedColor !== playerColor;
      if (playerWon) submitScore(game.moveCount * 10 + 100);
    } else {
      const { black, white, territory } = chineseScore(game.board);
      territoryRef.current = territory;
      game.blackTerritory = black;
      game.whiteTerritory = white;
      if (black > white) {
        game.winner = `黑方胜 (${black} vs ${white})`;
      } else if (white > black) {
        game.winner = `白方胜 (${white} vs ${black})`;
      } else {
        game.winner = "平局";
      }
      setBlackScore(black);
      setWhiteScore(white);
      const playerIsBlack = playerColor === 1;
      const playerScore = playerIsBlack ? black : white;
      const oppScore = playerIsBlack ? white : black;
      if (playerScore > oppScore) submitScore(Math.round(playerScore * 10));
    }
    soundRef.current?.playGameEnd();
    setGameOver(true);
    setWinner(game.winner);
  }, [playerColor, submitScore]);

  // ─── AI move ─────────────────────────────────────────────────────────
  const doAiMove = useCallback((game: GoState) => {
    if (game.gameOver) return;
    const aiColor = opponent(playerColor);
    if (game.turn !== aiColor) return;
    setThinking(true);
    setTimeout(() => {
      const move = getAiMove(game.board, aiColor, game.koPoint, difficulty);
      if (!move) {
        // AI passes
        game.consecutivePasses++;
        game.turn = opponent(game.turn);
        game.moveCount++;
        soundRef.current?.playPass();
        if (game.consecutivePasses >= 2) {
          endGame(game, "score");
        }
        setTurn(game.turn);
        setMoveCount(game.moveCount);
      } else {
        const result = tryPlace(game.board, move.r, move.c, aiColor, game.koPoint);
        if (result.valid) {
          game.moveHistory.push({
            board: cloneBoard(game.board),
            turn: game.turn,
            captures: [...game.captures] as [number, number],
            koPoint: game.koPoint,
          });
          game.board = result.newBoard;
          game.lastMove = move;
          game.consecutivePasses = 0;
          game.moveCount++;
          if (result.captured > 0) {
            if (aiColor === 1) game.captures[0] += result.captured;
            else game.captures[1] += result.captured;
            soundRef.current?.playCapture();
          } else {
            soundRef.current?.playPlace();
          }
          game.koPoint = result.capturedSingle
            ? { r: result.capturedSingle.r, c: result.capturedSingle.c }
            : null;
          game.turn = opponent(game.turn);
          setTurn(game.turn);
          setCaptures([...game.captures]);
          setMoveCount(game.moveCount);
        }
      }
      setThinking(false);
    }, 300 + Math.random() * 200);
  }, [playerColor, difficulty, endGame]);

  // ─── Place stone (player) ────────────────────────────────────────────
  const placeStone = useCallback((r: number, c: number) => {
    const game = gameRef.current;
    if (!game || game.gameOver || game.turn !== playerColor || thinking) return;
    const result = tryPlace(game.board, r, c, playerColor, game.koPoint);
    if (!result.valid) return;

    game.moveHistory.push({
      board: cloneBoard(game.board),
      turn: game.turn,
      captures: [...game.captures] as [number, number],
      koPoint: game.koPoint,
    });
    game.board = result.newBoard;
    game.lastMove = { r, c };
    game.consecutivePasses = 0;
    game.moveCount++;
    if (result.captured > 0) {
      if (playerColor === 1) game.captures[0] += result.captured;
      else game.captures[1] += result.captured;
      soundRef.current?.playCapture();
    } else {
      soundRef.current?.playPlace();
    }
    game.koPoint = result.capturedSingle
      ? { r: result.capturedSingle.r, c: result.capturedSingle.c }
      : null;
    game.turn = opponent(game.turn);
    setTurn(game.turn);
    setCaptures([...game.captures]);
    setMoveCount(game.moveCount);
    territoryRef.current = null;

    // Trigger AI
    setTimeout(() => doAiMove(game), 100);
  }, [playerColor, thinking, doAiMove]);

  // ─── Pass ────────────────────────────────────────────────────────────
  const handlePass = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.gameOver || game.turn !== playerColor || thinking) return;
    game.moveHistory.push({
      board: cloneBoard(game.board),
      turn: game.turn,
      captures: [...game.captures] as [number, number],
      koPoint: game.koPoint,
    });
    game.consecutivePasses++;
    game.turn = opponent(game.turn);
    game.moveCount++;
    game.koPoint = null;
    game.lastMove = null;
    soundRef.current?.playPass();
    if (game.consecutivePasses >= 2) {
      endGame(game, "score");
    } else {
      setTurn(game.turn);
      setMoveCount(game.moveCount);
      setTimeout(() => doAiMove(game), 100);
    }
  }, [playerColor, thinking, doAiMove, endGame]);

  // ─── Resign ──────────────────────────────────────────────────────────
  const handleResign = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.gameOver) return;
    endGame(game, "resign");
  }, [endGame]);

  // ─── Undo ────────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.gameOver || game.moveHistory.length < 2) return;
    // Undo both player and AI moves
    for (let i = 0; i < 2 && game.moveHistory.length > 0; i++) {
      const prev = game.moveHistory.pop()!;
      game.board = prev.board;
      game.turn = prev.turn;
      game.captures = prev.captures;
      game.koPoint = prev.koPoint;
    }
    game.lastMove = null;
    game.consecutivePasses = 0;
    game.moveCount = Math.max(0, game.moveCount - 2);
    setTurn(game.turn);
    setCaptures([...game.captures]);
    setMoveCount(game.moveCount);
    territoryRef.current = null;
  }, []);

  // ─── New game ────────────────────────────────────────────────────────
  const startNewGame = useCallback((size?: BoardSize) => {
    const s = size ?? boardSize;
    const game = initGameState(s);
    gameRef.current = game;
    scoreSubmittedRef.current = false;
    territoryRef.current = null;
    setTurn(1);
    setCaptures([0, 0]);
    setGameOver(false);
    setWinner("");
    setBlackScore(0);
    setWhiteScore(0);
    setMoveCount(0);
    setThinking(false);
    setShowSettings(false);
  }, [boardSize, initGameState]);

  // ─── Save / Load ────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const game = gameRef.current;
    if (!game) return null;
    return {
      size: game.size,
      board: game.board,
      turn: game.turn,
      captures: game.captures,
      koPoint: game.koPoint,
      lastMove: game.lastMove,
      consecutivePasses: game.consecutivePasses,
      moveCount: game.moveCount,
      difficulty,
    };
  }, [difficulty]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as {
      size: BoardSize; board: Stone[][]; turn: Stone;
      captures: [number, number]; koPoint: Position | null;
      lastMove: Position | null; consecutivePasses: number;
      moveCount: number; difficulty: Difficulty;
    };
    const game = initGameState(d.size);
    game.board = d.board;
    game.turn = d.turn;
    game.captures = d.captures;
    game.koPoint = d.koPoint;
    game.lastMove = d.lastMove;
    game.consecutivePasses = d.consecutivePasses;
    game.moveCount = d.moveCount;
    gameRef.current = game;
    setBoardSize(d.size);
    setDifficulty(d.difficulty);
    setTurn(d.turn);
    setCaptures([...d.captures]);
    setMoveCount(d.moveCount);
    setGameOver(false);
    setWinner("");
    territoryRef.current = null;
  }, [initGameState]);

  // ─── PixiJS rendering ──────────────────────────────────────────────
  const drawBoard = useCallback(async () => {
    if (!pixiGfxRef.current || !pixiAppRef.current) return;
    const game = gameRef.current;
    if (!game) return;
    const pixi = await loadPixi();
    const g = pixiGfxRef.current;
    const app = pixiAppRef.current;
    const W = app.screen.width;
    const H = app.screen.height;
    const size = game.size;
    const padding = size === 19 ? 20 : size === 13 ? 28 : 32;
    const cellSize = Math.floor((Math.min(W, H) - padding * 2) / (size - 1));
    const boardPixels = cellSize * (size - 1);
    const ox = Math.floor((W - boardPixels) / 2);
    const oy = Math.floor((H - boardPixels) / 2);
    const stoneRadius = Math.floor(cellSize * 0.45);

    g.clear();

    // Wood background
    g.rect(0, 0, W, H).fill({ color: 0xd4a76a });
    // Subtle wood grain
    for (let i = 0; i < 30; i++) {
      const y = (i / 30) * H;
      g.rect(0, y, W, 2).fill({ color: 0xc89b5e, alpha: 0.3 + Math.sin(i * 0.7) * 0.15 });
    }

    // Grid lines
    for (let i = 0; i < size; i++) {
      const x = ox + i * cellSize;
      const y = oy + i * cellSize;
      g.moveTo(x, oy).lineTo(x, oy + boardPixels).stroke({ color: 0x2a1a0a, width: 1, alpha: 0.8 });
      g.moveTo(ox, y).lineTo(ox + boardPixels, y).stroke({ color: 0x2a1a0a, width: 1, alpha: 0.8 });
    }

    // Star points (hoshi)
    const hoshiPoints = HOSHI[size] || [];
    for (const h of hoshiPoints) {
      const hx = ox + h.c * cellSize;
      const hy = oy + h.r * cellSize;
      g.circle(hx, hy, size === 19 ? 3.5 : 3).fill({ color: 0x2a1a0a });
    }

    // Territory overlay (when game is over)
    const terr = territoryRef.current;
    if (terr && game.gameOver) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (terr[r][c] !== 0) {
            const tx = ox + c * cellSize;
            const ty = oy + r * cellSize;
            const tColor = terr[r][c] === 1 ? 0x000000 : 0xffffff;
            g.rect(tx - cellSize * 0.15, ty - cellSize * 0.15, cellSize * 0.3, cellSize * 0.3)
              .fill({ color: tColor, alpha: 0.3 });
          }
        }
      }
    }

    // Stones
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const stone = game.board[r][c];
        if (stone === 0) continue;
        const sx = ox + c * cellSize;
        const sy = oy + r * cellSize;

        if (stone === 1) {
          // Black stone: dark gradient with highlight
          g.circle(sx, sy, stoneRadius).fill({ color: 0x1a1a1a });
          // Shadow
          g.circle(sx + 1, sy + 1, stoneRadius).fill({ color: 0x000000, alpha: 0.3 });
          // Main stone
          g.circle(sx, sy, stoneRadius).fill({ color: 0x222222 });
          // 3D highlight
          g.circle(sx - stoneRadius * 0.25, sy - stoneRadius * 0.25, stoneRadius * 0.35)
            .fill({ color: 0x555555, alpha: 0.4 });
          g.circle(sx - stoneRadius * 0.15, sy - stoneRadius * 0.15, stoneRadius * 0.15)
            .fill({ color: 0x888888, alpha: 0.3 });
        } else {
          // White stone: light gradient with shadow
          g.circle(sx + 1.5, sy + 1.5, stoneRadius).fill({ color: 0x000000, alpha: 0.2 });
          // Main stone
          g.circle(sx, sy, stoneRadius).fill({ color: 0xf0f0f0 });
          // 3D highlight
          g.circle(sx - stoneRadius * 0.25, sy - stoneRadius * 0.25, stoneRadius * 0.35)
            .fill({ color: 0xffffff, alpha: 0.6 });
          g.circle(sx - stoneRadius * 0.15, sy - stoneRadius * 0.15, stoneRadius * 0.15)
            .fill({ color: 0xffffff, alpha: 0.4 });
          // Subtle edge
          g.circle(sx, sy, stoneRadius).stroke({ color: 0xcccccc, width: 0.5 });
        }
      }
    }

    // Last move indicator
    if (game.lastMove && !game.gameOver) {
      const lx = ox + game.lastMove.c * cellSize;
      const ly = oy + game.lastMove.r * cellSize;
      const lastStone = game.board[game.lastMove.r][game.lastMove.c];
      const dotColor = lastStone === 1 ? 0xffffff : 0x000000;
      g.circle(lx, ly, stoneRadius * 0.2).fill({ color: dotColor, alpha: 0.8 });
    }

    // Ko point indicator
    if (game.koPoint && !game.gameOver) {
      const kx = ox + game.koPoint.c * cellSize;
      const ky = oy + game.koPoint.r * cellSize;
      g.rect(kx - 3, ky - 3, 6, 6).stroke({ color: 0xff4444, width: 1.5 });
    }
  }, []);

  // ─── Canvas click handler ──────────────────────────────────────────
  const handleCanvasInteraction = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const game = gameRef.current;
    if (!canvas || !game || game.gameOver || thinking) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    const size = game.size;
    const padding = size === 19 ? 20 : size === 13 ? 28 : 32;
    const W = canvas.width;
    const H = canvas.height;
    const cellSize = Math.floor((Math.min(W, H) - padding * 2) / (size - 1));
    const boardPixels = cellSize * (size - 1);
    const ox = Math.floor((W - boardPixels) / 2);
    const oy = Math.floor((H - boardPixels) / 2);

    const col = Math.round((x - ox) / cellSize);
    const row = Math.round((y - oy) / cellSize);
    if (row >= 0 && row < size && col >= 0 && col < size) {
      placeStone(row, col);
    }
  }, [placeStone, thinking]);

  // ─── PixiJS init + render loop ─────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || pixiInitRef.current) return;
    pixiInitRef.current = true;
    soundRef.current = new GoSound();
    gameRef.current = initGameState(boardSize);

    let destroyed = false;

    (async () => {
      const pixi = await loadPixi();
      if (destroyed) return;
      const canvas = canvasRef.current!;
      const parent = canvas.parentElement!;
      const w = Math.min(parent.clientWidth, 600);
      const h = w; // square board

      const app = await createPixiApp({
        canvas,
        width: w,
        height: h,
        backgroundColor: 0xd4a76a,
        antialias: true,
      });
      if (destroyed) { app.destroy(); return; }
      pixiAppRef.current = app;

      const gfx = new pixi.Graphics();
      app.stage.addChild(gfx);
      pixiGfxRef.current = gfx;

      // Render loop
      const renderLoop = () => {
        if (destroyed) return;
        drawBoard();
        animFrameRef.current = requestAnimationFrame(renderLoop);
      };
      renderLoop();
    })();

    return () => {
      destroyed = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      pixiAppRef.current?.destroy();
      pixiAppRef.current = null;
      pixiGfxRef.current = null;
      pixiInitRef.current = false;
      soundRef.current?.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw when board size changes (new game)
  useEffect(() => {
    if (!pixiAppRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const parent = canvas.parentElement!;
    const w = Math.min(parent.clientWidth, 600);
    const h = w;
    pixiAppRef.current.renderer.resize(w, h);
  }, [boardSize]);

  // ─── Toggle mute ──────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const m = soundRef.current?.toggleMute() ?? false;
    setMuted(m);
  }, []);

  // ─── Board size change ────────────────────────────────────────────
  const changeBoardSize = useCallback((size: BoardSize) => {
    setBoardSize(size);
    startNewGame(size);
  }, [startNewGame]);

  const turnLabel = turn === 1 ? "黑方" : "白方";
  const isPlayerTurn = turn === playerColor;

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0f0f0f] text-white pb-24 lg:pb-8">
        {/* Top bar */}
        <div className="max-w-[700px] mx-auto px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <Link
              href="/games"
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#3ea6ff] transition"
            >
              <ArrowLeft size={16} />
              返回游戏
            </Link>
            <h1 className="text-lg font-bold text-[#3ea6ff]">围棋</h1>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleMute}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition"
                title={muted ? "开启音效" : "关闭音效"}
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition"
                title="设置"
              >
                <Settings2 size={18} />
              </button>
            </div>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="mb-3 p-3 rounded-xl bg-[#1a1a1a] border border-[#333] space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">棋盘大小</label>
                <div className="flex gap-2">
                  {([9, 13, 19] as BoardSize[]).map(s => (
                    <button
                      key={s}
                      onClick={() => changeBoardSize(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        boardSize === s
                          ? "bg-[#3ea6ff] text-[#0f0f0f]"
                          : "bg-[#2a2a2a] text-gray-300 hover:bg-[#333]"
                      }`}
                    >
                      {s}x{s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">AI 难度</label>
                <div className="flex gap-2">
                  {(["easy", "normal", "hard"] as Difficulty[]).map(d => (
                    <button
                      key={d}
                      onClick={() => { setDifficulty(d); startNewGame(); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        difficulty === d
                          ? "bg-[#3ea6ff] text-[#0f0f0f]"
                          : "bg-[#2a2a2a] text-gray-300 hover:bg-[#333]"
                      }`}
                    >
                      {d === "easy" ? "简单" : d === "normal" ? "普通" : "困难"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Score bar */}
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#1a1a1a] border border-[#333] mb-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-[#222] border border-[#555]" />
              <span className="text-sm font-medium">黑方</span>
              <span className="text-xs text-gray-400">提子 {captures[0]}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className={`text-xs font-bold ${isPlayerTurn ? "text-[#3ea6ff]" : "text-[#f0b90b]"}`}>
                {thinking ? "AI思考中..." : `${turnLabel}落子`}
              </span>
              <span className="text-[10px] text-gray-500">第 {moveCount} 手</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">提子 {captures[1]}</span>
              <span className="text-sm font-medium">白方</span>
              <div className="w-4 h-4 rounded-full bg-[#f0f0f0] border border-[#ccc]" />
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="max-w-[700px] mx-auto px-4">
          <div className="relative w-full" style={{ maxWidth: 600, margin: "0 auto" }}>
            <canvas
              ref={canvasRef}
              className="w-full rounded-xl shadow-lg cursor-pointer touch-none"
              style={{ aspectRatio: "1/1" }}
              onClick={(e) => handleCanvasInteraction(e.clientX, e.clientY)}
              onTouchStart={(e) => {
                e.preventDefault();
                const touch = e.touches[0];
                if (touch) handleCanvasInteraction(touch.clientX, touch.clientY);
              }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="max-w-[700px] mx-auto px-4 mt-3">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={handlePass}
              disabled={gameOver || !isPlayerTurn || thinking}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2a2a2a] border border-[#444] text-sm text-gray-200 hover:bg-[#333] transition disabled:opacity-40"
            >
              <Hand size={16} />
              虚手(Pass)
            </button>
            <button
              onClick={handleResign}
              disabled={gameOver}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2a2a2a] border border-[#444] text-sm text-gray-200 hover:bg-[#333] transition disabled:opacity-40"
            >
              <Flag size={16} />
              认输
            </button>
            <button
              onClick={handleUndo}
              disabled={gameOver || !isPlayerTurn || thinking || moveCount < 2}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2a2a2a] border border-[#444] text-sm text-gray-200 hover:bg-[#333] transition disabled:opacity-40"
            >
              <RotateCcw size={16} />
              悔棋
            </button>
            <button
              onClick={() => startNewGame()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3ea6ff]/10 border border-[#3ea6ff]/30 text-sm text-[#3ea6ff] hover:bg-[#3ea6ff]/20 transition"
            >
              <Plus size={16} />
              新局
            </button>
          </div>
        </div>

        {/* Game over overlay */}
        {gameOver && (
          <div className="max-w-[700px] mx-auto px-4 mt-4">
            <div className="p-4 rounded-xl bg-[#1a1a1a] border border-[#3ea6ff]/30 text-center space-y-2">
              <div className="flex items-center justify-center gap-2">
                <Trophy size={20} className="text-[#f0b90b]" />
                <span className="text-lg font-bold text-[#3ea6ff]">对局结束</span>
              </div>
              <p className="text-sm text-gray-200">{winner}</p>
              {blackScore > 0 && (
                <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
                  <span>黑方目数: {blackScore}</span>
                  <span>白方目数: {whiteScore}</span>
                  <span className="text-[10px]">(贴目 6.5)</span>
                </div>
              )}
              <button
                onClick={() => startNewGame()}
                className="mt-2 px-6 py-2 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition shadow-lg shadow-[#3ea6ff]/25"
              >
                再来一局
              </button>
            </div>
          </div>
        )}

        {/* Info */}
        <p className="text-center text-[10px] text-[#666] mt-3 px-4">
          点击棋盘落子 · 贴目6.5 · 中国规则计分
        </p>

        {/* Leaderboard & Save/Load */}
        <div className="max-w-[700px] mx-auto px-4 mt-4 space-y-3">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </>
  );
}
