"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import {
  ChevronLeft, RotateCcw, Play, Volume2, VolumeX,
  Trophy, Save, Undo2, Flag, Cpu, Swords
} from "lucide-react";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Container, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

/* ================================================================== */
/*  常量                                                               */
/* ================================================================== */
const GAME_ID = "xiangqi";
const BOARD_COLS = 9;
const BOARD_ROWS = 10;
const CELL = 64;
const MARGIN = 40;
const PIECE_R = 26;
const W = MARGIN * 2 + CELL * (BOARD_COLS - 1); // 552
const H = MARGIN * 2 + CELL * (BOARD_ROWS - 1); // 656

type Side = "red" | "black";
type PieceType = "general" | "advisor" | "elephant" | "horse" | "chariot" | "cannon" | "pawn";
type GameScreen = "title" | "playing" | "over";
type Difficulty = "easy" | "normal" | "hard";

interface Piece {
  type: PieceType;
  side: Side;
  row: number;
  col: number;
}

interface Move {
  piece: Piece;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  captured: Piece | null;
}

/* 棋子中文名 */
const PIECE_CHARS: Record<Side, Record<PieceType, string>> = {
  red: { general: "帅", advisor: "仕", elephant: "相", horse: "马", chariot: "车", cannon: "炮", pawn: "兵" },
  black: { general: "将", advisor: "士", elephant: "象", horse: "马", chariot: "车", cannon: "砲", pawn: "卒" },
};

/* 棋子价值（用于 AI 评估） */
const PIECE_VALUES: Record<PieceType, number> = {
  general: 10000, advisor: 20, elephant: 20, horse: 40, chariot: 90, cannon: 45, pawn: 10,
};

/* 位置加成表（简化版） */
const POSITION_BONUS: Partial<Record<PieceType, number[][]>> = {
  pawn: (() => {
    const t: number[][] = [];
    for (let r = 0; r < 10; r++) {
      t[r] = [];
      for (let c = 0; c < 9; c++) {
        if (r >= 5) t[r][c] = 0;
        else if (r >= 3) t[r][c] = (c >= 3 && c <= 5) ? 6 : 4;
        else t[r][c] = (c >= 3 && c <= 5) ? 8 : 5;
      }
    }
    return t;
  })(),
  horse: (() => {
    const t: number[][] = [];
    for (let r = 0; r < 10; r++) {
      t[r] = [];
      for (let c = 0; c < 9; c++) {
        const centerDist = Math.abs(c - 4) + Math.abs(r - 4.5);
        t[r][c] = Math.max(0, 8 - centerDist);
      }
    }
    return t;
  })(),
  chariot: (() => {
    const t: number[][] = [];
    for (let r = 0; r < 10; r++) {
      t[r] = [];
      for (let c = 0; c < 9; c++) {
        t[r][c] = (r >= 3 && r <= 6) ? 4 : 2;
      }
    }
    return t;
  })(),
};

/* ================================================================== */
/*  音效引擎                                                           */
/* ================================================================== */
class XiangqiSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.12) {
    if (this.muted) return;
    try {
      const c = this.getCtx();
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g).connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur);
    } catch { /* ignore */ }
  }

  playMove() { this.tone(600, 0.08, "triangle"); setTimeout(() => this.tone(800, 0.06, "triangle"), 40); }
  playCapture() { this.tone(300, 0.12, "sawtooth", 0.1); setTimeout(() => this.tone(200, 0.15, "square", 0.08), 50); }
  playCheck() { this.tone(880, 0.1, "sine"); setTimeout(() => this.tone(1100, 0.1, "sine"), 80); setTimeout(() => this.tone(880, 0.15, "sine"), 160); }
  playCheckmate() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, "triangle"), i * 120)); }
  playSelect() { this.tone(660, 0.05, "sine", 0.08); }
  playInvalid() { this.tone(200, 0.15, "square", 0.06); }
  playStalemate() { [400, 350, 300].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, "sine", 0.08), i * 150)); }
  toggleMute(): boolean { this.muted = !this.muted; return this.muted; }
  isMuted(): boolean { return this.muted; }
  dispose() { this.ctx?.close(); this.ctx = null; }
}

/* ================================================================== */
/*  初始棋盘                                                           */
/* ================================================================== */
function createInitialBoard(): Piece[] {
  const pieces: Piece[] = [];
  const addSymmetric = (type: PieceType, side: Side, row: number, cols: number[]) => {
    cols.forEach(c => pieces.push({ type, side, row, col: c }));
  };
  // 红方 (bottom, rows 7-9)
  addSymmetric("chariot", "red", 9, [0, 8]);
  addSymmetric("horse", "red", 9, [1, 7]);
  addSymmetric("elephant", "red", 9, [2, 6]);
  addSymmetric("advisor", "red", 9, [3, 5]);
  pieces.push({ type: "general", side: "red", row: 9, col: 4 });
  addSymmetric("cannon", "red", 7, [1, 7]);
  addSymmetric("pawn", "red", 6, [0, 2, 4, 6, 8]);
  // 黑方 (top, rows 0-2)
  addSymmetric("chariot", "black", 0, [0, 8]);
  addSymmetric("horse", "black", 0, [1, 7]);
  addSymmetric("elephant", "black", 0, [2, 6]);
  addSymmetric("advisor", "black", 0, [3, 5]);
  pieces.push({ type: "general", side: "black", row: 0, col: 4 });
  addSymmetric("cannon", "black", 2, [1, 7]);
  addSymmetric("pawn", "black", 3, [0, 2, 4, 6, 8]);
  return pieces;
}

/* ================================================================== */
/*  规则引擎                                                           */
/* ================================================================== */
function getPieceAt(pieces: Piece[], row: number, col: number): Piece | null {
  return pieces.find(p => p.row === row && p.col === col) || null;
}

