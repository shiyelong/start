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
  ArrowLeft, Volume2, VolumeX, Trophy, Plus, RotateCcw, Dice1,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "liubo";
const TOTAL_POSITIONS = 24; // circuit path length
const PIECES_PER_PLAYER = 6;
const HOME_THRESHOLD = TOTAL_POSITIONS; // reaching pos >= this means home

type Player = 1 | 2; // 1=human(blue), 2=AI(red)
interface PieceState { pos: number; home: boolean; }
interface GameState {
  pieces: [PieceState[], PieceState[]]; // [player1, player2]
  current: Player;
  diceValue: number;
  phase: "roll" | "move" | "animating" | "over";
  selectedPiece: number;
  winner: Player | null;
  scores: [number, number];
  turnCount: number;
}

// ─── Sound ───────────────────────────────────────────────────────────────────
class LiuBoSound {
  private ctx: AudioContext | null = null;
  private muted = false;
  private init() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  private beep(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.15) {
    if (this.muted) return;
    this.init();
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }
  playDice() { this.beep(600, 0.1, "square"); setTimeout(() => this.beep(800, 0.1, "square"), 80); }
  playMove() { this.beep(440, 0.15, "sine"); }
  playCapture() { this.beep(300, 0.2, "sawtooth", 0.2); setTimeout(() => this.beep(200, 0.3, "sawtooth", 0.15), 100); }
  playWin() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, 0.3, "sine", 0.12), i * 150)); }
  toggleMute() { this.muted = !this.muted; return this.muted; }
  get isMuted() { return this.muted; }
  dispose() { this.ctx?.close().catch(() => {}); this.ctx = null; }
}

// ─── Board Path Coordinates ──────────────────────────────────────────────────
function buildPath(cx: number, cy: number, r: number): { x: number; y: number }[] {
  // Cross-shaped circuit: 24 positions forming a loop
  const pts: { x: number; y: number }[] = [];
  const arm = r * 0.85;
  const w = r * 0.25;
  // Top arm (0-5): left side going up, then right side going down
  // We create a rectangular loop with cross arms
  const segs = [
    // Right arm (0-5)
    ...Array.from({ length: 6 }, (_, i) => ({ x: cx + w + (arm - w) * i / 5, y: cy - w })),
    // Top arm (6-11)
    ...Array.from({ length: 6 }, (_, i) => ({ x: cx + w, y: cy - w - (arm - w) * i / 5 })),
    // Left arm (12-17)
    ...Array.from({ length: 6 }, (_, i) => ({ x: cx - w - (arm - w) * i / 5, y: cy - w })),
    // Bottom arm (18-23)
    ...Array.from({ length: 6 }, (_, i) => ({ x: cx - w, y: cy + w + (arm - w) * i / 5 })),
  ];
  return segs;
}

// ─── Game Logic ──────────────────────────────────────────────────────────────
function initState(): GameState {
  const makePieces = (): PieceState[] =>
    Array.from({ length: PIECES_PER_PLAYER }, () => ({ pos: -1, home: false }));
  return {
    pieces: [makePieces(), makePieces()],
    current: 1, diceValue: 0,
    phase: "roll", selectedPiece: -1, winner: null,
    scores: [0, 0], turnCount: 0,
  };
}

function rollDice(): number { return Math.floor(Math.random() * 6) + 1; }

function getMovablePieces(state: GameState): number[] {
  const pcs = state.pieces[state.current - 1];
  const dice = state.diceValue;
  const result: number[] = [];
  for (let i = 0; i < pcs.length; i++) {
    if (pcs[i].home) continue;
    if (pcs[i].pos === -1) { result.push(i); continue; } // can enter
    const newPos = pcs[i].pos + dice;
    if (newPos <= TOTAL_POSITIONS) result.push(i);
  }
  return result;
}

function movePiece(state: GameState, pieceIdx: number): { captured: boolean } {
  const pcs = state.pieces[state.current - 1];
  const opp = state.pieces[state.current === 1 ? 1 : 0];
  const pc = pcs[pieceIdx];
  let captured = false;

  if (pc.pos === -1) {
    pc.pos = state.current === 1 ? 0 : 12; // start positions
  } else {
    pc.pos += state.diceValue;
  }

  if (pc.pos >= TOTAL_POSITIONS) {
    pc.home = true;
    pc.pos = TOTAL_POSITIONS;
    state.scores[state.current - 1] += 10;
  } else {
    // Check capture
    for (const op of opp) {
      if (!op.home && op.pos === pc.pos && op.pos >= 0) {
        op.pos = -1; // sent back
        captured = true;
        state.scores[state.current - 1] += 5;
      }
    }
  }
  return { captured };
}

