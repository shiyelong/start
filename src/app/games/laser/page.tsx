"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

const CELL = 60, COLS = 7, ROWS = 7;
const W = COLS * CELL, H = ROWS * CELL;

type Dir = "up" | "down" | "left" | "right";
type PieceType = "empty" | "mirror_nw" | "mirror_ne" | "splitter" | "block" | "target" | "source";

interface Piece { type: PieceType; fixed: boolean; lit: boolean; color: string; }
interface LaserSeg { x1: number; y1: number; x2: number; y2: number; color: string; }

interface Level {
  name: string;
  grid: PieceType[][];
  sourcePos: [number, number];
  sourceDir: Dir;
  targetPositions: [number, number][];
}

const LEVELS: Level[] = [
  {
    name: "初识光线", grid: [
      ["empty","empty","empty","empty","empty","empty","empty"],
      ["empty","empty","empty","empty","empty","empty","empty"],
      ["empty","empty","empty","empty","empty","empty","empty"],
      ["source","empty","empty","mirror_ne","empty","empty","target"],
      ["empty","empty","empty","empty","empty","empty","empty"],
      ["empty","empty","empty","empty","empty","empty","empty"],
      ["empty","empty","empty","empty","empty","empty","empty"],
    ],
    sourcePos: [0, 3], sourceDir: "right", targetPositions: [[6, 3]],
  },
  {
    name: "双重反射", grid: [
      ["empty","empty","empty","empty","empty","empty","empty"],
      ["empty","empty","empty","empty","empty","empty","empty"],
      ["source","empty","empty","mirror_ne","empty","empty","empty"],
      ["empty","empty","empty","empty","empty","empty","empty"],
      ["empty","empty","empty","empty","empty","mirror_nw","empty"],
      ["empty","empty","empty","empty","empty","empty","empty"],
      ["empty","empty","empty","empty","empty","target","empty"],
    ],
    sourcePos: [0, 2], sourceDir: "right", targetPositions: [[5, 6]],
  },
  {
    name: "分光挑战", grid: [
      ["empty","empty","empty","target","empty","empty","empty"],
      ["empty","empty","empty","empty","empty","empty","empty"],
      ["empty","empty","empty","empty","empty","empty","empty"],
      ["source","empty","empty","splitter","empty","empty","target"],
      ["empty","empty","empty","empty","empty","empty","empty"],
      ["empty","empty","empty","empty","empty","empty","empty"],
      ["empty","empty","empty","target","empty","empty","empty"],
    ],
    sourcePos: [0, 3], sourceDir: "right", targetPositions: [[3, 0], [6, 3], [3, 6]],
  },
];

function reflect(dir: Dir, mirror: "mirror_nw" | "mirror_ne"): Dir {
  if (mirror === "mirror_ne") {
    if (dir === "right") return "up";
    if (dir === "left") return "down";
    if (dir === "up") return "right";
    return "left";
  }
  // mirror_nw: /
  if (dir === "right") return "down";
  if (dir === "left") return "up";
  if (dir === "up") return "left";
  return "right";
}

function traceLaser(grid: Piece[][], sx: number, sy: number, dir: Dir, color: string, depth: number): LaserSeg[] {
  if (depth > 50) return [];
  const segs: LaserSeg[] = [];
  const dx = dir === "right" ? 1 : dir === "left" ? -1 : 0;
  const dy = dir === "down" ? 1 : dir === "up" ? -1 : 0;
  let cx = sx, cy = sy;

  while (true) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
      segs.push({ x1: cx * CELL + CELL / 2, y1: cy * CELL + CELL / 2, x2: (cx + dx * 0.5) * CELL + CELL / 2, y2: (cy + dy * 0.5) * CELL + CELL / 2, color });
      break;
    }
    const piece = grid[ny][nx];
    segs.push({ x1: cx * CELL + CELL / 2, y1: cy * CELL + CELL / 2, x2: nx * CELL + CELL / 2, y2: ny * CELL + CELL / 2, color });

    if (piece.type === "block") break;
    if (piece.type === "target") { piece.lit = true; break; }
    if (piece.type === "mirror_ne" || piece.type === "mirror_nw") {
      piece.lit = true;
      const newDir = reflect(dir, piece.type);
      segs.push(...traceLaser(grid, nx, ny, newDir, color, depth + 1));
      break;
    }
    if (piece.type === "splitter") {
      piece.lit = true;
      // Continue straight + split perpendicular
      segs.push(...traceLaser(grid, nx, ny, dir, color, depth + 1));
      const perpDirs: Dir[] = (dir === "left" || dir === "right") ? ["up", "down"] : ["left", "right"];
      for (const pd of perpDirs) {
        segs.push(...traceLaser(grid, nx, ny, pd, "#a855f7", depth + 1));
      }
      break;
    }
    cx = nx; cy = ny;
  }
  return segs;
}

