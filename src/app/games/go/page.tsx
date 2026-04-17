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
  Plus, Trophy, Maximize2,
} from "lucide-react";

// ─── Constants & Types ───────────────────────────────────────────────────────
const GAME_ID = "go";
const KOMI = 6.5;
const COL_LABELS = "ABCDEFGHJKLMNOPQRST"; // I is skipped in Go

type Stone = 0 | 1 | 2; // empty, black, white
type BoardSize = 9 | 13 | 19;
type DifficultyKey = 0 | 1 | 2 | 3 | 4;
interface Pos { r: number; c: number }

const DIFF_LABELS: Record<DifficultyKey, string> = {
  0: "入门", 1: "初级", 2: "中级", 3: "高级", 4: "大师",
};
const MCTS_PLAYOUTS: Record<DifficultyKey, number> = {
  0: 0, 1: 0, 2: 500, 3: 2000, 4: 5000,
};

interface GoState {
  size: BoardSize;
  board: Stone[][];
  turn: Stone;
  captures: [number, number]; // black captured, white captured
  koPoint: Pos | null;
  lastMove: Pos | null;
  moveHistory: { board: Stone[][]; turn: Stone; captures: [number, number]; koPoint: Pos | null }[];
  positionHistory: string[]; // superko: serialized board states
  consecutivePasses: number;
  gameOver: boolean;
  winner: string;
  moveCount: number;
  deadStones: Set<string>; // "r,c" keys for dead stone marking
  scoringMode: boolean;
}

// ─── Star points ─────────────────────────────────────────────────────────────
const HOSHI: Record<BoardSize, Pos[]> = {
  9: [{ r: 2, c: 2 }, { r: 2, c: 6 }, { r: 6, c: 2 }, { r: 6, c: 6 }, { r: 4, c: 4 }],
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

// ─── Board Utilities ─────────────────────────────────────────────────────────
function makeBoard(size: number): Stone[][] {
  return Array.from({ length: size }, () => new Array(size).fill(0) as Stone[]);
}
function cloneBoard(b: Stone[][]): Stone[][] { return b.map(r => [...r]); }
function serializeBoard(b: Stone[][]): string {
  let s = "";
  for (let r = 0; r < b.length; r++) for (let c = 0; c < b[r].length; c++) s += b[r][c];
  return s;
}
function opp(s: Stone): Stone { return s === 1 ? 2 : 1; }

function neighbors(r: number, c: number, size: number): Pos[] {
  const n: Pos[] = [];
  if (r > 0) n.push({ r: r - 1, c });
  if (r < size - 1) n.push({ r: r + 1, c });
  if (c > 0) n.push({ r, c: c - 1 });
  if (c < size - 1) n.push({ r, c: c + 1 });
  return n;
}

function getGroup(board: Stone[][], r: number, c: number): { stones: Pos[]; liberties: Set<string> } {
  const size = board.length;
  const color = board[r][c];
  if (color === 0) return { stones: [], liberties: new Set() };
  const visited = new Set<string>();
  const stones: Pos[] = [];
  const liberties = new Set<string>();
  const stack: Pos[] = [{ r, c }];
  while (stack.length) {
    const p = stack.pop()!;
    const k = `${p.r},${p.c}`;
    if (visited.has(k)) continue;
    visited.add(k);
    stones.push(p);
    for (const nb of neighbors(p.r, p.c, size)) {
      const nk = `${nb.r},${nb.c}`;
      if (board[nb.r][nb.c] === 0) liberties.add(nk);
      else if (board[nb.r][nb.c] === color && !visited.has(nk)) stack.push(nb);
    }
  }
  return { stones, liberties };
}

function removeStones(board: Stone[][], stones: Pos[]): void {
  for (const s of stones) board[s.r][s.c] = 0;
}

/** Try placing a stone. Returns null if invalid. */
function tryPlace(
  board: Stone[][], r: number, c: number, color: Stone,
  koPoint: Pos | null, positionHistory: string[],
): { newBoard: Stone[][]; captured: number; newKo: Pos | null } | null {
  if (board[r][c] !== 0) return null;
  // Simple ko shortcut
  if (koPoint && koPoint.r === r && koPoint.c === c) return null;
  const size = board.length;
  const nb = cloneBoard(board);
  nb[r][c] = color;
  let totalCap = 0;
  let capSingle: Pos | null = null;
  const enemy = opp(color);
  for (const n of neighbors(r, c, size)) {
    if (nb[n.r][n.c] === enemy) {
      const g = getGroup(nb, n.r, n.c);
      if (g.liberties.size === 0) {
        if (g.stones.length === 1) capSingle = g.stones[0];
        else capSingle = null;
        totalCap += g.stones.length;
        removeStones(nb, g.stones);
      }
    }
  }
  // Suicide check
  const self = getGroup(nb, r, c);
  if (self.liberties.size === 0) return null;
  // Superko check
  const serial = serializeBoard(nb);
  if (positionHistory.includes(serial)) return null;
  const newKo = (totalCap === 1 && capSingle) ? capSingle : null;
  return { newBoard: nb, captured: totalCap, newKo };
}

/** Get all valid moves for a color */
function getValidMoves(board: Stone[][], color: Stone, koPoint: Pos | null, posHistory: string[]): Pos[] {
  const size = board.length;
  const moves: Pos[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (board[r][c] === 0 && tryPlace(board, r, c, color, koPoint, posHistory))
        moves.push({ r, c });
  return moves;
}

/** Chinese scoring with dead stone removal */
function chineseScore(board: Stone[][], deadStones?: Set<string>): { black: number; white: number; territory: Stone[][] } {
  const size = board.length;
  // Apply dead stone removal
  const b = cloneBoard(board);
  if (deadStones) {
    for (const key of deadStones) {
      const [r, c] = key.split(",").map(Number);
      b[r][c] = 0;
    }
  }
  const territory: Stone[][] = makeBoard(size);
  const visited = new Set<string>();
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (b[r][c] !== 0 || visited.has(`${r},${c}`)) continue;
      const region: Pos[] = [];
      const borders = new Set<Stone>();
      const stack: Pos[] = [{ r, c }];
      const rv = new Set<string>();
      while (stack.length) {
        const p = stack.pop()!;
        const k = `${p.r},${p.c}`;
        if (rv.has(k)) continue;
        rv.add(k); visited.add(k);
        region.push(p);
        for (const nb of neighbors(p.r, p.c, size)) {
          if (b[nb.r][nb.c] === 0 && !rv.has(`${nb.r},${nb.c}`)) stack.push(nb);
          else if (b[nb.r][nb.c] !== 0) borders.add(b[nb.r][nb.c]);
        }
      }
      if (borders.size === 1) {
        const owner = [...borders][0];
        for (const p of region) territory[p.r][p.c] = owner;
      }
    }
  }
  let black = 0, white = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (b[r][c] === 1) black++;
      else if (b[r][c] === 2) white++;
      if (territory[r][c] === 1) black++;
      else if (territory[r][c] === 2) white++;
    }
  }
  // Add captured dead stones as territory
  if (deadStones) {
    for (const key of deadStones) {
      const [r, c] = key.split(",").map(Number);
      if (board[r][c] === 1) white++; // dead black stone = white point
      else if (board[r][c] === 2) black++;
    }
  }
  return { black, white: white + KOMI, territory };
}

