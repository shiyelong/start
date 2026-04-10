"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";

const SIZE = 5; // hex grid radius
const HEX_R = 28;
const W = 500, H = 480;

interface HexCell { q: number; r: number; owner: 0 | 1 | 2; } // 0=empty, 1=blue, 2=red

function hexToPixel(q: number, r: number): [number, number] {
  const x = HEX_R * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r) + W / 2;
  const y = HEX_R * (3 / 2 * r) + H / 2;
  return [x, y];
}

function generateGrid(): HexCell[] {
  const cells: HexCell[] = [];
  for (let q = -SIZE; q <= SIZE; q++) {
    for (let r = -SIZE; r <= SIZE; r++) {
      if (Math.abs(q + r) <= SIZE) {
        cells.push({ q, r, owner: 0 });
      }
    }
  }
  return cells;
}

function getNeighbors(q: number, r: number): [number, number][] {
  return [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].map(([dq, dr]) => [q + dq, r + dr]);
}

// Check if player has connected their two sides
function checkWin(cells: HexCell[], player: 1 | 2): boolean {
  const owned = cells.filter(c => c.owner === player);
  if (owned.length < SIZE) return false;

  // Player 1 (blue): connect left to right (q = -SIZE to q = SIZE)
  // Player 2 (red): connect top to bottom (r = -SIZE to r = SIZE)
  const startCells = player === 1
    ? owned.filter(c => c.q === -SIZE || (c.q + c.r === -SIZE && c.q < 0))
    : owned.filter(c => c.r === -SIZE || (c.q + c.r === -SIZE && c.r < 0));

  const endCheck = player === 1
    ? (c: HexCell) => c.q === SIZE || (c.q + c.r === SIZE && c.q > 0)
    : (c: HexCell) => c.r === SIZE || (c.q + c.r === SIZE && c.r > 0);

  const visited = new Set<string>();
  const queue = startCells.map(c => `${c.q},${c.r}`);
  queue.forEach(k => visited.add(k));

  while (queue.length > 0) {
    const key = queue.shift()!;
    const [cq, cr] = key.split(",").map(Number);
    const cell = cells.find(c => c.q === cq && c.r === cr);
    if (cell && endCheck(cell)) return true;

    for (const [nq, nr] of getNeighbors(cq, cr)) {
      const nk = `${nq},${nr}`;
      if (visited.has(nk)) continue;
      const neighbor = cells.find(c => c.q === nq && c.r === nr && c.owner === player);
      if (neighbor) { visited.add(nk); queue.push(nk); }
    }
  }
  return false;
}