function checkWin(state: GameState): Player | null {
  for (const p of [0, 1] as const) {
    if (state.pieces[p].every(pc => pc.home)) return (p + 1) as Player;
  }
  return null;
}

function aiChoose(state: GameState): number {
  const movable = getMovablePieces(state);
  if (movable.length === 0) return -1;
  const opp = state.pieces[0]; // opponent is player 1
  let bestIdx = movable[0], bestScore = -999;
  for (const idx of movable) {
    const pc = state.pieces[1][idx];
    let newPos = pc.pos === -1 ? 12 : pc.pos + state.diceValue;
    let sc = newPos; // prefer advancing
    if (newPos >= TOTAL_POSITIONS) { sc = 100; } // reaching home is best
    else {
      for (const op of opp) {
        if (!op.home && op.pos === newPos && op.pos >= 0) sc += 50; // capture bonus
      }
    }
    if (sc > bestScore) { bestScore = sc; bestIdx = idx; }
  }
  return bestIdx;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function LiuBoPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(initState());
  const soundRef = useRef<LiuBoSound>(new LiuBoSound());
  const pixiAppRef = useRef<Application | null>(null);
  const gfxRef = useRef<PixiGraphics | null>(null);
  const rafRef = useRef<number>(0);
  const destroyedRef = useRef(false);
  const scoreSubmittedRef = useRef(false);

  const [phase, setPhase] = useState<GameState["phase"]>("roll");
  const [current, setCurrent] = useState<Player>(1);
  const [diceValue, setDiceValue] = useState(0);
  const [winner, setWinner] = useState<Player | null>(null);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [muted, setMuted] = useState(false);
  const [, forceUpdate] = useState(0);

  const syncUI = useCallback(() => {
    const g = gameRef.current;
    setPhase(g.phase); setCurrent(g.current);
    setDiceValue(g.diceValue); setWinner(g.winner);
    setScores([...g.scores] as [number, number]);
    forceUpdate(n => n + 1);
  }, []);

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

  const endTurn = useCallback(() => {
    const g = gameRef.current;
    const w = checkWin(g);
    if (w) {
      g.winner = w; g.phase = "over";
      soundRef.current.playWin();
      if (w === 1) submitScore(g.scores[0]);
      syncUI(); return;
    }
    g.current = g.current === 1 ? 2 : 1;
    g.phase = "roll"; g.selectedPiece = -1; g.turnCount++;
    syncUI();
    // AI turn
    if (g.current === 2 && !g.winner) {
      setTimeout(() => {
        if (destroyedRef.current) return;
        g.diceValue = rollDice();
        soundRef.current.playDice();
        g.phase = "move";
        syncUI();
        setTimeout(() => {
          if (destroyedRef.current) return;
          const choice = aiChoose(g);
          if (choice >= 0) {
            const { captured } = movePiece(g, choice);
            if (captured) soundRef.current.playCapture();
            else soundRef.current.playMove();
          }
          endTurn();
        }, 600);
      }, 500);
    }
  }, [syncUI, submitScore]);

  const handleRoll = useCallback(() => {
    const g = gameRef.current;
    if (g.phase !== "roll" || g.current !== 1 || g.winner) return;
    g.diceValue = rollDice();
    soundRef.current.playDice();
    const movable = getMovablePieces({ ...g, diceValue: g.diceValue } as GameState);
    if (movable.length === 0) {
      g.phase = "move";
      syncUI();
      setTimeout(() => endTurn(), 400);
      return;
    }
    g.phase = "move";
    syncUI();
  }, [syncUI, endTurn]);

  const handlePieceClick = useCallback((idx: number) => {
    const g = gameRef.current;
    if (g.phase !== "move" || g.current !== 1 || g.winner) return;
    const movable = getMovablePieces(g);
    if (!movable.includes(idx)) return;
    const { captured } = movePiece(g, idx);
    if (captured) soundRef.current.playCapture();
    else soundRef.current.playMove();
    endTurn();
  }, [endTurn]);

  const resetGame = useCallback(() => {
    gameRef.current = initState();
    scoreSubmittedRef.current = false;
    syncUI();
  }, [syncUI]);

  // ─── Save / Load ────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const g = gameRef.current;
    return {
      pieces: g.pieces.map(arr => arr.map(p => ({ ...p }))),
      current: g.current, diceValue: g.diceValue, phase: g.phase,
      selectedPiece: g.selectedPiece, winner: g.winner,
      scores: [...g.scores], turnCount: g.turnCount,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    try {
      const d = data as GameState;
      if (!d || !Array.isArray(d.pieces)) return;
      gameRef.current = {
        pieces: d.pieces.map(arr => arr.map(p => ({ ...p }))) as [PieceState[], PieceState[]],
        current: d.current, diceValue: d.diceValue, phase: d.phase,
        selectedPiece: d.selectedPiece, winner: d.winner,
        scores: [...d.scores] as [number, number], turnCount: d.turnCount,
      };
      scoreSubmittedRef.current = false;
      syncUI();
    } catch { /* ignore */ }
  }, [syncUI]);

  // ─── PixiJS Rendering ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    destroyedRef.current = false;
    let app: Application | null = null;

    const setup = async () => {
      const pixi = await loadPixi();
      if (destroyedRef.current) return;
      const size = Math.min(canvas.parentElement?.clientWidth ?? 500, 500);
      app = await createPixiApp({ canvas, width: size, height: size, backgroundColor: 0x0f0f0f });
      pixiAppRef.current = app;
      const g = new pixi.Graphics();
      app.stage.addChild(g);
      gfxRef.current = g;

      const render = () => {
        if (destroyedRef.current) return;
        drawBoard(g, size, pixi);
        rafRef.current = requestAnimationFrame(render);
      };
      rafRef.current = requestAnimationFrame(render);
    };

    const drawBoard = (g: PixiGraphics, size: number, pixi: typeof import("pixi.js")) => {
      g.clear();
      const cx = size / 2, cy = size / 2, r = size * 0.42;
      const path = buildPath(cx, cy, r);
      const game = gameRef.current;

      // Draw background pattern - cross shape
      const arm = r * 0.85, w = r * 0.25;
      g.rect(cx - arm, cy - w, arm * 2, w * 2).fill({ color: 0x2a1a0a, alpha: 0.6 });
      g.rect(cx - w, cy - arm, w * 2, arm * 2).fill({ color: 0x2a1a0a, alpha: 0.6 });
      // Center square
      g.rect(cx - w, cy - w, w * 2, w * 2).fill({ color: 0x3a2a1a, alpha: 0.8 });

      // Draw path nodes
      for (let i = 0; i < path.length; i++) {
        const p = path[i];
        g.circle(p.x, p.y, 10).fill({ color: 0x4a3a2a }).stroke({ color: 0xc8a84e, width: 1.5 });
      }

      // Draw path connections
      for (let i = 0; i < path.length; i++) {
        const a = path[i], b = path[(i + 1) % path.length];
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0xc8a84e, width: 1, alpha: 0.4 });
      }

      // Home zones
      const homeP1 = { x: cx + arm + 20, y: cy };
      const homeP2 = { x: cx - arm - 20, y: cy };
      g.roundRect(homeP1.x - 18, homeP1.y - 45, 36, 90, 6).fill({ color: 0x1a3a5a, alpha: 0.5 }).stroke({ color: 0x3ea6ff, width: 1 });
      g.roundRect(homeP2.x - 18, homeP2.y - 45, 36, 90, 6).fill({ color: 0x5a1a1a, alpha: 0.5 }).stroke({ color: 0xff4444, width: 1 });

      // Draw pieces
      const movable = game.phase === "move" && game.current === 1 ? getMovablePieces(game) : [];

      for (let p = 0; p < 2; p++) {
        const color = p === 0 ? 0x3ea6ff : 0xff4444;
        const pcs = game.pieces[p];
        const startPos = p === 0 ? 0 : 12;
        // Pieces at start (pos === -1)
        const atStart = pcs.filter(pc => pc.pos === -1);
        const startX = p === 0 ? cx + arm * 0.6 : cx - arm * 0.6;
        const startY = cy + arm * 0.6;
        atStart.forEach((_, si) => {
          const px = startX + (si % 3) * 16 - 16;
          const py = startY + Math.floor(si / 3) * 16;
          g.circle(px, py, 6).fill({ color }).stroke({ color: 0xffffff, width: 1, alpha: 0.3 });
        });

        // Pieces on board
        for (let i = 0; i < pcs.length; i++) {
          const pc = pcs[i];
          if (pc.pos < 0 || pc.home) continue;
          const pos = pc.pos % TOTAL_POSITIONS;
          const pt = path[pos];
          if (!pt) continue;
          const isMovable = p === 0 && movable.includes(i);
          const radius = isMovable ? 9 : 7;
          if (isMovable) {
            g.circle(pt.x, pt.y, 13).fill({ color: 0x3ea6ff, alpha: 0.2 + Math.sin(Date.now() / 200) * 0.1 });
          }
          g.circle(pt.x, pt.y, radius).fill({ color }).stroke({ color: 0xffffff, width: 1.5 });
        }

        // Pieces at home
        const atHome = pcs.filter(pc => pc.home);
        const home = p === 0 ? homeP1 : homeP2;
        atHome.forEach((_, hi) => {
          const hx = home.x;
          const hy = home.y - 30 + hi * 12;
          g.circle(hx, hy, 5).fill({ color }).stroke({ color: 0xffffff, width: 1 });
        });
      }

      // Dice display in center
      if (game.diceValue > 0) {
        g.roundRect(cx - 20, cy - 20, 40, 40, 6).fill({ color: 0x1a1a1a }).stroke({ color: 0xc8a84e, width: 2 });
        // Draw dice dots
        const dots = getDiceDots(game.diceValue, cx, cy);
        for (const d of dots) {
          g.circle(d.x, d.y, 3).fill({ color: 0xffffff });
        }
      }

      // Current player indicator
      const indColor = game.current === 1 ? 0x3ea6ff : 0xff4444;
      g.circle(cx, 20, 6).fill({ color: indColor });
    };

    setup();
    return () => {
      destroyedRef.current = true;
      cancelAnimationFrame(rafRef.current);
      if (app) { try { app.destroy(); } catch {} }
      pixiAppRef.current = null; gfxRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Canvas click handler ───────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onClick = (e: MouseEvent | TouchEvent) => {
      const game = gameRef.current;
      if (game.phase !== "move" || game.current !== 1) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
      const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
      const mx = (clientX - rect.left) * scaleX;
      const my = (clientY - rect.top) * scaleY;

      const size = canvas.width;
      const cx = size / 2, cy = size / 2, r = size * 0.42;
      const path = buildPath(cx, cy, r);
      const movable = getMovablePieces(game);

      // Check if clicked near a movable piece
      for (const idx of movable) {
        const pc = game.pieces[0][idx];
        if (pc.pos < 0) {
          // Click on start area
          const arm = r * 0.85;
          const startX = cx + arm * 0.6;
          const startY = cy + arm * 0.6;
          const atStartBefore = game.pieces[0].slice(0, idx).filter(p => p.pos === -1).length;
          const px = startX + (atStartBefore % 3) * 16 - 16;
          const py = startY + Math.floor(atStartBefore / 3) * 16;
          if (Math.hypot(mx - px, my - py) < 20) { handlePieceClick(idx); return; }
        } else if (!pc.home) {
          const pt = path[pc.pos % TOTAL_POSITIONS];
          if (pt && Math.hypot(mx - pt.x, my - pt.y) < 20) { handlePieceClick(idx); return; }
        }
      }
      // If only one movable, auto-select
      if (movable.length === 1) handlePieceClick(movable[0]);
    };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchstart", onClick, { passive: false });
    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchstart", onClick);
    };
  }, [handlePieceClick]);

  // Cleanup sound
  useEffect(() => () => { soundRef.current.dispose(); }, []);

  // ─── Render ─────────────────────────────────────────────────────────────
  const phaseText = phase === "roll" ? "掷骰" : phase === "move" ? "选棋移动" : phase === "over" ? "游戏结束" : "...";
  const currentText = current === 1 ? "你" : "对手";

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0f0f0f] text-white pt-20 pb-24 px-4 max-w-2xl mx-auto">
        <Link href="/games" className="inline-flex items-center gap-1.5 text-[#3ea6ff] hover:underline text-sm mb-4">
          <ArrowLeft className="w-4 h-4" /> 返回游戏
        </Link>

        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold">六博棋</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setMuted(soundRef.current.toggleMute())}
              className="p-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#aaa] hover:text-white transition">
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button onClick={resetGame}
              className="p-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#aaa] hover:text-white transition">
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Score bar */}
        <div className="flex items-center justify-between mb-3 bg-[#1a1a1a] rounded-xl border border-[#333] px-4 py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#3ea6ff] inline-block" />
            <span>你: {scores[0]}分</span>
          </div>
          <div className="text-[#888]">
            {winner ? (winner === 1 ? "你赢了!" : "对手赢了") : `${currentText}的回合 - ${phaseText}`}
          </div>
          <div className="flex items-center gap-2">
            <span>对手: {scores[1]}分</span>
            <span className="w-3 h-3 rounded-full bg-[#ff4444] inline-block" />
          </div>
        </div>

        {/* Canvas */}
        <div className="flex justify-center mb-3">
          <div className="relative w-full max-w-[500px] aspect-square">
            <canvas ref={canvasRef} className="w-full h-full rounded-xl border border-[#333]" />
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-3 mb-3">
          {phase === "roll" && current === 1 && !winner && (
            <button onClick={handleRoll}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition shadow-lg shadow-[#3ea6ff]/25">
              <Dice1 className="w-5 h-5" /> 掷骰
            </button>
          )}
          {phase === "move" && current === 1 && !winner && diceValue > 0 && (
            <div className="text-sm text-[#aaa] flex items-center gap-2">
              <Dice1 className="w-4 h-4 text-[#c8a84e]" />
              掷出 {diceValue} - 点击棋子移动
            </div>
          )}
          {current === 2 && !winner && (
            <div className="text-sm text-[#ff4444] animate-pulse">对手思考中...</div>
          )}
          {winner && (
            <button onClick={resetGame}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition shadow-lg shadow-[#3ea6ff]/25">
              <Plus className="w-5 h-5" /> 新局
            </button>
          )}
        </div>

        {/* Piece status */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-[#1a1a1a] rounded-xl border border-[#333] p-3">
            <div className="text-xs text-[#888] mb-1.5 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#3ea6ff] inline-block" /> 你的棋子
            </div>
            <div className="flex gap-1.5">
              {gameRef.current.pieces[0].map((pc, i) => (
                <div key={i} className={`w-5 h-5 rounded-full border ${
                  pc.home ? "bg-[#3ea6ff] border-[#3ea6ff]" :
                  pc.pos >= 0 ? "bg-[#3ea6ff]/50 border-[#3ea6ff]/70" :
                  "bg-[#1a1a1a] border-[#555]"
                }`} />
              ))}
            </div>
          </div>
          <div className="bg-[#1a1a1a] rounded-xl border border-[#333] p-3">
            <div className="text-xs text-[#888] mb-1.5 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#ff4444] inline-block" /> 对手棋子
            </div>
            <div className="flex gap-1.5">
              {gameRef.current.pieces[1].map((pc, i) => (
                <div key={i} className={`w-5 h-5 rounded-full border ${
                  pc.home ? "bg-[#ff4444] border-[#ff4444]" :
                  pc.pos >= 0 ? "bg-[#ff4444]/50 border-[#ff4444]/70" :
                  "bg-[#1a1a1a] border-[#555]"
                }`} />
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] text-[#666] mb-4">
          掷骰后点击棋子移动 · 落在对手棋子上可吃子 · 先将全部棋子送回终点获胜
        </p>

        {/* Leaderboard & Save/Load */}
        <div className="space-y-3">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </>
  );
}

// ─── Dice dot positions ──────────────────────────────────────────────────────
function getDiceDots(value: number, cx: number, cy: number): { x: number; y: number }[] {
  const s = 8;
  const positions: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [[-s, -s], [s, s]],
    3: [[-s, -s], [0, 0], [s, s]],
    4: [[-s, -s], [s, -s], [-s, s], [s, s]],
    5: [[-s, -s], [s, -s], [0, 0], [-s, s], [s, s]],
    6: [[-s, -s], [s, -s], [-s, 0], [s, 0], [-s, s], [s, s]],
  };
  return (positions[value] || []).map(([dx, dy]) => ({ x: cx + dx, y: cy + dy }));
}