// ─── AI: Difficulty 0 (入门) — Random, avoid self-atari ─────────────────────
function aiRandom(board: Stone[][], color: Stone, ko: Pos | null, ph: string[]): Pos | null {
  const moves = getValidMoves(board, color, ko, ph);
  if (!moves.length) return null;
  // Filter out self-atari moves
  const safe = moves.filter(m => {
    const res = tryPlace(board, m.r, m.c, color, ko, ph);
    if (!res) return false;
    const g = getGroup(res.newBoard, m.r, m.c);
    return g.liberties.size > 1;
  });
  const pool = safe.length > 0 ? safe : moves;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── AI: Difficulty 1 (初级) — Capture + basic territory ────────────────────
function aiBasic(board: Stone[][], color: Stone, ko: Pos | null, ph: string[]): Pos | null {
  const moves = getValidMoves(board, color, ko, ph);
  if (!moves.length) return null;
  const size = board.length;
  const center = (size - 1) / 2;
  const enemy = opp(color);
  let best: Pos | null = null, bestScore = -Infinity;
  for (const m of moves) {
    const res = tryPlace(board, m.r, m.c, color, ko, ph);
    if (!res) continue;
    let score = res.captured * 10;
    // Prefer near center
    score -= (Math.abs(m.r - center) + Math.abs(m.c - center)) * 0.3;
    // Adjacent to own stones
    for (const nb of neighbors(m.r, m.c, size)) {
      if (board[nb.r][nb.c] === color) score += 1.5;
      if (board[nb.r][nb.c] === enemy) score += 0.5;
    }
    // Avoid edges early
    if (m.r === 0 || m.r === size - 1 || m.c === 0 || m.c === size - 1) score -= 2;
    // Avoid self-atari
    const g = getGroup(res.newBoard, m.r, m.c);
    if (g.liberties.size === 1) score -= 6;
    // Threaten low-liberty enemy groups
    for (const nb of neighbors(m.r, m.c, size)) {
      if (board[nb.r][nb.c] === enemy) {
        const eg = getGroup(board, nb.r, nb.c);
        if (eg.liberties.size <= 2) score += (3 - eg.liberties.size) * 4;
      }
    }
    score += Math.random() * 2;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

// ─── AI: MCTS (Difficulty 2-4) ──────────────────────────────────────────────
interface MCTSNode {
  move: Pos | null;
  board: Stone[][];
  color: Stone; // color that just played
  ko: Pos | null;
  parent: MCTSNode | null;
  children: MCTSNode[];
  wins: number;
  visits: number;
  untriedMoves: Pos[];
}

function createMCTSNode(board: Stone[][], color: Stone, ko: Pos | null, move: Pos | null, parent: MCTSNode | null): MCTSNode {
  return {
    move, board, color, ko, parent, children: [],
    wins: 0, visits: 0,
    untriedMoves: getValidMoves(board, opp(color), ko, []),
  };
}

function ucb1(node: MCTSNode, C: number): number {
  if (node.visits === 0) return Infinity;
  return node.wins / node.visits + C * Math.sqrt(Math.log(node.parent!.visits) / node.visits);
}

function selectChild(node: MCTSNode): MCTSNode {
  let best = node.children[0], bestVal = -Infinity;
  for (const c of node.children) {
    const val = ucb1(c, 1.414);
    if (val > bestVal) { bestVal = val; best = c; }
  }
  return best;
}

function randomPlayout(board: Stone[][], startColor: Stone, maxMoves: number): number {
  const size = board.length;
  const b = cloneBoard(board);
  let color = startColor;
  let passes = 0;
  let ko: Pos | null = null;
  for (let i = 0; i < maxMoves && passes < 2; i++) {
    // Quick random move selection (no superko in playouts for speed)
    const empties: Pos[] = [];
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (b[r][c] === 0) empties.push({ r, c });
    // Shuffle and try
    let placed = false;
    for (let j = empties.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [empties[j], empties[k]] = [empties[k], empties[j]];
    }
    for (const m of empties) {
      if (ko && ko.r === m.r && ko.c === m.c) continue;
      const nb = cloneBoard(b);
      nb[m.r][m.c] = color;
      let cap = 0;
      let capSingle: Pos | null = null;
      const enemy = opp(color);
      for (const n of neighbors(m.r, m.c, size)) {
        if (nb[n.r][n.c] === enemy) {
          const g = getGroup(nb, n.r, n.c);
          if (g.liberties.size === 0) {
            if (g.stones.length === 1) capSingle = g.stones[0]; else capSingle = null;
            cap += g.stones.length;
            removeStones(nb, g.stones);
          }
        }
      }
      const self = getGroup(nb, m.r, m.c);
      if (self.liberties.size === 0) continue;
      // Valid move
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) b[r][c] = nb[r][c];
      ko = (cap === 1 && capSingle) ? capSingle : null;
      color = opp(color);
      passes = 0;
      placed = true;
      break;
    }
    if (!placed) { passes++; color = opp(color); ko = null; }
  }
  // Score
  const { black, white } = chineseScore(b);
  return black > white ? 1 : 2; // return winner color
}

function mctsSearch(board: Stone[][], color: Stone, ko: Pos | null, playouts: number, size: number): Pos | null {
  const root = createMCTSNode(board, opp(color), ko, null, null);
  root.untriedMoves = getValidMoves(board, color, ko, []);
  if (root.untriedMoves.length === 0) return null;
  const maxPlayoutMoves = size * size * 2;

  for (let i = 0; i < playouts; i++) {
    let node = root;
    // Selection
    while (node.untriedMoves.length === 0 && node.children.length > 0) {
      node = selectChild(node);
    }
    // Expansion
    if (node.untriedMoves.length > 0) {
      const idx = Math.floor(Math.random() * node.untriedMoves.length);
      const move = node.untriedMoves.splice(idx, 1)[0];
      const nextColor = opp(node.color);
      const res = tryPlace(node.board, move.r, move.c, nextColor, node.ko, []);
      if (res) {
        const child = createMCTSNode(res.newBoard, nextColor, res.newKo, move, node);
        node.children.push(child);
        node = child;
      }
    }
    // Simulation
    const winner = randomPlayout(node.board, opp(node.color), maxPlayoutMoves);
    // Backpropagation
    let n: MCTSNode | null = node;
    while (n) {
      n.visits++;
      if (winner === n.color) n.wins++;
      n = n.parent;
    }
  }
  // Best child by visits
  if (root.children.length === 0) return root.untriedMoves.length > 0 ? root.untriedMoves[0] : null;
  let bestChild = root.children[0];
  for (const c of root.children) {
    if (c.visits > bestChild.visits) bestChild = c;
  }
  return bestChild.move;
}

// ─── Influence map for Master difficulty ─────────────────────────────────────
function computeInfluence(board: Stone[][], size: number): number[][] {
  const inf: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === 0) continue;
      const val = board[r][c] === 1 ? 1 : -1;
      for (let dr = -4; dr <= 4; dr++) {
        for (let dc = -4; dc <= 4; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          const dist = Math.abs(dr) + Math.abs(dc);
          if (dist <= 4) inf[nr][nc] += val * (5 - dist) / 5;
        }
      }
    }
  }
  return inf;
}