function inBoard(r: number, c: number): boolean {
  return r >= 0 && r <= 9 && c >= 0 && c <= 8;
}

function inPalace(r: number, c: number, side: Side): boolean {
  if (c < 3 || c > 5) return false;
  return side === "red" ? (r >= 7 && r <= 9) : (r >= 0 && r <= 2);
}

function getRawMoves(piece: Piece, pieces: Piece[]): [number, number][] {
  const { type, side, row, col } = piece;
  const moves: [number, number][] = [];

  const addIfValid = (r: number, c: number) => {
    if (!inBoard(r, c)) return;
    const target = getPieceAt(pieces, r, c);
    if (target && target.side === side) return;
    moves.push([r, c]);
  };

  switch (type) {
    case "general": {
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dr, dc] of dirs) {
        const nr = row + dr, nc = col + dc;
        if (inPalace(nr, nc, side)) addIfValid(nr, nc);
      }
      break;
    }
    case "advisor": {
      const dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dr, dc] of dirs) {
        const nr = row + dr, nc = col + dc;
        if (inPalace(nr, nc, side)) addIfValid(nr, nc);
      }
      break;
    }
    case "elephant": {
      const dirs = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
      for (const [dr, dc] of dirs) {
        const nr = row + dr, nc = col + dc;
        const blockR = row + dr / 2, blockC = col + dc / 2;
        if (!inBoard(nr, nc)) continue;
        // Cannot cross river
        if (side === "red" && nr < 5) continue;
        if (side === "black" && nr > 4) continue;
        // Blocking piece check (elephant eye)
        if (getPieceAt(pieces, blockR, blockC)) continue;
        addIfValid(nr, nc);
      }
      break;
    }
    case "horse": {
      const jumps: [number, number, number, number][] = [
        [-2, -1, -1, 0], [-2, 1, -1, 0],
        [2, -1, 1, 0], [2, 1, 1, 0],
        [-1, -2, 0, -1], [-1, 2, 0, 1],
        [1, -2, 0, -1], [1, 2, 0, 1],
      ];
      for (const [dr, dc, br, bc] of jumps) {
        const nr = row + dr, nc = col + dc;
        if (!inBoard(nr, nc)) continue;
        // Leg blocking
        if (getPieceAt(pieces, row + br, col + bc)) continue;
        addIfValid(nr, nc);
      }
      break;
    }
    case "chariot": {
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dr, dc] of dirs) {
        for (let i = 1; i < 10; i++) {
          const nr = row + dr * i, nc = col + dc * i;
          if (!inBoard(nr, nc)) break;
          const target = getPieceAt(pieces, nr, nc);
          if (target) {
            if (target.side !== side) moves.push([nr, nc]);
            break;
          }
          moves.push([nr, nc]);
        }
      }
      break;
    }
    case "cannon": {
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dr, dc] of dirs) {
        let jumped = false;
        for (let i = 1; i < 10; i++) {
          const nr = row + dr * i, nc = col + dc * i;
          if (!inBoard(nr, nc)) break;
          const target = getPieceAt(pieces, nr, nc);
          if (!jumped) {
            if (target) jumped = true;
            else moves.push([nr, nc]);
          } else {
            if (target) {
              if (target.side !== side) moves.push([nr, nc]);
              break;
            }
          }
        }
      }
      break;
    }
    case "pawn": {
      const forward = side === "red" ? -1 : 1;
      const crossedRiver = side === "red" ? row <= 4 : row >= 5;
      addIfValid(row + forward, col);
      if (crossedRiver) {
        addIfValid(row, col - 1);
        addIfValid(row, col + 1);
      }
      break;
    }
  }
  return moves;
}

/* 检查将帅是否面对面 */
function generalsAreFacing(pieces: Piece[]): boolean {
  const redGen = pieces.find(p => p.type === "general" && p.side === "red");
  const blackGen = pieces.find(p => p.type === "general" && p.side === "black");
  if (!redGen || !blackGen) return false;
  if (redGen.col !== blackGen.col) return false;
  // Check if any piece is between them
  const minR = Math.min(redGen.row, blackGen.row);
  const maxR = Math.max(redGen.row, blackGen.row);
  for (let r = minR + 1; r < maxR; r++) {
    if (getPieceAt(pieces, r, redGen.col)) return false;
  }
  return true;
}

/* 模拟走棋后检查是否合法（不被将军、不让将帅面对面） */
function simulateMove(pieces: Piece[], piece: Piece, toRow: number, toCol: number): Piece[] {
  const newPieces = pieces.filter(p => !(p.row === toRow && p.col === toCol));
  return newPieces.map(p =>
    p === piece ? { ...p, row: toRow, col: toCol } : p
  );
}

function isInCheck(pieces: Piece[], side: Side): boolean {
  const general = pieces.find(p => p.type === "general" && p.side === side);
  if (!general) return true;
  const opponent = side === "red" ? "black" : "red";
  return pieces
    .filter(p => p.side === opponent)
    .some(p => getRawMoves(p, pieces).some(([r, c]) => r === general.row && c === general.col));
}

function getValidMoves(piece: Piece, pieces: Piece[]): [number, number][] {
  const raw = getRawMoves(piece, pieces);
  return raw.filter(([r, c]) => {
    const simulated = simulateMove(pieces, piece, r, c);
    if (isInCheck(simulated, piece.side)) return false;
    if (generalsAreFacing(simulated)) return false;
    return true;
  });
}

function getAllValidMoves(pieces: Piece[], side: Side): { piece: Piece; moves: [number, number][] }[] {
  const result: { piece: Piece; moves: [number, number][] }[] = [];
  for (const p of pieces.filter(p => p.side === side)) {
    const moves = getValidMoves(p, pieces);
    if (moves.length > 0) result.push({ piece: p, moves });
  }
  return result;
}

