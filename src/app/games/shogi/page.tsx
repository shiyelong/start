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
  ArrowLeft, Volume2, VolumeX, Settings2, RotateCcw, Trophy, Plus, Flag,
} from "lucide-react";

/* ================================================================
   Constants & Types
   ================================================================ */
const GAME_ID = "shogi";
const COLS = 9, ROWS = 9;
const CELL = 52;
const PAD = 30;
const HAND_W = 80;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;
const W = BOARD_W + PAD * 2 + HAND_W * 2;
const H = BOARD_H + PAD * 2 + 40;

type Side = 0 | 1; // 0=player(bottom/sente), 1=AI(top/gote)
type PieceType = "K" | "R" | "B" | "G" | "S" | "N" | "L" | "P";
type PromotedType = "PR" | "PB" | "PS" | "PN" | "PL" | "PP";
type AnyPiece = PieceType | PromotedType;
type Phase = "title" | "playing" | "cpu" | "gameover";

interface Piece { type: AnyPiece; side: Side }
type Cell = Piece | null;
type Board = Cell[][];
type Hand = Record<PieceType, number>;

interface Move {
  fromR: number; fromC: number; toR: number; toC: number;
  promote: boolean; drop: PieceType | null;
  captured: Piece | null;
}

interface GameState {
  board: Board;
  hands: [Hand, Hand];
  turn: Side;
  history: Move[];
  winner: Side | -1; // -1 = none
  moveCount: number;
  inCheck: [boolean, boolean];
}

const KANJI: Record<AnyPiece, string> = {
  K: "王", R: "飛", B: "角", G: "金", S: "銀", N: "桂", L: "香", P: "歩",
  PR: "龍", PB: "馬", PS: "全", PN: "圭", PL: "杏", PP: "と",
};
const PROMOTED: Record<string, PromotedType> = {
  R: "PR", B: "PB", S: "PS", N: "PN", L: "PL", P: "PP",
};
const UNPROMOTE: Record<string, PieceType> = {
  PR: "R", PB: "B", PS: "S", PN: "N", PL: "L", PP: "P",
};
const PROMOTABLE = new Set<AnyPiece>(["R", "B", "S", "N", "L", "P"]);
const IS_PROMOTED = new Set<AnyPiece>(["PR", "PB", "PS", "PN", "PL", "PP"]);

function emptyHand(): Hand { return { K: 0, R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 }; }

function baseType(t: AnyPiece): PieceType { return UNPROMOTE[t] || t as PieceType; }

/* ================================================================
   Sound (Web Audio API)
   ================================================================ */
class ShogiSound {
  private ctx: AudioContext | null = null;
  private muted = false;
  private init() { if (!this.ctx) this.ctx = new AudioContext(); }
  private beep(freq: number, dur: number, vol = 0.15) {
    if (this.muted) return;
    this.init();
    const c = this.ctx!;
    const o = c.createOscillator(); const g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.frequency.value = freq; o.type = "sine";
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.start(); o.stop(c.currentTime + dur);
  }
  playMove() { this.beep(600, 0.1); }
  playCapture() { this.beep(400, 0.15, 0.2); this.beep(800, 0.1, 0.1); }
  playCheck() { this.beep(1000, 0.08); setTimeout(() => this.beep(1200, 0.08), 100); }
  playWin() { this.beep(523, 0.15); setTimeout(() => this.beep(659, 0.15), 150); setTimeout(() => this.beep(784, 0.2), 300); }
  toggleMute() { this.muted = !this.muted; return this.muted; }
  dispose() { this.ctx?.close(); this.ctx = null; }
}

/* ================================================================
   Movement Rules
   ================================================================ */
