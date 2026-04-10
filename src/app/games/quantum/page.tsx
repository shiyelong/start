"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";

const W = 440, H = 440;

interface Node { x: number; y: number; color: string; id: number; paired: number; connected: boolean; }
interface Line { from: number; to: number; path: [number, number][]; color: string; }

const COLORS = ["#00ffcc", "#ff4444", "#3ea6ff", "#f0b90b", "#a855f7", "#ec4899", "#f97316", "#2ba640"];

function generatePuzzle(pairCount: number): { nodes: Node[]; } {
  const nodes: Node[] = [];
  const positions: [number, number][] = [];
  const margin = 60, spacing = 80;

  // Generate grid positions
  for (let y = margin; y < H - margin; y += spacing) {
    for (let x = margin; x < W - margin; x += spacing) {
      positions.push([x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20]);
    }
  }

  // Shuffle and pick pairs
  const shuffled = positions.sort(() => Math.random() - 0.5);
  for (let i = 0; i < pairCount * 2 && i < shuffled.length; i += 2) {
    const color = COLORS[Math.floor(i / 2) % COLORS.length];
    const id1 = nodes.length, id2 = nodes.length + 1;
    nodes.push({ x: shuffled[i][0], y: shuffled[i][1], color, id: id1, paired: id2, connected: false });
    nodes.push({ x: shuffled[i + 1][0], y: shuffled[i + 1][1], color, id: id2, paired: id1, connected: false });
  }
  return { nodes };
}

const LEVELS = [
  { name: "3对", pairs: 3 },
  { name: "4对", pairs: 4 },
  { name: "5对", pairs: 5 },
  { name: "6对", pairs: 6 },
];