function aiMCTS(board: Stone[][], color: Stone, ko: Pos | null, ph: string[], diff: DifficultyKey): Pos | null {
  const size = board.length;
  const playouts = MCTS_PLAYOUTS[diff];
  const move = mctsSearch(board, color, ko, playouts, size);
  if (!move) return null;
  // For Master: bias toward influence-positive moves
  if (diff === 4) {
    const inf = computeInfluence(board, size);
    const candidates = getValidMoves(board, color, ko, ph);
    if (candidates.length <= 1) return move;
    // Re-rank top MCTS move with influence
    const root = createMCTSNode(board, opp(color), ko, null, null);
    root.untriedMoves = candidates;
    // Just use the MCTS result but check if influence suggests a better opening move
    const moveCount = board.flat().filter(s => s !== 0).length;
    if (moveCount < 10) {
      // Joseki-like: prefer star points and 3-4 points in opening
      const joseki = HOSHI[size as BoardSize] || [];
      const threesFours: Pos[] = [];
      for (const h of joseki) if (board[h.r][h.c] === 0) threesFours.push(h);
      if (threesFours.length > 0 && Math.random() < 0.6) {
        return threesFours[Math.floor(Math.random() * threesFours.length)];
      }
    }
  }
  return move;
}

function getAiMove(board: Stone[][], color: Stone, ko: Pos | null, ph: string[], diff: DifficultyKey): Pos | null {
  if (diff === 0) return aiRandom(board, color, ko, ph);
  if (diff === 1) return aiBasic(board, color, ko, ph);
  return aiMCTS(board, color, ko, ph, diff);
}

