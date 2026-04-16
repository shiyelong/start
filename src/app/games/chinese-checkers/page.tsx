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
  ArrowLeft, Volume2, VolumeX, Settings2, RotateCcw, Trophy, Plus,
} from "lucide-react";

const GAME_ID = "chinese-checkers";
const C = {
  bg: 0x0f0f0f, cell: 0x333333, player: 0x3ea6ff, ai: 0xff4444,
  sel: 0xffd93d, valid: 0x44bb44, jump: 0xff9900, board: 0x1a1a1a,
};

/* Board: 6-pointed star, 121 positions, 17 rows */
const ROWS: number[][] = [
  [6],[5,6],[4,5,6],[3,4,5,6],
  [0,1,2,3,4,5,6,7,8,9,10,11,12],
  [0,1,2,3,4,5,6,7,8,9,10,11],
  [0,1,2,3,4,5,6,7,8,9,10],
  [0,1,2,3,4,5,6,7,8,9],
  [0,1,2,3,4,5,6,7,8],
  [0,1,2,3,4,5,6,7,8,9],
  [0,1,2,3,4,5,6,7,8,9,10],
  [0,1,2,3,4,5,6,7,8,9,10,11],
  [0,1,2,3,4,5,6,7,8,9,10,11,12],
  [6,7,8,9],[6,7,8],[6,7],[6],
];
const X_OFF = [0,.5,1,1.5,0,.5,1,1.5,2,1.5,1,.5,0,-1.5,-1,-.5,0];

type Owner = 0 | 1 | 2;
const pk = (r: number, c: number) => `${r},${c}`;
const pp = (k: string) => { const [r, c] = k.split(",").map(Number); return { r, c }; };

const ALL_POS: string[] = [];
const POS_SET = new Set<string>();
const XY = new Map<string, [number, number]>();
for (let row = 0; row < ROWS.length; row++) {
  for (const col of ROWS[row]) {
    const k = pk(row, col);
    ALL_POS.push(k);
    POS_SET.add(k);
    XY.set(k, [col + X_OFF[row], row]);
  }
}

const TOP_TRI = new Set<string>();
const BOT_TRI = new Set<string>();
for (let r = 0; r <= 3; r++) for (const c of ROWS[r]) TOP_TRI.add(pk(r, c));
for (let r = 13; r <= 16; r++) for (const c of ROWS[r]) BOT_TRI.add(pk(r, c));

const NBR = new Map<string, string[]>();
for (const k of ALL_POS) {
  const [x1, y1] = XY.get(k)!;
  const nb: string[] = [];
  for (const k2 of ALL_POS) {
    if (k === k2) continue;
    const [x2, y2] = XY.get(k2)!;
    if (Math.hypot(x2 - x1, y2 - y1) < 1.15) nb.push(k2);
  }
  NBR.set(k, nb);
}


/* ================================================================ */
/*  Game State & Logic                                               */
/* ================================================================ */
interface GS {
  cells: Map<string, Owner>;
  turn: 1 | 2;
  sel: string | null;
  valid: Set<string>;
  jumpPath: string[];
  over: boolean;
  winner: Owner;
  moves: number;
  history: { from: string; to: string; cells: [string, Owner][] }[];
}

function initCells(): Map<string, Owner> {
  const m = new Map<string, Owner>();
  for (const k of ALL_POS) m.set(k, 0);
  for (const k of BOT_TRI) m.set(k, 1);
  for (const k of TOP_TRI) m.set(k, 2);
  return m;
}

function newGame(): GS {
  return {
    cells: initCells(), turn: 1, sel: null, valid: new Set(),
    jumpPath: [], over: false, winner: 0, moves: 0, history: [],
  };
}

function cloneCells(m: Map<string, Owner>): [string, Owner][] {
  return [...m.entries()];
}

