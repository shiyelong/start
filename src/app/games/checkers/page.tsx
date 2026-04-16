"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics } from "pixi.js";
import { ArrowLeft, Crown, Volume2, VolumeX, RotateCcw } from "lucide-react";

// ─── Types & Constants ───────────────────────────────────────────────────────
const GAME_ID = "checkers";
const BOARD_SIZE = 8;

const EMPTY = 0;
const RED = 1;       // 红方 (player)
const BLACK = 2;     // 黑方 (AI)
const RED_KING = 3;
const BLACK_KING = 4;

const LIGHT_SQ = 0xe8d5b5;
const DARK_SQ = 0x2d5016;
const RED_COLOR = 0xcc0000;
const BLACK_COLOR = 0x333333;
const HIGHLIGHT_COLOR = 0x3ea6ff;
const VALID_MOVE_COLOR = 0xffff00;

type Board = number[][];
interface Pos { r: number; c: number; }
interface Move { from: Pos; to: Pos; captures: Pos[]; }

function isRed(p: number) { return p === RED || p === RED_KING; }
function isBlack(p: number) { return p === BLACK || p === BLACK_KING; }
function isKing(p: number) { return p === RED_KING || p === BLACK_KING; }
function isOwn(p: number, side: number) { return side === RED ? isRed(p) : isBlack(p); }
function isEnemy(p: number, side: number) { return side === RED ? isBlack(p) : isRed(p); }

function cloneBoard(b: Board): Board { return b.map(r => [...r]); }

function createInitialBoard(): Board {
  const b: Board = Array.from({ length: 8 }, () => Array(8).fill(EMPTY));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) b[r][c] = BLACK;
    }
  }
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) b[r][c] = RED;
    }
  }
  return b;
}

// ─── Move Generation ─────────────────────────────────────────────────────────
function getCaptures(board: Board, r: number, c: number, side: number): Move[] {
  const piece = board[r][c];
  if (!isOwn(piece, side)) return [];
  const dirs = isKing(piece)
    ? [[-1,-1],[-1,1],[1,-1],[1,1]]
    : side === RED ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
  // Also allow backward captures for non-kings
  const capDirs = isKing(piece)
    ? [[-1,-1],[-1,1],[1,-1],[1,1]]
    : [[-1,-1],[-1,1],[1,-1],[1,1]];

  const results: Move[] = [];

  function dfs(board: Board, cr: number, cc: number, captured: Pos[]) {
    let found = false;
    for (const [dr, dc] of capDirs) {
      const mr = cr + dr, mc = cc + dc;
      const lr = cr + 2 * dr, lc = cc + 2 * dc;
      if (lr < 0 || lr >= 8 || lc < 0 || lc >= 8) continue;
      if (!isEnemy(board[mr][mc], side)) continue;
      if (board[lr][lc] !== EMPTY) continue;
      if (captured.some(p => p.r === mr && p.c === mc)) continue;
      found = true;
      const nb = cloneBoard(board);
      nb[lr][lc] = nb[cr][cc];
      nb[cr][cc] = EMPTY;
      nb[mr][mc] = EMPTY;
      const newCap = [...captured, { r: mr, c: mc }];
      dfs(nb, lr, lc, newCap);
    }
    if (!found && captured.length > 0) {
      results.push({ from: { r, c }, to: { r: cr, c: cc }, captures: captured });
    }
  }
  dfs(board, r, c, []);
  return results;
}

function getSimpleMoves(board: Board, r: number, c: number, side: number): Move[] {
  const piece = board[r][c];
  if (!isOwn(piece, side)) return [];
  const dirs = isKing(piece)
    ? [[-1,-1],[-1,1],[1,-1],[1,1]]
    : side === RED ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
  const moves: Move[] = [];
  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
    if (board[nr][nc] !== EMPTY) continue;
    moves.push({ from: { r, c }, to: { r: nr, c: nc }, captures: [] });
  }
  return moves;
}