function getMoves(type: AnyPiece, side: Side): [number, number][] {
  const s = side === 0 ? -1 : 1; // forward direction
  switch (type) {
    case "K": return [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    case "G": case "PS": case "PN": case "PL": case "PP":
      return [[s,0],[s,-1],[s,1],[-s,0],[0,-1],[0,1]]; // gold moves
    case "S": return [[s,-1],[s,0],[s,1],[-s,-1],[-s,1]];
    case "N": return [[s*2,-1],[s*2,1]];
    case "P": return [[s,0]];
    case "L": { const m: [number,number][] = []; for (let i = 1; i <= 8; i++) m.push([s*i, 0]); return m; }
    case "R": case "PR": { const m: [number,number][] = [];
      for (let i = 1; i <= 8; i++) m.push([i,0],[-i,0],[0,i],[0,-i]);
      if (type === "PR") m.push([-1,-1],[-1,1],[1,-1],[1,1]);
      return m; }
    case "B": case "PB": { const m: [number,number][] = [];
      for (let i = 1; i <= 8; i++) m.push([i,i],[i,-i],[-i,i],[-i,-i]);
      if (type === "PB") m.push([-1,0],[1,0],[0,-1],[0,1]);
      return m; }
    default: return [];
  }
}

function isSlider(type: AnyPiece): boolean {
  return ["R","B","L","PR","PB"].includes(type);
}

function inBounds(r: number, c: number) { return r >= 0 && r < 9 && c >= 0 && c < 9; }

function getValidMoves(board: Board, r: number, c: number, side: Side): [number, number, boolean][] {
  const piece = board[r][c];
  if (!piece || piece.side !== side) return [];
  const moves: [number, number, boolean][] = [];
  const rawMoves = getMoves(piece.type, side);
  const slider = isSlider(piece.type);

  for (const [dr, dc] of rawMoves) {
    if (slider && (Math.abs(dr) > 1 || Math.abs(dc) > 1)) continue; // handle below
    const nr = r + dr, nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const target = board[nr][nc];
    if (target && target.side === side) continue;
    addMoveWithPromotion(moves, piece, side, r, c, nr, nc);
  }

  if (slider) {
    const dirs: [number, number][] = [];
    const t = piece.type;
    if (t === "R" || t === "PR") dirs.push([1,0],[-1,0],[0,1],[0,-1]);
    if (t === "B" || t === "PB") dirs.push([1,1],[1,-1],[-1,1],[-1,-1]);
    if (t === "L") dirs.push([side === 0 ? -1 : 1, 0]);
    for (const [dr, dc] of dirs) {
      for (let i = 1; i <= 8; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (!inBounds(nr, nc)) break;
        const target = board[nr][nc];
        if (target && target.side === side) break;
        addMoveWithPromotion(moves, piece, side, r, c, nr, nc);
        if (target) break;
      }
    }
  }
  return moves;
}

function addMoveWithPromotion(moves: [number,number,boolean][], piece: Piece, side: Side, fr: number, fc: number, tr: number, tc: number) {
  const promZone = side === 0 ? [0,1,2] : [6,7,8];
  const canPromote = PROMOTABLE.has(piece.type) && !IS_PROMOTED.has(piece.type) &&
    (promZone.includes(tr) || promZone.includes(fr));
  const mustPromote = (piece.type === "P" || piece.type === "L") && (side === 0 ? tr === 0 : tr === 8) ||
    piece.type === "N" && (side === 0 ? tr <= 1 : tr >= 7);
  if (mustPromote) {
    moves.push([tr, tc, true]);
  } else {
    moves.push([tr, tc, false]);
    if (canPromote) moves.push([tr, tc, true]);
  }
}

function getDropMoves(board: Board, hand: Hand, side: Side): [PieceType, number, number][] {
  const drops: [PieceType, number, number][] = [];
  const types: PieceType[] = ["R","B","G","S","N","L","P"];
  for (const pt of types) {
    if (hand[pt] <= 0) continue;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c]) continue;
        // Pawn: no two pawns in same column, no drop on last rank
        if (pt === "P") {
          if (side === 0 && r === 0) continue;
          if (side === 1 && r === 8) continue;
          let hasPawn = false;
          for (let rr = 0; rr < 9; rr++) {
            const p = board[rr][c];
            if (p && p.side === side && p.type === "P") { hasPawn = true; break; }
          }
          if (hasPawn) continue;
        }
        if (pt === "L") { if (side === 0 && r === 0) continue; if (side === 1 && r === 8) continue; }
        if (pt === "N") { if (side === 0 && r <= 1) continue; if (side === 1 && r >= 7) continue; }
        drops.push([pt, r, c]);
      }
    }
  }
  return drops;
}

/* ================================================================
   King & Check utilities
   ================================================================ */
function findKing(board: Board, side: Side): [number, number] | null {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p && p.side === side && p.type === "K") return [r, c];
    }
  return null;
}

function isAttacked(board: Board, r: number, c: number, byS: Side): boolean {
  for (let rr = 0; rr < 9; rr++)
    for (let cc = 0; cc < 9; cc++) {
      const p = board[rr][cc];
      if (!p || p.side !== byS) continue;
      const mvs = getValidMoves(board, rr, cc, byS);
      for (const [mr, mc] of mvs) if (mr === r && mc === c) return true;
    }
  return false;
}

function isInCheck(board: Board, side: Side): boolean {
  const k = findKing(board, side);
  if (!k) return true;
  return isAttacked(board, k[0], k[1], side === 0 ? 1 : 0);
}

function applyMove(board: Board, hands: [Hand, Hand], m: Move): Piece | null {
  let captured: Piece | null = null;
  if (m.drop) {
    const side = board[0][0]?.side ?? 0; // inferred from context
    // handled externally
    return null;
  }
  const piece = board[m.fromR][m.fromC]!;
  captured = board[m.toR][m.toC];
  board[m.toR][m.toC] = {
    type: m.promote ? PROMOTED[piece.type] || piece.type : piece.type,
    side: piece.side,
  };
  board[m.fromR][m.fromC] = null;
  if (captured) {
    const bt = baseType(captured.type);
    if (bt !== "K") hands[piece.side][bt]++;
  }
  return captured;
}

function makeMove(gs: GameState, m: Move) {
  if (m.drop) {
    gs.board[m.toR][m.toC] = { type: m.drop, side: gs.turn };
    gs.hands[gs.turn][m.drop]--;
  } else {
    const piece = gs.board[m.fromR][m.fromC]!;
    const captured = gs.board[m.toR][m.toC];
    gs.board[m.toR][m.toC] = {
      type: m.promote ? (PROMOTED[piece.type] || piece.type) as AnyPiece : piece.type,
      side: piece.side,
    };
    gs.board[m.fromR][m.fromC] = null;
    m.captured = captured;
    if (captured) {
      const bt = baseType(captured.type);
      if (bt !== "K") gs.hands[gs.turn][bt]++;
    }
  }
  gs.turn = gs.turn === 0 ? 1 : 0;
  gs.moveCount++;
  gs.inCheck = [isInCheck(gs.board, 0), isInCheck(gs.board, 1)];
}

