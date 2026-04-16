"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics } from "pixi.js";
import { ArrowLeft, Volume2, VolumeX, Trophy, Plus, RotateCcw } from "lucide-react";

const GAME_ID = "niuqi";
type Cell = 0 | 1 | 2;
type Phase = "place" | "move";

// Board: 3x3 grid with all adjacencies (horizontal, vertical, diagonal)
// 0--1--2
// |\ | /|
// 3--4--5
// |/ | \|
// 6--7--8
const ADJ: number[][] = [
  [1,3,4],[0,2,3,4,5],[1,4,5],
  [0,1,4,6,7],[0,1,2,3,5,6,7,8],[1,2,4,7,8],
  [3,4,7],[3,4,5,6,8],[4,5,7],
];
const POS: [number,number][] = [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]];

interface GameState {
  board: Cell[]; phase: Phase; turn: 1|2;
  placed: [number,number]; selected: number|null;
  winner: 0|1|2; moveCount: number;
}

class NiuQiSound {
  private ctx: AudioContext|null = null;
  private muted = false;
  private init() { if (!this.ctx) this.ctx = new AudioContext(); if (this.ctx.state==="suspended") this.ctx.resume(); }
  private beep(f:number,d:number,v=0.15) {
    if (this.muted) return; this.init(); const c=this.ctx!;
    const o=c.createOscillator(),g=c.createGain();
    o.frequency.value=f; o.type="sine";
    g.gain.setValueAtTime(v,c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+d);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime+d);
  }
  playMove() { this.beep(600,0.1); }
  playWin() { this.beep(800,0.15); setTimeout(()=>this.beep(1000,0.15),150); setTimeout(()=>this.beep(1200,0.25),300); }
  playLose() { this.beep(300,0.2); setTimeout(()=>this.beep(200,0.3),200); }
  toggleMute() { this.muted=!this.muted; return this.muted; }
  get isMuted() { return this.muted; }
  dispose() { this.ctx?.close().catch(()=>{}); this.ctx=null; }
}

// ─── Game Logic ──────────────────────────────────────────────────────────────
function initState(): GameState {
  return { board: Array(9).fill(0) as Cell[], phase:"place", turn:1, placed:[0,0], selected:null, winner:0, moveCount:0 };
}

function getValidPlacements(board: Cell[]): number[] {
  return board.map((c,i)=>c===0?i:-1).filter(i=>i>=0);
}

function getMoves(board: Cell[], player: 1|2): [number,number][] {
  const moves: [number,number][] = [];
  for (let i=0;i<9;i++) {
    if (board[i]!==player) continue;
    for (const j of ADJ[i]) if (board[j]===0) moves.push([i,j]);
  }
  return moves;
}

function isTrapped(board: Cell[], player: 1|2): boolean {
  for (let i=0;i<9;i++) {
    if (board[i]!==player) continue;
    for (const j of ADJ[i]) if (board[j]===0) return false;
  }
  return true;
}

function evaluate(board: Cell[]): number {
  let aiMob=0, plMob=0;
  for (let i=0;i<9;i++) {
    if (board[i]===2) for (const j of ADJ[i]) { if (board[j]===0) aiMob++; }
    if (board[i]===1) for (const j of ADJ[i]) { if (board[j]===0) plMob++; }
  }
  const center = board[4]===2?3:board[4]===1?-3:0;
  return (aiMob-plMob)*2+center;
}

function minimax(board: Cell[], phase: Phase, placed: [number,number], turn: 1|2, depth: number, a: number, b: number, max: boolean): number {
  if (phase==="move" && isTrapped(board,turn)) return max ? -1000+depth : 1000-depth;
  if (depth===0) return evaluate(board);
  const opp: 1|2 = turn===1?2:1;
  if (phase==="place") {
    const spots = getValidPlacements(board);
    if (spots.length===0) return evaluate(board);
    let best = max?-Infinity:Infinity;
    for (const s of spots) {
      const nb=[...board] as Cell[]; nb[s]=turn;
      const np:[number,number]=[...placed]; np[turn-1]++;
      const nph = np[0]>=2&&np[1]>=2?"move":"place";
      const v = minimax(nb,nph,np,opp,depth-1,a,b,!max);
      if (max) { best=Math.max(best,v); a=Math.max(a,v); } else { best=Math.min(best,v); b=Math.min(b,v); }
      if (b<=a) break;
    }
    return best;
  }
  const moves = getMoves(board,turn);
  if (moves.length===0) return max?-1000+depth:1000-depth;
  let best = max?-Infinity:Infinity;
  for (const [from,to] of moves) {
    const nb=[...board] as Cell[]; nb[from]=0; nb[to]=turn;
    const v = minimax(nb,phase,placed,opp,depth-1,a,b,!max);
    if (max) { best=Math.max(best,v); a=Math.max(a,v); } else { best=Math.min(best,v); b=Math.min(b,v); }
    if (b<=a) break;
  }
  return best;
}