function findCellAt(x: number, y: number): string | null {
  for (const k of ALL_POS) {
    const [cx, cy] = XY.get(k)!;
    if (Math.abs(cx - x) < 0.01 && Math.abs(cy - y) < 0.01) return k;
  }
  return null;
}

function getValidMoves(cells: Map<string, Owner>, from: string): Set<string> {
  const moves = new Set<string>();
  for (const nb of NBR.get(from) || []) {
    if (cells.get(nb) === 0) moves.add(nb);
  }
  const visited = new Set<string>([from]);
  const stack = [from];
  while (stack.length) {
    const cur = stack.pop()!;
    const [cx, cy] = XY.get(cur)!;
    for (const nb of NBR.get(cur) || []) {
      if (cells.get(nb) !== 0) {
        const [nx, ny] = XY.get(nb)!;
        const lx = nx + (nx - cx), ly = ny + (ny - cy);
        const landing = findCellAt(lx, ly);
        if (landing && cells.get(landing) === 0 && !visited.has(landing)) {
          visited.add(landing);
          moves.add(landing);
          stack.push(landing);
        }
      }
    }
  }
  return moves;
}

function checkWin(cells: Map<string, Owner>, player: 1 | 2): boolean {
  const goal = player === 1 ? TOP_TRI : BOT_TRI;
  for (const k of goal) {
    if (cells.get(k) !== player) return false;
  }
  return true;
}

function distToGoal(k: string, player: 1 | 2): number {
  const { r } = pp(k);
  return player === 2 ? 16 - r : r;
}

/* ================================================================ */
/*  AI — greedy: move piece closest to goal, prefer chain jumps     */
/* ================================================================ */
function aiMove(cells: Map<string, Owner>): { from: string; to: string } | null {
  let bestScore = -Infinity;
  let bestMove: { from: string; to: string } | null = null;
  const pieces = ALL_POS.filter(k => cells.get(k) === 2);
  for (const from of pieces) {
    const moves = getValidMoves(cells, from);
    const fromDist = distToGoal(from, 2);
    for (const to of moves) {
      const toDist = distToGoal(to, 2);
      let score = fromDist - toDist; // positive = moving toward goal
      // Bonus for chain jumps (longer distance)
      const { r: fr } = pp(from);
      const { r: tr } = pp(to);
      if (Math.abs(fr - tr) > 1) score += 2; // jump bonus
      // Bonus for moving pieces that are far from goal
      score += fromDist * 0.3;
      // Penalty for moving backward
      if (toDist > fromDist) score -= 5;
      // Bonus for entering goal zone
      if (BOT_TRI.has(to)) score += 3;
      if (score > bestScore) {
        bestScore = score;
        bestMove = { from, to };
      }
    }
  }
  return bestMove;
}

/* ================================================================ */
/*  Sound — Web Audio API                                            */
/* ================================================================ */
class CheckersSound {
  private ctx: AudioContext | null = null;
  private _muted = false;
  get muted() { return this._muted; }

  private ensure() {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.15) {
    if (this._muted) return;
    const c = this.ensure();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur);
  }

  playMove() { this.tone(600, 0.1, "sine", 0.1); }
  playJump() { this.tone(800, 0.15, "triangle", 0.12); this.tone(1000, 0.1, "triangle", 0.1); }
  playWin() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, "sine", 0.15), i * 120));
  }
  toggleMute() { this._muted = !this._muted; return this._muted; }
  dispose() { this.ctx?.close(); this.ctx = null; }
}


/* ================================================================ */
/*  Rendering helpers                                                */
/* ================================================================ */
function cellToPixel(k: string, cx: number, cy: number, spacing: number): [number, number] {
  const [x, y] = XY.get(k)!;
  return [cx + (x - 6) * spacing, cy + (y - 8) * spacing * 0.88];
}