function undoMove(gs: GameState, m: Move) {
  gs.turn = gs.turn === 0 ? 1 : 0;
  gs.moveCount--;
  if (m.drop) {
    gs.board[m.toR][m.toC] = null;
    gs.hands[gs.turn][m.drop]++;
  } else {
    const piece = gs.board[m.toR][m.toC]!;
    gs.board[m.fromR][m.fromC] = {
      type: m.promote ? (UNPROMOTE[piece.type] || piece.type) as AnyPiece : piece.type,
      side: piece.side,
    };
    gs.board[m.toR][m.toC] = m.captured;
    if (m.captured) {
      const bt = baseType(m.captured.type);
      if (bt !== "K") gs.hands[gs.turn][bt]--;
    }
  }
  gs.inCheck = [isInCheck(gs.board, 0), isInCheck(gs.board, 1)];
}

function hasLegalMoves(gs: GameState, side: Side): boolean {
  // Board moves
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const p = gs.board[r][c];
      if (!p || p.side !== side) continue;
      const mvs = getValidMoves(gs.board, r, c, side);
      for (const [tr, tc, prom] of mvs) {
        const m: Move = { fromR: r, fromC: c, toR: tr, toC: tc, promote: prom, drop: null, captured: null };
        makeMove(gs, m);
        const legal = !isInCheck(gs.board, side);
        undoMove(gs, m);
        if (legal) return true;
      }
    }
  // Drop moves
  const drops = getDropMoves(gs.board, gs.hands[side], side);
  for (const [pt, dr, dc] of drops) {
    const m: Move = { fromR: -1, fromC: -1, toR: dr, toC: dc, promote: false, drop: pt, captured: null };
    makeMove(gs, m);
    const legal = !isInCheck(gs.board, side);
    undoMove(gs, m);
    if (legal) return true;
  }
  return false;
}

/* ================================================================
   Initial Board Setup
   ================================================================ */
function createInitialBoard(): Board {
  const b: Board = Array.from({ length: 9 }, () => new Array(9).fill(null));
  // AI side (top, side=1)
  b[0][0] = { type: "L", side: 1 }; b[0][1] = { type: "N", side: 1 };
  b[0][2] = { type: "S", side: 1 }; b[0][3] = { type: "G", side: 1 };
  b[0][4] = { type: "K", side: 1 }; b[0][5] = { type: "G", side: 1 };
  b[0][6] = { type: "S", side: 1 }; b[0][7] = { type: "N", side: 1 };
  b[0][8] = { type: "L", side: 1 };
  b[1][1] = { type: "R", side: 1 }; b[1][7] = { type: "B", side: 1 };
  for (let c = 0; c < 9; c++) b[2][c] = { type: "P", side: 1 };
  // Player side (bottom, side=0)
  b[8][0] = { type: "L", side: 0 }; b[8][1] = { type: "N", side: 0 };
  b[8][2] = { type: "S", side: 0 }; b[8][3] = { type: "G", side: 0 };
  b[8][4] = { type: "K", side: 0 }; b[8][5] = { type: "G", side: 0 };
  b[8][6] = { type: "S", side: 0 }; b[8][7] = { type: "N", side: 0 };
  b[8][8] = { type: "L", side: 0 };
  b[7][7] = { type: "R", side: 0 }; b[7][1] = { type: "B", side: 0 };
  for (let c = 0; c < 9; c++) b[6][c] = { type: "P", side: 0 };
  return b;
}

function createGameState(): GameState {
  return {
    board: createInitialBoard(),
    hands: [emptyHand(), emptyHand()],
    turn: 0,
    history: [],
    winner: -1,
    moveCount: 0,
    inCheck: [false, false],
  };
}

/* ================================================================
   AI — Minimax with Alpha-Beta
   ================================================================ */
const PIECE_VAL: Record<AnyPiece, number> = {
  K: 10000, R: 1000, B: 900, G: 500, S: 450, N: 350, L: 300, P: 100,
  PR: 1300, PB: 1200, PS: 500, PN: 500, PL: 500, PP: 500,
};

function evalBoard(gs: GameState): number {
  let score = 0;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const p = gs.board[r][c];
      if (!p) continue;
      const v = PIECE_VAL[p.type];
      score += p.side === 1 ? v : -v;
      // Positional: advance bonus
      if (p.side === 1) score += (8 - r) * 2;
      else score -= r * 2;
    }
  // Hand pieces
  const handTypes: PieceType[] = ["R","B","G","S","N","L","P"];
  for (const t of handTypes) {
    score += gs.hands[1][t] * (PIECE_VAL[t] * 0.85);
    score -= gs.hands[0][t] * (PIECE_VAL[t] * 0.85);
  }
  if (gs.inCheck[0]) score += 50;
  if (gs.inCheck[1]) score -= 50;
  return score;
}

