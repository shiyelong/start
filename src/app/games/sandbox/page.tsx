"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Box } from "lucide-react";

const W = 400, H = 400, GRID = 16, COLS = W / GRID, ROWS = H / GRID;
type BlockType = "air" | "dirt" | "stone" | "wood" | "water" | "sand" | "grass" | "brick";
const BLOCK_COLORS: Record<BlockType, string> = {
  air: "transparent", dirt: "#8B6914", stone: "#808080", wood: "#A0522D",
  water: "#1E90FF", sand: "#F4D03F", grass: "#228B22", brick: "#B22222",
};
const BLOCK_LIST: BlockType[] = ["dirt", "stone", "wood", "water", "sand", "grass", "brick"];

export default function SandboxGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedBlock, setSelectedBlock] = useState<BlockType>("dirt");
  const [brushSize, setBrushSize] = useState(1);
  const gridRef = useRef<BlockType[][]>(Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, () => r > ROWS - 4 ? "dirt" : r === ROWS - 4 ? "grass" : "air")));
  const paintingRef = useRef(false);
  const eraseRef = useRef(false);
  const rafRef = useRef(0);

  const paint = useCallback((mx: number, my: number) => {
    const grid = gridRef.current;
    const cx = Math.floor(mx / GRID), cy = Math.floor(my / GRID);
    for (let dy = -brushSize + 1; dy < brushSize; dy++) {
      for (let dx = -brushSize + 1; dx < brushSize; dx++) {
        const gx = cx + dx, gy = cy + dy;
        if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) {
          grid[gy][gx] = eraseRef.current ? "air" : selectedBlock;
        }
      }
    }
  }, [selectedBlock, brushSize]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;

    const render = () => {
      ctx.save(); ctx.scale(dpr, dpr);
      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#0a0a2e"); sky.addColorStop(1, "#1a1a3e");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      // Blocks
      const grid = gridRef.current;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (grid[r][c] === "air") continue;
        ctx.fillStyle = BLOCK_COLORS[grid[r][c]];
        ctx.fillRect(c * GRID, r * GRID, GRID, GRID);
        // Simple shading
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.fillRect(c * GRID, r * GRID + GRID - 2, GRID, 2);
      }
      // Physics: sand/water fall
      for (let r = ROWS - 2; r >= 0; r--) for (let c = 0; c < COLS; c++) {
        const b = grid[r][c];
        if (b === "sand" && grid[r + 1][c] === "air") { grid[r + 1][c] = "sand"; grid[r][c] = "air"; }
        else if (b === "water") {
          if (grid[r + 1][c] === "air") { grid[r + 1][c] = "water"; grid[r][c] = "air"; }
          else if (c > 0 && grid[r][c - 1] === "air" && Math.random() < 0.3) { grid[r][c - 1] = "water"; grid[r][c] = "air"; }
          else if (c < COLS - 1 && grid[r][c + 1] === "air" && Math.random() < 0.3) { grid[r][c + 1] = "water"; grid[r][c] = "air"; }
        }
      }
      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    const getPos = (e: MouseEvent | Touch) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) };
    };
    const onDown = (e: MouseEvent) => { paintingRef.current = true; eraseRef.current = e.button === 2; const p = getPos(e); paint(p.x, p.y); };
    const onMove = (e: MouseEvent) => { if (paintingRef.current) { const p = getPos(e); paint(p.x, p.y); } };
    const onUp = () => { paintingRef.current = false; };
    const onContext = (e: Event) => e.preventDefault();
    const onTouchStart = (e: TouchEvent) => { e.preventDefault(); paintingRef.current = true; const p = getPos(e.touches[0]); paint(p.x, p.y); };
    const onTouchMove = (e: TouchEvent) => { e.preventDefault(); if (paintingRef.current) { const p = getPos(e.touches[0]); paint(p.x, p.y); } };
    const onTouchEnd = () => { paintingRef.current = false; };
    canvas.addEventListener("mousedown", onDown); canvas.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp); canvas.addEventListener("contextmenu", onContext);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener("mousedown", onDown); canvas.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp); canvas.removeEventListener("contextmenu", onContext);
      canvas.removeEventListener("touchstart", onTouchStart); canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [paint]);

  const clearAll = () => { gridRef.current = Array.from({ length: ROWS }, () => Array(COLS).fill("air")); };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link>
        <div className="flex items-center gap-2 mb-4"><Box size={24} className="text-[#3ea6ff]" /><h1 className="text-xl font-bold">2D Sandbox</h1></div>
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10 cursor-crosshair" />
        <div className="mt-4 flex flex-wrap gap-2">
          {BLOCK_LIST.map(b => (
            <button key={b} onClick={() => setSelectedBlock(b)}
              className={`px-3 py-1.5 rounded text-xs font-medium border ${selectedBlock === b ? "border-[#3ea6ff] bg-[#3ea6ff]/20" : "border-white/10 bg-white/5"}`}
              style={{ color: BLOCK_COLORS[b] }}>{b}</button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-4">
          <label className="text-sm text-gray-400">Brush: {brushSize}</label>
          <input type="range" min={1} max={4} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} className="flex-1" />
          <button onClick={clearAll} className="flex items-center gap-1 px-3 py-1.5 bg-[#3ea6ff] rounded text-xs font-medium hover:bg-[#3ea6ff]/80"><RotateCcw size={12} /> Clear</button>
        </div>
        <p className="mt-2 text-xs text-gray-500">Left click to place, right click to erase. Sand and water have physics!</p>
      </div>
    </div>
  );
}