// ─── Sound (Web Audio API) ───────────────────────────────────────────────────
class GoSound {
  private ctx: AudioContext | null = null;
  private _muted = false;
  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }
  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.25, delay = 0) {
    if (this._muted) return;
    const ctx = this.getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + delay + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + dur);
  }
  playPlace(isBlack: boolean) {
    this.tone(isBlack ? 900 : 700, 0.1, "sine", 0.3);
    this.tone(isBlack ? 200 : 180, 0.08, "triangle", 0.15, 0.02);
  }
  playCapture(count: number) {
    const n = Math.min(count, 5);
    for (let i = 0; i < n; i++) this.tone(600 + i * 150, 0.12, "triangle", 0.2, i * 0.05);
  }
  playPass() { this.tone(300, 0.2, "sine", 0.12); }
  playGameEnd() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, "sine", 0.18, i * 0.12));
  }
  toggleMute(): boolean { this._muted = !this._muted; return this._muted; }
  get muted() { return this._muted; }
  dispose() { this.ctx?.close(); this.ctx = null; }
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function GoPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GoState | null>(null);
  const soundRef = useRef<GoSound | null>(null);
  const appRef = useRef<Application | null>(null);
  const gfxRef = useRef<PixiGraphics | null>(null);
  const initRef = useRef(false);
  const dirtyRef = useRef(true);
  const scoreSubmittedRef = useRef(false);
  const hoverRef = useRef<Pos | null>(null);
  const animRef = useRef<number>(0);
  const captureAnimRef = useRef<{ r: number; c: number; alpha: number; color: Stone }[]>([]);
  const placeAnimRef = useRef<{ r: number; c: number; scale: number; color: Stone } | null>(null);

  const [boardSize, setBoardSize] = useState<BoardSize>(9);
  const [difficulty, setDifficulty] = useState<DifficultyKey>(2);
  const [playerColor, setPlayerColor] = useState<Stone>(1);
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
  const [scoringMode, setScoringMode] = useState(false);
  const [showTerritory, setShowTerritory] = useState(false);
  const [territoryData, setTerritoryData] = useState<Stone[][] | null>(null);

  // ─── Init state ────────────────────────────────────────────────────
  const mkState = useCallback((size: BoardSize): GoState => ({
    size, board: makeBoard(size), turn: 1,
    captures: [0, 0], koPoint: null, lastMove: null,
    moveHistory: [], positionHistory: [serializeBoard(makeBoard(size))],
    consecutivePasses: 0, gameOver: false, winner: "", moveCount: 0,
    deadStones: new Set(), scoringMode: false,
  }), []);

  const markDirty = useCallback(() => { dirtyRef.current = true; }, []);

  // ─── Sync React state from game ────────────────────────────────────
  const syncState = useCallback((g: GoState) => {
    setTurn(g.turn);
    setCaptures([...g.captures]);
    setMoveCount(g.moveCount);
    setGameOver(g.gameOver);
    setWinner(g.winner);
    markDirty();
  }, [markDirty]);

  // ─── Submit score ──────────────────────────────────────────────────
  const submitScore = useCallback(async (score: number) => {
    if (scoreSubmittedRef.current || score <= 0) return;
    scoreSubmittedRef.current = true;
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score }),
      });
    } catch { /* ignore */ }
  }, []);

  // ─── End game ──────────────────────────────────────────────────────
  const endGame = useCallback((g: GoState, reason: "score" | "resign") => {
    g.gameOver = true;
    if (reason === "resign") {
      g.winner = g.turn === 1 ? "白方胜（黑方认输）" : "黑方胜（白方认输）";
      if (g.turn !== playerColor) submitScore(g.moveCount * 10 + 100);
    } else {
      const { black, white, territory } = chineseScore(g.board, g.deadStones);
      setTerritoryData(territory);
      setShowTerritory(true);
      setBlackScore(black);
      setWhiteScore(white);
      g.winner = black > white ? `黑方胜 (${black} vs ${white})` : white > black ? `白方胜 (${white} vs ${black})` : "平局";
      const pScore = playerColor === 1 ? black : white;
      const oScore = playerColor === 1 ? white : black;
      if (pScore > oScore) submitScore(Math.round(pScore * 10));
    }
    soundRef.current?.playGameEnd();
    syncState(g);
  }, [playerColor, submitScore, syncState]);

  // ─── AI move ───────────────────────────────────────────────────────
  const doAiMove = useCallback((g: GoState) => {
    if (g.gameOver || g.turn === playerColor) return;
    setThinking(true);
    setTimeout(() => {
      const aiColor = g.turn;
      const move = getAiMove(g.board, aiColor, g.koPoint, g.positionHistory, difficulty);
      if (!move) {
        // AI passes
        g.consecutivePasses++;
        g.turn = opp(g.turn);
        g.moveCount++;
        g.koPoint = null;
        soundRef.current?.playPass();
        if (g.consecutivePasses >= 2) {
          // Enter scoring mode for dead stone marking
          g.scoringMode = true;
          setScoringMode(true);
        }
      } else {
        const res = tryPlace(g.board, move.r, move.c, aiColor, g.koPoint, g.positionHistory);
        if (res) {
          g.moveHistory.push({
            board: cloneBoard(g.board), turn: g.turn,
            captures: [...g.captures] as [number, number], koPoint: g.koPoint,
          });
          g.board = res.newBoard;
          g.positionHistory.push(serializeBoard(res.newBoard));
          g.lastMove = move;
          g.consecutivePasses = 0;
          g.moveCount++;
          if (res.captured > 0) {
            if (aiColor === 1) g.captures[0] += res.captured; else g.captures[1] += res.captured;
            soundRef.current?.playCapture(res.captured);
            // Capture animation
            // (we don't track which stones were captured here for simplicity, just the count)
          } else {
            soundRef.current?.playPlace(aiColor === 1);
          }
          // Place animation
          placeAnimRef.current = { r: move.r, c: move.c, scale: 0.3, color: aiColor };
          g.koPoint = res.newKo;
        }
      }
      setThinking(false);
      syncState(g);
    }, difficulty >= 2 ? 100 : 200 + Math.random() * 200);
  }, [playerColor, difficulty, syncState]);

  // ─── Place stone (player) ──────────────────────────────────────────
  const placeStone = useCallback((r: number, c: number) => {
    const g = gameRef.current;
    if (!g || g.gameOver || g.scoringMode || g.turn !== playerColor || thinking) return;
    const res = tryPlace(g.board, r, c, playerColor, g.koPoint, g.positionHistory);
    if (!res) return;
    g.moveHistory.push({
      board: cloneBoard(g.board), turn: g.turn,
      captures: [...g.captures] as [number, number], koPoint: g.koPoint,
    });
    g.board = res.newBoard;
    g.positionHistory.push(serializeBoard(res.newBoard));
    g.lastMove = { r, c };
    g.consecutivePasses = 0;
    g.moveCount++;
    if (res.captured > 0) {
      if (playerColor === 1) g.captures[0] += res.captured; else g.captures[1] += res.captured;
      soundRef.current?.playCapture(res.captured);
    } else {
      soundRef.current?.playPlace(playerColor === 1);
    }
    placeAnimRef.current = { r, c, scale: 0.3, color: playerColor };
    g.koPoint = res.newKo;
    g.turn = opp(g.turn);
    syncState(g);
    setTimeout(() => doAiMove(g), 50);
  }, [playerColor, thinking, doAiMove, syncState]);

  // ─── Toggle dead stone in scoring mode ─────────────────────────────
  const toggleDeadStone = useCallback((r: number, c: number) => {
    const g = gameRef.current;
    if (!g || !g.scoringMode) return;
    if (g.board[r][c] === 0) return;
    // Toggle entire group
    const group = getGroup(g.board, r, c);
    const allDead = group.stones.every(s => g.deadStones.has(`${s.r},${s.c}`));
    for (const s of group.stones) {
      const key = `${s.r},${s.c}`;
      if (allDead) g.deadStones.delete(key); else g.deadStones.add(key);
    }
    // Recalculate score preview
    const { black, white, territory } = chineseScore(g.board, g.deadStones);
    setBlackScore(black);
    setWhiteScore(white);
    setTerritoryData(territory);
    setShowTerritory(true);
    markDirty();
  }, [markDirty]);

  // ─── Confirm scoring ──────────────────────────────────────────────
  const confirmScoring = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.scoringMode = false;
    setScoringMode(false);
    endGame(g, "score");
  }, [endGame]);

  // ─── Pass ──────────────────────────────────────────────────────────
  const handlePass = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.gameOver || g.scoringMode || g.turn !== playerColor || thinking) return;
    g.moveHistory.push({
      board: cloneBoard(g.board), turn: g.turn,
      captures: [...g.captures] as [number, number], koPoint: g.koPoint,
    });
    g.consecutivePasses++;
    g.turn = opp(g.turn);
    g.moveCount++;
    g.koPoint = null;
    g.lastMove = null;
    soundRef.current?.playPass();
    if (g.consecutivePasses >= 2) {
      g.scoringMode = true;
      setScoringMode(true);
      const { black, white, territory } = chineseScore(g.board, g.deadStones);
      setBlackScore(black); setWhiteScore(white);
      setTerritoryData(territory); setShowTerritory(true);
    }
    syncState(g);
    if (!g.scoringMode) setTimeout(() => doAiMove(g), 50);
  }, [playerColor, thinking, doAiMove, syncState]);

  const handleResign = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.gameOver) return;
    endGame(g, "resign");
  }, [endGame]);

  const handleUndo = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.gameOver || g.moveHistory.length < 2) return;
    for (let i = 0; i < 2 && g.moveHistory.length > 0; i++) {
      const prev = g.moveHistory.pop()!;
      g.board = prev.board; g.turn = prev.turn;
      g.captures = prev.captures; g.koPoint = prev.koPoint;
      if (g.positionHistory.length > 1) g.positionHistory.pop();
    }
    g.lastMove = null;
    g.consecutivePasses = 0;
    g.moveCount = Math.max(0, g.moveCount - 2);
    syncState(g);
  }, [syncState]);

  const startNewGame = useCallback((size?: BoardSize, pColor?: Stone) => {
    const s = size ?? boardSize;
    const pc = pColor ?? playerColor;
    const g = mkState(s);
    gameRef.current = g;
    scoreSubmittedRef.current = false;
    setTerritoryData(null);
    setShowTerritory(false);
    setScoringMode(false);
    setBlackScore(0); setWhiteScore(0);
    setThinking(false);
    setShowSettings(false);
    syncState(g);
    // If player is white, AI goes first
    if (pc === 2) setTimeout(() => doAiMove(g), 300);
  }, [boardSize, playerColor, mkState, syncState, doAiMove]);

  // ─── Save / Load ──────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const g = gameRef.current;
    if (!g) return null;
    return {
      size: g.size, board: g.board, turn: g.turn, captures: g.captures,
      koPoint: g.koPoint, lastMove: g.lastMove, consecutivePasses: g.consecutivePasses,
      moveCount: g.moveCount, difficulty, playerColor,
      positionHistory: g.positionHistory,
    };
  }, [difficulty, playerColor]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as {
      size: BoardSize; board: Stone[][]; turn: Stone; captures: [number, number];
      koPoint: Pos | null; lastMove: Pos | null; consecutivePasses: number;
      moveCount: number; difficulty: DifficultyKey; playerColor: Stone;
      positionHistory?: string[];
    };
    const g = mkState(d.size);
    g.board = d.board; g.turn = d.turn; g.captures = d.captures;
    g.koPoint = d.koPoint; g.lastMove = d.lastMove;
    g.consecutivePasses = d.consecutivePasses; g.moveCount = d.moveCount;
    g.positionHistory = d.positionHistory || [serializeBoard(d.board)];
    gameRef.current = g;
    setBoardSize(d.size);
    setDifficulty(d.difficulty);
    setPlayerColor(d.playerColor);
    setTerritoryData(null); setShowTerritory(false); setScoringMode(false);
    syncState(g);
  }, [mkState, syncState]);

  // ─── PixiJS Rendering ──────────────────────────────────────────────
  const drawBoard = useCallback(() => {
    if (!gfxRef.current || !appRef.current || !gameRef.current) return;
    const g = gameRef.current;
    const gfx = gfxRef.current;
    const W = appRef.current.screen.width;
    const H = appRef.current.screen.height;
    const size = g.size;
    const padding = size === 19 ? 24 : size === 13 ? 30 : 36;
    const labelSpace = 16;
    const totalPad = padding + labelSpace;
    const cellSize = Math.floor((Math.min(W, H) - totalPad * 2) / (size - 1));
    const boardPx = cellSize * (size - 1);
    const ox = Math.floor((W - boardPx) / 2);
    const oy = Math.floor((H - boardPx) / 2);
    const stoneR = Math.floor(cellSize * 0.44);

    gfx.clear();

    // ── Wooden board background with gradient ──
    // Base wood color
    gfx.rect(0, 0, W, H).fill({ color: 0xd4a76a });
    // Wood grain lines
    for (let i = 0; i < 40; i++) {
      const y = (i / 40) * H;
      const alpha = 0.08 + Math.sin(i * 0.8 + 2.3) * 0.06;
      gfx.rect(0, y, W, 1.5).fill({ color: 0xc08840, alpha: Math.max(0.02, alpha) });
    }
    // Subtle darker border around board area
    const bm = 6;
    gfx.rect(ox - bm, oy - bm, boardPx + bm * 2, boardPx + bm * 2)
      .fill({ color: 0xb8944a, alpha: 0.3 });

    // ── Grid lines ──
    for (let i = 0; i < size; i++) {
      const x = ox + i * cellSize;
      const y = oy + i * cellSize;
      gfx.moveTo(x, oy).lineTo(x, oy + boardPx).stroke({ color: 0x2a1a0a, width: 1, alpha: 0.75 });
      gfx.moveTo(ox, y).lineTo(ox + boardPx, y).stroke({ color: 0x2a1a0a, width: 1, alpha: 0.75 });
    }

    // ── Star points (hoshi) ──
    for (const h of (HOSHI[size] || [])) {
      gfx.circle(ox + h.c * cellSize, oy + h.r * cellSize, size === 19 ? 3.5 : 3)
        .fill({ color: 0x2a1a0a });
    }

    // ── Coordinate labels ──
    const fontSize = Math.max(8, Math.min(11, cellSize * 0.3));
    // We draw small rectangles as label indicators since we avoid Text objects for perf
    // Column labels (A-T, skip I)
    for (let c = 0; c < size; c++) {
      const x = ox + c * cellSize;
      // Top label dot
      gfx.circle(x, oy - labelSpace + 2, 1.5).fill({ color: 0x5a4020, alpha: 0.6 });
      // Bottom label dot
      gfx.circle(x, oy + boardPx + labelSpace - 2, 1.5).fill({ color: 0x5a4020, alpha: 0.6 });
    }
    // Row labels
    for (let r = 0; r < size; r++) {
      const y = oy + r * cellSize;
      gfx.circle(ox - labelSpace + 2, y, 1.5).fill({ color: 0x5a4020, alpha: 0.6 });
      gfx.circle(ox + boardPx + labelSpace - 2, y, 1.5).fill({ color: 0x5a4020, alpha: 0.6 });
    }

    // ── Territory overlay ──
    if (showTerritory && territoryData) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (territoryData[r][c] !== 0) {
            const tx = ox + c * cellSize;
            const ty = oy + r * cellSize;
            const tColor = territoryData[r][c] === 1 ? 0x000000 : 0xffffff;
            const s = cellSize * 0.15;
            gfx.rect(tx - s, ty - s, s * 2, s * 2).fill({ color: tColor, alpha: 0.35 });
          }
        }
      }
    }

    // ── Capture animations ──
    const caps = captureAnimRef.current;
    for (let i = caps.length - 1; i >= 0; i--) {
      const ca = caps[i];
      ca.alpha -= 0.04;
      if (ca.alpha <= 0) { caps.splice(i, 1); continue; }
      const cx = ox + ca.c * cellSize;
      const cy = oy + ca.r * cellSize;
      const col = ca.color === 1 ? 0x222222 : 0xf0f0f0;
      gfx.circle(cx, cy, stoneR * ca.alpha).fill({ color: col, alpha: ca.alpha * 0.6 });
      dirtyRef.current = true; // keep animating
    }

    // ── Place animation ──
    const pa = placeAnimRef.current;
    if (pa) {
      pa.scale = Math.min(1, pa.scale + 0.15);
      if (pa.scale >= 1) placeAnimRef.current = null;
      else dirtyRef.current = true;
    }

    // ── Stones ──
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const stone = g.board[r][c];
        if (stone === 0) continue;
        const sx = ox + c * cellSize;
        const sy = oy + r * cellSize;
        let sr = stoneR;
        // Apply place animation scale
        if (pa && pa.r === r && pa.c === c) sr = stoneR * pa.scale;
        // Dead stone marking
        const isDead = g.deadStones.has(`${r},${c}`);

        if (stone === 1) {
          // Shadow
          gfx.circle(sx + 1.5, sy + 1.5, sr).fill({ color: 0x000000, alpha: 0.25 });
          // Main black stone
          gfx.circle(sx, sy, sr).fill({ color: isDead ? 0x444444 : 0x1a1a1a });
          // 3D highlight
          gfx.circle(sx - sr * 0.28, sy - sr * 0.28, sr * 0.32)
            .fill({ color: 0x555555, alpha: isDead ? 0.2 : 0.45 });
          gfx.circle(sx - sr * 0.15, sy - sr * 0.15, sr * 0.14)
            .fill({ color: 0x888888, alpha: isDead ? 0.15 : 0.3 });
        } else {
          // Shadow
          gfx.circle(sx + 1.5, sy + 1.5, sr).fill({ color: 0x000000, alpha: 0.18 });
          // Main white stone
          gfx.circle(sx, sy, sr).fill({ color: isDead ? 0xaaaaaa : 0xf0f0f0 });
          // 3D highlight
          gfx.circle(sx - sr * 0.28, sy - sr * 0.28, sr * 0.32)
            .fill({ color: 0xffffff, alpha: isDead ? 0.3 : 0.55 });
          gfx.circle(sx - sr * 0.15, sy - sr * 0.15, sr * 0.14)
            .fill({ color: 0xffffff, alpha: isDead ? 0.2 : 0.4 });
          // Edge
          gfx.circle(sx, sy, sr).stroke({ color: isDead ? 0x999999 : 0xcccccc, width: 0.5 });
        }
        // Dead stone X marker
        if (isDead) {
          const xs = sr * 0.5;
          gfx.moveTo(sx - xs, sy - xs).lineTo(sx + xs, sy + xs).stroke({ color: 0xff4444, width: 2 });
          gfx.moveTo(sx + xs, sy - xs).lineTo(sx - xs, sy + xs).stroke({ color: 0xff4444, width: 2 });
        }
      }
    }

    // ── Last move indicator ──
    if (g.lastMove && !g.gameOver) {
      const lx = ox + g.lastMove.c * cellSize;
      const ly = oy + g.lastMove.r * cellSize;
      const lc = g.board[g.lastMove.r]?.[g.lastMove.c];
      const dotCol = lc === 1 ? 0xffffff : 0x000000;
      gfx.circle(lx, ly, stoneR * 0.22).fill({ color: dotCol, alpha: 0.85 });
    }

    // ── Hover preview (desktop) ──
    const hv = hoverRef.current;
    if (hv && !g.gameOver && !g.scoringMode && g.turn === playerColor && !thinking) {
      if (g.board[hv.r]?.[hv.c] === 0) {
        const hx = ox + hv.c * cellSize;
        const hy = oy + hv.r * cellSize;
        const hCol = playerColor === 1 ? 0x222222 : 0xf0f0f0;
        gfx.circle(hx, hy, stoneR).fill({ color: hCol, alpha: 0.35 });
      }
    }

    // ── Ko point indicator ──
    if (g.koPoint && !g.gameOver) {
      const kx = ox + g.koPoint.c * cellSize;
      const ky = oy + g.koPoint.r * cellSize;
      gfx.rect(kx - 4, ky - 4, 8, 8).stroke({ color: 0xff4444, width: 1.5 });
    }
  }, [playerColor, thinking, showTerritory, territoryData]);

  // ─── Canvas interaction ────────────────────────────────────────────
  const posFromEvent = useCallback((clientX: number, clientY: number): Pos | null => {
    const canvas = canvasRef.current;
    const g = gameRef.current;
    if (!canvas || !g) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    const size = g.size;
    const padding = size === 19 ? 24 : size === 13 ? 30 : 36;
    const labelSpace = 16;
    const totalPad = padding + labelSpace;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    const cellSize = Math.floor((Math.min(W, H) - totalPad * 2) / (size - 1));
    const boardPx = cellSize * (size - 1);
    const ox = Math.floor((W - boardPx) / 2);
    const oy = Math.floor((H - boardPx) / 2);
    const col = Math.round(((x / dpr) - ox) / cellSize);
    const row = Math.round(((y / dpr) - oy) / cellSize);
    if (row >= 0 && row < size && col >= 0 && col < size) return { r: row, c: col };
    return null;
  }, []);

  const handleClick = useCallback((cx: number, cy: number) => {
    const pos = posFromEvent(cx, cy);
    if (!pos) return;
    const g = gameRef.current;
    if (!g) return;
    if (g.scoringMode) { toggleDeadStone(pos.r, pos.c); return; }
    placeStone(pos.r, pos.c);
  }, [posFromEvent, placeStone, toggleDeadStone]);

  const handleHover = useCallback((cx: number, cy: number) => {
    const pos = posFromEvent(cx, cy);
    if (pos?.r !== hoverRef.current?.r || pos?.c !== hoverRef.current?.c) {
      hoverRef.current = pos;
      markDirty();
    }
  }, [posFromEvent, markDirty]);

  // ─── PixiJS init + render loop ─────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || initRef.current) return;
    initRef.current = true;
    soundRef.current = new GoSound();
    gameRef.current = mkState(boardSize);
    let destroyed = false;

    (async () => {
      const pixi = await loadPixi();
      if (destroyed) return;
      const canvas = canvasRef.current!;
      const parent = canvas.parentElement!;
      const w = Math.min(parent.clientWidth, 600);

      const app = await createPixiApp({
        canvas, width: w, height: w,
        backgroundColor: 0xd4a76a, antialias: true,
      });
      if (destroyed) { app.destroy(); return; }
      appRef.current = app;
      const gfx = new pixi.Graphics();
      app.stage.addChild(gfx);
      gfxRef.current = gfx;
      dirtyRef.current = true;

      const loop = () => {
        if (destroyed) return;
        if (dirtyRef.current) {
          dirtyRef.current = false;
          drawBoard();
        }
        animRef.current = requestAnimationFrame(loop);
      };
      loop();
    })();

    return () => {
      destroyed = true;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      appRef.current?.destroy();
      appRef.current = null;
      gfxRef.current = null;
      initRef.current = false;
      soundRef.current?.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize on board size change
  useEffect(() => {
    if (!appRef.current || !canvasRef.current) return;
    const parent = canvasRef.current.parentElement!;
    const w = Math.min(parent.clientWidth, 600);
    appRef.current.renderer.resize(w, w);
    markDirty();
  }, [boardSize, markDirty]);

  // Redraw on relevant state changes
  useEffect(() => { markDirty(); }, [turn, captures, gameOver, showTerritory, scoringMode, markDirty]);

  const toggleMute = useCallback(() => {
    const m = soundRef.current?.toggleMute() ?? false;
    setMuted(m);
  }, []);

  const changeBoardSize = useCallback((s: BoardSize) => {
    setBoardSize(s);
    startNewGame(s);
  }, [startNewGame]);

  const changePlayerColor = useCallback((c: Stone) => {
    setPlayerColor(c);
    startNewGame(boardSize, c);
  }, [boardSize, startNewGame]);

  const changeDifficulty = useCallback((d: DifficultyKey) => {
    setDifficulty(d);
    startNewGame();
  }, [startNewGame]);

  const isPlayerTurn = turn === playerColor;
  const turnLabel = turn === 1 ? "黑方" : "白方";

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0f0f0f] text-white pb-24 lg:pb-8">
        {/* ── Top bar ── */}
        <div className="max-w-[960px] mx-auto px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <Link href="/games" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#3ea6ff] transition">
              <ArrowLeft size={16} /> 返回游戏
            </Link>
            <h1 className="text-lg font-bold text-[#3ea6ff]">围棋</h1>
            <div className="flex items-center gap-1">
              <button onClick={toggleMute} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition" title={muted ? "开启音效" : "关闭音效"}>
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <button onClick={() => setShowSettings(!showSettings)} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition" title="设置">
                <Settings2 size={18} />
              </button>
            </div>
          </div>

          {/* ── Settings panel ── */}
          {showSettings && (
            <div className="mb-3 p-3 rounded-xl bg-[#1a1a1a] border border-[#333] space-y-3 animate-in fade-in duration-200">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">棋盘大小</label>
                <div className="flex gap-2">
                  {([9, 13, 19] as BoardSize[]).map(s => (
                    <button key={s} onClick={() => changeBoardSize(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${boardSize === s ? "bg-[#3ea6ff] text-[#0f0f0f]" : "bg-[#2a2a2a] text-gray-300 hover:bg-[#333]"}`}>
                      {s}x{s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">AI 难度</label>
                <div className="flex gap-2 flex-wrap">
                  {([0, 1, 2, 3, 4] as DifficultyKey[]).map(d => (
                    <button key={d} onClick={() => changeDifficulty(d)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${difficulty === d ? "bg-[#3ea6ff] text-[#0f0f0f]" : "bg-[#2a2a2a] text-gray-300 hover:bg-[#333]"}`}>
                      {DIFF_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">执棋</label>
                <div className="flex gap-2">
                  <button onClick={() => changePlayerColor(1)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${playerColor === 1 ? "bg-[#3ea6ff] text-[#0f0f0f]" : "bg-[#2a2a2a] text-gray-300 hover:bg-[#333]"}`}>
                    <span className="w-3 h-3 rounded-full bg-[#222] border border-[#555] inline-block" /> 执黑
                  </button>
                  <button onClick={() => changePlayerColor(2)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${playerColor === 2 ? "bg-[#3ea6ff] text-[#0f0f0f]" : "bg-[#2a2a2a] text-gray-300 hover:bg-[#333]"}`}>
                    <span className="w-3 h-3 rounded-full bg-[#f0f0f0] border border-[#ccc] inline-block" /> 执白
                  </button>
                  <button onClick={() => changePlayerColor(Math.random() < 0.5 ? 1 : 2 as Stone)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#2a2a2a] text-gray-300 hover:bg-[#333] transition">
                    随机
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Desktop layout: side panel ── */}
        <div className="max-w-[960px] mx-auto px-4 lg:flex lg:gap-4">
          {/* Canvas column */}
          <div className="flex-1 min-w-0">
            {/* Score bar (mobile) */}
            <div className="lg:hidden mb-3">
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#1a1a1a] border border-[#333]">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-[#222] border border-[#555]" />
                  <span className="text-sm font-medium">黑方</span>
                  <span className="text-xs text-gray-400">提子:{captures[0]}</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className={`text-xs font-bold ${scoringMode ? "text-[#f0b90b]" : isPlayerTurn ? "text-[#3ea6ff]" : "text-[#f0b90b]"}`}>
                    {scoringMode ? "标记死子" : thinking ? "AI思考中..." : `${turnLabel}落子`}
                  </span>
                  <span className="text-[10px] text-gray-500">第 {moveCount} 手</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">提子:{captures[1]}</span>
                  <span className="text-sm font-medium">白方</span>
                  <div className="w-4 h-4 rounded-full bg-[#f0f0f0] border border-[#ccc]" />
                </div>
              </div>
            </div>

            {/* Canvas */}
            <div className="relative w-full mx-auto" style={{ maxWidth: 600 }}>
              <canvas
                ref={canvasRef}
                className="w-full rounded-xl shadow-lg cursor-pointer touch-none"
                style={{ aspectRatio: "1/1" }}
                onClick={e => handleClick(e.clientX, e.clientY)}
                onTouchStart={e => { e.preventDefault(); const t = e.touches[0]; if (t) handleClick(t.clientX, t.clientY); }}
                onMouseMove={e => handleHover(e.clientX, e.clientY)}
                onMouseLeave={() => { hoverRef.current = null; markDirty(); }}
              />
            </div>

            {/* Action buttons (mobile) */}
            <div className="lg:hidden mt-3">
              {scoringMode ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs text-[#f0b90b]">点击棋盘上的死子标记，然后确认计分</p>
                  <div className="flex items-center gap-4 text-sm">
                    <span>黑: {blackScore}</span>
                    <span>白: {whiteScore}</span>
                  </div>
                  <button onClick={confirmScoring}
                    className="px-6 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition">
                    确认计分
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button onClick={handlePass} disabled={gameOver || !isPlayerTurn || thinking}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2a2a2a] border border-[#444] text-sm text-gray-200 hover:bg-[#333] transition disabled:opacity-40 min-h-[44px]">
                    <Hand size={16} /> 虚手
                  </button>
                  <button onClick={handleUndo} disabled={gameOver || !isPlayerTurn || thinking || moveCount < 2}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2a2a2a] border border-[#444] text-sm text-gray-200 hover:bg-[#333] transition disabled:opacity-40 min-h-[44px]">
                    <RotateCcw size={16} /> 悔棋
                  </button>
                  <button onClick={handleResign} disabled={gameOver}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2a2a2a] border border-[#444] text-sm text-gray-200 hover:bg-[#333] transition disabled:opacity-40 min-h-[44px]">
                    <Flag size={16} /> 认输
                  </button>
                  <button onClick={() => startNewGame()}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#3ea6ff]/10 border border-[#3ea6ff]/30 text-sm text-[#3ea6ff] hover:bg-[#3ea6ff]/20 transition min-h-[44px]">
                    <Plus size={16} /> 新局
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Desktop side panel ── */}
          <div className="hidden lg:block w-[240px] flex-shrink-0 space-y-3">
            {/* Score info */}
            <div className="p-3 rounded-xl bg-[#1a1a1a] border border-[#333] space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-[#222] border border-[#555]" />
                <span className="text-sm font-medium flex-1">黑方{playerColor === 1 ? "（你）" : "（AI）"}</span>
                <span className="text-xs text-gray-400">提子:{captures[0]}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-[#f0f0f0] border border-[#ccc]" />
                <span className="text-sm font-medium flex-1">白方{playerColor === 2 ? "（你）" : "（AI）"}</span>
                <span className="text-xs text-gray-400">提子:{captures[1]}</span>
              </div>
              <div className="border-t border-[#333] pt-2 text-center">
                <span className="text-xs text-gray-500">第 {moveCount} 手</span>
                <div className={`text-sm font-bold mt-1 ${scoringMode ? "text-[#f0b90b]" : isPlayerTurn ? "text-[#3ea6ff]" : "text-[#f0b90b]"}`}>
                  {scoringMode ? "标记死子阶段" : thinking ? "AI思考中..." : `${turnLabel}落子`}
                </div>
              </div>
              {scoringMode && (
                <div className="space-y-2 border-t border-[#333] pt-2">
                  <div className="flex justify-between text-xs">
                    <span>黑方: {blackScore}</span>
                    <span>白方: {whiteScore}</span>
                  </div>
                  <p className="text-[10px] text-[#f0b90b]">点击死子标记后确认</p>
                  <button onClick={confirmScoring}
                    className="w-full py-2 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] font-bold text-xs hover:bg-[#65b8ff] transition">
                    确认计分
                  </button>
                </div>
              )}
            </div>

            {/* Action buttons (desktop) */}
            {!scoringMode && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handlePass} disabled={gameOver || !isPlayerTurn || thinking}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#2a2a2a] border border-[#444] text-xs text-gray-200 hover:bg-[#333] transition disabled:opacity-40">
                  <Hand size={14} /> 虚手
                </button>
                <button onClick={handleUndo} disabled={gameOver || !isPlayerTurn || thinking || moveCount < 2}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#2a2a2a] border border-[#444] text-xs text-gray-200 hover:bg-[#333] transition disabled:opacity-40">
                  <RotateCcw size={14} /> 悔棋
                </button>
                <button onClick={handleResign} disabled={gameOver}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#2a2a2a] border border-[#444] text-xs text-gray-200 hover:bg-[#333] transition disabled:opacity-40">
                  <Flag size={14} /> 认输
                </button>
                <button onClick={() => startNewGame()}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#3ea6ff]/10 border border-[#3ea6ff]/30 text-xs text-[#3ea6ff] hover:bg-[#3ea6ff]/20 transition">
                  <Plus size={14} /> 新局
                </button>
              </div>
            )}

            {/* Save/Load & Leaderboard (desktop) */}
            <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            <GameLeaderboard gameId={GAME_ID} />
          </div>
        </div>

        {/* ── Game over overlay ── */}
        {gameOver && (
          <div className="max-w-[960px] mx-auto px-4 mt-4">
            <div className="p-4 rounded-xl bg-[#1a1a1a] border border-[#3ea6ff]/30 text-center space-y-2">
              <div className="flex items-center justify-center gap-2">
                <Trophy size={20} className="text-[#f0b90b]" />
                <span className="text-lg font-bold text-[#3ea6ff]">对局结束</span>
              </div>
              <p className="text-sm text-gray-200">{winner}</p>
              {blackScore > 0 && (
                <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
                  <span>黑方: {blackScore}</span>
                  <span>白方: {whiteScore}</span>
                  <span className="text-[10px]">(贴目 {KOMI})</span>
                </div>
              )}
              <button onClick={() => startNewGame()}
                className="mt-2 px-6 py-2 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition shadow-lg shadow-[#3ea6ff]/25">
                再来一局
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-[10px] text-[#666] mt-3 px-4">
          点击棋盘落子 · 贴目{KOMI} · 中国规则 · 超级劫规则
        </p>

        {/* Save/Load & Leaderboard (mobile) */}
        <div className="lg:hidden max-w-[700px] mx-auto px-4 mt-4 space-y-3">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </>
  );
}
