"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import {
  ChevronLeft, Play, Volume2, VolumeX, RotateCcw, Crown,
} from "lucide-react";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Container } from "pixi.js";

/* ================================================================== */
/*  常量                                                               */
/* ================================================================== */
const GAME_ID = "chess-intl";
const BOARD_SIZE = 8;
const LIGHT_SQ = 0xe8d5b5;
const DARK_SQ = 0xb58863;
const WHITE_PIECE = 0xf0f0f0;
const BLACK_PIECE = 0x333333;
const HIGHLIGHT_MOVE = 0x7ec850;
const HIGHLIGHT_SEL = 0xf6f669;
const HIGHLIGHT_CHECK = 0xff4444;
const PRIMARY = 0x3ea6ff;

/* ================================================================== */
/*  类型                                                               */
/* ================================================================== */
type PieceType = "K" | "Q" | "R" | "B" | "N" | "P";
type Color = "w" | "b";
type GameScreen = "title" | "diffSelect" | "playing" | "gameover";
type Difficulty = "easy" | "normal" | "hard";

interface Piece {
  type: PieceType;
  color: Color;
  moved?: boolean;
}

type Board = (Piece | null)[][];

interface GameState {
  board: Board;
  turn: Color;
  enPassantTarget: [number, number] | null;
  halfMoveClock: number;
  moveCount: number;
  inCheck: boolean;
  gameOver: boolean;
  result: "checkmate" | "stalemate" | null;
  winner: Color | null;
  selectedSquare: [number, number] | null;
  validMoves: [number, number][];
  lastMove: { from: [number, number]; to: [number, number] } | null;
}

/* ================================================================== */
/*  初始棋盘                                                           */
/* ================================================================== */
function createInitialBoard(): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const backRank: PieceType[] = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: backRank[c], color: "b" };
    board[1][c] = { type: "P", color: "b" };
    board[6][c] = { type: "P", color: "w" };
    board[7][c] = { type: backRank[c], color: "w" };
  }
  return board;
}

function cloneBoard(b: Board): Board {
  return b.map(row => row.map(p => (p ? { ...p } : null)));
}

/* ================================================================== */
/*  棋子价值                                                           */
/* ================================================================== */
const PIECE_VALUE: Record<PieceType, number> = {
  P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000,
};

// Piece-square tables for positional evaluation
const PST_PAWN = [
  [0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],
  [5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],
  [5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0],
];
const PST_KNIGHT = [
  [-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],
  [-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],
  [-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],
  [-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50],
];
const PST_BISHOP = [
  [-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],
  [-10,0,10,10,10,10,0,-10],[-10,5,5,10,10,5,5,-10],
  [-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],
  [-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20],
];
const PST_ROOK = [
  [0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],
  [-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],
  [-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],
  [-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0],
];
const PST_QUEEN = [
  [-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],
  [-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],
  [0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],
  [-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20],
];
const PST_KING_MID = [
  [-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],
  [20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20],
];

function getPST(type: PieceType): number[][] {
  switch (type) {
    case "P": return PST_PAWN;
    case "N": return PST_KNIGHT;
    case "B": return PST_BISHOP;
    case "R": return PST_ROOK;
    case "Q": return PST_QUEEN;
    case "K": return PST_KING_MID;
  }
}

/* ================================================================== */
/*  移动生成                                                           */
/* ================================================================== */
function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function findKing(board: Board, color: Color): [number, number] {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.type === "K" && board[r][c]?.color === color)
        return [r, c];
  return [-1, -1]; // should never happen
}

function isSquareAttacked(board: Board, r: number, c: number, byColor: Color): boolean {
  // Pawn attacks
  const pawnDir = byColor === "w" ? 1 : -1;
  for (const dc of [-1, 1]) {
    const pr = r + pawnDir;
    const pc = c + dc;
    if (inBounds(pr, pc) && board[pr][pc]?.type === "P" && board[pr][pc]?.color === byColor)
      return true;
  }
  // Knight attacks
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc) && board[nr][nc]?.type === "N" && board[nr][nc]?.color === byColor)
      return true;
  }
  // Sliding attacks (Bishop/Queen diagonals, Rook/Queen straights)
  const slideDirs: [number, number, PieceType[]][] = [
    [0,1,["R","Q"]],[0,-1,["R","Q"]],[1,0,["R","Q"]],[-1,0,["R","Q"]],
    [1,1,["B","Q"]],[1,-1,["B","Q"]],[-1,1,["B","Q"]],[-1,-1,["B","Q"]],
  ];
  for (const [dr, dc, types] of slideDirs) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === byColor && (types as string[]).includes(p.type)) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
  // King attacks
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && board[nr][nc]?.type === "K" && board[nr][nc]?.color === byColor)
        return true;
    }
  return false;
}

function isInCheck(board: Board, color: Color): boolean {
  const [kr, kc] = findKing(board, color);
  if (kr === -1) return false;
  return isSquareAttacked(board, kr, kc, color === "w" ? "b" : "w");
}