function getAllMoves(board: Board, side: number): Move[] {
  let allCaptures: Move[] = [];
  let allSimple: Move[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (!isOwn(board[r][c], side)) continue;
      allCaptures = allCaptures.concat(getCaptures(board, r, c, side));
      allSimple = allSimple.concat(getSimpleMoves(board, r, c, side));
    }
  }
  // Mandatory captures
  if (allCaptures.length > 0) {
    // Prefer longest capture chain
    const maxLen = Math.max(...allCaptures.map(m => m.captures.length));
    return allCaptures.filter(m => m.captures.length === maxLen);
  }
  return allSimple;
}

function applyMove(board: Board, move: Move): Board {
  const b = cloneBoard(board);
  const piece = b[move.from.r][move.from.c];
  b[move.from.r][move.from.c] = EMPTY;
  b[move.to.r][move.to.c] = piece;
  for (const cap of move.captures) {
    b[cap.r][cap.c] = EMPTY;
  }
  // Promotion
  if (isRed(piece) && move.to.r === 0) b[move.to.r][move.to.c] = RED_KING;
  if (isBlack(piece) && move.to.r === 7) b[move.to.r][move.to.c] = BLACK_KING;
  return b;
}

// ─── AI: Minimax with Alpha-Beta ─────────────────────────────────────────────
function evaluate(board: Board): number {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p === RED) score += 10 + (7 - r); // closer to promotion = better
      else if (p === RED_KING) score += 15 + centerBonus(r, c);
      else if (p === BLACK) score -= 10 + r;
      else if (p === BLACK_KING) score -= 15 + centerBonus(r, c);
    }
  }
  return score;
}

function centerBonus(r: number, c: number): number {
  const dr = Math.abs(r - 3.5);
  const dc = Math.abs(c - 3.5);
  return Math.max(0, 3 - Math.floor(dr + dc));
}

function minimax(
  board: Board, depth: number, alpha: number, beta: number,
  maximizing: boolean
): number {
  const side = maximizing ? RED : BLACK;
  const moves = getAllMoves(board, side);
  if (depth === 0 || moves.length === 0) {
    if (moves.length === 0) {
      return maximizing ? -1000 : 1000;
    }
    return evaluate(board);
  }
  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      const nb = applyMove(board, move);
      const val = minimax(nb, depth - 1, alpha, beta, false);
      best = Math.max(best, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      const nb = applyMove(board, move);
      const val = minimax(nb, depth - 1, alpha, beta, true);
      best = Math.min(best, val);
      beta = Math.min(beta, val);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function aiChooseMove(board: Board): Move | null {
  const moves = getAllMoves(board, BLACK);
  if (moves.length === 0) return null;
  // Adaptive depth: fewer pieces = deeper search
  const pieceCount = board.flat().filter(p => p !== EMPTY).length;
  const depth = pieceCount <= 6 ? 6 : pieceCount <= 10 ? 5 : 4;
  let bestScore = Infinity;
  let bestMove = moves[0];
  for (const move of moves) {
    const nb = applyMove(board, move);
    const val = minimax(nb, depth - 1, -Infinity, Infinity, true);
    if (val < bestScore) {
      bestScore = val;
      bestMove = move;
    }
  }
  return bestMove;
}

// ─── Game State ──────────────────────────────────────────────────────────────
interface GameState {
  board: Board;
  turn: number; // RED or BLACK
  selected: Pos | null;
  validMoves: Move[];
  gameOver: boolean;
  winner: number | null; // RED, BLACK, or null for draw
  redCount: number;
  blackCount: number;
  moveHistory: { board: Board; turn: number }[];
  mustCapture: boolean;
  aiThinking: boolean;
  lastMove: Move | null;
  promoted: Pos | null; // last promoted position for animation
}

function countPieces(board: Board) {
  let red = 0, black = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (isRed(board[r][c])) red++;
      if (isBlack(board[r][c])) black++;
    }
  }
  return { red, black };
}