/* ================================================================ */
/*  Component                                                        */
/* ================================================================ */
export default function ChineseCheckersPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GS>(newGame());
  const soundRef = useRef<CheckersSound>(new CheckersSound());
  const appRef = useRef<Application | null>(null);
  const gfxRef = useRef<PixiGraphics | null>(null);
  const rafRef = useRef(0);
  const destroyedRef = useRef(false);
  const scoreSubmittedRef = useRef(false);

  const [phase, setPhase] = useState<"title" | "playing" | "over">("title");
  const [turn, setTurn] = useState<1 | 2>(1);
  const [muted, setMuted] = useState(false);
  const [showLB, setShowLB] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [winner, setWinner] = useState<Owner>(0);
  const [moveCount, setMoveCount] = useState(0);
  const [, refresh] = useState(0);

  const [cSize, setCSize] = useState({ w: 480, h: 528 });
  useEffect(() => {
    const calc = () => {
      const w = Math.min(window.innerWidth - 32, 560);
      setCSize({ w, h: Math.round(w * 1.1) });
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  /* ── Submit score ─────────────────────────────────────────────── */
  const submitScore = useCallback(async (moves: number) => {
    if (scoreSubmittedRef.current || moves === 0) return;
    scoreSubmittedRef.current = true;
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: Math.max(1, 1000 - moves * 5) }),
      });
    } catch { /* ignore */ }
  }, []);

  /* ── Start new game ──────────────────────────────────────────── */
  const startGame = useCallback(() => {
    gsRef.current = newGame();
    scoreSubmittedRef.current = false;
    setPhase("playing");
    setTurn(1);
    setWinner(0);
    setMoveCount(0);
    refresh(n => n + 1);
  }, []);

  /* ── Undo ────────────────────────────────────────────────────── */
  const undo = useCallback(() => {
    const gs = gsRef.current;
    if (gs.over || gs.history.length < 2) return; // undo player + AI move
    for (let i = 0; i < 2 && gs.history.length; i++) {
      const h = gs.history.pop()!;
      gs.cells = new Map(h.cells);
    }
    gs.turn = 1;
    gs.sel = null;
    gs.valid = new Set();
    gs.moves = Math.max(0, gs.moves - 1);
    setTurn(1);
    setMoveCount(gs.moves);
    refresh(n => n + 1);
  }, []);

  /* ── Handle click on board ───────────────────────────────────── */
  const handleClick = useCallback((px: number, py: number) => {
    const gs = gsRef.current;
    if (gs.over || gs.turn !== 1 || phase !== "playing") return;
    const { w, h } = cSize;
    const spacing = w / 14;
    const cx = w / 2, cy = h / 2;

    // Find closest cell
    let closest: string | null = null;
    let minD = Infinity;
    for (const k of ALL_POS) {
      const [sx, sy] = cellToPixel(k, cx, cy, spacing);
      const d = Math.hypot(px - sx, py - sy);
      if (d < spacing * 0.45 && d < minD) { minD = d; closest = k; }
    }
    if (!closest) { gs.sel = null; gs.valid = new Set(); refresh(n => n + 1); return; }

    const owner = gs.cells.get(closest)!;
    if (owner === 1) {
      // Select own piece
      gs.sel = closest;
      gs.valid = getValidMoves(gs.cells, closest);
      soundRef.current.playMove();
      refresh(n => n + 1);
      return;
    }

    if (gs.sel && gs.valid.has(closest)) {
      // Move piece
      const snapshot = cloneCells(gs.cells);
      gs.history.push({ from: gs.sel, to: closest, cells: snapshot });
      gs.cells.set(closest, 1);
      gs.cells.set(gs.sel, 0);
      gs.moves++;
      const isJump = Math.abs(pp(gs.sel).r - pp(closest).r) > 1 ||
        !NBR.get(gs.sel)?.includes(closest);
      if (isJump) soundRef.current.playJump();
      else soundRef.current.playMove();
      gs.sel = null;
      gs.valid = new Set();

      if (checkWin(gs.cells, 1)) {
        gs.over = true;
        gs.winner = 1;
        soundRef.current.playWin();
        submitScore(gs.moves);
        setWinner(1);
        setPhase("over");
        setMoveCount(gs.moves);
        refresh(n => n + 1);
        return;
      }

      gs.turn = 2;
      setTurn(2);
      setMoveCount(gs.moves);
      refresh(n => n + 1);

      // AI move after delay
      setTimeout(() => {
        if (destroyedRef.current) return;
        const g = gsRef.current;
        const move = aiMove(g.cells);
        if (move) {
          const snap = cloneCells(g.cells);
          g.history.push({ from: move.from, to: move.to, cells: snap });
          g.cells.set(move.to, 2);
          g.cells.set(move.from, 0);
          soundRef.current.playMove();
          if (checkWin(g.cells, 2)) {
            g.over = true;
            g.winner = 2;
            setWinner(2);
            setPhase("over");
          }
        }
        g.turn = 1;
        setTurn(1);
        refresh(n => n + 1);
      }, 400);
    } else {
      gs.sel = null;
      gs.valid = new Set();
      refresh(n => n + 1);
    }
  }, [phase, cSize, submitScore]);

  /* ── Save / Load ─────────────────────────────────────────────── */
  const onSave = useCallback(() => {
    const gs = gsRef.current;
    return {
      cells: [...gs.cells.entries()],
      turn: gs.turn, moves: gs.moves, over: gs.over, winner: gs.winner,
    };
  }, []);

  const onLoad = useCallback((data: unknown) => {
    const d = data as { cells: [string, Owner][]; turn: 1|2; moves: number; over: boolean; winner: Owner };
    const gs = gsRef.current;
    gs.cells = new Map(d.cells);
    gs.turn = d.turn;
    gs.moves = d.moves;
    gs.over = d.over;
    gs.winner = d.winner;
    gs.sel = null;
    gs.valid = new Set();
    gs.history = [];
    setPhase(d.over ? "over" : "playing");
    setTurn(d.turn);
    setMoveCount(d.moves);
    setWinner(d.winner);
    refresh(n => n + 1);
  }, []);


  /* ── PixiJS init & render loop ───────────────────────────────── */
  useEffect(() => {
    if (!canvasRef.current) return;
    destroyedRef.current = false;
    let app: Application | null = null;
    let gfx: PixiGraphics | null = null;

    const init = async () => {
      const pixi = await loadPixi();
      if (destroyedRef.current) return;
      const { w, h } = cSize;
      app = await createPixiApp({
        canvas: canvasRef.current!, width: w, height: h, backgroundColor: C.bg,
      });
      appRef.current = app;
      gfx = new pixi.Graphics();
      gfxRef.current = gfx;
      app.stage.addChild(gfx);

      const render = () => {
        if (destroyedRef.current || !gfx) return;
        gfx.clear();
        const gs = gsRef.current;
        const spacing = w / 14;
        const cx = w / 2, cy = h / 2;
        const cellR = spacing * 0.18;
        const pieceR = spacing * 0.32;

        // Draw board background
        gfx.roundRect(cx - 6.5 * spacing, cy - 8 * spacing * 0.88 - spacing * 0.5,
          13 * spacing, 16 * spacing * 0.88 + spacing, 12);
        gfx.fill({ color: C.board, alpha: 0.3 });

        // Draw goal zone highlights
        for (const k of TOP_TRI) {
          const [sx, sy] = cellToPixel(k, cx, cy, spacing);
          gfx.circle(sx, sy, cellR + 3);
          gfx.fill({ color: C.player, alpha: 0.08 });
        }
        for (const k of BOT_TRI) {
          const [sx, sy] = cellToPixel(k, cx, cy, spacing);
          gfx.circle(sx, sy, cellR + 3);
          gfx.fill({ color: C.ai, alpha: 0.08 });
        }

        // Draw connections
        for (const k of ALL_POS) {
          const [sx, sy] = cellToPixel(k, cx, cy, spacing);
          for (const nb of NBR.get(k) || []) {
            if (nb > k) { // draw each line once
              const [nx, ny] = cellToPixel(nb, cx, cy, spacing);
              gfx.moveTo(sx, sy);
              gfx.lineTo(nx, ny);
              gfx.stroke({ color: 0x222222, width: 1, alpha: 0.5 });
            }
          }
        }

        // Draw cells
        for (const k of ALL_POS) {
          const [sx, sy] = cellToPixel(k, cx, cy, spacing);
          gfx.circle(sx, sy, cellR);
          gfx.fill({ color: C.cell, alpha: 0.6 });
        }

        // Draw valid moves
        if (gs.sel) {
          for (const k of gs.valid) {
            const [sx, sy] = cellToPixel(k, cx, cy, spacing);
            gfx.circle(sx, sy, pieceR);
            gfx.fill({ color: C.valid, alpha: 0.3 });
            gfx.circle(sx, sy, pieceR);
            gfx.stroke({ color: C.valid, width: 2, alpha: 0.6 });
          }
        }

        // Draw pieces
        for (const k of ALL_POS) {
          const owner = gs.cells.get(k)!;
          if (owner === 0) continue;
          const [sx, sy] = cellToPixel(k, cx, cy, spacing);
          const color = owner === 1 ? C.player : C.ai;

          // Shadow
          gfx.circle(sx + 1, sy + 2, pieceR);
          gfx.fill({ color: 0x000000, alpha: 0.3 });

          // Piece body
          gfx.circle(sx, sy, pieceR);
          gfx.fill({ color });

          // Highlight
          gfx.circle(sx - pieceR * 0.25, sy - pieceR * 0.25, pieceR * 0.35);
          gfx.fill({ color: 0xffffff, alpha: 0.2 });

          // Selected glow
          if (k === gs.sel) {
            gfx.circle(sx, sy, pieceR + 4);
            gfx.stroke({ color: C.sel, width: 3, alpha: 0.8 });
            gfx.circle(sx, sy, pieceR + 8);
            gfx.stroke({ color: C.sel, width: 2, alpha: 0.3 });
          }
        }

        // Game over overlay
        if (gs.over) {
          gfx.rect(0, 0, w, h);
          gfx.fill({ color: 0x000000, alpha: 0.5 });
        }

        rafRef.current = requestAnimationFrame(render);
      };
      render();
    };

    init();

    return () => {
      destroyedRef.current = true;
      cancelAnimationFrame(rafRef.current);
      if (appRef.current) { try { appRef.current.destroy(); } catch {} }
      appRef.current = null;
      gfxRef.current = null;
      soundRef.current.dispose();
    };
  }, [cSize]);

  /* ── Canvas interaction ──────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const t = "touches" in e ? e.touches[0] : e;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    };
    const onClick = (e: MouseEvent) => { const p = getPos(e); handleClick(p.x, p.y); };
    const onTouch = (e: TouchEvent) => { e.preventDefault(); const p = getPos(e); handleClick(p.x, p.y); };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchstart", onTouch, { passive: false });
    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchstart", onTouch);
    };
  }, [handleClick]);


  /* ── JSX ─────────────────────────────────────────────────────── */
  const { w, h } = cSize;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-4xl mx-auto px-4 pt-4 pb-20">
        {/* Top bar */}
        <div className="flex items-center gap-3 mb-4">
          <Link href="/games" className="text-[#aaa] hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold text-[#3ea6ff] flex-1">
            {phase === "title" ? "中国跳棋" : phase === "over"
              ? (winner === 1 ? "恭喜获胜!" : "AI 获胜")
              : turn === 1 ? "你的回合" : "AI 思考中..."}
          </h1>
          <span className="text-xs text-[#666]">步数: {moveCount}</span>
          <button onClick={() => { const m = soundRef.current.toggleMute(); setMuted(m); }}
            className="p-2 rounded-lg hover:bg-[#1a1a1a] transition text-[#aaa]">
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
          {/* Canvas area */}
          <div className="flex-1">
            {phase === "title" ? (
              <div className="rounded-xl bg-[#1a1a1a] border border-[#333] p-8 text-center">
                <h2 className="text-2xl font-bold text-[#3ea6ff] mb-4">中国跳棋</h2>
                <p className="text-[#aaa] text-sm mb-2">
                  将你的棋子从底部三角移动到顶部三角
                </p>
                <p className="text-[#666] text-xs mb-6">
                  棋子可以移动到相邻空位，或跳过其他棋子（可连跳）
                </p>
                <div className="flex items-center justify-center gap-4 mb-6">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ background: "#3ea6ff" }} />
                    <span className="text-xs text-[#aaa]">你</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ background: "#ff4444" }} />
                    <span className="text-xs text-[#aaa]">AI</span>
                  </div>
                </div>
                <button onClick={startGame}
                  className="px-8 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold hover:bg-[#5bb8ff] transition flex items-center gap-2 mx-auto">
                  <Plus className="w-4 h-4" /> 开始游戏
                </button>
              </div>
            ) : (
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  width={w}
                  height={h}
                  className="w-full rounded-xl border border-[#333]"
                  style={{ maxWidth: w, aspectRatio: `${w}/${h}`, touchAction: "none" }}
                />
                {phase === "over" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="bg-[#1a1a1a]/95 border border-[#333] rounded-xl p-6 text-center">
                      <Trophy className="w-10 h-10 mx-auto mb-3 text-[#ffd93d]" />
                      <p className="text-xl font-bold mb-1">
                        {winner === 1 ? "恭喜获胜!" : "AI 获胜"}
                      </p>
                      <p className="text-sm text-[#aaa] mb-4">
                        共 {moveCount} 步
                        {winner === 1 && ` / 得分: ${Math.max(1, 1000 - moveCount * 5)}`}
                      </p>
                      <button onClick={startGame}
                        className="px-6 py-2 rounded-lg bg-[#3ea6ff] text-[#0f0f0f] font-bold hover:bg-[#5bb8ff] transition flex items-center gap-2 mx-auto">
                        <RotateCcw className="w-4 h-4" /> 再来一局
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            {phase === "playing" && (
              <div className="flex gap-2 mt-3">
                <button onClick={undo}
                  className="flex-1 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-sm text-[#aaa] hover:text-white hover:border-[#555] transition flex items-center justify-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" /> 悔棋
                </button>
                <button onClick={startGame}
                  className="flex-1 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-sm text-[#aaa] hover:text-white hover:border-[#555] transition flex items-center justify-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> 新局
                </button>
                <button onClick={() => setShowLB(!showLB)}
                  className="flex-1 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-sm text-[#aaa] hover:text-white hover:border-[#555] transition flex items-center justify-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5" /> 排行
                </button>
                <button onClick={() => setShowSave(!showSave)}
                  className="flex-1 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-sm text-[#aaa] hover:text-white hover:border-[#555] transition flex items-center justify-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5" /> 存档
                </button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:w-72 space-y-4">
            {/* Rules */}
            <div className="rounded-xl bg-[#1a1a1a] border border-[#333] p-4">
              <h3 className="text-sm font-bold mb-2 text-[#3ea6ff]">游戏规则</h3>
              <ul className="text-xs text-[#aaa] space-y-1">
                <li>- 点击己方棋子选中</li>
                <li>- 点击绿色位置移动</li>
                <li>- 可跳过相邻棋子到空位</li>
                <li>- 跳跃可连续进行</li>
                <li>- 先将全部棋子移到对面三角获胜</li>
              </ul>
            </div>
            {showLB && <GameLeaderboard gameId={GAME_ID} />}
            {showSave && <GameSaveLoad gameId={GAME_ID} onSave={onSave} onLoad={onLoad} />}
          </div>
        </div>
      </div>
    </div>
  );
}