function getAllMoves(gs: GameState, side: Side): Move[] {
  const moves: Move[] = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const p = gs.board[r][c];
      if (!p || p.side !== side) continue;
      const mvs = getValidMoves(gs.board, r, c, side);
      for (const [tr, tc, prom] of mvs) {
        moves.push({ fromR: r, fromC: c, toR: tr, toC: tc, promote: prom, drop: null, captured: null });
      }
    }
  const drops = getDropMoves(gs.board, gs.hands[side], side);
  for (const [pt, dr, dc] of drops) {
    moves.push({ fromR: -1, fromC: -1, toR: dr, toC: dc, promote: false, drop: pt, captured: null });
  }
  return moves;
}

function minimax(gs: GameState, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  if (depth === 0) return evalBoard(gs);
  const side: Side = maximizing ? 1 : 0;
  const moves = getAllMoves(gs, side);
  // Order: captures first
  moves.sort((a, b) => {
    const ac = a.drop ? 0 : (gs.board[a.toR]?.[a.toC] ? PIECE_VAL[gs.board[a.toR][a.toC]!.type] : 0);
    const bc = b.drop ? 0 : (gs.board[b.toR]?.[b.toC] ? PIECE_VAL[gs.board[b.toR][b.toC]!.type] : 0);
    return bc - ac;
  });

  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      makeMove(gs, m);
      if (isInCheck(gs.board, side)) { undoMove(gs, m); continue; }
      best = Math.max(best, minimax(gs, depth - 1, alpha, beta, false));
      undoMove(gs, m);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best === -Infinity ? -99999 + (4 - depth) : best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      makeMove(gs, m);
      if (isInCheck(gs.board, side)) { undoMove(gs, m); continue; }
      best = Math.min(best, minimax(gs, depth - 1, alpha, beta, true));
      undoMove(gs, m);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best === Infinity ? 99999 - (4 - depth) : best;
  }
}

function aiPickMove(gs: GameState): Move | null {
  const moves = getAllMoves(gs, 1);
  let bestScore = -Infinity;
  let bestMove: Move | null = null;
  const depth = gs.moveCount < 10 ? 2 : 3;
  for (const m of moves) {
    makeMove(gs, m);
    if (isInCheck(gs.board, 1)) { undoMove(gs, m); continue; }
    const score = minimax(gs, depth - 1, -Infinity, Infinity, false);
    undoMove(gs, m);
    if (score > bestScore) { bestScore = score; bestMove = m; }
  }
  return bestMove;
}

/* ================================================================
   Main Component
   ================================================================ */