function initGameState(): GameState {
  const board = createInitialBoard();
  const counts = countPieces(board);
  return {
    board,
    turn: RED,
    selected: null,
    validMoves: getAllMoves(board, RED),
    gameOver: false,
    winner: null,
    redCount: counts.red,
    blackCount: counts.black,
    moveHistory: [],
    mustCapture: false,
    aiThinking: false,
    lastMove: null,
    promoted: null,
  };
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function CheckersPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(initGameState());
  const soundRef = useRef<SoundEngine>(null!);
  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiInitRef = useRef(false);
  const rafRef = useRef<number>(0);
  const scoreSubmittedRef = useRef(false);

  const [turn, setTurn] = useState<number>(RED);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);
  const [redCount, setRedCount] = useState(12);
  const [blackCount, setBlackCount] = useState(12);
  const [muted, setMuted] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>("");

  // Submit score on win
  const submitScore = useCallback(async (captured: number) => {
    if (scoreSubmittedRef.current || captured === 0) return;
    scoreSubmittedRef.current = true;
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: captured * 100 }),
      });
    } catch { /* ignore */ }
  }, []);

  // ─── Drawing ─────────────────────────────────────────────────────────────
  const drawBoard = useCallback(() => {
    const g = pixiGfxRef.current;
    const app = pixiAppRef.current;
    if (!g || !app) return;
    const game = gameRef.current;

    g.clear();

    const canvasW = app.screen.width;
    const canvasH = app.screen.height;
    const cellSize = Math.floor(Math.min(canvasW, canvasH - 40) / BOARD_SIZE);
    const boardPx = cellSize * BOARD_SIZE;
    const offsetX = Math.floor((canvasW - boardPx) / 2);
    const offsetY = Math.floor((canvasH - boardPx) / 2);

    // Draw squares
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const x = offsetX + c * cellSize;
        const y = offsetY + r * cellSize;
        const color = (r + c) % 2 === 0 ? LIGHT_SQ : DARK_SQ;
        g.rect(x, y, cellSize, cellSize).fill({ color });
      }
    }

    // Last move highlight
    if (game.lastMove) {
      const { from, to } = game.lastMove;
      for (const pos of [from, to]) {
        const x = offsetX + pos.c * cellSize;
        const y = offsetY + pos.r * cellSize;
        g.rect(x, y, cellSize, cellSize).fill({ color: 0x3ea6ff, alpha: 0.2 });
      }
    }

    // Selected piece highlight
    if (game.selected) {
      const x = offsetX + game.selected.c * cellSize;
      const y = offsetY + game.selected.r * cellSize;
      g.rect(x, y, cellSize, cellSize).fill({ color: HIGHLIGHT_COLOR, alpha: 0.35 });
    }

    // Valid move indicators
    if (game.selected) {
      const movesForSelected = game.validMoves.filter(
        m => m.from.r === game.selected!.r && m.from.c === game.selected!.c
      );
      for (const move of movesForSelected) {
        const cx = offsetX + move.to.c * cellSize + cellSize / 2;
        const cy = offsetY + move.to.r * cellSize + cellSize / 2;
        if (move.captures.length > 0) {
          g.circle(cx, cy, cellSize * 0.35).fill({ color: 0xff4444, alpha: 0.35 });
        } else {
          g.circle(cx, cy, cellSize * 0.15).fill({ color: VALID_MOVE_COLOR, alpha: 0.6 });
        }
      }
    }

    // Pieces with movable indicator
    const movablePieces = new Set<string>();
    if (!game.gameOver && game.turn === RED) {
      for (const m of game.validMoves) {
        movablePieces.add(`${m.from.r},${m.from.c}`);
      }
    }

    // Draw pieces
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = game.board[r][c];
        if (piece === EMPTY) continue;
        const cx = offsetX + c * cellSize + cellSize / 2;
        const cy = offsetY + r * cellSize + cellSize / 2;
        const radius = cellSize * 0.38;

        // Movable glow for player pieces
        if (movablePieces.has(`${r},${c}`)) {
          g.circle(cx, cy, radius + 3).fill({ color: HIGHLIGHT_COLOR, alpha: 0.3 });
        }

        // 3D shading: outer shadow
        g.circle(cx + 1, cy + 2, radius).fill({ color: 0x000000, alpha: 0.3 });

        // Main piece
        const baseColor = isRed(piece) ? RED_COLOR : BLACK_COLOR;
        g.circle(cx, cy, radius).fill({ color: baseColor });

        // 3D highlight (top-left)
        const hlColor = isRed(piece) ? 0xff4444 : 0x666666;
        g.circle(cx - radius * 0.2, cy - radius * 0.2, radius * 0.65)
          .fill({ color: hlColor, alpha: 0.3 });

        // Inner ring
        g.circle(cx, cy, radius * 0.7).stroke({ color: isRed(piece) ? 0xff6666 : 0x555555, width: 1.5, alpha: 0.4 });

        // King crown symbol (star/cross)
        if (isKing(piece)) {
          const s = radius * 0.35;
          const crownColor = isRed(piece) ? 0xffd700 : 0xffd700;
          // Draw a small crown shape
          g.moveTo(cx - s, cy + s * 0.3)
           .lineTo(cx - s, cy - s * 0.3)
           .lineTo(cx - s * 0.5, cy + s * 0.1)
           .lineTo(cx, cy - s * 0.7)
           .lineTo(cx + s * 0.5, cy + s * 0.1)
           .lineTo(cx + s, cy - s * 0.3)
           .lineTo(cx + s, cy + s * 0.3)
           .closePath()
           .fill({ color: crownColor, alpha: 0.9 });
        }
      }
    }

    // Board border
    g.rect(offsetX - 2, offsetY - 2, boardPx + 4, boardPx + 4)
      .stroke({ color: 0x555555, width: 2 });

    // Row/col labels
    // (skip for cleaner look on mobile)
  }, []);

  // ─── Handle click/touch on board ───────────────────────────────────────────
  const handleCanvasClick = useCallback((clientX: number, clientY: number) => {
    const game = gameRef.current;
    const app = pixiAppRef.current;
    if (!app || game.gameOver || game.turn !== RED || game.aiThinking) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = app.screen.width / rect.width;
    const scaleY = app.screen.height / rect.height;
    const px = (clientX - rect.left) * scaleX;
    const py = (clientY - rect.top) * scaleY;

    const cellSize = Math.floor(Math.min(app.screen.width, app.screen.height - 40) / BOARD_SIZE);
    const boardPx = cellSize * BOARD_SIZE;
    const offsetX = Math.floor((app.screen.width - boardPx) / 2);
    const offsetY = Math.floor((app.screen.height - boardPx) / 2);

    const col = Math.floor((px - offsetX) / cellSize);
    const row = Math.floor((py - offsetY) / cellSize);
    if (row < 0 || row >= 8 || col < 0 || col >= 8) return;

    // If clicking on a valid move destination
    if (game.selected) {
      const move = game.validMoves.find(
        m => m.from.r === game.selected!.r && m.from.c === game.selected!.c
          && m.to.r === row && m.to.c === col
      );
      if (move) {
        executeMove(move);
        return;
      }
    }

    // Select own piece
    if (isRed(game.board[row][col])) {
      const hasMovesForPiece = game.validMoves.some(m => m.from.r === row && m.from.c === col);
      if (hasMovesForPiece) {
        game.selected = { r: row, c: col };
        soundRef.current?.playClick();
        drawBoard();
      }
    }
  }, [drawBoard]);

  // ─── Execute a move ────────────────────────────────────────────────────────
  const executeMove = useCallback((move: Move) => {
    const game = gameRef.current;
    game.moveHistory.push({ board: cloneBoard(game.board), turn: game.turn });
    const oldPiece = game.board[move.from.r][move.from.c];
    game.board = applyMove(game.board, move);
    game.lastMove = move;
    game.selected = null;
    game.promoted = null;

    // Sound effects
    if (move.captures.length > 0) {
      soundRef.current?.playMerge(move.captures.length * 100);
    } else {
      soundRef.current?.playMove();
    }

    // Check promotion
    const newPiece = game.board[move.to.r][move.to.c];
    if (!isKing(oldPiece) && isKing(newPiece)) {
      game.promoted = { r: move.to.r, c: move.to.c };
      soundRef.current?.playLevelUp();
      setStatusMsg("升王!");
      setTimeout(() => setStatusMsg(""), 1500);
    }

    const counts = countPieces(game.board);
    game.redCount = counts.red;
    game.blackCount = counts.black;
    setRedCount(counts.red);
    setBlackCount(counts.black);

    // Switch turn
    game.turn = game.turn === RED ? BLACK : RED;
    game.validMoves = getAllMoves(game.board, game.turn);
    game.mustCapture = game.validMoves.length > 0 && game.validMoves[0].captures.length > 0;

    // Check game over
    if (game.validMoves.length === 0) {
      game.gameOver = true;
      game.winner = game.turn === RED ? BLACK : RED;
      setGameOver(true);
      setWinner(game.winner);
      soundRef.current?.playGameOver();
      if (game.winner === RED) {
        submitScore(12 - counts.black + counts.red);
      }
    } else {
      setTurn(game.turn);
      // AI turn
      if (game.turn === BLACK) {
        game.aiThinking = true;
        setAiThinking(true);
        setTimeout(() => {
          runAI();
        }, 400);
      }
    }

    drawBoard();
  }, [drawBoard, submitScore]);

  // ─── AI Turn ───────────────────────────────────────────────────────────────
  const runAI = useCallback(() => {
    const game = gameRef.current;
    if (game.gameOver || game.turn !== BLACK) return;

    const move = aiChooseMove(game.board);
    if (!move) {
      game.gameOver = true;
      game.winner = RED;
      setGameOver(true);
      setWinner(RED);
      soundRef.current?.playGameOver();
      submitScore(12 - game.blackCount + game.redCount);
      game.aiThinking = false;
      setAiThinking(false);
      drawBoard();
      return;
    }

    game.aiThinking = false;
    setAiThinking(false);
    executeMove(move);
  }, [drawBoard, executeMove, submitScore]);

  // ─── Init Game ─────────────────────────────────────────────────────────────
  const initGame = useCallback(() => {
    const gs = initGameState();
    gameRef.current = gs;
    scoreSubmittedRef.current = false;
    setTurn(RED);
    setGameOver(false);
    setWinner(null);
    setRedCount(12);
    setBlackCount(12);
    setAiThinking(false);
    setStatusMsg("");
    drawBoard();
  }, [drawBoard]);

  // ─── Save / Load ──────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const game = gameRef.current;
    return {
      board: game.board,
      turn: game.turn,
      redCount: game.redCount,
      blackCount: game.blackCount,
      gameOver: game.gameOver,
      winner: game.winner,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as {
      board: Board; turn: number; redCount: number; blackCount: number;
      gameOver: boolean; winner: number | null;
    };
    const game = gameRef.current;
    game.board = d.board;
    game.turn = d.turn;
    game.redCount = d.redCount;
    game.blackCount = d.blackCount;
    game.gameOver = d.gameOver;
    game.winner = d.winner;
    game.selected = null;
    game.validMoves = getAllMoves(game.board, game.turn);
    game.mustCapture = game.validMoves.length > 0 && game.validMoves[0].captures.length > 0;
    game.aiThinking = false;
    game.lastMove = null;
    game.promoted = null;
    game.moveHistory = [];
    setTurn(d.turn);
    setGameOver(d.gameOver);
    setWinner(d.winner);
    setRedCount(d.redCount);
    setBlackCount(d.blackCount);
    setAiThinking(false);
    drawBoard();
    // If it's AI's turn after load
    if (d.turn === BLACK && !d.gameOver) {
      game.aiThinking = true;
      setAiThinking(true);
      setTimeout(() => runAI(), 400);
    }
  }, [drawBoard, runAI]);

  // ─── PixiJS Init ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (pixiInitRef.current) return;
    pixiInitRef.current = true;

    soundRef.current = new SoundEngine(GAME_ID);

    const initPixi = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const pixi = await loadPixi();
      const parent = canvas.parentElement;
      const w = parent?.clientWidth || 400;
      const h = Math.min(w + 60, window.innerHeight - 200);

      const app = await createPixiApp({
        canvas,
        width: w,
        height: h,
        backgroundColor: 0x0f0f0f,
      });
      pixiAppRef.current = app;

      const gfx = new pixi.Graphics();
      app.stage.addChild(gfx);
      pixiGfxRef.current = gfx;

      drawBoard();

      // Render loop
      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        // Redraw is triggered by state changes, but we keep the loop for smooth rendering
      };
      loop();
    };

    initPixi();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      pixiAppRef.current?.destroy();
      pixiAppRef.current = null;
      soundRef.current?.dispose();
    };
  }, [drawBoard]);

  // ─── Resize handler ────────────────────────────────────────────────────────
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const app = pixiAppRef.current;
      if (!canvas || !app) return;
      const parent = canvas.parentElement;
      const w = parent?.clientWidth || 400;
      const h = Math.min(w + 60, window.innerHeight - 200);
      app.renderer.resize(w, h);
      drawBoard();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawBoard]);

  // ─── Toggle mute ──────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const m = soundRef.current?.toggleMute();
    setMuted(!!m);
  }, []);

  // ─── JSX ───────────────────────────────────────────────────────────────────
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0f0f0f] text-white pt-16 pb-20 px-3 max-w-lg mx-auto">
        {/* Top bar */}
        <div className="flex items-center gap-2 mb-3">
          <Link href="/games" className="text-[#3ea6ff] hover:text-[#65b8ff] transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold flex-1">国际跳棋</h1>
          <button onClick={toggleMute} className="p-2 text-[#aaa] hover:text-white transition">
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button onClick={initGame} className="p-2 text-[#aaa] hover:text-white transition" title="重新开始">
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>

        {/* Score bar */}
        <div className="flex items-center justify-between mb-3 px-2 py-2 rounded-xl bg-[#1a1a1a] border border-[#333] text-sm">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full inline-block" style={{ background: "#cc0000" }} />
            <span className={turn === RED && !gameOver ? "text-[#3ea6ff] font-bold" : "text-[#aaa]"}>
              红方: {redCount}
            </span>
          </div>
          <div className="text-xs text-[#666]">
            {gameOver
              ? winner === RED ? "红方胜利!" : winner === BLACK ? "黑方胜利!" : "平局"
              : aiThinking
                ? "黑方思考中..."
                : turn === RED
                  ? "红方走棋"
                  : "黑方走棋"
            }
          </div>
          <div className="flex items-center gap-2">
            <span className={turn === BLACK && !gameOver ? "text-[#3ea6ff] font-bold" : "text-[#aaa]"}>
              黑方: {blackCount}
            </span>
            <span className="w-4 h-4 rounded-full inline-block" style={{ background: "#333333", border: "1px solid #555" }} />
          </div>
        </div>

        {/* Status message */}
        {statusMsg && (
          <div className="text-center text-sm text-[#f0b90b] font-bold mb-2 animate-pulse">
            <Crown className="w-4 h-4 inline-block mr-1" />
            {statusMsg}
          </div>
        )}

        {/* Must capture warning */}
        {!gameOver && turn === RED && gameRef.current.mustCapture && (
          <div className="text-center text-xs text-[#ff6b6b] mb-2">
            必须吃子!
          </div>
        )}

        {/* Canvas */}
        <div className="w-full rounded-xl overflow-hidden border border-[#333] bg-[#0a0a0a]">
          <canvas
            ref={canvasRef}
            className="w-full block"
            style={{ touchAction: "none" }}
            onClick={(e) => handleCanvasClick(e.clientX, e.clientY)}
            onTouchStart={(e) => {
              e.preventDefault();
              const touch = e.touches[0];
              if (touch) handleCanvasClick(touch.clientX, touch.clientY);
            }}
          />
        </div>

        {/* Game over */}
        {gameOver && (
          <div className="text-center mt-4">
            <p className="text-lg font-bold mb-3">
              {winner === RED ? "恭喜，红方胜利!" : winner === BLACK ? "黑方胜利，再接再厉!" : "平局!"}
            </p>
            <button
              onClick={initGame}
              className="px-6 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition shadow-lg shadow-[#3ea6ff]/25"
            >
              再来一局
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-[#666] mt-3">
          点击棋子选中 · 点击目标位置移动 · 必须吃子规则
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