function aiChoose(state: GameState): number[]|null {
  const { board, phase, placed } = state;
  if (phase==="place") {
    const spots = getValidPlacements(board);
    if (!spots.length) return null;
    let best=spots[0], bestV=-Infinity;
    for (const s of spots) {
      const nb=[...board] as Cell[]; nb[s]=2;
      const np:[number,number]=[...placed]; np[1]++;
      const nph = np[0]>=2&&np[1]>=2?"move":"place";
      const v = minimax(nb,nph,np,1,5,-Infinity,Infinity,false);
      if (v>bestV) { bestV=v; best=s; }
    }
    return [best];
  }
  const moves = getMoves(board,2);
  if (!moves.length) return null;
  let best=moves[0], bestV=-Infinity;
  for (const [from,to] of moves) {
    const nb=[...board] as Cell[]; nb[from]=0; nb[to]=2;
    const v = minimax(nb,phase,placed,1,5,-Infinity,Infinity,false);
    if (v>bestV) { bestV=v; best=[from,to]; }
  }
  return best;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function NiuQiPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(initState());
  const soundRef = useRef<NiuQiSound>(null!);
  const pixiAppRef = useRef<Application|null>(null);
  const pixiGfxRef = useRef<PixiGraphics|null>(null);
  const rafRef = useRef<number>(0);
  const destroyedRef = useRef(false);
  const scoreSubmittedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("place");
  const [turn, setTurn] = useState<1|2>(1);
  const [winner, setWinner] = useState<0|1|2>(0);
  const [muted, setMuted] = useState(false);
  const [showLB, setShowLB] = useState(false);
  const [wins, setWins] = useState(0);

  const syncUI = useCallback(() => {
    const g = gameRef.current;
    setPhase(g.phase); setTurn(g.turn); setWinner(g.winner);
  }, []);

  const submitScore = useCallback(async (s: number) => {
    if (scoreSubmittedRef.current||s===0) return;
    scoreSubmittedRef.current = true;
    try { await fetchWithAuth("/api/games/scores",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({game_id:GAME_ID,score:s})}); } catch {}
  }, []);

  const checkWin = useCallback((g: GameState) => {
    if (g.phase!=="move") return;
    if (isTrapped(g.board, g.turn)) {
      g.winner = g.turn===1?2:1;
      if (g.winner===1) { soundRef.current?.playWin(); const w=wins+1; setWins(w); submitScore(w*100); }
      else soundRef.current?.playLose();
      syncUI();
    }
  }, [wins, submitScore, syncUI]);

  const doAI = useCallback((g: GameState) => {
    setTimeout(() => {
      if (destroyedRef.current||g.winner) return;
      const move = aiChoose(g);
      if (!move) { g.winner=1; soundRef.current?.playWin(); const w=wins+1; setWins(w); submitScore(w*100); syncUI(); return; }
      if (g.phase==="place") {
        g.board[move[0]]=2; g.placed[1]++; g.moveCount++;
        if (g.placed[0]>=2&&g.placed[1]>=2) g.phase="move";
      } else {
        g.board[move[0]]=0; g.board[move[1]]=2; g.moveCount++;
      }
      soundRef.current?.playMove();
      g.turn=1; g.selected=null;
      checkWin(g); syncUI();
    }, 400);
  }, [wins, submitScore, checkWin, syncUI]);

  const handleClick = useCallback((pointIdx: number) => {
    const g = gameRef.current;
    if (g.winner||g.turn!==1) return;
    if (g.phase==="place") {
      if (g.board[pointIdx]!==0) return;
      g.board[pointIdx]=1; g.placed[0]++; g.moveCount++;
      if (g.placed[0]>=2&&g.placed[1]>=2) g.phase="move";
      soundRef.current?.playMove();
      g.turn=2; syncUI(); doAI(g);
    } else {
      if (g.selected===null) {
        if (g.board[pointIdx]!==1) return;
        const hasMoves = ADJ[pointIdx].some(j=>g.board[j]===0);
        if (!hasMoves) return;
        g.selected=pointIdx; syncUI();
      } else {
        if (pointIdx===g.selected) { g.selected=null; syncUI(); return; }
        if (g.board[pointIdx]===1) {
          const hasMoves = ADJ[pointIdx].some(j=>g.board[j]===0);
          if (hasMoves) { g.selected=pointIdx; syncUI(); }
          return;
        }
        if (g.board[pointIdx]!==0||!ADJ[g.selected].includes(pointIdx)) return;
        g.board[g.selected]=0; g.board[pointIdx]=1; g.moveCount++;
        soundRef.current?.playMove();
        g.selected=null; g.turn=2; checkWin(g); syncUI();
        if (!g.winner) doAI(g);
      }
    }
  }, [doAI, checkWin, syncUI]);

  const initGame = useCallback(() => {
    gameRef.current = initState();
    scoreSubmittedRef.current = false;
    syncUI();
  }, [syncUI]);

  const undoRef = useRef<GameState[]>([]);
  const saveSnapshot = useCallback(() => {
    const g = gameRef.current;
    undoRef.current.push(JSON.parse(JSON.stringify(g)));
    if (undoRef.current.length>20) undoRef.current.shift();
  }, []);

  const handleClickWrapped = useCallback((idx: number) => {
    saveSnapshot(); handleClick(idx);
  }, [saveSnapshot, handleClick]);

  const undo = useCallback(() => {
    const stack = undoRef.current;
    if (stack.length<2) return;
    stack.pop(); // remove AI move
    const prev = stack.pop()!;
    gameRef.current = prev;
    syncUI();
  }, [syncUI]);

  // Save / Load
  const handleSave = useCallback(() => {
    const g = gameRef.current;
    return { board:[...g.board], phase:g.phase, turn:g.turn, placed:[...g.placed], selected:g.selected, winner:g.winner, moveCount:g.moveCount, wins };
  }, [wins]);

  const handleLoad = useCallback((data: unknown) => {
    try {
      const d = data as GameState & { wins?: number };
      if (!d||!Array.isArray(d.board)) return;
      gameRef.current = { board:d.board as Cell[], phase:d.phase, turn:d.turn, placed:d.placed as [number,number], selected:null, winner:d.winner, moveCount:d.moveCount };
      if (typeof d.wins==="number") setWins(d.wins);
      scoreSubmittedRef.current = false;
      syncUI();
    } catch {}
  }, [syncUI]);

  // ─── PixiJS Rendering ────────────────────────────────────────────────────
  useEffect(() => {
    soundRef.current = new NiuQiSound();
    const canvas = canvasRef.current;
    if (!canvas) return;
    destroyedRef.current = false;

    let app: Application|null = null;
    let gfx: PixiGraphics|null = null;

    const resize = () => {
      const p = canvas.parentElement;
      if (!p) return;
      const sz = Math.min(p.clientWidth, 480);
      canvas.style.width = `${sz}px`;
      canvas.style.height = `${sz}px`;
      if (app) app.renderer.resize(sz, sz);
    };

    async function init() {
      if (destroyedRef.current) return;
      const pixi = await loadPixi();
      if (destroyedRef.current) return;
      const p = canvas!.parentElement;
      const sz = Math.min(p?p.clientWidth:400, 480);
      app = await createPixiApp({ canvas: canvas!, width: sz, height: sz, backgroundColor: 0x0f0f0f, antialias: true });
      if (destroyedRef.current) { app.destroy(true); return; }
      pixiAppRef.current = app;
      gfx = new pixi.Graphics();
      app.stage.addChild(gfx);
      pixiGfxRef.current = gfx;

      // Click handling
      canvas!.addEventListener("click", onCanvasClick);
      canvas!.addEventListener("touchend", onCanvasTouch);

      resize();
      renderLoop();
    }

    function getPointFromXY(cx: number, cy: number): number {
      const rect = canvas!.getBoundingClientRect();
      const scale = rect.width;
      const pad = scale * 0.15;
      const gridSz = scale - pad * 2;
      const step = gridSz / 2;
      const mx = (cx - rect.left - pad) / step;
      const my = (cy - rect.top - pad) / step;
      let closest = -1, minD = Infinity;
      for (let i = 0; i < 9; i++) {
        const dx = POS[i][0] - mx, dy = POS[i][1] - my;
        const d = dx*dx + dy*dy;
        if (d < minD) { minD = d; closest = i; }
      }
      return minD < 0.25 ? closest : -1;
    }

    function onCanvasClick(e: MouseEvent) {
      const idx = getPointFromXY(e.clientX, e.clientY);
      if (idx >= 0) handleClickWrapped(idx);
    }
    function onCanvasTouch(e: TouchEvent) {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (!t) return;
      const idx = getPointFromXY(t.clientX, t.clientY);
      if (idx >= 0) handleClickWrapped(idx);
    }

    function renderLoop() {
      if (destroyedRef.current) return;
      rafRef.current = requestAnimationFrame(renderLoop);
      if (!gfx) return;
      gfx.clear();
      const g = gameRef.current;
      const cw = canvas!.clientWidth || 400;
      const pad = cw * 0.15;
      const gridSz = cw - pad * 2;
      const step = gridSz / 2;

      // Draw board lines
      const lineColor = 0xc8a84e;
      const lineAlpha = 0.7;
      const lw = 2;
      // Horizontal
      for (let r = 0; r < 3; r++) {
        const y = pad + r * step;
        gfx.moveTo(pad, y).lineTo(pad + gridSz, y).stroke({ color: lineColor, alpha: lineAlpha, width: lw });
      }
      // Vertical
      for (let c = 0; c < 3; c++) {
        const x = pad + c * step;
        gfx.moveTo(x, pad).lineTo(x, pad + gridSz).stroke({ color: lineColor, alpha: lineAlpha, width: lw });
      }
      // Diagonals
      gfx.moveTo(pad, pad).lineTo(pad+gridSz, pad+gridSz).stroke({ color: lineColor, alpha: lineAlpha, width: lw });
      gfx.moveTo(pad+gridSz, pad).lineTo(pad, pad+gridSz).stroke({ color: lineColor, alpha: lineAlpha, width: lw });

      // Draw points and pieces
      const ptR = Math.max(8, cw * 0.025);
      const pieceR = Math.max(14, cw * 0.06);
      const time = Date.now() / 1000;

      for (let i = 0; i < 9; i++) {
        const x = pad + POS[i][0] * step;
        const y = pad + POS[i][1] * step;

        if (g.board[i] === 0) {
          // Valid move indicator
          const isValid = g.turn===1 && !g.winner && (
            (g.phase==="place") ||
            (g.phase==="move" && g.selected!==null && ADJ[g.selected].includes(i))
          );
          if (isValid) {
            const pulse = 0.3 + Math.sin(time * 3) * 0.15;
            gfx.circle(x, y, ptR * 1.5).fill({ color: 0x3ea6ff, alpha: pulse });
          }
          gfx.circle(x, y, ptR).fill({ color: 0x555555, alpha: 0.8 });
        } else {
          // Piece
          const isPlayer = g.board[i] === 1;
          const color = isPlayer ? 0x3ea6ff : 0xe74c3c;
          const isSelected = g.selected === i;
          if (isSelected) {
            const glow = 0.4 + Math.sin(time * 4) * 0.2;
            gfx.circle(x, y, pieceR * 1.4).fill({ color: 0x3ea6ff, alpha: glow });
          }
          // Shadow
          gfx.circle(x + 2, y + 2, pieceR).fill({ color: 0x000000, alpha: 0.3 });
          // Main piece
          gfx.circle(x, y, pieceR).fill({ color });
          // Highlight
          gfx.circle(x - pieceR * 0.25, y - pieceR * 0.25, pieceR * 0.35).fill({ color: 0xffffff, alpha: 0.25 });
        }
      }

      // Winner overlay
      if (g.winner) {
        gfx.rect(0, 0, cw, cw).fill({ color: 0x000000, alpha: 0.5 });
      }
    }

    init();
    window.addEventListener("resize", resize);

    return () => {
      destroyedRef.current = true;
      cancelAnimationFrame(rafRef.current);
      canvas!.removeEventListener("click", onCanvasClick);
      canvas!.removeEventListener("touchend", onCanvasTouch);
      window.removeEventListener("resize", resize);
      if (app) { try { app.destroy(true); } catch {} }
      pixiAppRef.current = null;
      pixiGfxRef.current = null;
      soundRef.current?.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── JSX ─────────────────────────────────────────────────────────────────
  const phaseText = phase === "place" ? "放子阶段" : "走子阶段";
  const turnText = winner ? (winner===1?"你赢了!":"你输了!") : turn===1?"你的回合":"对手思考中...";
  const turnColor = winner ? (winner===1?"text-green-400":"text-red-400") : turn===1?"text-[#3ea6ff]":"text-red-400";

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0f0f0f] text-white pt-16 pb-20 px-4 max-w-2xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center gap-3 mb-4">
          <Link href="/games" className="text-[#3ea6ff] hover:text-[#65b8ff] transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold flex-1">
            <span className="text-[#3ea6ff]">{">"}</span> 憋死牛
          </h1>
          <button onClick={()=>setMuted(soundRef.current?.toggleMute()??false)} className="p-2 rounded-lg hover:bg-[#1a1a1a] transition text-[#aaa]" aria-label="静音">
            {muted ? <VolumeX className="w-5 h-5"/> : <Volume2 className="w-5 h-5"/>}
          </button>
          <button onClick={()=>setShowLB(!showLB)} className="p-2 rounded-lg hover:bg-[#1a1a1a] transition text-[#aaa]" aria-label="排行榜">
            <Trophy className="w-5 h-5"/>
          </button>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#888] bg-[#1a1a1a] px-2 py-1 rounded border border-[#333]">{phaseText}</span>
            <span className={`text-sm font-bold ${turnColor}`}>{turnText}</span>
          </div>
          <div className="text-xs text-[#888]">
            胜场: <span className="text-[#f0b90b] font-bold">{wins}</span>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex justify-center mb-4">
          <div className="w-full max-w-[480px] aspect-square">
            <canvas ref={canvasRef} className="w-full h-full rounded-xl border border-[#333] cursor-pointer" style={{ touchAction: "none" }} />
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-3 mb-4">
          <button onClick={initGame} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3ea6ff]/20 text-[#3ea6ff] hover:bg-[#3ea6ff]/30 transition text-sm font-medium border border-[#3ea6ff]/30">
            <Plus className="w-4 h-4"/> 新局
          </button>
          <button onClick={undo} disabled={turn!==1||!!winner} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1a1a] text-[#aaa] hover:bg-[#252525] transition text-sm border border-[#333] disabled:opacity-40">
            <RotateCcw className="w-4 h-4"/> 悔棋
          </button>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-6 mb-4 text-xs text-[#888]">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#3ea6ff] inline-block" /> 你 (蓝)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#e74c3c] inline-block" /> 对手 (红)
          </div>
        </div>

        {/* Rules */}
        <div className="rounded-xl bg-[#1a1a1a] border border-[#333] p-4 mb-4 text-xs text-[#888] space-y-1">
          <p className="text-[#3ea6ff] font-bold text-sm mb-2">规则说明</p>
          <p>1. 双方各有2枚棋子（牛），在3x3棋盘上对弈</p>
          <p>2. 放子阶段：轮流将棋子放在空位上</p>
          <p>3. 走子阶段：沿线移动棋子到相邻空位</p>
          <p>4. 无法移动的一方输（被"憋死"）</p>
        </div>

        {winner > 0 && (
          <div className="text-center mb-4">
            <button onClick={initGame} className="px-6 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition shadow-lg shadow-[#3ea6ff]/25">
              再来一局
            </button>
          </div>
        )}

        {showLB && <div className="mb-4"><GameLeaderboard gameId={GAME_ID} /></div>}
        <div className="space-y-3">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
        </div>
      </main>
    </>
  );
}