export default function ShogiGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [muted, setMuted] = useState(false);
  const gsRef = useRef<GameState>(createGameState());
  const soundRef = useRef<ShogiSound | null>(null);
  const selRef = useRef<{ r: number; c: number; handPiece?: PieceType } | null>(null);
  const validRef = useRef<[number, number, boolean][]>([]);
  const promRef = useRef<{ move: Move; callback: (p: boolean) => void } | null>(null);

  const [turnDisplay, setTurnDisplay] = useState<Side>(0);
  const [winnerDisplay, setWinnerDisplay] = useState<Side | -1>(-1);
  const [moveCount, setMoveCount] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => { soundRef.current = new ShogiSound(); return () => { soundRef.current?.dispose(); }; }, []);

  const submitScore = useCallback(async (score: number) => {
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score }),
      });
    } catch { /* ignore */ }
  }, []);

  const handleSave = useCallback(() => {
    const gs = gsRef.current;
    return {
      board: gs.board.map(r => r.map(c => c ? { ...c } : null)),
      hands: [{ ...gs.hands[0] }, { ...gs.hands[1] }],
      turn: gs.turn, history: [...gs.history], winner: gs.winner,
      moveCount: gs.moveCount, phase,
    };
  }, [phase]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d?.board) return;
    const gs = gsRef.current;
    gs.board = (d.board as Cell[][]).map(r => r.map(c => c ? { ...c } : null));
    gs.hands = d.hands as [Hand, Hand];
    gs.turn = d.turn as Side; gs.history = d.history as Move[];
    gs.winner = d.winner as Side | -1; gs.moveCount = d.moveCount as number;
    gs.inCheck = [isInCheck(gs.board, 0), isInCheck(gs.board, 1)];
    selRef.current = null; validRef.current = [];
    setTurnDisplay(gs.turn); setWinnerDisplay(gs.winner); setMoveCount(gs.moveCount);
    setPhase(gs.winner !== -1 ? "gameover" : (d.phase as Phase) || "playing");
  }, []);

  const startGame = useCallback(() => {
    gsRef.current = createGameState();
    selRef.current = null; validRef.current = [];
    setTurnDisplay(0); setWinnerDisplay(-1); setMoveCount(0); setPhase("playing");
  }, []);

  const checkGameEnd = useCallback((gs: GameState) => {
    const opp = gs.turn;
    if (!hasLegalMoves(gs, opp)) {
      gs.winner = opp === 0 ? 1 : 0;
      setWinnerDisplay(gs.winner);
      soundRef.current?.playWin();
      if (gs.winner === 0) submitScore(1000 + Math.max(0, 200 - gs.moveCount) * 5);
      setPhase("gameover");
      return true;
    }
    if (gs.inCheck[opp]) soundRef.current?.playCheck();
    return false;
  }, [submitScore]);

  const executeMove = useCallback((m: Move) => {
    const gs = gsRef.current;
    const wasCapture = !m.drop && gs.board[m.toR][m.toC] !== null;
    makeMove(gs, m);
    gs.history.push(m);
    if (wasCapture) soundRef.current?.playCapture(); else soundRef.current?.playMove();
    setTurnDisplay(gs.turn); setMoveCount(gs.moveCount);
    selRef.current = null; validRef.current = [];
    if (checkGameEnd(gs)) return;
    // AI turn
    if (gs.turn === 1) {
      setPhase("cpu");
      setTimeout(() => {
        const aiM = aiPickMove(gs);
        if (aiM) {
          const wasCap = !aiM.drop && gs.board[aiM.toR][aiM.toC] !== null;
          makeMove(gs, aiM);
          gs.history.push(aiM);
          if (wasCap) soundRef.current?.playCapture(); else soundRef.current?.playMove();
          setTurnDisplay(gs.turn); setMoveCount(gs.moveCount);
          if (!checkGameEnd(gs)) setPhase("playing");
        } else {
          gs.winner = 0; setWinnerDisplay(0); soundRef.current?.playWin();
          submitScore(1000 + Math.max(0, 200 - gs.moveCount) * 5);
          setPhase("gameover");
        }
      }, 200);
    }
  }, [checkGameEnd, submitScore]);

  const handleUndo = useCallback(() => {
    const gs = gsRef.current;
    if (gs.history.length < 2 || gs.winner !== -1 || phase !== "playing") return;
    // Undo AI + player move
    for (let i = 0; i < 2 && gs.history.length > 0; i++) {
      const m = gs.history.pop()!;
      undoMove(gs, m);
    }
    selRef.current = null; validRef.current = [];
    setTurnDisplay(gs.turn); setMoveCount(gs.moveCount);
  }, [phase]);

  const resign = useCallback(() => {
    const gs = gsRef.current;
    if (gs.winner !== -1) return;
    gs.winner = 1; setWinnerDisplay(1); setPhase("gameover");
  }, []);

  /* ----------------------------------------------------------------
     Board click handler
     ---------------------------------------------------------------- */
  const handleBoardClick = useCallback((mx: number, my: number) => {
    if (phase !== "playing") return;
    const gs = gsRef.current;
    if (gs.turn !== 0) return;

    const bx = mx - PAD - HAND_W;
    const by = my - PAD;

    // Check hand piece click (player hand on right side)
    const handX = PAD + HAND_W + BOARD_W + 8;
    if (mx >= handX && mx <= handX + HAND_W - 16) {
      const handTypes: PieceType[] = ["R","B","G","S","N","L","P"];
      let hy = PAD + BOARD_H / 2;
      for (const pt of handTypes) {
        if (gs.hands[0][pt] <= 0) continue;
        if (my >= hy && my <= hy + 28) {
          selRef.current = { r: -1, c: -1, handPiece: pt };
          // Compute drop targets
          const drops = getDropMoves(gs.board, gs.hands[0], 0);
          validRef.current = drops.filter(d => d[0] === pt).map(d => [d[1], d[2], false]);
          // Filter legal drops
          validRef.current = validRef.current.filter(([dr, dc]) => {
            const m: Move = { fromR: -1, fromC: -1, toR: dr, toC: dc, promote: false, drop: pt, captured: null };
            makeMove(gs, m); const ok = !isInCheck(gs.board, 0); undoMove(gs, m); return ok;
          });
          return;
        }
        hy += 30;
      }
    }

    // AI hand on left side
    // (no interaction needed)

    // Board click
    const col = Math.floor(bx / CELL);
    const row = Math.floor(by / CELL);
    if (!inBounds(row, col)) { selRef.current = null; validRef.current = []; return; }

    const sel = selRef.current;

    // If we have a selection, try to move
    if (sel) {
      const target = validRef.current.find(([r, c]) => r === row && c === col);
      if (target) {
        if (sel.handPiece) {
          const m: Move = { fromR: -1, fromC: -1, toR: row, toC: col, promote: false, drop: sel.handPiece, captured: null };
          executeMove(m);
          return;
        }
        // Check if both promote and non-promote are valid
        const promOptions = validRef.current.filter(([r, c]) => r === row && c === col);
        if (promOptions.length === 2) {
          // Ask for promotion — auto-promote for simplicity (promote is usually better)
          const piece = gs.board[sel.r][sel.c];
          if (piece && PROMOTABLE.has(piece.type)) {
            const m: Move = { fromR: sel.r, fromC: sel.c, toR: row, toC: col, promote: true, drop: null, captured: null };
            executeMove(m);
            return;
          }
        }
        const m: Move = { fromR: sel.r, fromC: sel.c, toR: row, toC: col, promote: target[2], drop: null, captured: null };
        executeMove(m);
        return;
      }
    }

    // Select a piece
    const piece = gs.board[row][col];
    if (piece && piece.side === 0) {
      selRef.current = { r: row, c: col };
      const mvs = getValidMoves(gs.board, row, col, 0);
      // Filter legal moves (not leaving king in check)
      validRef.current = mvs.filter(([tr, tc, prom]) => {
        const m: Move = { fromR: row, fromC: col, toR: tr, toC: tc, promote: prom, drop: null, captured: null };
        makeMove(gs, m); const ok = !isInCheck(gs.board, 0); undoMove(gs, m); return ok;
      });
    } else {
      selRef.current = null; validRef.current = [];
    }
  }, [phase, executeMove]);

  /* ----------------------------------------------------------------
     PixiJS Render Loop
     ---------------------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;
    let app: Application | null = null;
    let rafId = 0;

    (async () => {
      const pixi = await loadPixi();
      if (destroyed) return;
      app = await createPixiApp({ canvas, width: W, height: H, backgroundColor: 0x0f0f0f, antialias: true });
      if (destroyed) { app.destroy(true); return; }

      const g = new pixi.Graphics();
      app.stage.addChild(g);

      // Text pool
      const POOL = 120;
      const texts: InstanceType<typeof pixi.Text>[] = [];
      for (let i = 0; i < POOL; i++) {
        const t = new pixi.Text({ text: "", style: { fontSize: 14, fill: 0xffffff, fontFamily: "serif" } });
        t.visible = false; app.stage.addChild(t); texts.push(t);
      }
      let ti = 0;

      function txt(s: string, x: number, y: number, opts: {
        sz?: number; fill?: number; bold?: boolean; align?: "left"|"center"|"right"; alpha?: number;
      } = {}) {
        if (ti >= POOL) return;
        const t = texts[ti++];
        t.text = s; t.visible = true; t.alpha = opts.alpha ?? 1;
        t.style.fontSize = opts.sz ?? 14;
        t.style.fill = opts.fill ?? 0xffffff;
        t.style.fontWeight = opts.bold ? "bold" : "normal";
        t.style.fontFamily = "serif, 'Noto Serif CJK', 'MS Mincho', sans-serif";
        const a = opts.align ?? "left";
        if (a === "center") { t.anchor.set(0.5, 0.5); t.x = x; }
        else if (a === "right") { t.anchor.set(1, 0.5); t.x = x; }
        else { t.anchor.set(0, 0.5); t.x = x; }
        t.y = y;
      }

      function drawPentagon(gfx: PixiGraphics, cx: number, cy: number, w: number, h: number, side: Side, selected: boolean) {
        const hw = w / 2, hh = h / 2;
        const pts: [number, number][] = side === 0
          ? [[cx, cy - hh], [cx + hw, cy - hh * 0.3], [cx + hw * 0.8, cy + hh], [cx - hw * 0.8, cy + hh], [cx - hw, cy - hh * 0.3]]
          : [[cx, cy + hh], [cx - hw, cy + hh * 0.3], [cx - hw * 0.8, cy - hh], [cx + hw * 0.8, cy - hh], [cx + hw, cy + hh * 0.3]];
        gfx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) gfx.lineTo(pts[i][0], pts[i][1]);
        gfx.closePath();
        gfx.fill(selected ? 0xffe0a0 : 0xf5deb3);
        gfx.stroke({ color: selected ? 0xff8800 : 0x8b7355, width: selected ? 2 : 1 });
      }

      // Click/touch
      const onClick = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        handleBoardClick(
          (e.clientX - rect.left) * (W / rect.width),
          (e.clientY - rect.top) * (H / rect.height)
        );
      };
      const onTouch = (e: TouchEvent) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        handleBoardClick(
          (t.clientX - rect.left) * (W / rect.width),
          (t.clientY - rect.top) * (H / rect.height)
        );
      };
      canvas.addEventListener("click", onClick);
      canvas.addEventListener("touchstart", onTouch, { passive: false });

      // Render loop
      const render = () => {
        if (destroyed) return;
        const gs = gsRef.current;
        const sel = selRef.current;
        const valid = validRef.current;

        g.clear();
        ti = 0;
        for (const t of texts) t.visible = false;

        // Background
        g.rect(0, 0, W, H).fill(0x0f0f0f);

        if (phase === "title") {
          // Title screen
          txt("将棋", W / 2, H / 2 - 80, { sz: 42, fill: 0x3ea6ff, bold: true, align: "center" });
          txt("日本象棋 · AI 对战", W / 2, H / 2 - 40, { sz: 14, fill: 0xaaaaaa, align: "center" });

          // Start button
          const bw = 140, bh = 36, bx = W / 2 - bw / 2, by = H / 2 - bh / 2 + 10;
          g.roundRect(bx, by, bw, bh, 8).fill(0x3ea6ff);
          txt("开始对局", W / 2, H / 2 + 10, { sz: 16, fill: 0xffffff, bold: true, align: "center" });

          txt("点击开始 / 按回车", W / 2, H / 2 + 60, { sz: 12, fill: 0x888888, align: "center" });
          txt("鼠标点击选子移动 · 支持持ち駒打入", W / 2, H / 2 + 80, { sz: 12, fill: 0x888888, align: "center" });
          rafId = requestAnimationFrame(render);
          return;
        }

        const ox = PAD + HAND_W; // board origin x
        const oy = PAD;          // board origin y

        // Board background (wooden)
        g.rect(ox, oy, BOARD_W, BOARD_H).fill(0xd4a76a);

        // Grid lines
        for (let i = 0; i <= 9; i++) {
          g.moveTo(ox + i * CELL, oy).lineTo(ox + i * CELL, oy + BOARD_H).stroke({ color: 0x5a4a2a, width: 1 });
          g.moveTo(ox, oy + i * CELL).lineTo(ox + BOARD_W, oy + i * CELL).stroke({ color: 0x5a4a2a, width: 1 });
        }

        // Star points
        for (const [sr, sc] of [[2,2],[2,5],[5,2],[5,5]] as [number,number][]) {
          g.circle(ox + (sc + 0.5) * CELL, oy + (sr + 0.5) * CELL, 3).fill(0x5a4a2a);
        }

        // Valid move dots
        const validSet = new Set(valid.map(([r, c]) => r * 9 + c));
        for (const [vr, vc] of valid) {
          const cx = ox + vc * CELL + CELL / 2;
          const cy = oy + vr * CELL + CELL / 2;
          if (gs.board[vr][vc]) {
            // Capture target: ring
            g.circle(cx, cy, CELL / 2 - 4).stroke({ color: 0xff4444, width: 2, alpha: 0.7 });
          } else {
            g.circle(cx, cy, 6).fill({ color: 0x3ea6ff, alpha: 0.5 });
          }
        }

        // Selected cell highlight
        if (sel && sel.r >= 0) {
          g.rect(ox + sel.c * CELL + 1, oy + sel.r * CELL + 1, CELL - 2, CELL - 2)
            .fill({ color: 0x3ea6ff, alpha: 0.2 });
        }

        // Last move highlight
        if (gs.history.length > 0) {
          const last = gs.history[gs.history.length - 1];
          g.rect(ox + last.toC * CELL + 1, oy + last.toR * CELL + 1, CELL - 2, CELL - 2)
            .fill({ color: 0xffcc00, alpha: 0.15 });
          if (last.fromR >= 0) {
            g.rect(ox + last.fromC * CELL + 1, oy + last.fromR * CELL + 1, CELL - 2, CELL - 2)
              .fill({ color: 0xffcc00, alpha: 0.1 });
          }
        }

        // Check highlight
        if (gs.inCheck[0]) {
          const k = findKing(gs.board, 0);
          if (k) g.rect(ox + k[1] * CELL + 1, oy + k[0] * CELL + 1, CELL - 2, CELL - 2)
            .fill({ color: 0xff0000, alpha: 0.3 });
        }
        if (gs.inCheck[1]) {
          const k = findKing(gs.board, 1);
          if (k) g.rect(ox + k[1] * CELL + 1, oy + k[0] * CELL + 1, CELL - 2, CELL - 2)
            .fill({ color: 0xff0000, alpha: 0.3 });
        }

        // Pieces on board
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            const p = gs.board[r][c];
            if (!p) continue;
            const cx = ox + c * CELL + CELL / 2;
            const cy = oy + r * CELL + CELL / 2;
            const isSel = sel && sel.r === r && sel.c === c;
            drawPentagon(g, cx, cy, CELL * 0.75, CELL * 0.85, p.side, !!isSel);
            const kanji = KANJI[p.type] || "?";
            const isProm = IS_PROMOTED.has(p.type);
            txt(kanji, cx, cy, {
              sz: CELL * 0.38, fill: isProm ? 0xcc0000 : 0x222222,
              bold: true, align: "center",
            });
          }
        }

        // Hand pieces — AI (left side)
        {
          const hx = PAD + 4;
          let hy = oy + 4;
          txt("AI持駒", hx + HAND_W / 2 - 8, hy, { sz: 11, fill: 0x888888 });
          hy += 20;
          const handTypes: PieceType[] = ["R","B","G","S","N","L","P"];
          for (const pt of handTypes) {
            if (gs.hands[1][pt] <= 0) continue;
            drawPentagon(g, hx + 16, hy + 12, 24, 28, 1, false);
            txt(KANJI[pt], hx + 16, hy + 12, { sz: 12, fill: 0x222222, bold: true, align: "center" });
            txt(`x${gs.hands[1][pt]}`, hx + 34, hy + 12, { sz: 11, fill: 0xcccccc });
            hy += 30;
          }
        }

        // Hand pieces — Player (right side)
        {
          const hx = ox + BOARD_W + 8;
          let hy = oy + BOARD_H / 2 - 10;
          txt("持ち駒", hx + HAND_W / 2 - 16, hy - 16, { sz: 11, fill: 0x888888 });
          const handTypes: PieceType[] = ["R","B","G","S","N","L","P"];
          for (const pt of handTypes) {
            if (gs.hands[0][pt] <= 0) continue;
            const isSel = sel?.handPiece === pt;
            drawPentagon(g, hx + 16, hy + 12, 24, 28, 0, isSel);
            txt(KANJI[pt], hx + 16, hy + 12, { sz: 12, fill: 0x222222, bold: true, align: "center" });
            txt(`x${gs.hands[0][pt]}`, hx + 34, hy + 12, { sz: 11, fill: 0xcccccc });
            hy += 30;
          }
        }

        // Column/row labels
        const colLabels = ["9","8","7","6","5","4","3","2","1"];
        const rowLabels = ["一","二","三","四","五","六","七","八","九"];
        for (let i = 0; i < 9; i++) {
          txt(colLabels[i], ox + i * CELL + CELL / 2, oy - 10, { sz: 10, fill: 0x888888, align: "center" });
          txt(rowLabels[i], ox + BOARD_W + 4, oy + i * CELL + CELL / 2, { sz: 10, fill: 0x888888 });
        }

        // Status bar
        const sy = oy + BOARD_H + 16;
        if (phase === "cpu") {
          txt("AI 思考中...", W / 2, sy, { sz: 14, fill: 0xaaaaaa, align: "center" });
        } else if (phase === "playing") {
          txt(gs.turn === 0 ? "你的回合" : "AI 回合", W / 2, sy, { sz: 14, fill: 0x3ea6ff, align: "center" });
        }
        txt(`第 ${gs.moveCount} 手`, ox, sy, { sz: 11, fill: 0x666666 });

        // Game over overlay
        if (phase === "gameover") {
          g.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.65 });
          const isWin = gs.winner === 0;
          txt(isWin ? "你赢了!" : "AI 获胜", W / 2, H / 2 - 20, {
            sz: 32, fill: isWin ? 0x2ed573 : 0xff4757, bold: true, align: "center",
          });
          txt(isWin ? "詰み — 将棋!" : "詰み", W / 2, H / 2 + 15, { sz: 14, fill: 0xaaaaaa, align: "center" });
          txt("点击 新局 重新开始", W / 2, H / 2 + 40, { sz: 13, fill: 0xaaaaaa, align: "center" });
        }

        rafId = requestAnimationFrame(render);
      };

      rafId = requestAnimationFrame(render);
    })();

    return () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
      if (app) { app.destroy(true); app = null; }
    };
  }, [phase, handleBoardClick]);

  /* ----------------------------------------------------------------
     Title click
     ---------------------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || phase !== "title") return;
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const my = (e.clientY - rect.top) * (H / rect.height);
      if (Math.abs(my - (H / 2 + 10)) < 24) startGame();
    };
    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const rect = canvas.getBoundingClientRect();
      const my = (t.clientY - rect.top) * (H / rect.height);
      if (Math.abs(my - (H / 2 + 10)) < 24) startGame();
    };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchstart", onTouch, { passive: false });
    return () => { canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchstart", onTouch); };
  }, [phase, startGame]);

  /* ----------------------------------------------------------------
     Keyboard
     ---------------------------------------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        if (phase === "title") { startGame(); e.preventDefault(); }
        else if (phase === "gameover") { startGame(); e.preventDefault(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startGame]);

  /* ----------------------------------------------------------------
     JSX
     ---------------------------------------------------------------- */
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <main className="max-w-[700px] mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4">
          <ArrowLeft size={16} /> 返回游戏中心
        </Link>

        <div className="flex items-center gap-2 mb-4">
          <Settings2 size={24} className="text-[#3ea6ff]" />
          <h1 className="text-xl font-bold">将棋</h1>
          {phase !== "title" && (
            <span className="ml-2 text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded">
              {turnDisplay === 0 ? "先手" : "后手"}
            </span>
          )}
        </div>

        <div className="flex justify-center">
          <canvas
            ref={canvasRef}
            className="rounded-lg border border-white/10 max-w-full"
            style={{ touchAction: "none" }}
          />
        </div>

        {phase !== "title" && (
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button onClick={startGame}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3ea6ff] rounded-lg text-sm font-medium hover:bg-[#3ea6ff]/80 transition-colors">
              <Plus size={14} /> 新局
            </button>
            <button onClick={handleUndo}
              disabled={phase !== "playing" || gsRef.current.history.length < 2}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-lg text-sm font-medium hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <RotateCcw size={14} /> 悔棋
            </button>
            <button onClick={resign}
              disabled={phase !== "playing"}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-lg text-sm font-medium hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <Flag size={14} /> 认输
            </button>
            <button onClick={() => { setMuted(!muted); soundRef.current?.toggleMute(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-lg text-sm font-medium hover:bg-white/20 transition-colors">
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              {muted ? "静音" : "音效"}
            </button>
            <button onClick={() => setShowLeaderboard(!showLeaderboard)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-lg text-sm font-medium hover:bg-white/20 transition-colors ml-auto">
              <Trophy size={14} /> 排行
            </button>
          </div>
        )}

        {phase !== "title" && (
          <div className="flex items-center justify-between mt-3 text-sm text-gray-400">
            <span>
              {phase === "gameover"
                ? winnerDisplay === 0 ? "你赢了!" : "AI 获胜"
                : phase === "cpu" ? "AI 思考中..." : "你的回合"}
            </span>
            <span>第 {moveCount} 手</span>
          </div>
        )}

        {phase === "playing" && (
          <div className="mt-3 text-xs text-gray-600">
            <p>点击棋子选择，再点击目标位置移动 | 右侧持ち駒可打入棋盘</p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </div>
  );
}