/** Generate pseudo-legal moves for a piece, then filter for legality */
function getRawMoves(board: Board, r: number, c: number, enPassant: [number, number] | null): [number, number][] {
  const piece = board[r][c];
  if (!piece) return [];
  const moves: [number, number][] = [];
  const color = piece.color;
  const enemy = color === "w" ? "b" : "w";

  const addIfValid = (nr: number, nc: number) => {
    if (inBounds(nr, nc) && board[nr][nc]?.color !== color) moves.push([nr, nc]);
  };

  switch (piece.type) {
    case "P": {
      const dir = color === "w" ? -1 : 1;
      const startRow = color === "w" ? 6 : 1;
      // Forward
      if (inBounds(r + dir, c) && !board[r + dir][c]) {
        moves.push([r + dir, c]);
        if (r === startRow && !board[r + 2 * dir][c]) moves.push([r + 2 * dir, c]);
      }
      // Captures
      for (const dc of [-1, 1]) {
        const nr = r + dir, nc = c + dc;
        if (inBounds(nr, nc)) {
          if (board[nr][nc]?.color === enemy) moves.push([nr, nc]);
          if (enPassant && enPassant[0] === nr && enPassant[1] === nc) moves.push([nr, nc]);
        }
      }
      break;
    }
    case "N":
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
        addIfValid(r + dr, c + dc);
      break;
    case "B":
      for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc)) {
          if (board[nr][nc]) { if (board[nr][nc]!.color === enemy) moves.push([nr, nc]); break; }
          moves.push([nr, nc]);
          nr += dr; nc += dc;
        }
      }
      break;
    case "R":
      for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc)) {
          if (board[nr][nc]) { if (board[nr][nc]!.color === enemy) moves.push([nr, nc]); break; }
          moves.push([nr, nc]);
          nr += dr; nc += dc;
        }
      }
      break;
    case "Q":
      for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc)) {
          if (board[nr][nc]) { if (board[nr][nc]!.color === enemy) moves.push([nr, nc]); break; }
          moves.push([nr, nc]);
          nr += dr; nc += dc;
        }
      }
      break;
    case "K":
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          addIfValid(r + dr, c + dc);
        }
      // Castling
      if (!piece.moved && !isInCheck(board, color)) {
        const row = color === "w" ? 7 : 0;
        if (r === row && c === 4) {
          // Kingside
          const rook = board[row][7];
          if (rook?.type === "R" && rook.color === color && !rook.moved &&
              !board[row][5] && !board[row][6] &&
              !isSquareAttacked(board, row, 5, enemy) &&
              !isSquareAttacked(board, row, 6, enemy)) {
            moves.push([row, 6]);
          }
          // Queenside
          const qRook = board[row][0];
          if (qRook?.type === "R" && qRook.color === color && !qRook.moved &&
              !board[row][1] && !board[row][2] && !board[row][3] &&
              !isSquareAttacked(board, row, 3, enemy) &&
              !isSquareAttacked(board, row, 2, enemy)) {
            moves.push([row, 2]);
          }
        }
      }
      break;
  }
  return moves;
}

function getLegalMoves(board: Board, r: number, c: number, enPassant: [number, number] | null): [number, number][] {
  const piece = board[r][c];
  if (!piece) return [];
  const raw = getRawMoves(board, r, c, enPassant);
  return raw.filter(([nr, nc]) => {
    const nb = cloneBoard(board);
    // Handle en passant capture
    if (piece.type === "P" && enPassant && nr === enPassant[0] && nc === enPassant[1]) {
      const captureRow = piece.color === "w" ? nr + 1 : nr - 1;
      nb[captureRow][nc] = null;
    }
    // Handle castling rook move
    if (piece.type === "K" && Math.abs(nc - c) === 2) {
      const row = r;
      if (nc === 6) { nb[row][5] = nb[row][7]; nb[row][7] = null; }
      if (nc === 2) { nb[row][3] = nb[row][0]; nb[row][0] = null; }
    }
    nb[nr][nc] = nb[r][c];
    nb[r][c] = null;
    return !isInCheck(nb, piece.color);
  });
}

function getAllLegalMoves(board: Board, color: Color, enPassant: [number, number] | null): { from: [number, number]; to: [number, number] }[] {
  const moves: { from: [number, number]; to: [number, number] }[] = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.color === color)
        for (const [nr, nc] of getLegalMoves(board, r, c, enPassant))
          moves.push({ from: [r, c], to: [nr, nc] });
  return moves;
}

/* ================================================================== */
/*  执行移动                                                           */
/* ================================================================== */
interface MoveResult {
  board: Board;
  enPassant: [number, number] | null;
  captured: boolean;
  castled: boolean;
  promoted: boolean;
}