export default function HexChainPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cells, setCells] = useState<HexCell[]>(() => generateGrid());
  const [turn, setTurn] = useState<1 | 2>(1);
  const [winner, setWinner] = useState<0 | 1 | 2>(0);
  const [hoverCell, setHoverCell] = useState<string | null>(null);
  const frameRef = useRef(0);

  const restart = () => { setCells(generateGrid()); setTurn(1); setWinner(0); };

  const handleClick = useCallback((cx: number, cy: number) => {
    if (winner) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const scale = W / rect.width;
    const mx = (cx - rect.left) * scale, my = (cy - rect.top) * scale;

    let closest: HexCell | null = null, minDist = Infinity;
    for (const cell of cells) {
      const [px, py] = hexToPixel(cell.q, cell.r);
      const d = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
      if (d < HEX_R && d < minDist) { closest = cell; minDist = d; }
    }
    if (!closest || closest.owner !== 0) return;

    const nc = cells.map(c => c.q === closest!.q && c.r === closest!.r ? { ...c, owner: turn } : { ...c });
    setCells(nc);

    if (checkWin(nc, turn)) { setWinner(turn); return; }
    setTurn(turn === 1 ? 2 : 1);
  }, [cells, turn, winner]);

  // Render
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    let raf: number;

    const draw = () => {
      frameRef.current++;
      const f = frameRef.current;
      // Background
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, "#0a0a2e");
      bg.addColorStop(1, "#1a0a3e");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Stars
      for (let i = 0; i < 40; i++) {
        const sx = (i * 127 + f * 0.05) % W;
        const sy = (i * 83) % H;
        ctx.fillStyle = `rgba(255,255,255,${0.1 + (i % 5) * 0.05})`;
        ctx.fillRect(sx, sy, 1, 1);
      }

      // Edge indicators
      // Blue: left-right edges
      ctx.fillStyle = "rgba(62,166,255,0.08)";
      ctx.fillRect(0, 0, 20, H);
      ctx.fillRect(W - 20, 0, 20, H);
      // Red: top-bottom edges
      ctx.fillStyle = "rgba(255,68,68,0.08)";
      ctx.fillRect(0, 0, W, 20);
      ctx.fillRect(0, H - 20, W, 20);

      // Draw hexagons
      cells.forEach(cell => {
        const [px, py] = hexToPixel(cell.q, cell.r);
        const isHover = hoverCell === `${cell.q},${cell.r}`;

        // Hex path
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = Math.PI / 180 * (60 * i - 30);
          const hx = px + HEX_R * 0.9 * Math.cos(angle);
          const hy = py + HEX_R * 0.9 * Math.sin(angle);
          if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.closePath();

        // Fill
        if (cell.owner === 1) {
          const g = ctx.createRadialGradient(px, py, 0, px, py, HEX_R);
          g.addColorStop(0, "#3ea6ff");
          g.addColorStop(1, "#1a5a9e");
          ctx.fillStyle = g;
          ctx.fill();
          ctx.shadowColor = "#3ea6ff";
          ctx.shadowBlur = 8 + Math.sin(f * 0.05) * 4;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (cell.owner === 2) {
          const g = ctx.createRadialGradient(px, py, 0, px, py, HEX_R);
          g.addColorStop(0, "#ff4444");
          g.addColorStop(1, "#9e1a1a");
          ctx.fillStyle = g;
          ctx.fill();
          ctx.shadowColor = "#ff4444";
          ctx.shadowBlur = 8 + Math.sin(f * 0.05) * 4;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = isHover ? (turn === 1 ? "rgba(62,166,255,0.15)" : "rgba(255,68,68,0.15)") : "rgba(255,255,255,0.03)";
          ctx.fill();
        }

        // Border
        ctx.strokeStyle = cell.owner === 1 ? "#3ea6ff" : cell.owner === 2 ? "#ff4444" : "rgba(255,255,255,0.1)";
        ctx.lineWidth = cell.owner ? 2 : 1;
        ctx.stroke();
      });

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [cells, turn, hoverCell]);

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8 text-center">
        <h1 className="text-xl font-bold mb-2"><i className="fas fa-hexagon-check mr-2 text-[#2ba640]" />六角连珠</h1>
        <p className="text-[#8a8a8a] text-xs mb-3">
          <span className="text-[#3ea6ff]">蓝方</span>连接左右 · <span className="text-[#ff4444]">红方</span>连接上下 · 双人对弈
        </p>

        <div className="flex justify-center gap-4 text-sm mb-3">
          <span className={turn === 1 ? "text-[#3ea6ff] font-bold" : "text-[#666]"}>🔵 蓝方{turn === 1 && !winner ? " ←" : ""}</span>
          <span className={turn === 2 ? "text-[#ff4444] font-bold" : "text-[#666]"}>🔴 红方{turn === 2 && !winner ? " ←" : ""}</span>
        </div>

        <div className="relative inline-block">
          <canvas ref={canvasRef} width={W} height={H}
            onClick={e => handleClick(e.clientX, e.clientY)}
            onMouseMove={e => {
              const rect = canvasRef.current!.getBoundingClientRect();
              const scale = W / rect.width;
              const mx = (e.clientX - rect.left) * scale, my = (e.clientY - rect.top) * scale;
              let found: string | null = null;
              for (const cell of cells) {
                const [px, py] = hexToPixel(cell.q, cell.r);
                if (Math.sqrt((mx - px) ** 2 + (my - py) ** 2) < HEX_R) { found = `${cell.q},${cell.r}`; break; }
              }
              setHoverCell(found);
            }}
            className="rounded-xl border border-[#333] max-w-full cursor-pointer" />
          {winner > 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-xl">
              <p className="text-3xl mb-2">{winner === 1 ? "🔵" : "🔴"}</p>
              <p className="text-xl font-bold mb-3" style={{ color: winner === 1 ? "#3ea6ff" : "#ff4444" }}>
                {winner === 1 ? "蓝方" : "红方"}胜利！
              </p>
              <button onClick={restart} className="px-6 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold">再来一局</button>
            </div>
          )}
        </div>
        <button onClick={restart} className="mt-3 text-[11px] text-[#666] hover:text-[#aaa]">🔄 重新开始</button>
      </main>
    </>
  );
}
