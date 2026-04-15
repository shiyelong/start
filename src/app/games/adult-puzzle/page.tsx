"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Puzzle, Lock } from "lucide-react";
import { ageGate } from "@/lib/age-gate";

const W = 400, H = 440, GRID = 6, CELL = 56;
type Phase = "title" | "playing" | "gameover";
const COLORS = ["#ff4757", "#3ea6ff", "#2ed573", "#ffa502", "#a55eea", "#ff6b81"];

function makeBoard(): number[][] {
  const b: number[][] = Array.from({ length: GRID }, () => Array.from({ length: GRID }, () => Math.floor(Math.random() * COLORS.length)));
  // Remove initial matches
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
    while ((c >= 2 && b[r][c] === b[r][c - 1] && b[r][c] === b[r][c - 2]) || (r >= 2 && b[r][c] === b[r - 1][c] && b[r][c] === b[r - 2][c]))
      b[r][c] = Math.floor(Math.random() * COLORS.length);
  }
  return b;
}

function findMatches(b: number[][]): [number, number][] {
  const matched = new Set<string>();
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID - 2; c++) {
    if (b[r][c] >= 0 && b[r][c] === b[r][c + 1] && b[r][c] === b[r][c + 2]) { matched.add(`${r},${c}`); matched.add(`${r},${c + 1}`); matched.add(`${r},${c + 2}`); }
  }
  for (let r = 0; r < GRID - 2; r++) for (let c = 0; c < GRID; c++) {
    if (b[r][c] >= 0 && b[r][c] === b[r + 1][c] && b[r][c] === b[r + 2][c]) { matched.add(`${r},${c}`); matched.add(`${r + 1},${c}`); matched.add(`${r + 2},${c}`); }
  }
  return Array.from(matched).map(s => { const [r, c] = s.split(",").map(Number); return [r, c]; });
}

export default function AdultPuzzle() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [score, setScore] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const sRef = useRef({ board: makeBoard(), score: 0, moves: 30, selected: null as [number, number] | null, msg: "" });
  const rafRef = useRef(0);

  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  const startGame = useCallback(() => {
    sRef.current = { board: makeBoard(), score: 0, moves: 30, selected: null, msg: "Match 3 or more!" };
    setScore(0); setPhase("playing");
  }, []);

  const swap = useCallback((r1: number, c1: number, r2: number, c2: number) => {
    const s = sRef.current; const b = s.board;
    [b[r1][c1], b[r2][c2]] = [b[r2][c2], b[r1][c1]];
    const matches = findMatches(b);
    if (matches.length === 0) { [b[r1][c1], b[r2][c2]] = [b[r2][c2], b[r1][c1]]; s.msg = "No match!"; return; }
    s.moves--;
    // Remove matches and cascade
    let totalCleared = 0;
    const processMatches = () => {
      const m = findMatches(b); if (m.length === 0) return;
      totalCleared += m.length;
      for (const [mr, mc] of m) b[mr][mc] = -1;
      // Gravity
      for (let c = 0; c < GRID; c++) {
        let writeRow = GRID - 1;
        for (let r = GRID - 1; r >= 0; r--) { if (b[r][c] >= 0) { b[writeRow][c] = b[r][c]; if (writeRow !== r) b[r][c] = -1; writeRow--; } }
        for (let r = writeRow; r >= 0; r--) b[r][c] = Math.floor(Math.random() * COLORS.length);
      }
      processMatches();
    };
    processMatches();
    s.score += totalCleared * 20; setScore(s.score);
    s.msg = `+${totalCleared * 20} pts!`;
    if (s.moves <= 0) { setPhase("gameover"); s.msg = "No moves left!"; }
  }, []);

  const handleClick = useCallback((mx: number, my: number) => {
    if (phase !== "playing") { startGame(); return; }
    const s = sRef.current;
    const ox = (W - GRID * CELL) / 2, oy = 60;
    const c = Math.floor((mx - ox) / CELL), r = Math.floor((my - oy) / CELL);
    if (r < 0 || r >= GRID || c < 0 || c >= GRID) return;
    if (s.selected) {
      const [sr, sc] = s.selected;
      if (Math.abs(sr - r) + Math.abs(sc - c) === 1) { swap(sr, sc, r, c); s.selected = null; }
      else s.selected = [r, c];
    } else s.selected = [r, c];
  }, [phase, startGame, swap]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    const render = () => {
      ctx.save(); ctx.scale(dpr, dpr); ctx.fillStyle = "#0f0f0f"; ctx.fillRect(0, 0, W, H);
      const s = sRef.current;
      if (phase === "title") {
        ctx.fillStyle = "#a55eea"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Adult Puzzle", W / 2, H / 2 - 30); ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif"; ctx.fillText("Match-3 puzzle game", W / 2, H / 2); ctx.fillText("Click to Start", W / 2, H / 2 + 30);
      } else {
        ctx.fillStyle = "#fff"; ctx.font = "14px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`Moves: ${s.moves} | Score: ${s.score}`, 10, 24);
        ctx.fillStyle = "#ffd700"; ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.fillText(s.msg, W / 2, 46);
        const ox = (W - GRID * CELL) / 2, oy = 60;
        for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
          const x = ox + c * CELL, y = oy + r * CELL;
          const sel = s.selected && s.selected[0] === r && s.selected[1] === c;
          ctx.fillStyle = sel ? "#2a2a4e" : "#1a1a2e";
          ctx.beginPath(); ctx.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 8); ctx.fill();
          if (s.board[r][c] >= 0) {
            ctx.fillStyle = COLORS[s.board[r][c]];
            ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2, CELL / 2 - 8, 0, Math.PI * 2); ctx.fill();
          }
          if (sel) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 8); ctx.stroke(); }
        }
        if (phase === "gameover") { ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#a55eea"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center"; ctx.fillText("Game Over", W / 2, H / 2 - 10); ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif"; ctx.fillText(`Score: ${s.score}`, W / 2, H / 2 + 20); ctx.fillText("Click to Restart", W / 2, H / 2 + 44); }
      }
      ctx.restore(); rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    const onClick = (e: MouseEvent) => { const rect = canvas.getBoundingClientRect(); handleClick((e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height)); };
    const onTouch = (e: TouchEvent) => { e.preventDefault(); const t = e.changedTouches[0]; const rect = canvas.getBoundingClientRect(); handleClick((t.clientX - rect.left) * (W / rect.width), (t.clientY - rect.top) * (H / rect.height)); };
    canvas.addEventListener("click", onClick); canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => { cancelAnimationFrame(rafRef.current); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchend", onTouch); };
  }, [phase, handleClick]);

  if (blocked) return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-20 text-center"><Lock size={48} className="mx-auto text-gray-600 mb-4" /><h1 className="text-xl font-bold mb-2">Access Restricted</h1><p className="text-gray-400">NC-17 mode required.</p><Link href="/games" className="mt-4 inline-block text-[#3ea6ff]">Back</Link></div></div>);

  return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-6"><Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link><div className="flex items-center gap-2 mb-4"><Puzzle size={24} className="text-[#a55eea]" /><h1 className="text-xl font-bold">Adult Puzzle</h1></div><canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" /><button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#a55eea] rounded-lg text-sm font-medium hover:bg-[#a55eea]/80"><RotateCcw size={14} /> Restart</button></div></div>);
}