export default function QuantumPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [levelIdx, setLevelIdx] = useState(0);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [drawing, setDrawing] = useState<{ fromId: number; path: [number, number][] } | null>(null);
  const [won, setWon] = useState(false);
  const frameRef = useRef(0);

  const initLevel = useCallback((idx: number) => {
    const { nodes: n } = generatePuzzle(LEVELS[idx].pairs);
    setNodes(n);
    setLines([]);
    setDrawing(null);
    setWon(false);
    setLevelIdx(idx);
  }, []);

  useEffect(() => { initLevel(0); }, [initLevel]);

  const getNodeAt = useCallback((mx: number, my: number): Node | null => {
    for (const n of nodes) {
      if (Math.sqrt((mx - n.x) ** 2 + (my - n.y) ** 2) < 20) return n;
    }
    return null;
  }, [nodes]);

  const handleMouseDown = useCallback((mx: number, my: number) => {
    if (won) return;
    const node = getNodeAt(mx, my);
    if (!node) return;
    // Remove existing line from this node
    setLines(prev => prev.filter(l => l.from !== node.id && l.to !== node.id));
    setDrawing({ fromId: node.id, path: [[node.x, node.y]] });
  }, [nodes, won, getNodeAt]);

  const handleMouseMove = useCallback((mx: number, my: number) => {
    if (!drawing) return;
    setDrawing(prev => prev ? { ...prev, path: [...prev.path, [mx, my]] } : null);
  }, [drawing]);

  const handleMouseUp = useCallback((mx: number, my: number) => {
    if (!drawing) return;
    const fromNode = nodes.find(n => n.id === drawing.fromId);
    const toNode = getNodeAt(mx, my);

    if (fromNode && toNode && toNode.id === fromNode.paired) {
      // Valid connection
      const newLine: Line = { from: fromNode.id, to: toNode.id, path: [...drawing.path, [toNode.x, toNode.y]], color: fromNode.color };
      const newLines = [...lines.filter(l => l.from !== fromNode.id && l.to !== fromNode.id && l.from !== toNode.id && l.to !== toNode.id), newLine];
      setLines(newLines);

      // Check win
      const connectedPairs = newLines.length;
      if (connectedPairs === LEVELS[levelIdx].pairs) setWon(true);
    }
    setDrawing(null);
  }, [drawing, nodes, lines, levelIdx, getNodeAt]);

  // Render
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    let raf: number;

    const draw = () => {
      frameRef.current++;
      const f = frameRef.current;

      // Background
      ctx.fillStyle = "#050515";
      ctx.fillRect(0, 0, W, H);

      // Quantum field effect
      for (let i = 0; i < 60; i++) {
        const px = (i * 73 + f * 0.3) % W;
        const py = (i * 47 + Math.sin(f * 0.01 + i) * 30) % H;
        const alpha = 0.03 + Math.sin(f * 0.02 + i) * 0.02;
        ctx.fillStyle = `rgba(168,85,247,${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 2 + Math.sin(f * 0.05 + i) * 1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Grid dots
      for (let x = 40; x < W; x += 40) {
        for (let y = 40; y < H; y += 40) {
          ctx.fillStyle = "rgba(255,255,255,0.03)";
          ctx.fillRect(x, y, 1, 1);
        }
      }

      // Connected lines
      lines.forEach(line => {
        if (line.path.length < 2) return;
        const pulse = 0.5 + Math.sin(f * 0.06) * 0.5;

        // Glow
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 6;
        ctx.shadowColor = line.color;
        ctx.shadowBlur = 15 * pulse;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(line.path[0][0], line.path[0][1]);
        for (let i = 1; i < line.path.length; i++) ctx.lineTo(line.path[i][0], line.path[i][1]);
        ctx.stroke();

        // Core
        ctx.lineWidth = 2;
        ctx.shadowBlur = 8;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(line.path[0][0], line.path[0][1]);
        for (let i = 1; i < line.path.length; i++) ctx.lineTo(line.path[i][0], line.path[i][1]);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // Traveling particle
        const totalLen = line.path.reduce((sum, p, i) => {
          if (i === 0) return 0;
          return sum + Math.sqrt((p[0] - line.path[i - 1][0]) ** 2 + (p[1] - line.path[i - 1][1]) ** 2);
        }, 0);
        const t = ((f * 2) % totalLen) / totalLen;
        let accum = 0;
        for (let i = 1; i < line.path.length; i++) {
          const segLen = Math.sqrt((line.path[i][0] - line.path[i - 1][0]) ** 2 + (line.path[i][1] - line.path[i - 1][1]) ** 2);
          if ((accum + segLen) / totalLen >= t) {
            const segT = (t * totalLen - accum) / segLen;
            const px = line.path[i - 1][0] + (line.path[i][0] - line.path[i - 1][0]) * segT;
            const py = line.path[i - 1][1] + (line.path[i][1] - line.path[i - 1][1]) * segT;
            ctx.fillStyle = "#fff";
            ctx.shadowColor = line.color;
            ctx.shadowBlur = 12;
            ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            break;
          }
          accum += segLen;
        }
      });

      // Drawing line
      if (drawing && drawing.path.length > 1) {
        const fromNode = nodes.find(n => n.id === drawing.fromId);
        if (fromNode) {
          ctx.strokeStyle = fromNode.color;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.6;
          ctx.shadowColor = fromNode.color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(drawing.path[0][0], drawing.path[0][1]);
          for (let i = 1; i < drawing.path.length; i++) ctx.lineTo(drawing.path[i][0], drawing.path[i][1]);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }
      }

      // Nodes
      nodes.forEach(node => {
        const isConnected = lines.some(l => l.from === node.id || l.to === node.id);
        const isDrawing = drawing?.fromId === node.id;
        const pulse = 0.7 + Math.sin(f * 0.04 + node.id) * 0.3;

        // Outer glow
        const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, 25);
        glow.addColorStop(0, node.color + "40");
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(node.x, node.y, 25, 0, Math.PI * 2); ctx.fill();

        // Orbiting ring
        ctx.strokeStyle = node.color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3 * pulse;
        ctx.beginPath(); ctx.arc(node.x, node.y, 16 + Math.sin(f * 0.03 + node.id) * 3, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;

        // Core
        ctx.fillStyle = isConnected ? node.color : (isDrawing ? "#fff" : node.color);
        ctx.shadowColor = node.color;
        ctx.shadowBlur = isConnected ? 15 : 8;
        ctx.beginPath(); ctx.arc(node.x, node.y, isConnected ? 10 : 8, 0, Math.PI * 2); ctx.fill();

        // Inner bright
        ctx.fillStyle = "#fff";
        ctx.shadowBlur = 0;
        ctx.globalAlpha = isConnected ? 0.8 : 0.4;
        ctx.beginPath(); ctx.arc(node.x, node.y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      });

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [nodes, lines, drawing]);

  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scale = W / rect.width;
    const clientX = "touches" in e ? e.touches[0]?.clientX || 0 : e.clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY || 0 : e.clientY;
    return [(clientX - rect.left) * scale, (clientY - rect.top) * scale];
  };

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8 text-center">
        <h1 className="text-xl font-bold mb-2"><i className="fas fa-atom mr-2 text-[#a855f7]" />量子连线</h1>
        <p className="text-[#8a8a8a] text-xs mb-3">拖动连接相同颜色的量子节点，线路不能交叉</p>

        <div className="flex justify-center gap-2 mb-3">
          {LEVELS.map((l, i) => (
            <button key={i} onClick={() => initLevel(i)}
              className={`px-3 py-1 rounded-full text-[12px] border transition ${levelIdx === i ? "bg-[#a855f7] text-white border-[#a855f7] font-bold" : "text-[#aaa] border-[#333]"}`}>
              {l.name}
            </button>
          ))}
        </div>

        <div className="flex justify-center gap-4 text-sm mb-3">
          <span className="text-[#a855f7]">{lines.length}/{LEVELS[levelIdx].pairs} 已连接</span>
        </div>

        <div className="relative inline-block">
          <canvas ref={canvasRef} width={W} height={H}
            onMouseDown={e => { const [mx, my] = getCanvasPos(e); handleMouseDown(mx, my); }}
            onMouseMove={e => { const [mx, my] = getCanvasPos(e); handleMouseMove(mx, my); }}
            onMouseUp={e => { const [mx, my] = getCanvasPos(e); handleMouseUp(mx, my); }}
            onTouchStart={e => { e.preventDefault(); const [mx, my] = getCanvasPos(e); handleMouseDown(mx, my); }}
            onTouchMove={e => { e.preventDefault(); const [mx, my] = getCanvasPos(e); handleMouseMove(mx, my); }}
            onTouchEnd={e => { e.preventDefault(); const rect = canvasRef.current!.getBoundingClientRect(); const scale = W / rect.width; const touch = e.changedTouches[0]; handleMouseUp((touch.clientX - rect.left) * scale, (touch.clientY - rect.top) * scale); }}
            className="rounded-xl border border-[#333] max-w-full cursor-crosshair" style={{ touchAction: "none" }} />
          {won && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-xl">
              <p className="text-3xl mb-2">⚛️</p>
              <p className="text-xl font-bold text-[#a855f7] mb-3">量子纠缠完成！</p>
              {levelIdx < LEVELS.length - 1 && (
                <button onClick={() => initLevel(levelIdx + 1)} className="px-6 py-2.5 rounded-xl bg-[#a855f7] text-white font-bold">下一关</button>
              )}
            </div>
          )}
        </div>
        <button onClick={() => initLevel(levelIdx)} className="mt-3 text-[11px] text-[#666] hover:text-[#aaa]">🔄 重新生成</button>
      </main>
    </>
  );
}