function isCheckmate(pieces: Piece[], side: Side): boolean {
  return getAllValidMoves(pieces, side).length === 0 && isInCheck(pieces, side);
}

function isStalemate(pieces: Piece[], side: Side): boolean {
  return getAllValidMoves(pieces, side).length === 0 && !isInCheck(pieces, side);
}


/* ================================================================== */
/*  AI 引擎 — Minimax + Alpha-Beta                                    */
/* ================================================================== */
function evaluateBoard(pieces: Piece[], aiSide: Side): number {
  const opponentSide = aiSide === "red" ? "black" : "red";
  let score = 0;
  for (const p of pieces) {
    const baseVal = PIECE_VALUES[p.type];
    const bonus = POSITION_BONUS[p.type];
    let posVal = 0;
    if (bonus) {
      const r = p.side === aiSide ? p.row : (9 - p.row);
      const c = p.col;
      posVal = bonus[r]?.[c] ?? 0;
    }
    const total = baseVal + posVal;
    score += p.side === aiSide ? total : -total;
  }
  // Mobility bonus
  const aiMoves = getAllValidMoves(pieces, aiSide);
  const oppMoves = getAllValidMoves(pieces, opponentSide);
  score += aiMoves.reduce((s, m) => s + m.moves.length, 0) * 0.5;
  score -= oppMoves.reduce((s, m) => s + m.moves.length, 0) * 0.5;
  // Check bonus
  if (isInCheck(pieces, opponentSide)) score += 30;
  if (isInCheck(pieces, aiSide)) score -= 30;
  return score;
}

interface AIMove {
  piece: Piece;
  toRow: number;
  toCol: number;
  score: number;
}