function executeMove(board: Board, from: [number, number], to: [number, number], enPassant: [number, number] | null): MoveResult {
  const nb = cloneBoard(board);
  const [fr, fc] = from;
  const [tr, tc] = to;
  const piece = nb[fr][fc]!;
  let captured = !!nb[tr][tc];
  let castled = false;
  let promoted = false;
  let newEnPassant: [number, number] | null = null;

  // En passant capture
  if (piece.type === "P" && enPassant && tr === enPassant[0] && tc === enPassant[1]) {
    const captureRow = piece.color === "w" ? tr + 1 : tr - 1;
    nb[captureRow][tc] = null;
    captured = true;
  }

  // Castling
  if (piece.type === "K" && Math.abs(tc - fc) === 2) {
    castled = true;
    if (tc === 6) { nb[fr][5] = nb[fr][7]; nb[fr][7] = null; if (nb[fr][5]) nb[fr][5]!.moved = true; }
    if (tc === 2) { nb[fr][3] = nb[fr][0]; nb[fr][0] = null; if (nb[fr][3]) nb[fr][3]!.moved = true; }
  }

  // Pawn double push — set en passant target
  if (piece.type === "P" && Math.abs(tr - fr) === 2) {
    newEnPassant = [(fr + tr) / 2, fc];
  }

  nb[tr][tc] = { ...piece, moved: true };
  nb[fr][fc] = null;

  // Pawn promotion (auto-queen)
  if (piece.type === "P" && (tr === 0 || tr === 7)) {
    nb[tr][tc] = { type: "Q", color: piece.color, moved: true };
    promoted = true;
  }

  return { board: nb, enPassant: newEnPassant, captured, castled, promoted };
}

/* ================================================================== */
/*  评估函数                                                           */
/* ================================================================== */
function evaluate(board: Board): number {
  let score = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const pst = getPST(p.type);
      const row = p.color === "w" ? r : 7 - r;
      const val = PIECE_VALUE[p.type] + pst[row][c];
      score += p.color === "w" ? val : -val;
    }
  return score;
}

/* ================================================================== */
/*  AI — Minimax + Alpha-Beta                                          */
/* ================================================================== */
function minimax(
  board: Board, depth: number, alpha: number, beta: number,
  maximizing: boolean, enPassant: [number, number] | null,
): number {
  if (depth === 0) return evaluate(board);
  const color: Color = maximizing ? "w" : "b";
  const moves = getAllLegalMoves(board, color, enPassant);
  if (moves.length === 0) {
    if (isInCheck(board, color)) return maximizing ? -99999 + (3 - depth) : 99999 - (3 - depth);
    return 0; // stalemate
  }

  // Move ordering: captures first
  moves.sort((a, b) => {
    const capA = board[a.to[0]][a.to[1]] ? PIECE_VALUE[board[a.to[0]][a.to[1]]!.type] : 0;
    const capB = board[b.to[0]][b.to[1]] ? PIECE_VALUE[board[b.to[0]][b.to[1]]!.type] : 0;
    return capB - capA;
  });

  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const result = executeMove(board, move.from, move.to, enPassant);
      const ev = minimax(result.board, depth - 1, alpha, beta, false, result.enPassant);
      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const result = executeMove(board, move.from, move.to, enPassant);
      const ev = minimax(result.board, depth - 1, alpha, beta, true, result.enPassant);
      minEval = Math.min(minEval, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function getAIMove(board: Board, enPassant: [number, number] | null, difficulty: Difficulty): { from: [number, number]; to: [number, number] } | null {
  const moves = getAllLegalMoves(board, "b", enPassant);
  if (moves.length === 0) return null;

  const depth = difficulty === "easy" ? 1 : difficulty === "normal" ? 2 : 3;

  // Easy mode: 30% random
  if (difficulty === "easy" && Math.random() < 0.3) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  let bestMove = moves[0];
  let bestEval = Infinity;
  for (const move of moves) {
    const result = executeMove(board, move.from, move.to, enPassant);
    const ev = minimax(result.board, depth - 1, -Infinity, Infinity, true, result.enPassant);
    if (ev < bestEval) {
      bestEval = ev;
      bestMove = move;
    }
  }
  return bestMove;
}

/* ================================================================== */
/*  音效引擎                                                           */
/* ================================================================== */
class ChessSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.12) {
    if (this.muted) return;
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch { /* ignore */ }
  }

  playMove() { this.tone(440, 0.08, "triangle"); setTimeout(() => this.tone(520, 0.06, "triangle"), 40); }
  playCapture() { this.tone(200, 0.12, "sawtooth", 0.1); this.tone(300, 0.08, "square", 0.08); }
  playCheck() { this.tone(880, 0.1, "sine"); setTimeout(() => this.tone(660, 0.15, "sine"), 80); }
  playCastle() { this.tone(330, 0.08, "triangle"); setTimeout(() => this.tone(440, 0.08, "triangle"), 60); setTimeout(() => this.tone(550, 0.1, "triangle"), 120); }
  playGameOver() { [523, 494, 440, 392].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, "triangle"), i * 200)); }
  playWin() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, "triangle"), i * 120)); }
  playClick() { this.tone(660, 0.04, "sine", 0.08); }
  toggleMute(): boolean { this.muted = !this.muted; return this.muted; }
  isMuted(): boolean { return this.muted; }
  dispose() { this.ctx?.close(); this.ctx = null; }
}


