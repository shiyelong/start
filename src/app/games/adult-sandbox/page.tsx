"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Box, Lock } from "lucide-react";
import { ageGate } from "@/lib/age-gate";

const W = 400, H = 400, GRID = 16, COLS = W / GRID, ROWS = H / GRID;
type Block = "air" | "wall" | "bed" | "light" | "carpet" | "plant" | "mirror" | "curtain";
const BLOCK_COLORS: Record<Block, string> = { air: "transparent", wall: "#4a3a2e", bed: "#ff6b81", light: "#ffd700", carpet: "#a55eea", plant: "#2ed573", mirror: "#70a1ff", curtain: "#ff4757" };
const BLOCKS: Block[] = ["wall", "bed", "light", "carpet", "plant", "mirror", "curtain"];

export default function AdultSandbox() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<Block>("wall");
  const [blocked, setBlocked] = useState(false);
  const gridRef = useRef<Block[][]>(Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, () => r === 0 || r === ROWS - 1 ? "wall" : "air")));
  const paintingRef = useRef(false);
  const eraseRef = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  const paint = useCallback((mx: number, my: number) => {
    const gx = Math.floor(mx / GRID), gy = Math.floor(my / GRID);
    if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) gridRef.current[gy][gx] = eraseRef.current ? "air" : selected;
  }, [selected]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    const render = () => {
      ctx.save(); ctx.scale(dpr, dpr);
      ctx.fillStyle = "#1a0a1a"; ctx.fillRect(0, 0, W, H);
      const grid = gridRef.current;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (grid[r][c] === "air") continue;
        ctx.fillStyle = BLOCK_COLORS[grid[r][c]]; ctx.fillRect(c * GRID, r * GRID, GRID, GRID);
        ctx.fillStyle = "rgba(0,0,0,0.15)"; ctx.fillRect(c * GRID, r * GRID + GRID - 2, GRID, 2);
      }
      // Light glow effect
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (grid[r][c] === "light") {
          const grd = ctx.createRadialGradient(c * GRID + GRID / 2, r * GRID + GRID / 2, 0, c * GRID + GRID / 2, r * GRID + GRID / 2, GRID * 3);
          grd.addColorStop(0, "rgba(255,215,0,0.15)"); grd.addColorStop(1, "transparent");
          ctx.fillStyle = grd; ctx.fillRect(c * GRID - GRID * 3, r * GRID - GRID * 3, GRID * 7, GRID * 7);
        }
      }
      ctx.restore(); rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    const getPos = (e: MouseEvent | Touch) => { const rect = canvas.getBoundingClientRect(); return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) }; };
    const onDown = (e: MouseEvent) => { paintingRef.current = true; eraseRef.current = e.button === 2; paint(getPos(e).x, getPos(e).y); };
    const onMove = (e: MouseEvent) => { if (paintingRef.current) paint(getPos(e).x, getPos(e).y); };
    const onUp = () => { paintingRef.current = false; };
    const onCtx = (e: Event) => e.preventDefault();
    const onTS = (e: TouchEvent) => { e.preventDefault(); paintingRef.current = true; paint(getPos(e.touches[0]).x, getPos(e.touches[0]).y); };
    const onTM = (e: TouchEvent) => { e.preventDefault(); if (paintingRef.current) paint(getPos(e.touches[0]).x, getPos(e.touches[0]).y); };
    const onTE = () => { paintingRef.current = false; };
    canvas.addEventListener("mousedown", onDown); canvas.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp); canvas.addEventListener("contextmenu", onCtx);
    canvas.addEventListener("touchstart", onTS, { passive: false }); canvas.addEventListener("touchmove", onTM, { passive: false }); canvas.addEventListener("touchend", onTE);
    return () => { cancelAnimationFrame(rafRef.current); canvas.removeEventListener("mousedown", onDown); canvas.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); canvas.removeEventListener("contextmenu", onCtx); canvas.removeEventListener("touchstart", onTS); canvas.removeEventListener("touchmove", onTM); canvas.removeEventListener("touchend", onTE); };
  }, [paint]);

  if (blocked) return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-20 text-center"><Lock size={48} className="mx-auto text-gray-600 mb-4" /><h1 className="text-xl font-bold mb-2">Access Restricted</h1><p className="text-gray-400">NC-17 mode required.</p><Link href="/games" className="mt-4 inline-block text-[#3ea6ff]">Back</Link></div></div>);

  return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-6"><Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link><div className="flex items-center gap-2 mb-4"><Box size={24} className="text-[#a55eea]" /><h1 className="text-xl font-bold">Adult Sandbox</h1></div><canvas ref={canvasRef} className="w-full rounded-lg border border-white/10 cursor-crosshair" /><div className="mt-3 flex flex-wrap gap-2">{BLOCKS.map(b => (<button key={b} onClick={() => setSelected(b)} className={`px-3 py-1.5 rounded text-xs font-medium border ${selected === b ? "border-[#a55eea] bg-[#a55eea]/20" : "border-white/10 bg-white/5"}`} style={{ color: BLOCK_COLORS[b] }}>{b}</button>))}</div><p className="mt-2 text-xs text-gray-500">Left click to place, right click to erase.</p></div></div>);
}
