"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";

const W = 400, H = 700;
const BASE_W = 120, BLOCK_H = 28;
const COLORS = [
  "#ff4444", "#ff6b35", "#f0b90b", "#2ba640", "#3ea6ff", "#a855f7", "#ec4899",
  "#06b6d4", "#84cc16", "#f97316", "#ef4444", "#8b5cf6", "#14b8a6", "#e11d48",
];

interface Block {
  x: number;
  y: number;
  w: number;
  color: string;
  settled: boolean;
}

interface FallingPiece {
  x: number;
  y: number;
  w: number;
  vy: number;
  rot: number;
}

export default function StackTowerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [height, setHeight] = useState(0);
  const [started, setStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [perfect, setPerfect] = useState(0);

  const sRef = useRef({
    blocks: [] as Block[],
    falling: [] as FallingPiece[],
    currentBlock: { x: 0, w: BASE_W, dir: 1, speed: 2 },
    score: 0,
    height: 0,
    cameraY: 0,
    targetCameraY: 0,
    perfectStreak: 0,
    gameOver: false,
    frame: 0,
    particles: [] as { x: number; y: number; vx: number; vy: number; life: number; color: string }[],
  });

  const reset = useCallback(() => {
    const s = sRef.current;
    s.blocks = [{ x: W / 2 - BASE_W / 2, y: H - BLOCK_H - 40, w: BASE_W, color: COLORS[0], settled: true }];
    s.falling = [];
    s.currentBlock = { x: 0, w: BASE_W, dir: 1, speed: 2 };
    s.score = 0; s.height = 0; s.cameraY = 0; s.targetCameraY = 0;
    s.perfectStreak = 0; s.gameOver = false; s.frame = 0; s.particles = [];
    setScore(0); setHeight(0); setGameOver(false); setPerfect(0);
  }, []);

  const start = useCallback(() => { reset(); setStarted(true); }, [reset]);

  const placeBlock = useCallback(() => {
    const s = sRef.current;
    if (s.gameOver) return;

    const top = s.blocks[s.blocks.length - 1];
    const cur = s.currentBlock;
    const curX = cur.x;
    const curW = cur.w;
    const newY = top.y - BLOCK_H;

    // Calculate overlap
    const overlapLeft = Math.max(curX, top.x);
    const overlapRight = Math.min(curX + curW, top.x + top.w);
    const overlapW = overlapRight - overlapLeft;

    if (overlapW <= 0) {
      // Complete miss — game over
      s.falling.push({ x: curX, y: newY - s.cameraY, w: curW, vy: 0, rot: (curX > top.x ? 1 : -1) * 0.02 });
      s.gameOver = true;
      setGameOver(true);
      setBest(prev => Math.max(prev, s.score));
      return;
    }

    const color = COLORS[s.blocks.length % COLORS.length];

    // Check if perfect placement (within 3px tolerance)
    const isPerfect = Math.abs(curX - top.x) < 3 && Math.abs(curW - top.w) < 3;

    if (isPerfect) {
      s.perfectStreak++;
      setPerfect(s.perfectStreak);
      // Perfect: keep full width, bonus points
      s.blocks.push({ x: top.x, y: newY, w: top.w, color, settled: true });
      s.score += 2;
      // Sparkle particles
      for (let i = 0; i < 15; i++) {
        s.particles.push({
          x: top.x + Math.random() * top.w, y: newY,
          vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 5 - 2,
          life: 40 + Math.random() * 20, color: "#f0b90b",
        });
      }
      // Grow back slightly after 5 perfects
      if (s.perfectStreak >= 5) {
        const lastBlock = s.blocks[s.blocks.length - 1];
        lastBlock.w = Math.min(BASE_W, lastBlock.w + 4);
        lastBlock.x = Math.max(0, lastBlock.x - 2);
      }
    } else {
      s.perfectStreak = 0;
      setPerfect(0);
      // Place the overlapping part
      s.blocks.push({ x: overlapLeft, y: newY, w: overlapW, color, settled: true });
      s.score++;

      // The cut-off piece falls
      if (curX < top.x) {
        // Left side cut
        s.falling.push({ x: curX, y: newY, w: overlapLeft - curX, vy: 0, rot: -0.03 });
      }
      if (curX + curW > top.x + top.w) {
        // Right side cut
        s.falling.push({ x: overlapRight, y: newY, w: (curX + curW) - overlapRight, vy: 0, rot: 0.03 });
      }

      // Cut particles
      for (let i = 0; i < 6; i++) {
        s.particles.push({
          x: overlapW < curW / 2 ? curX + curW / 2 : overlapLeft + overlapW / 2,
          y: newY, vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 3,
          life: 20 + Math.random() * 10, color,
        });
      }
    }

    setScore(s.score);
    s.height++;
    setHeight(s.height);

    // Setup next block
    const lastPlaced = s.blocks[s.blocks.length - 1];
    const speed = Math.min(6, 2 + s.height * 0.08);
    s.currentBlock = { x: -lastPlaced.w, w: lastPlaced.w, dir: 1, speed };

    // Camera
    if (newY - s.cameraY < H * 0.4) {
      s.targetCameraY = newY - H * 0.5;
    }
  }, []);

  useEffect(() => {
    if (!started || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    const s = sRef.current;
    let raf: number;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); placeBlock(); }
    };
    const handleClick = () => placeBlock();
    window.addEventListener("keydown", handleKey);
    canvasRef.current.addEventListener("click", handleClick);
    canvasRef.current.addEventListener("touchstart", handleClick);

    const loop = () => {
      s.frame++;

      // Move current block
      if (!s.gameOver) {
        s.currentBlock.x += s.currentBlock.dir * s.currentBlock.speed;
        if (s.currentBlock.x + s.currentBlock.w > W) { s.currentBlock.dir = -1; }
        if (s.currentBlock.x < 0) { s.currentBlock.dir = 1; }
      }

      // Camera smooth
      s.cameraY += (s.targetCameraY - s.cameraY) * 0.08;

      // Falling pieces
      s.falling = s.falling.filter(f => {
        f.vy += 0.4;
        f.y += f.vy;
        f.rot += f.rot > 0 ? 0.01 : -0.01;
        return f.y < H + 200;
      });

      // Particles
      s.particles = s.particles.filter(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--;
        return p.life > 0;
      });

      // ===== DRAW =====
      // Sky gradient
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#0a0a2e");
      grad.addColorStop(0.5, "#1a1a3e");
      grad.addColorStop(1, "#2a2a4e");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Stars
      for (let i = 0; i < 30; i++) {
        const sx = (i * 137) % W;
        const sy = ((i * 89 + s.frame * 0.1) % (H + 100)) - 50;
        ctx.fillStyle = `rgba(255,255,255,${0.15 + (i % 4) * 0.08})`;
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }

      // Height markers
      for (let h = 0; h < s.height + 20; h += 5) {
        const markerY = (H - 40 - h * BLOCK_H) - s.cameraY;
        if (markerY > -20 && markerY < H + 20) {
          ctx.fillStyle = "#333";
          ctx.font = "10px monospace";
          ctx.textAlign = "left";
          ctx.fillText(`${h}M`, 5, markerY + 4);
          ctx.strokeStyle = "#222";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(30, markerY);
          ctx.lineTo(W, markerY);
          ctx.stroke();
        }
      }

      // Ground
      const groundY = H - 40 - s.cameraY;
      if (groundY < H) {
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(0, groundY, W, H - groundY + 100);
        ctx.fillStyle = "#333";
        ctx.fillRect(0, groundY, W, 2);
      }

      // Settled blocks
      s.blocks.forEach((b) => {
        const drawY = b.y - s.cameraY;
        if (drawY > H + 50 || drawY < -50) return;
        // Block body
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, drawY, b.w, BLOCK_H);
        // Highlight top
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(b.x, drawY, b.w, 4);
        // Shadow bottom
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.fillRect(b.x, drawY + BLOCK_H - 3, b.w, 3);
        // Left/right edge
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        ctx.fillRect(b.x, drawY, 2, BLOCK_H);
        ctx.fillRect(b.x + b.w - 2, drawY, 2, BLOCK_H);
      });

      // Current moving block
      if (!s.gameOver) {
        const top = s.blocks[s.blocks.length - 1];
        const curY = top.y - BLOCK_H - s.cameraY;
        const color = COLORS[s.blocks.length % COLORS.length];
        ctx.fillStyle = color;
        ctx.fillRect(s.currentBlock.x, curY, s.currentBlock.w, BLOCK_H);
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillRect(s.currentBlock.x, curY, s.currentBlock.w, 4);
        // Guide line
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(top.x, curY + BLOCK_H);
        ctx.lineTo(top.x, curY);
        ctx.moveTo(top.x + top.w, curY + BLOCK_H);
        ctx.lineTo(top.x + top.w, curY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Falling pieces
      s.falling.forEach(f => {
        ctx.save();
        const cx = f.x + f.w / 2, cy = f.y - s.cameraY + BLOCK_H / 2;
        ctx.translate(cx, cy);
        ctx.rotate(f.rot * s.frame);
        ctx.globalAlpha = Math.max(0, 1 - f.vy * 0.05);
        ctx.fillStyle = COLORS[(s.blocks.length - 1) % COLORS.length];
        ctx.fillRect(-f.w / 2, -BLOCK_H / 2, f.w, BLOCK_H);
        ctx.restore();
      });

      // Particles
      s.particles.forEach(p => {
        ctx.globalAlpha = p.life / 40;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - s.cameraY * 0, p.y - s.cameraY, 3, 3);
      });
      ctx.globalAlpha = 1;

      // Perfect streak text
      if (s.perfectStreak >= 2 && !s.gameOver) {
        ctx.fillStyle = "#f0b90b";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.globalAlpha = 0.5 + Math.sin(s.frame * 0.1) * 0.5;
        ctx.fillText(`🔥 PERFECT x${s.perfectStreak}`, W / 2, 50);
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const cvs = canvasRef.current;
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", handleKey);
      cvs?.removeEventListener("click", handleClick);
      cvs?.removeEventListener("touchstart", handleClick);
    };
  }, [started, placeBlock]);

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8 text-center">
        <h1 className="text-xl font-bold mb-2"><i className="fas fa-cubes-stacked mr-2 text-[#f0b90b]" />难死塔</h1>
        <div className="flex justify-center gap-4 text-sm mb-3">
          <span className="text-[#f0b90b]"><i className="fas fa-layer-group mr-1" />{height}层</span>
          <span className="text-[#3ea6ff]"><i className="fas fa-star mr-1" />{score}分</span>
          <span className="text-[#aaa]"><i className="fas fa-trophy mr-1" />最高{best}</span>
          {perfect >= 2 && <span className="text-[#ff4444] font-bold animate-pulse">🔥x{perfect}</span>}
        </div>
        <div className="relative inline-block">
          <canvas ref={canvasRef} width={W} height={H}
            className="rounded-xl border border-[#333] max-w-full cursor-pointer" style={{ touchAction: "none" }} />
          {!started && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-xl">
              <div className="text-5xl mb-4">🏗️</div>
              <h2 className="text-xl font-bold mb-2">难死塔</h2>
              <p className="text-[#8a8a8a] text-sm mb-4">精准堆叠，越高越难！</p>
              <button onClick={start} className="px-8 py-3 rounded-xl bg-[#f0b90b] text-[#0f0f0f] font-bold text-lg hover:bg-[#f0b90b]/80 transition active:scale-95">
                <i className="fas fa-play mr-2" />开始堆塔
              </button>
            </div>
          )}
          {gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-xl">
              <p className="text-3xl font-bold text-[#ff4444] mb-1">倒塌了！</p>
              <p className="text-[#f0b90b] text-lg mb-1">堆了 {height} 层</p>
              <p className="text-[#aaa] text-sm mb-4">得分 {score}</p>
              <button onClick={start} className="px-6 py-2.5 rounded-xl bg-[#f0b90b] text-[#0f0f0f] font-bold hover:bg-[#f0b90b]/80 transition active:scale-95">
                <i className="fas fa-redo mr-1" />再来一局
              </button>
            </div>
          )}
        </div>
        <p className="text-[11px] text-[#666] mt-3">点击屏幕/空格键放下方块 · 对齐越准保留越多 · 连续完美放置有加分</p>
      </main>
    </>
  );
}