/* ================================================================== */
/*  PixiJS 棋子绘制                                                    */
/* ================================================================== */
function hexToNum(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

async function drawPieceGraphic(
  pixi: typeof import("pixi.js"),
  type: PieceType,
  color: Color,
  size: number,
): Promise<PixiGraphics> {
  const g = new pixi.Graphics();
  const fill = color === "w" ? WHITE_PIECE : BLACK_PIECE;
  const stroke = color === "w" ? 0xaaaaaa : 0x666666;
  const cx = size / 2;
  const cy = size / 2;
  const unit = size / 10;

  switch (type) {
    case "P": {
      // Pawn: small circle on a base
      g.circle(cx, cy - unit, unit * 2);
      g.fill({ color: fill });
      g.circle(cx, cy - unit, unit * 2);
      g.stroke({ color: stroke, width: 1.2 });
      // Base
      g.roundRect(cx - unit * 2.2, cy + unit * 1.5, unit * 4.4, unit * 1.8, 2);
      g.fill({ color: fill });
      g.roundRect(cx - unit * 2.2, cy + unit * 1.5, unit * 4.4, unit * 1.8, 2);
      g.stroke({ color: stroke, width: 1 });
      break;
    }
    case "R": {
      // Rook: rectangle body with battlements
      const bw = unit * 5;
      const bh = unit * 6;
      const bx = cx - bw / 2;
      const by = cy - bh / 2 + unit;
      g.rect(bx, by, bw, bh);
      g.fill({ color: fill });
      g.rect(bx, by, bw, bh);
      g.stroke({ color: stroke, width: 1.2 });
      // Battlements (3 notches)
      const battH = unit * 1.5;
      const battW = bw / 5;
      for (let i = 0; i < 3; i++) {
        const bxp = bx + battW * (i * 2);
        g.rect(bxp, by - battH, battW, battH);
        g.fill({ color: fill });
        g.rect(bxp, by - battH, battW, battH);
        g.stroke({ color: stroke, width: 1 });
      }
      break;
    }
    case "N": {
      // Knight: L-shaped body
      const baseX = cx - unit * 2;
      const baseY = cy + unit * 2;
      // Vertical part
      g.rect(baseX, cy - unit * 3, unit * 2.5, unit * 5);
      g.fill({ color: fill });
      g.rect(baseX, cy - unit * 3, unit * 2.5, unit * 5);
      g.stroke({ color: stroke, width: 1.2 });
      // Horizontal part (head)
      g.rect(baseX, cy - unit * 3, unit * 5, unit * 2);
      g.fill({ color: fill });
      g.rect(baseX, cy - unit * 3, unit * 5, unit * 2);
      g.stroke({ color: stroke, width: 1.2 });
      // Eye dot
      g.circle(baseX + unit * 3.5, cy - unit * 2, unit * 0.5);
      g.fill({ color: stroke });
      // Base
      g.roundRect(cx - unit * 2.5, baseY, unit * 5, unit * 1.5, 2);
      g.fill({ color: fill });
      g.roundRect(cx - unit * 2.5, baseY, unit * 5, unit * 1.5, 2);
      g.stroke({ color: stroke, width: 1 });
      break;
    }
    case "B": {
      // Bishop: circle body with pointed top
      g.circle(cx, cy + unit * 0.5, unit * 2.5);
      g.fill({ color: fill });
      g.circle(cx, cy + unit * 0.5, unit * 2.5);
      g.stroke({ color: stroke, width: 1.2 });
      // Pointed top (triangle)
      g.moveTo(cx, cy - unit * 4);
      g.lineTo(cx - unit * 1.2, cy - unit * 1.5);
      g.lineTo(cx + unit * 1.2, cy - unit * 1.5);
      g.closePath();
      g.fill({ color: fill });
      g.moveTo(cx, cy - unit * 4);
      g.lineTo(cx - unit * 1.2, cy - unit * 1.5);
      g.lineTo(cx + unit * 1.2, cy - unit * 1.5);
      g.closePath();
      g.stroke({ color: stroke, width: 1.2 });
      // Base
      g.roundRect(cx - unit * 2.5, cy + unit * 2.5, unit * 5, unit * 1.5, 2);
      g.fill({ color: fill });
      g.roundRect(cx - unit * 2.5, cy + unit * 2.5, unit * 5, unit * 1.5, 2);
      g.stroke({ color: stroke, width: 1 });
      break;
    }
    case "Q": {
      // Queen: circle with crown (3 small triangles on top)
      g.circle(cx, cy + unit * 0.5, unit * 2.8);
      g.fill({ color: fill });
      g.circle(cx, cy + unit * 0.5, unit * 2.8);
      g.stroke({ color: stroke, width: 1.2 });
      // Crown: 3 triangles
      const crownY = cy - unit * 2;
      for (let i = -1; i <= 1; i++) {
        const tx = cx + i * unit * 1.8;
        g.moveTo(tx, crownY - unit * 2);
        g.lineTo(tx - unit * 0.8, crownY);
        g.lineTo(tx + unit * 0.8, crownY);
        g.closePath();
        g.fill({ color: fill });
        g.moveTo(tx, crownY - unit * 2);
        g.lineTo(tx - unit * 0.8, crownY);
        g.lineTo(tx + unit * 0.8, crownY);
        g.closePath();
        g.stroke({ color: stroke, width: 1 });
      }
      // Base
      g.roundRect(cx - unit * 2.8, cy + unit * 2.8, unit * 5.6, unit * 1.5, 2);
      g.fill({ color: fill });
      g.roundRect(cx - unit * 2.8, cy + unit * 2.8, unit * 5.6, unit * 1.5, 2);
      g.stroke({ color: stroke, width: 1 });
      break;
    }
    case "K": {
      // King: circle with cross on top
      g.circle(cx, cy + unit * 0.5, unit * 2.8);
      g.fill({ color: fill });
      g.circle(cx, cy + unit * 0.5, unit * 2.8);
      g.stroke({ color: stroke, width: 1.2 });
      // Cross
      const crossY = cy - unit * 2.5;
      g.rect(cx - unit * 0.5, crossY - unit * 2.5, unit, unit * 2.5);
      g.fill({ color: fill });
      g.rect(cx - unit * 0.5, crossY - unit * 2.5, unit, unit * 2.5);
      g.stroke({ color: stroke, width: 1 });
      g.rect(cx - unit * 1.2, crossY - unit * 1.8, unit * 2.4, unit);
      g.fill({ color: fill });
      g.rect(cx - unit * 1.2, crossY - unit * 1.8, unit * 2.4, unit);
      g.stroke({ color: stroke, width: 1 });
      // Base
      g.roundRect(cx - unit * 2.8, cy + unit * 2.8, unit * 5.6, unit * 1.5, 2);
      g.fill({ color: fill });
      g.roundRect(cx - unit * 2.8, cy + unit * 2.8, unit * 5.6, unit * 1.5, 2);
      g.stroke({ color: stroke, width: 1 });
      break;
    }
  }
  return g;
}


/* ================================================================== */
/*  PixiJS 棋盘渲染                                                    */
/* ================================================================== */
async function renderBoard(
  pixi: typeof import("pixi.js"),
  app: Application,
  state: GameState,
  sqSize: number,
  boardOffset: { x: number; y: number },
) {
  // Clear stage
  while (app.stage.children.length > 0) app.stage.removeChildAt(0);

  const boardContainer = new pixi.Container();
  boardContainer.x = boardOffset.x;
  boardContainer.y = boardOffset.y;
  app.stage.addChild(boardContainer);

  const [kr, kc] = state.inCheck ? findKing(state.board, state.turn) : [-1, -1];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const x = c * sqSize;
      const y = r * sqSize;
      const isLight = (r + c) % 2 === 0;

      // Square background
      const sq = new pixi.Graphics();
      sq.rect(x, y, sqSize, sqSize);
      sq.fill({ color: isLight ? LIGHT_SQ : DARK_SQ });

      // Highlight last move
      if (state.lastMove) {
        const { from, to } = state.lastMove;
        if ((r === from[0] && c === from[1]) || (r === to[0] && c === to[1])) {
          sq.rect(x, y, sqSize, sqSize);
          sq.fill({ color: 0xf6f669, alpha: 0.35 });
        }
      }

      // Highlight selected square
      if (state.selectedSquare && state.selectedSquare[0] === r && state.selectedSquare[1] === c) {
        sq.rect(x, y, sqSize, sqSize);
        sq.fill({ color: HIGHLIGHT_SEL, alpha: 0.5 });
      }

      // Highlight check
      if (state.inCheck && r === kr && c === kc) {
        sq.rect(x, y, sqSize, sqSize);
        sq.fill({ color: HIGHLIGHT_CHECK, alpha: 0.45 });
      }

      boardContainer.addChild(sq);

      // Valid move indicators
      if (state.validMoves.some(([mr, mc]) => mr === r && mc === c)) {
        const dot = new pixi.Graphics();
        if (state.board[r][c]) {
          // Capture indicator: ring
          dot.circle(x + sqSize / 2, y + sqSize / 2, sqSize * 0.45);
          dot.stroke({ color: HIGHLIGHT_MOVE, width: 3, alpha: 0.7 });
        } else {
          // Move indicator: dot
          dot.circle(x + sqSize / 2, y + sqSize / 2, sqSize * 0.15);
          dot.fill({ color: HIGHLIGHT_MOVE, alpha: 0.6 });
        }
        boardContainer.addChild(dot);
      }

      // Draw piece
      const piece = state.board[r][c];
      if (piece) {
        const pieceG = await drawPieceGraphic(pixi, piece.type, piece.color, sqSize * 0.85);
        pieceG.x = x + sqSize * 0.075;
        pieceG.y = y + sqSize * 0.075;
        boardContainer.addChild(pieceG);
      }
    }
  }

  // File/rank labels
  const labelStyle = new pixi.TextStyle({
    fontSize: 10,
    fill: "#888888",
    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
  });
  for (let i = 0; i < 8; i++) {
    const fileLabel = new pixi.Text({ text: String.fromCharCode(97 + i), style: labelStyle });
    fileLabel.x = boardOffset.x + i * sqSize + sqSize / 2 - 3;
    fileLabel.y = boardOffset.y + 8 * sqSize + 2;
    app.stage.addChild(fileLabel);

    const rankLabel = new pixi.Text({ text: String(8 - i), style: labelStyle });
    rankLabel.x = boardOffset.x - 12;
    rankLabel.y = boardOffset.y + i * sqSize + sqSize / 2 - 5;
    app.stage.addChild(rankLabel);
  }
}