function minimax(
  pieces: Piece[],
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  aiSide: Side,
): number {
  const currentSide = maximizing ? aiSide : (aiSide === "red" ? "black" : "red");
  if (depth === 0) return evaluateBoard(pieces, aiSide);
  if (isCheckmate(pieces, currentSide)) return maximizing ? -99999 + (4 - depth) : 99999 - (4 - depth);
  if (isStalemate(pieces, currentSide)) return 0;

  const allMoves = getAllValidMoves(pieces, currentSide);
  if (allMoves.length === 0) return evaluateBoard(pieces, aiSide);

  if (maximizing) {
    let maxEval = -Infinity;
    for (const { piece, moves } of allMoves) {
      for (const [r, c] of moves) {
        const sim = simulateMove(pieces, piece, r, c);
        const ev = minimax(sim, depth - 1, alpha, beta, false, aiSide);
        maxEval = Math.max(maxEval, ev);
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) break;
      }
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const { piece, moves } of allMoves) {
      for (const [r, c] of moves) {
        const sim = simulateMove(pieces, piece, r, c);
        const ev = minimax(sim, depth - 1, alpha, beta, true, aiSide);
        minEval = Math.min(minEval, ev);
        beta = Math.min(beta, ev);
        if (beta <= alpha) break;
      }
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function getAIMove(pieces: Piece[], aiSide: Side, depth: number): AIMove | null {
  const allMoves = getAllValidMoves(pieces, aiSide);
  if (allMoves.length === 0) return null;

  let bestMove: AIMove | null = null;
  let bestScore = -Infinity;

  // Sort moves for better pruning: captures first, then checks
  const sortedMoves: { piece: Piece; r: number; c: number; priority: number }[] = [];
  for (const { piece, moves } of allMoves) {
    for (const [r, c] of moves) {
      const captured = getPieceAt(pieces, r, c);
      let priority = 0;
      if (captured) priority += PIECE_VALUES[captured.type];
      const sim = simulateMove(pieces, piece, r, c);
      const oppSide = aiSide === "red" ? "black" : "red";
      if (isInCheck(sim, oppSide)) priority += 50;
      sortedMoves.push({ piece, r, c, priority });
    }
  }
  sortedMoves.sort((a, b) => b.priority - a.priority);

  for (const { piece, r, c } of sortedMoves) {
    const sim = simulateMove(pieces, piece, r, c);
    const score = minimax(sim, depth - 1, -Infinity, Infinity, false, aiSide);
    if (score > bestScore) {
      bestScore = score;
      bestMove = { piece, toRow: r, toCol: c, score };
    }
  }
  return bestMove;
}

const DEPTH_MAP: Record<Difficulty, number> = { easy: 2, normal: 3, hard: 4 };


/* ================================================================== */
/*  PixiJS 渲染                                                       */
/* ================================================================== */
function hexToNum(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

async function drawBoard(app: Application) {
  const pixi = await loadPixi();
  const board = new pixi.Container();
  board.label = "board";

  // Wood background
  const bg = new pixi.Graphics();
  bg.rect(0, 0, W, H);
  bg.fill({ color: 0xd4a76a });
  board.addChild(bg);

  // Wood grain texture effect
  const grain = new pixi.Graphics();
  for (let i = 0; i < 30; i++) {
    const y = Math.random() * H;
    grain.moveTo(0, y);
    grain.lineTo(W, y + (Math.random() - 0.5) * 20);
    grain.stroke({ color: 0xc49a5e, width: 0.5, alpha: 0.3 });
  }
  board.addChild(grain);

  const lineColor = 0x4a3520;
  const lineWidth = 1.5;
  const lines = new pixi.Graphics();

  // Horizontal lines
  for (let r = 0; r < BOARD_ROWS; r++) {
    const y = MARGIN + r * CELL;
    lines.moveTo(MARGIN, y);
    lines.lineTo(MARGIN + (BOARD_COLS - 1) * CELL, y);
    lines.stroke({ color: lineColor, width: lineWidth });
  }

  // Vertical lines (with river gap for inner lines)
  for (let c = 0; c < BOARD_COLS; c++) {
    if (c === 0 || c === BOARD_COLS - 1) {
      // Edge lines go full length
      lines.moveTo(MARGIN + c * CELL, MARGIN);
      lines.lineTo(MARGIN + c * CELL, MARGIN + (BOARD_ROWS - 1) * CELL);
      lines.stroke({ color: lineColor, width: lineWidth });
    } else {
      // Top half
      lines.moveTo(MARGIN + c * CELL, MARGIN);
      lines.lineTo(MARGIN + c * CELL, MARGIN + 4 * CELL);
      lines.stroke({ color: lineColor, width: lineWidth });
      // Bottom half
      lines.moveTo(MARGIN + c * CELL, MARGIN + 5 * CELL);
      lines.lineTo(MARGIN + c * CELL, MARGIN + 9 * CELL);
      lines.stroke({ color: lineColor, width: lineWidth });
    }
  }

  // Palace diagonals — top
  lines.moveTo(MARGIN + 3 * CELL, MARGIN);
  lines.lineTo(MARGIN + 5 * CELL, MARGIN + 2 * CELL);
  lines.stroke({ color: lineColor, width: lineWidth });
  lines.moveTo(MARGIN + 5 * CELL, MARGIN);
  lines.lineTo(MARGIN + 3 * CELL, MARGIN + 2 * CELL);
  lines.stroke({ color: lineColor, width: lineWidth });

  // Palace diagonals — bottom
  lines.moveTo(MARGIN + 3 * CELL, MARGIN + 7 * CELL);
  lines.lineTo(MARGIN + 5 * CELL, MARGIN + 9 * CELL);
  lines.stroke({ color: lineColor, width: lineWidth });
  lines.moveTo(MARGIN + 5 * CELL, MARGIN + 7 * CELL);
  lines.lineTo(MARGIN + 3 * CELL, MARGIN + 9 * CELL);
  lines.stroke({ color: lineColor, width: lineWidth });

  board.addChild(lines);

  // River text
  const riverY = MARGIN + 4.5 * CELL;
  const riverStyle = new pixi.TextStyle({
    fontSize: 28,
    fill: 0x4a3520,
    fontFamily: "serif",
    fontWeight: "bold",
    letterSpacing: 20,
  });
  const chuhe = new pixi.Text({ text: "楚河", style: riverStyle });
  chuhe.anchor.set(0.5);
  chuhe.x = MARGIN + 1.5 * CELL;
  chuhe.y = riverY;
  board.addChild(chuhe);

  const hanjie = new pixi.Text({ text: "汉界", style: riverStyle });
  hanjie.anchor.set(0.5);
  hanjie.x = MARGIN + 6.5 * CELL;
  hanjie.y = riverY;
  board.addChild(hanjie);

  // Star points (cross marks at cannon and pawn positions)
  const starPositions = [
    [2, 1], [2, 7], [3, 0], [3, 2], [3, 4], [3, 6], [3, 8],
    [6, 0], [6, 2], [6, 4], [6, 6], [6, 8], [7, 1], [7, 7],
  ];
  const starSize = 6;
  const starGap = 3;
  const stars = new pixi.Graphics();
  for (const [r, c] of starPositions) {
    const x = MARGIN + c * CELL;
    const y = MARGIN + r * CELL;
    // Draw small cross marks
    const drawArm = (dx: number, dy: number) => {
      if (c + dx / Math.abs(dx || 1) >= 0 && c + dx / Math.abs(dx || 1) <= 8) {
        stars.moveTo(x + dx * starGap, y + dy * starGap);
        stars.lineTo(x + dx * (starGap + starSize), y + dy * starGap);
        stars.stroke({ color: lineColor, width: 1 });
        stars.moveTo(x + dx * starGap, y + dy * starGap);
        stars.lineTo(x + dx * starGap, y + dy * (starGap + starSize));
        stars.stroke({ color: lineColor, width: 1 });
      }
    };
    if (c > 0) { drawArm(-1, -1); drawArm(-1, 1); }
    if (c < 8) { drawArm(1, -1); drawArm(1, 1); }
  }
  board.addChild(stars);

  // Outer border
  const border = new pixi.Graphics();
  border.rect(MARGIN - 8, MARGIN - 8, (BOARD_COLS - 1) * CELL + 16, (BOARD_ROWS - 1) * CELL + 16);
  border.stroke({ color: lineColor, width: 3 });
  board.addChild(border);

  app.stage.addChild(board);
}

async function drawPieces(
  app: Application,
  pieces: Piece[],
  selectedPiece: Piece | null,
  validMoves: [number, number][],
  lastMove: Move | null,
) {
  const pixi = await loadPixi();

  // Remove old pieces container
  const old = app.stage.children.find(c => c.label === "pieces");
  if (old) app.stage.removeChild(old);

  const container = new pixi.Container();
  container.label = "pieces";

  // Last move highlight
  if (lastMove) {
    const fromG = new pixi.Graphics();
    fromG.rect(
      MARGIN + lastMove.fromCol * CELL - CELL / 2,
      MARGIN + lastMove.fromRow * CELL - CELL / 2,
      CELL, CELL
    );
    fromG.fill({ color: 0xffeb3b, alpha: 0.15 });
    container.addChild(fromG);

    const toG = new pixi.Graphics();
    toG.rect(
      MARGIN + lastMove.toCol * CELL - CELL / 2,
      MARGIN + lastMove.toRow * CELL - CELL / 2,
      CELL, CELL
    );
    toG.fill({ color: 0xffeb3b, alpha: 0.25 });
    container.addChild(toG);
  }

  // Valid move indicators
  for (const [r, c] of validMoves) {
    const x = MARGIN + c * CELL;
    const y = MARGIN + r * CELL;
    const target = getPieceAt(pieces, r, c);
    const indicator = new pixi.Graphics();
    if (target) {
      // Capture indicator — ring
      indicator.circle(x, y, PIECE_R + 4);
      indicator.stroke({ color: 0xff4444, width: 3, alpha: 0.7 });
    } else {
      // Move indicator — dot
      indicator.circle(x, y, 8);
      indicator.fill({ color: 0x4caf50, alpha: 0.6 });
    }
    container.addChild(indicator);
  }

  // Draw each piece
  for (const piece of pieces) {
    const x = MARGIN + piece.col * CELL;
    const y = MARGIN + piece.row * CELL;
    const isSelected = selectedPiece === piece;
    const pieceColor = piece.side === "red" ? 0xcc0000 : 0x333333;
    const textColor = piece.side === "red" ? "#cc0000" : "#333333";

    // Selected glow
    if (isSelected) {
      const glow = new pixi.Graphics();
      glow.circle(x, y, PIECE_R + 6);
      glow.fill({ color: 0x3ea6ff, alpha: 0.3 });
      glow.circle(x, y, PIECE_R + 10);
      glow.fill({ color: 0x3ea6ff, alpha: 0.15 });
      container.addChild(glow);
    }

    // Piece shadow
    const shadow = new pixi.Graphics();
    shadow.circle(x + 2, y + 2, PIECE_R);
    shadow.fill({ color: 0x000000, alpha: 0.2 });
    container.addChild(shadow);

    // Piece body — outer ring
    const outer = new pixi.Graphics();
    outer.circle(x, y, PIECE_R);
    outer.fill({ color: 0xf5e6c8 });
    outer.stroke({ color: pieceColor, width: 2 });
    container.addChild(outer);

    // Inner ring
    const inner = new pixi.Graphics();
    inner.circle(x, y, PIECE_R - 4);
    inner.stroke({ color: pieceColor, width: 1.5 });
    container.addChild(inner);

    // Chinese character
    const charStyle = new pixi.TextStyle({
      fontSize: 22,
      fill: textColor,
      fontFamily: "serif, SimSun, STSong, 'Noto Serif CJK SC'",
      fontWeight: "bold",
    });
    const charText = new pixi.Text({ text: PIECE_CHARS[piece.side][piece.type], style: charStyle });
    charText.anchor.set(0.5);
    charText.x = x;
    charText.y = y;
    container.addChild(charText);
  }

  app.stage.addChild(container);
}

async function drawUI(
  app: Application,
  screen: GameScreen,
  turn: Side,
  inCheck: boolean,
  winner: Side | null,
  stalemate: boolean,
  moveCount: number,
  aiThinking: boolean,
) {
  const pixi = await loadPixi();
  const old = app.stage.children.find(c => c.label === "ui-overlay");
  if (old) app.stage.removeChild(old);

  const ui = new pixi.Container();
  ui.label = "ui-overlay";

  if (screen === "title") {
    // Title overlay
    const overlay = new pixi.Graphics();
    overlay.rect(0, 0, W, H);
    overlay.fill({ color: 0x000000, alpha: 0.7 });
    ui.addChild(overlay);

    const titleStyle = new pixi.TextStyle({
      fontSize: 48,
      fill: "#d4a76a",
      fontFamily: "serif",
      fontWeight: "bold",
    });
    const title = new pixi.Text({ text: "中国象棋", style: titleStyle });
    title.anchor.set(0.5);
    title.x = W / 2;
    title.y = H / 2 - 60;
    ui.addChild(title);

    const subStyle = new pixi.TextStyle({
      fontSize: 18,
      fill: "#aaa",
      fontFamily: "sans-serif",
    });
    const sub = new pixi.Text({ text: "点击「开始对局」按钮开始", style: subStyle });
    sub.anchor.set(0.5);
    sub.x = W / 2;
    sub.y = H / 2 + 10;
    ui.addChild(sub);
  } else if (screen === "over") {
    const overlay = new pixi.Graphics();
    overlay.rect(0, 0, W, H);
    overlay.fill({ color: 0x000000, alpha: 0.6 });
    ui.addChild(overlay);

    let resultText = "";
    if (stalemate) {
      resultText = "和棋";
    } else if (winner === "red") {
      resultText = "红方胜 — 将死!";
    } else {
      resultText = "黑方胜 — 将死!";
    }

    const resultStyle = new pixi.TextStyle({
      fontSize: 40,
      fill: stalemate ? "#ffd700" : (winner === "red" ? "#cc0000" : "#ffffff"),
      fontFamily: "serif",
      fontWeight: "bold",
      dropShadow: {
        color: "#000000",
        distance: 2,
      },
    });
    const result = new pixi.Text({ text: resultText, style: resultStyle });
    result.anchor.set(0.5);
    result.x = W / 2;
    result.y = H / 2 - 30;
    ui.addChild(result);

    const moveStyle = new pixi.TextStyle({ fontSize: 16, fill: "#aaa", fontFamily: "sans-serif" });
    const moveText = new pixi.Text({ text: `共 ${moveCount} 手`, style: moveStyle });
    moveText.anchor.set(0.5);
    moveText.x = W / 2;
    moveText.y = H / 2 + 20;
    ui.addChild(moveText);
  } else {
    // Playing — status bar at top
    if (inCheck) {
      const checkStyle = new pixi.TextStyle({
        fontSize: 20,
        fill: "#ff4444",
        fontFamily: "sans-serif",
        fontWeight: "bold",
      });
      const checkText = new pixi.Text({ text: "将军!", style: checkStyle });
      checkText.anchor.set(0.5);
      checkText.x = W / 2;
      checkText.y = 16;
      ui.addChild(checkText);
    }

    if (aiThinking) {
      const thinkStyle = new pixi.TextStyle({
        fontSize: 14,
        fill: "#3ea6ff",
        fontFamily: "sans-serif",
      });
      const thinkText = new pixi.Text({ text: "AI 思考中...", style: thinkStyle });
      thinkText.anchor.set(0.5);
      thinkText.x = W / 2;
      thinkText.y = H - 12;
      ui.addChild(thinkText);
    }
  }

  app.stage.addChild(ui);
}


/* ================================================================== */
/*  React 组件                                                         */
/* ================================================================== */
const DIFF_LABELS: Record<Difficulty, string> = { easy: "简单", normal: "普通", hard: "困难" };

export default function XiangqiPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);
  const soundRef = useRef<XiangqiSoundEngine | null>(null);

  const [screen, setScreen] = useState<GameScreen>("title");
  const [pieces, setPieces] = useState<Piece[]>(createInitialBoard);
  const [turn, setTurn] = useState<Side>("red");
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [validMovesState, setValidMovesState] = useState<[number, number][]>([]);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [moveHistory, setMoveHistory] = useState<Move[]>([]);
  const [inCheckState, setInCheckState] = useState(false);
  const [winner, setWinner] = useState<Side | null>(null);
  const [stalemate, setStalemate] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [playerSide] = useState<Side>("red");
  const [muted, setMuted] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [canvasScale, setCanvasScale] = useState(1);

  // Refs for latest state in callbacks
  const piecesRef = useRef(pieces);
  const turnRef = useRef(turn);
  const screenRef = useRef(screen);
  const selectedRef = useRef(selectedPiece);
  const validMovesRef = useRef(validMovesState);
  const aiThinkingRef = useRef(aiThinking);

  piecesRef.current = pieces;
  turnRef.current = turn;
  screenRef.current = screen;
  selectedRef.current = selectedPiece;
  validMovesRef.current = validMovesState;
  aiThinkingRef.current = aiThinking;

  /* ---- Init PixiJS ---- */
  useEffect(() => {
    if (!canvasRef.current) return;
    let destroyed = false;

    const init = async () => {
      const app = await createPixiApp({
        canvas: canvasRef.current!,
        width: W,
        height: H,
        backgroundColor: hexToNum("#d4a76a"),
      });
      if (destroyed) { app.destroy(); return; }
      appRef.current = app;
      soundRef.current = new XiangqiSoundEngine();
      await drawBoard(app);
      await drawPieces(app, piecesRef.current, null, [], null);
      await drawUI(app, "title", "red", false, null, false, 0, false);
    };
    init();

    return () => {
      destroyed = true;
      soundRef.current?.dispose();
      appRef.current?.destroy();
      appRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Responsive scaling ---- */
  useEffect(() => {
    const handleResize = () => {
      const container = canvasRef.current?.parentElement;
      if (!container) return;
      const maxW = container.clientWidth - 16;
      const scale = Math.min(1, maxW / W);
      setCanvasScale(scale);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /* ---- Redraw on state change ---- */
  const redraw = useCallback(async (
    p: Piece[], sel: Piece | null, vm: [number, number][], lm: Move | null,
    scr: GameScreen, t: Side, chk: boolean, w: Side | null, sm: boolean, mc: number, ait: boolean,
  ) => {
    const app = appRef.current;
    if (!app) return;
    await drawPieces(app, p, sel, vm, lm);
    await drawUI(app, scr, t, chk, w, sm, mc, ait);
  }, []);

  useEffect(() => {
    redraw(pieces, selectedPiece, validMovesState, lastMove, screen, turn, inCheckState, winner, stalemate, moveHistory.length, aiThinking);
  }, [pieces, selectedPiece, validMovesState, lastMove, screen, turn, inCheckState, winner, stalemate, moveHistory.length, aiThinking, redraw]);

  /* ---- Execute a move ---- */
  const executeMove = useCallback((piece: Piece, toRow: number, toCol: number, currentPieces: Piece[]) => {
    const captured = getPieceAt(currentPieces, toRow, toCol);
    const move: Move = {
      piece,
      fromRow: piece.row,
      fromCol: piece.col,
      toRow,
      toCol,
      captured,
    };

    const newPieces = simulateMove(currentPieces, piece, toRow, toCol);
    const nextTurn: Side = piece.side === "red" ? "black" : "red";

    // Sound
    if (captured) soundRef.current?.playCapture();
    else soundRef.current?.playMove();

    // Check for check/checkmate/stalemate
    const check = isInCheck(newPieces, nextTurn);
    const mate = isCheckmate(newPieces, nextTurn);
    const stale = isStalemate(newPieces, nextTurn);

    if (check && !mate) soundRef.current?.playCheck();
    if (mate) soundRef.current?.playCheckmate();
    if (stale) soundRef.current?.playStalemate();

    setPieces(newPieces);
    setTurn(nextTurn);
    setSelectedPiece(null);
    setValidMovesState([]);
    setLastMove(move);
    setMoveHistory(prev => [...prev, move]);
    setInCheckState(check);

    if (mate) {
      setWinner(piece.side);
      setScreen("over");
      // Submit score
      const moveCount = moveHistory.length + 1;
      const score = Math.max(1000 - moveCount * 10, 100);
      fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score }),
      }).catch(() => {});
    } else if (stale) {
      setStalemate(true);
      setScreen("over");
    }

    return { newPieces, nextTurn, mate, stale };
  }, [moveHistory.length]);

  /* ---- AI turn ---- */
  const runAI = useCallback((currentPieces: Piece[], aiSide: Side) => {
    setAiThinking(true);
    // Use setTimeout to not block UI
    setTimeout(() => {
      const depth = DEPTH_MAP[difficulty];
      const move = getAIMove(currentPieces, aiSide, depth);
      setAiThinking(false);
      if (move) {
        // Find the actual piece reference in current state
        const actualPiece = currentPieces.find(
          p => p.type === move.piece.type && p.side === move.piece.side &&
               p.row === move.piece.row && p.col === move.piece.col
        );
        if (actualPiece) {
          executeMove(actualPiece, move.toRow, move.toCol, currentPieces);
        }
      }
    }, 100);
  }, [difficulty, executeMove]);

  /* ---- Canvas click handler ---- */
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (screenRef.current !== "playing") return;
    if (aiThinkingRef.current) return;
    if (turnRef.current !== playerSide) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;

    let clientX: number, clientY: number;
    if ("touches" in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      e.preventDefault();
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    // Find closest intersection
    const col = Math.round((x - MARGIN) / CELL);
    const row = Math.round((y - MARGIN) / CELL);
    if (!inBoard(row, col)) return;

    const currentPieces = piecesRef.current;
    const selected = selectedRef.current;
    const validMoves = validMovesRef.current;

    // If a piece is selected and this is a valid move target
    if (selected && validMoves.some(([r, c]) => r === row && c === col)) {
      const result = executeMove(selected, row, col, currentPieces);
      // Trigger AI if game continues
      if (!result.mate && !result.stale && result.nextTurn !== playerSide) {
        runAI(result.newPieces, result.nextTurn);
      }
      return;
    }

    // Select a piece
    const clickedPiece = getPieceAt(currentPieces, row, col);
    if (clickedPiece && clickedPiece.side === playerSide) {
      soundRef.current?.playSelect();
      const moves = getValidMoves(clickedPiece, currentPieces);
      setSelectedPiece(clickedPiece);
      setValidMovesState(moves);
    } else {
      // Deselect
      if (selected) soundRef.current?.playInvalid();
      setSelectedPiece(null);
      setValidMovesState([]);
    }
  }, [playerSide, executeMove, runAI]);

  /* ---- Game controls ---- */
  const startGame = useCallback(() => {
    const initial = createInitialBoard();
    setPieces(initial);
    setTurn("red");
    setSelectedPiece(null);
    setValidMovesState([]);
    setLastMove(null);
    setMoveHistory([]);
    setInCheckState(false);
    setWinner(null);
    setStalemate(false);
    setScreen("playing");
    setAiThinking(false);
  }, []);

  const undoMove = useCallback(() => {
    if (moveHistory.length < 2) return; // Undo both AI and player move
    if (aiThinking) return;

    const newHistory = [...moveHistory];
    // Undo AI move
    const aiMove = newHistory.pop()!;
    // Undo player move
    const playerMove = newHistory.pop()!;

    // Rebuild board from initial
    let boardPieces = createInitialBoard();
    for (const m of newHistory) {
      boardPieces = simulateMove(
        boardPieces,
        boardPieces.find(p => p.row === m.fromRow && p.col === m.fromCol && p.type === m.piece.type && p.side === m.piece.side)!,
        m.toRow,
        m.toCol,
      );
    }

    setPieces(boardPieces);
    setTurn(playerSide);
    setSelectedPiece(null);
    setValidMovesState([]);
    setLastMove(newHistory.length > 0 ? newHistory[newHistory.length - 1] : null);
    setMoveHistory(newHistory);
    setInCheckState(isInCheck(boardPieces, playerSide));
    setWinner(null);
    setStalemate(false);
    setScreen("playing");
  }, [moveHistory, aiThinking, playerSide]);

  const toggleMute = useCallback(() => {
    const m = soundRef.current?.toggleMute() ?? false;
    setMuted(m);
  }, []);

  /* ---- Save/Load ---- */
  const handleSave = useCallback(() => {
    return {
      pieces: pieces.map(p => ({ ...p })),
      turn,
      moveHistory: moveHistory.map(m => ({
        pieceType: m.piece.type,
        pieceSide: m.piece.side,
        fromRow: m.fromRow,
        fromCol: m.fromCol,
        toRow: m.toRow,
        toCol: m.toCol,
        captured: m.captured ? { type: m.captured.type, side: m.captured.side } : null,
      })),
      difficulty,
      inCheck: inCheckState,
    };
  }, [pieces, turn, moveHistory, difficulty, inCheckState]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as {
      pieces: Piece[];
      turn: Side;
      moveHistory: { pieceType: PieceType; pieceSide: Side; fromRow: number; fromCol: number; toRow: number; toCol: number; captured: { type: PieceType; side: Side } | null }[];
      difficulty: Difficulty;
      inCheck: boolean;
    };
    setPieces(d.pieces);
    setTurn(d.turn);
    setDifficulty(d.difficulty);
    setInCheckState(d.inCheck);
    setSelectedPiece(null);
    setValidMovesState([]);
    setScreen("playing");
    setWinner(null);
    setStalemate(false);
    setAiThinking(false);
    // Rebuild move history with piece references
    const history: Move[] = d.moveHistory.map(m => ({
      piece: { type: m.pieceType, side: m.pieceSide, row: m.toRow, col: m.toCol },
      fromRow: m.fromRow,
      fromCol: m.fromCol,
      toRow: m.toRow,
      toCol: m.toCol,
      captured: m.captured ? { ...m.captured, row: m.toRow, col: m.toCol } : null,
    }));
    setMoveHistory(history);
    setLastMove(history.length > 0 ? history[history.length - 1] : null);

    // If it's AI's turn after loading, trigger AI
    if (d.turn !== playerSide) {
      setTimeout(() => runAI(d.pieces, d.turn), 300);
    }
  }, [playerSide, runAI]);

  /* ---- Render ---- */
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <main className="max-w-[1200px] mx-auto px-4 pt-4 pb-24 lg:pb-8">
        {/* Top bar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Link href="/games" className="text-[#3ea6ff] hover:underline flex items-center gap-1 text-sm">
            <ChevronLeft size={16} /> 返回游戏
          </Link>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Swords size={22} className="text-[#d4a76a]" />
            中国象棋
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggleMute} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition" title={muted ? "开启音效" : "静音"}>
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition lg:hidden" title="更多">
              <Save size={18} />
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
          {/* Game area */}
          <div className="flex-1 flex flex-col items-center">
            {/* Status bar */}
            <div className="w-full max-w-[560px] flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-3 h-3 rounded-full ${turn === "black" ? "bg-gray-700 ring-2 ring-white/50" : "bg-gray-700"}`} />
                <span className="text-sm text-gray-300">黑方 (AI)</span>
              </div>
              <div className="text-xs text-gray-500">
                {screen === "playing" && (
                  <>第 {Math.ceil((moveHistory.length + 1) / 2)} 回合 {turn === "red" ? "红方走" : "黑方走"}</>
                )}
                {screen === "over" && (stalemate ? "和棋" : `${winner === "red" ? "红方" : "黑方"}胜`)}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-300">红方 (你)</span>
                <span className={`inline-block w-3 h-3 rounded-full ${turn === "red" ? "bg-red-600 ring-2 ring-white/50" : "bg-red-600"}`} />
              </div>
            </div>

            {/* Canvas */}
            <div className="relative bg-[#1a1a1a] rounded-xl p-2 border border-[#333] overflow-hidden">
              <canvas
                ref={canvasRef}
                width={W}
                height={H}
                onClick={handleCanvasClick}
                onTouchStart={handleCanvasClick}
                className="block cursor-pointer"
                style={{
                  width: W * canvasScale,
                  height: H * canvasScale,
                }}
              />
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
              {screen === "title" && (
                <>
                  <div className="flex items-center gap-1 mr-2">
                    <Cpu size={14} className="text-gray-400" />
                    <span className="text-xs text-gray-400">难度:</span>
                    {(["easy", "normal", "hard"] as Difficulty[]).map(d => (
                      <button
                        key={d}
                        onClick={() => setDifficulty(d)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition ${
                          difficulty === d
                            ? "bg-[#3ea6ff] text-[#0f0f0f] border-[#3ea6ff] font-bold"
                            : "text-[#aaa] border-[#333] hover:text-white"
                        }`}
                      >
                        {DIFF_LABELS[d]}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={startGame}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#5ab8ff] transition"
                  >
                    <Play size={16} /> 开始对局
                  </button>
                </>
              )}
              {screen === "playing" && (
                <>
                  <button
                    onClick={undoMove}
                    disabled={moveHistory.length < 2 || aiThinking}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition disabled:opacity-30"
                  >
                    <Undo2 size={14} /> 悔棋
                  </button>
                  <button
                    onClick={() => { setScreen("over"); setStalemate(true); }}
                    disabled={aiThinking}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition disabled:opacity-30"
                  >
                    <Flag size={14} /> 认输
                  </button>
                  <div className="flex items-center gap-1 ml-2">
                    <Cpu size={14} className="text-gray-500" />
                    <span className="text-[10px] text-gray-500">{DIFF_LABELS[difficulty]}</span>
                  </div>
                </>
              )}
              {screen === "over" && (
                <>
                  <button
                    onClick={startGame}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#5ab8ff] transition"
                  >
                    <RotateCcw size={16} /> 再来一局
                  </button>
                  <button
                    onClick={() => { setScreen("title"); }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white transition"
                  >
                    返回标题
                  </button>
                </>
              )}
            </div>

            {/* Check / thinking indicator */}
            {screen === "playing" && inCheckState && (
              <div className="mt-2 text-red-500 text-sm font-bold animate-pulse flex items-center gap-1">
                <Swords size={14} /> 将军!
              </div>
            )}
            {aiThinking && (
              <div className="mt-2 text-[#3ea6ff] text-xs flex items-center gap-1">
                <Cpu size={12} className="animate-spin" /> AI 思考中...
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className={`w-full lg:w-72 space-y-4 ${showSidebar ? "block" : "hidden lg:block"}`}>
            {/* Move history */}
            <div className="rounded-xl bg-[#1a1a1a] border border-[#333] p-4">
              <h3 className="text-sm font-bold mb-3 text-[#3ea6ff] flex items-center gap-1.5">
                <Trophy size={14} /> 走棋记录
              </h3>
              <div className="max-h-48 overflow-y-auto space-y-0.5 text-xs">
                {moveHistory.length === 0 ? (
                  <p className="text-gray-600 text-center py-4">暂无记录</p>
                ) : (
                  moveHistory.map((m, i) => (
                    <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded ${m.piece.side === "red" ? "text-red-400" : "text-gray-300"}`}>
                      <span className="text-gray-600 w-6 text-right">{i + 1}.</span>
                      <span>{PIECE_CHARS[m.piece.side][m.piece.type]}</span>
                      <span className="text-gray-500">
                        ({m.fromCol},{m.fromRow})-({m.toCol},{m.toRow})
                      </span>
                      {m.captured && <span className="text-yellow-500 ml-auto">吃{PIECE_CHARS[m.captured.side][m.captured.type]}</span>}
                    </div>
                  ))
                )}
              </div>
            </div>

            <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            <GameLeaderboard gameId={GAME_ID} />
          </div>
        </div>
      </main>
    </div>
  );
}