export default function LaserPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [levelIdx, setLevelIdx] = useState(0);
  const [grid, setGrid] = useState<Piece[][]>([]);
  const [won, setWon] = useState(false);
  const [laserSegs, setLaserSegs] = useState<LaserSeg[]>([]);
  const frameRef = useRef(0);

  const initLevel = useCallback((idx: number) => {
    const level = LEVELS[idx];
    const g: Piece[][] = level.grid.map(row => row.map(type => ({
      type, fixed: type === "source" || type === "target" || type === "block",
      lit: false, color: type === "source" ? "#00ffcc" : type === "target" ? "#ff4444" : "#3ea6ff",
    })));
    setGrid(g);
    setWon(false);
    setLevelIdx(idx);
  }, []);

  useEffect(() => { initLevel(0); }, [initLevel]);

  // Trace laser whenever grid changes
  useEffect(() => {
    if (grid.length === 0) return;
    const level = LEVELS[levelIdx];
    // Reset lit
    grid.forEach(row => row.forEach(p => { if (p.type !== "source") p.lit = false; }));
    const segs = traceLaser(grid, level.sourcePos[0], level.sourcePos[1], level.sourceDir, "#00ffcc", 0);
    setLaserSegs(segs);
    // Check win
    const allLit = level.targetPositions.every(([tx, ty]) => grid[ty][tx].lit);
    if (allLit) setWon(true);
  }, [grid, levelIdx]);

  // Render
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    let raf: number;
    const draw = () => {
      frameRef.current++;
      const f = frameRef.current;
      ctx.fillStyle = "#0a0a1a";
      ctx.fillRect(0, 0, W, H);

      // Grid lines with glow
      ctx.strokeStyle = "rgba(62,166,255,0.06)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke(); }
      for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL); ctx.stroke(); }

      // Pieces
      grid.forEach((row, y) => row.forEach((p, x) => {
        const cx = x * CELL + CELL / 2, cy = y * CELL + CELL / 2;
        if (p.type === "source") {
          const glow = ctx.createRadialGradient(cx, cy, 5, cx, cy, 25);
          glow.addColorStop(0, "rgba(0,255,204,0.6)");
          glow.addColorStop(1, "rgba(0,255,204,0)");
          ctx.fillStyle = glow; ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
          ctx.fillStyle = "#00ffcc";
          ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#0a0a1a";
          ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
        }
        if (p.type === "target") {
          const lit = p.lit;
          const glow = ctx.createRadialGradient(cx, cy, 5, cx, cy, 25);
          glow.addColorStop(0, lit ? "rgba(43,166,64,0.6)" : "rgba(255,68,68,0.3)");
          glow.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = glow; ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
          ctx.strokeStyle = lit ? "#2ba640" : "#ff4444";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
          if (lit) { ctx.fillStyle = "#2ba640"; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill(); }
        }
        if (p.type === "mirror_ne" || p.type === "mirror_nw") {
          ctx.strokeStyle = p.lit ? "#00ffcc" : "#3ea6ff";
          ctx.lineWidth = 3;
          ctx.shadowColor = p.lit ? "#00ffcc" : "transparent";
          ctx.shadowBlur = p.lit ? 10 : 0;
          ctx.beginPath();
          if (p.type === "mirror_ne") { ctx.moveTo(x * CELL + 8, y * CELL + CELL - 8); ctx.lineTo(x * CELL + CELL - 8, y * CELL + 8); }
          else { ctx.moveTo(x * CELL + 8, y * CELL + 8); ctx.lineTo(x * CELL + CELL - 8, y * CELL + CELL - 8); }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        if (p.type === "splitter") {
          ctx.fillStyle = p.lit ? "#a855f7" : "#666";
          ctx.shadowColor = p.lit ? "#a855f7" : "transparent";
          ctx.shadowBlur = p.lit ? 10 : 0;
          ctx.beginPath(); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx + 14, cy); ctx.lineTo(cx, cy + 14); ctx.lineTo(cx - 14, cy); ctx.fill();
          ctx.shadowBlur = 0;
        }
        if (p.type === "block") {
          ctx.fillStyle = "#333";
          ctx.fillRect(x * CELL + 6, y * CELL + 6, CELL - 12, CELL - 12);
        }
      }));

      // Laser beams with glow animation
      const pulse = 0.6 + Math.sin(f * 0.08) * 0.4;
      laserSegs.forEach(seg => {
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = seg.color;
        ctx.shadowBlur = 12 * pulse;
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1); ctx.lineTo(seg.x2, seg.y2); ctx.stroke();
        // Core bright line
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.shadowBlur = 6 * pulse;
        ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1); ctx.lineTo(seg.x2, seg.y2); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      });

      // Floating particles along laser
      if (laserSegs.length > 0 && f % 3 === 0) {
        const seg = laserSegs[Math.floor(Math.random() * laserSegs.length)];
        const t = Math.random();
        const px = seg.x1 + (seg.x2 - seg.x1) * t;
        const py = seg.y1 + (seg.y2 - seg.y1) * t;
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath(); ctx.arc(px + (Math.random() - 0.5) * 6, py + (Math.random() - 0.5) * 6, 1.5, 0, Math.PI * 2); ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [grid, laserSegs]);

  const handleClick = (gx: number, gy: number) => {
    if (won) return;
    const piece = grid[gy][gx];
    if (piece.fixed) return;
    // Cycle: empty -> mirror_ne -> mirror_nw -> splitter -> empty
    const cycle: PieceType[] = ["empty", "mirror_ne", "mirror_nw", "splitter", "empty"];
    const idx = cycle.indexOf(piece.type);
    const nextType = cycle[(idx + 1) % cycle.length];
    const ng = grid.map(row => row.map(p => ({ ...p })));
    ng[gy][gx] = { ...ng[gy][gx], type: nextType };
    setGrid(ng);
  };

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8 text-center">
        <h1 className="text-xl font-bold mb-2"><i className="fas fa-wand-sparkles mr-2 text-[#00ffcc]" />流光迷宫</h1>
        <p className="text-[#8a8a8a] text-xs mb-3">点击空格放置镜子/分光器，引导激光照亮所有目标</p>

        <div className="flex justify-center gap-2 mb-3">
          {LEVELS.map((l, i) => (
            <button key={i} onClick={() => initLevel(i)} className={clsx(
              "px-3 py-1 rounded-full text-[12px] border transition",
              levelIdx === i ? "bg-[#00ffcc] text-[#0a0a1a] border-[#00ffcc] font-bold" : "text-[#aaa] border-[#333]"
            )}>{l.name}</button>
          ))}
        </div>

        <div className="relative inline-block">
          <canvas ref={canvasRef} width={W} height={H}
            onClick={e => {
              const rect = canvasRef.current!.getBoundingClientRect();
              const scale = W / rect.width;
              const gx = Math.floor((e.clientX - rect.left) * scale / CELL);
              const gy = Math.floor((e.clientY - rect.top) * scale / CELL);
              if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) handleClick(gx, gy);
            }}
            className="rounded-xl border border-[#333] max-w-full cursor-pointer" />
          {won && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-xl">
              <p className="text-3xl mb-2">✨</p>
              <p className="text-xl font-bold text-[#00ffcc] mb-3">全部照亮！</p>
              {levelIdx < LEVELS.length - 1 && (
                <button onClick={() => initLevel(levelIdx + 1)} className="px-6 py-2.5 rounded-xl bg-[#00ffcc] text-[#0a0a1a] font-bold">下一关</button>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-center gap-4 mt-3 text-[11px] text-[#666]">
          <span>点击 = 放置/切换</span>
          <span className="text-[#3ea6ff]">╲ 镜子</span>
          <span className="text-[#a855f7]">◆ 分光器</span>
          <span className="text-[#ff4444]">◎ 目标</span>
        </div>
      </main>
    </>
  );
}