/* ================================================================== */
/*  React 组件                                                         */
/* ================================================================== */
export default function ChessIntlPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<GameScreen>("title");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [muted, setMuted] = useState(false);
  const [statusText, setStatusText] = useState("白方回合");
  const [moveHistory, setMoveHistory] = useState<string[]>([]);

  const soundRef = useRef<ChessSoundEngine | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const appRef = useRef<Application | null>(null);
  const pixiRef = useRef<typeof import("pixi.js") | null>(null);
  const screenRef = useRef(screen);
  const diffRef = useRef(difficulty);
  const aiThinkingRef = useRef(false);

  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { diffRef.current = difficulty; }, [difficulty]);

  // Init sound
  useEffect(() => {
    soundRef.current = new ChessSoundEngine();
    return () => { soundRef.current?.dispose(); };
  }, []);

  const createNewGame = useCallback((): GameState => ({
    board: createInitialBoard(),
    turn: "w",
    enPassantTarget: null,
    halfMoveClock: 0,
    moveCount: 1,
    inCheck: false,
    gameOver: false,
    result: null,
    winner: null,
    selectedSquare: null,
    validMoves: [],
    lastMove: null,
  }), []);

  const getSquareLabel = (r: number, c: number): string =>
    String.fromCharCode(97 + c) + String(8 - r);

  const getPieceLabel = (type: PieceType): string => {
    const labels: Record<PieceType, string> = { K: "K", Q: "Q", R: "R", B: "B", N: "N", P: "" };
    return labels[type];
  };

  const redraw = useCallback(async () => {
    if (!appRef.current || !pixiRef.current || !gameRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const boardPx = Math.min(w, h) - 30;
    const sqSize = boardPx / 8;
    const offsetX = (w - boardPx) / 2;
    const offsetY = (h - boardPx) / 2;
    await renderBoard(pixiRef.current, appRef.current, gameRef.current, sqSize, { x: offsetX, y: offsetY });
  }, []);

  const handleSquareClick = useCallback(async (r: number, c: number) => {
    const state = gameRef.current;
    if (!state || state.gameOver || state.turn !== "w" || aiThinkingRef.current) return;

    const piece = state.board[r][c];

    // If a square is selected and this is a valid move target
    if (state.selectedSquare) {
      const isValidTarget = state.validMoves.some(([mr, mc]) => mr === r && mc === c);
      if (isValidTarget) {
        // Execute player move
        const result = executeMove(state.board, state.selectedSquare, [r, c], state.enPassantTarget);
        const movePiece = state.board[state.selectedSquare[0]][state.selectedSquare[1]]!;
        const moveLabel = getPieceLabel(movePiece.type) + getSquareLabel(r, c);

        // Play sound
        if (result.castled) soundRef.current?.playCastle();
        else if (result.captured) soundRef.current?.playCapture();
        else soundRef.current?.playMove();

        state.board = result.board;
        state.enPassantTarget = result.enPassant;
        state.lastMove = { from: state.selectedSquare, to: [r, c] };
        state.selectedSquare = null;
        state.validMoves = [];
        state.turn = "b";

        // Check for check/checkmate/stalemate
        const opponentMoves = getAllLegalMoves(state.board, "b", state.enPassantTarget);
        state.inCheck = isInCheck(state.board, "b");

        if (opponentMoves.length === 0) {
          state.gameOver = true;
          if (state.inCheck) {
            state.result = "checkmate";
            state.winner = "w";
            setStatusText("将杀! 白方胜利!");
            soundRef.current?.playWin();
          } else {
            state.result = "stalemate";
            setStatusText("和棋 (逼和)");
            soundRef.current?.playGameOver();
          }
          setScreen("gameover");
          setMoveHistory(prev => [...prev, moveLabel + "#"]);
          await redraw();
          return;
        }

        if (state.inCheck) {
          soundRef.current?.playCheck();
          setMoveHistory(prev => [...prev, moveLabel + "+"]);
        } else {
          setMoveHistory(prev => [...prev, moveLabel]);
        }

        setStatusText("黑方思考中...");
        await redraw();

        // AI move
        aiThinkingRef.current = true;
        await new Promise(resolve => setTimeout(resolve, 300));

        const aiMove = getAIMove(state.board, state.enPassantTarget, diffRef.current);
        if (aiMove) {
          const aiResult = executeMove(state.board, aiMove.from, aiMove.to, state.enPassantTarget);
          const aiPiece = state.board[aiMove.from[0]][aiMove.from[1]]!;
          const aiLabel = getPieceLabel(aiPiece.type) + getSquareLabel(aiMove.to[0], aiMove.to[1]);

          if (aiResult.castled) soundRef.current?.playCastle();
          else if (aiResult.captured) soundRef.current?.playCapture();
          else soundRef.current?.playMove();

          state.board = aiResult.board;
          state.enPassantTarget = aiResult.enPassant;
          state.lastMove = { from: aiMove.from, to: aiMove.to };
          state.turn = "w";

          const playerMoves = getAllLegalMoves(state.board, "w", state.enPassantTarget);
          state.inCheck = isInCheck(state.board, "w");

          if (playerMoves.length === 0) {
            state.gameOver = true;
            if (state.inCheck) {
              state.result = "checkmate";
              state.winner = "b";
              setStatusText("将杀! 黑方胜利!");
              soundRef.current?.playGameOver();
            } else {
              state.result = "stalemate";
              setStatusText("和棋 (逼和)");
              soundRef.current?.playGameOver();
            }
            setScreen("gameover");
            setMoveHistory(prev => [...prev, aiLabel + "#"]);
          } else {
            if (state.inCheck) {
              soundRef.current?.playCheck();
              setStatusText("将军! 白方回合");
              setMoveHistory(prev => [...prev, aiLabel + "+"]);
            } else {
              setStatusText("白方回合");
              setMoveHistory(prev => [...prev, aiLabel]);
            }
          }
        }
        aiThinkingRef.current = false;
        await redraw();
        return;
      }

      // Clicking on own piece — reselect
      if (piece && piece.color === "w") {
        state.selectedSquare = [r, c];
        state.validMoves = getLegalMoves(state.board, r, c, state.enPassantTarget);
        soundRef.current?.playClick();
        await redraw();
        return;
      }

      // Deselect
      state.selectedSquare = null;
      state.validMoves = [];
      await redraw();
      return;
    }

    // No selection yet — select own piece
    if (piece && piece.color === "w") {
      state.selectedSquare = [r, c];
      state.validMoves = getLegalMoves(state.board, r, c, state.enPassantTarget);
      soundRef.current?.playClick();
      await redraw();
    }
  }, [redraw]);

  // PixiJS init
  useEffect(() => {
    if (screen !== "playing" && screen !== "gameover") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;
    let app: Application | null = null;

    const init = async () => {
      const pixi = await loadPixi();
      if (destroyed) return;
      pixiRef.current = pixi;

      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : 600;
      const size = Math.min(w, 600);

      app = await createPixiApp({
        canvas,
        width: size,
        height: size + 20,
        backgroundColor: 0x0f0f0f,
      });
      appRef.current = app;

      if (!gameRef.current) {
        gameRef.current = createNewGame();
      }
      await redraw();
    };

    init();

    return () => {
      destroyed = true;
      if (app) { app.destroy(true); app = null; }
      appRef.current = null;
    };
  }, [screen, createNewGame, redraw]);

  // Canvas click handler
  useEffect(() => {
    if (screen !== "playing" && screen !== "gameover") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      let clientX: number, clientY: number;
      if ("touches" in e) {
        if (e.touches.length === 0) return;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const dpr = window.devicePixelRatio || 1;
      const canvasW = canvas.width / dpr;
      const canvasH = canvas.height / dpr;
      const boardPx = Math.min(canvasW, canvasH) - 30;
      const sqSize = boardPx / 8;
      const offsetX = (canvasW - boardPx) / 2;
      const offsetY = (canvasH - boardPx) / 2;

      const x = (clientX - rect.left) * (canvasW / rect.width) - offsetX;
      const y = (clientY - rect.top) * (canvasH / rect.height) - offsetY;

      const col = Math.floor(x / sqSize);
      const row = Math.floor(y / sqSize);

      if (row >= 0 && row < 8 && col >= 0 && col < 8) {
        handleSquareClick(row, col);
      }
    };

    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("touchstart", handleClick, { passive: false });
    return () => {
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("touchstart", handleClick);
    };
  }, [screen, handleSquareClick]);

  const startGame = useCallback((diff: Difficulty) => {
    setDifficulty(diff);
    gameRef.current = createNewGame();
    setStatusText("白方回合");
    setMoveHistory([]);
    aiThinkingRef.current = false;
    setScreen("playing");
    soundRef.current?.playClick();
  }, [createNewGame]);

  const resetGame = useCallback(() => {
    gameRef.current = createNewGame();
    setStatusText("白方回合");
    setMoveHistory([]);
    aiThinkingRef.current = false;
    setScreen("playing");
    redraw();
  }, [createNewGame, redraw]);

  // Save/Load handlers
  const handleSave = useCallback(() => {
    if (!gameRef.current) return null;
    const s = gameRef.current;
    return {
      board: s.board,
      turn: s.turn,
      enPassantTarget: s.enPassantTarget,
      halfMoveClock: s.halfMoveClock,
      moveCount: s.moveCount,
      inCheck: s.inCheck,
      gameOver: s.gameOver,
      result: s.result,
      winner: s.winner,
      lastMove: s.lastMove,
      difficulty,
      moveHistory,
    };
  }, [difficulty, moveHistory]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d || !d.board) return;
    gameRef.current = {
      board: d.board as Board,
      turn: (d.turn as Color) || "w",
      enPassantTarget: (d.enPassantTarget as [number, number] | null) || null,
      halfMoveClock: (d.halfMoveClock as number) || 0,
      moveCount: (d.moveCount as number) || 1,
      inCheck: (d.inCheck as boolean) || false,
      gameOver: (d.gameOver as boolean) || false,
      result: (d.result as GameState["result"]) || null,
      winner: (d.winner as Color | null) || null,
      selectedSquare: null,
      validMoves: [],
      lastMove: (d.lastMove as GameState["lastMove"]) || null,
    };
    if (d.difficulty) setDifficulty(d.difficulty as Difficulty);
    if (d.moveHistory) setMoveHistory(d.moveHistory as string[]);
    setStatusText(gameRef.current.turn === "w" ? "白方回合" : "黑方回合");
    if (gameRef.current.gameOver) {
      setScreen("gameover");
    } else {
      setScreen("playing");
    }
    setTimeout(() => redraw(), 100);
  }, [redraw]);

  const DIFF_LABELS: Record<Difficulty, string> = { easy: "简单", normal: "普通", hard: "困难" };

  /* ================================================================ */
  /*  渲染 UI                                                         */
  /* ================================================================ */
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-6 pb-24 lg:pb-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4">
          <ChevronLeft size={16} /> 返回游戏中心
        </Link>

        <div className="flex items-center gap-2 mb-4">
          <Crown size={24} className="text-[#3ea6ff]" />
          <h1 className="text-xl font-bold">国际象棋</h1>
          <button
            onClick={() => { const m = soundRef.current?.toggleMute(); setMuted(!!m); }}
            className="ml-auto p-2 rounded-lg hover:bg-white/10"
          >
            {muted ? <VolumeX size={18} className="text-gray-500" /> : <Volume2 size={18} className="text-[#3ea6ff]" />}
          </button>
        </div>

        {/* ========== 标题画面 ========== */}
        {screen === "title" && (
          <div className="text-center space-y-6">
            <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-[#1a1a2e] to-[#0f0f0f] p-8 overflow-hidden">
              <Crown size={48} className="text-[#3ea6ff] mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-[#3ea6ff] mb-2">国际象棋</h2>
              <p className="text-gray-400 mb-6">与AI对弈，挑战你的棋艺</p>
              <button
                onClick={() => setScreen("diffSelect")}
                className="flex items-center gap-2 px-6 py-3 bg-[#3ea6ff] rounded-xl font-bold hover:bg-[#3ea6ff]/80 transition mx-auto"
              >
                <Play size={18} /> 开始对弈
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#1a1a1a] p-4 text-left text-sm text-gray-400 space-y-1">
              <p className="text-[#3ea6ff] font-bold mb-2">操作说明</p>
              <p>点击/触摸选择棋子，再次点击目标格移动</p>
              <p>绿色圆点表示可移动位置，绿色圆环表示可吃子</p>
              <p>支持王车易位、吃过路兵、兵升变（自动升后）</p>
              <p>白方（你）先行，黑方为AI对手</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
              <GameLeaderboard gameId={GAME_ID} />
            </div>
          </div>
        )}

        {/* ========== 难度选择 ========== */}
        {screen === "diffSelect" && (
          <div className="text-center space-y-6">
            <h2 className="text-2xl font-bold">选择难度</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto">
              {(["easy", "normal", "hard"] as Difficulty[]).map(d => (
                <button
                  key={d}
                  onClick={() => startGame(d)}
                  className="rounded-xl border border-white/10 bg-[#1a1a1a] p-6 hover:border-[#3ea6ff] transition text-center"
                >
                  <div className="text-lg font-bold mb-1">{DIFF_LABELS[d]}</div>
                  <div className="text-xs text-gray-500">
                    {d === "easy" ? "搜索深度 1" : d === "normal" ? "搜索深度 2" : "搜索深度 3"}
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setScreen("title")}
              className="text-sm text-gray-500 hover:text-[#3ea6ff] transition"
            >
              返回
            </button>
          </div>
        )}

        {/* ========== 对弈画面 ========== */}
        {(screen === "playing" || screen === "gameover") && (
          <div className="space-y-4">
            {/* Status bar */}
            <div className="flex items-center justify-between rounded-xl bg-[#1a1a1a] border border-white/10 px-4 py-2">
              <span className="text-sm font-bold text-[#3ea6ff]">{statusText}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{DIFF_LABELS[difficulty]}</span>
                <button
                  onClick={resetGame}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition"
                  title="重新开始"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
            </div>

            {/* Canvas */}
            <div className="flex justify-center">
              <div className="w-full max-w-[600px]">
                <canvas
                  ref={canvasRef}
                  className="w-full rounded-xl border border-white/10"
                  style={{ touchAction: "none", aspectRatio: "1 / 1.03" }}
                />
              </div>
            </div>

            {/* Game over overlay */}
            {screen === "gameover" && gameRef.current && (
              <div className="rounded-xl bg-[#1a1a1a] border border-white/10 p-6 text-center space-y-4">
                <h2 className="text-2xl font-bold text-[#3ea6ff]">
                  {gameRef.current.result === "checkmate"
                    ? gameRef.current.winner === "w" ? "将杀! 白方胜利!" : "将杀! 黑方胜利!"
                    : "和棋"}
                </h2>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => startGame(difficulty)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#3ea6ff] rounded-xl font-bold hover:bg-[#3ea6ff]/80 transition"
                  >
                    <RotateCcw size={16} /> 再来一局
                  </button>
                  <button
                    onClick={() => { setScreen("title"); gameRef.current = null; }}
                    className="px-5 py-2.5 bg-white/10 rounded-xl font-bold hover:bg-white/20 transition"
                  >
                    返回标题
                  </button>
                </div>
              </div>
            )}

            {/* Move history */}
            {moveHistory.length > 0 && (
              <div className="rounded-xl bg-[#1a1a1a] border border-white/10 p-4">
                <h3 className="text-sm font-bold text-[#3ea6ff] mb-2">走棋记录</h3>
                <div className="flex flex-wrap gap-1 text-xs text-gray-400 max-h-24 overflow-y-auto">
                  {moveHistory.map((m, i) => (
                    <span key={i} className={i % 2 === 0 ? "text-gray-300" : "text-gray-500"}>
                      {i % 2 === 0 ? `${Math.floor(i / 2) + 1}.` : ""}{m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
              <GameLeaderboard gameId={GAME_ID} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
