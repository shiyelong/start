"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";

const LANES = [-1, 0, 1];
const W = 400, H = 600;

interface Obstacle { x: number; z: number; lane: number; type: "box" | "spike" | "coin"; }

export default function RunnerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const stateRef = useRef({ lane: 0, jumping: false, jumpY: 0, jumpV: 0, speed: 4, score: 0, coins: 0, obstacles: [] as Obstacle[], frame: 0, alive: true });

  const reset = useCallback(() => {
    const s = stateRef.current;
    s.lane = 0; s.jumping = false; s.jumpY = 0; s.jumpV = 0; s.speed = 4; s.score = 0; s.coins = 0; s.obstacles = []; s.frame = 0; s.alive = true;
    setScore(0); setCoins(0); setGameOver(false);
  }, []);

  const start = useCallback(() => { reset(); setStarted(true); }, [reset]);

  useEffect(() => {
    if (!started || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    const s = stateRef.current;
    let raf: number;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && s.lane > -1) s.lane--;
      if (e.key === "ArrowRight" && s.lane < 1) s.lane++;
      if ((e.key === "ArrowUp" || e.key === " ") && !s.jumping) { s.jumping = true; s.jumpV = -12; }
    };
    window.addEventListener("keydown", handleKey);

    const loop = () => {
      if (!s.alive) return;
      s.frame++;
      s.score++;
      s.speed = 4 + Math.floor(s.score / 500) * 0.5;
      setScore(s.score);

      // Jump physics
      if (s.jumping) {
        s.jumpY += s.jumpV;
        s.jumpV += 0.8;
        if (s.jumpY >= 0) { s.jumpY = 0; s.jumping = false; }
      }

      // Spawn obstacles
      if (s.frame % Math.max(30, 60 - Math.floor(s.score / 200)) === 0) {
        const lane = LANES[Math.floor(Math.random() * 3)];
        const type = Math.random() < 0.3 ? "coin" : Math.random() < 0.5 ? "spike" : "box";
        s.obstacles.push({ x: 0, z: 800, lane, type });
      }

      // Move obstacles
      s.obstacles = s.obstacles.filter(o => {
        o.z -= s.speed * 3;
        return o.z > -100;
      });

      // Collision
      const playerLane = s.lane;
      s.obstacles.forEach(o => {
        if (o.z > 50 && o.z < 120 && o.lane === playerLane) {
          if (o.type === "coin") { s.coins++; setCoins(s.coins); o.z = -200; }
          else if (s.jumpY >= -20) { s.alive = false; setGameOver(true); }
        }
      });

      // Draw
      ctx.fillStyle = "#0a0a1a";
      ctx.fillRect(0, 0, W, H);

      // Pseudo-3D road
      for (let i = 0; i < 40; i++) {
        const z = i * 20;
        const perspective = 300 / (z + 100);
        const y = H - 100 - i * 8 * perspective;
        const roadW = 300 * perspective;
        const cx = W / 2;
        ctx.fillStyle = i % 2 === 0 ? "#1a1a2e" : "#16213e";
        ctx.fillRect(cx - roadW / 2, y, roadW, 12 * perspective);
        // Lane lines
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1;
        for (let l = -1; l <= 1; l += 2) {
          ctx.beginPath();
          ctx.moveTo(cx + l * roadW / 6, y);
          ctx.lineTo(cx + l * roadW / 6, y + 12 * perspective);
          ctx.stroke();
        }
      }

      // Draw obstacles
      s.obstacles.forEach(o => {
        const perspective = 300 / (o.z + 100);
        const y = H - 100 - (o.z / 20) * 8 * perspective;
        const ox = W / 2 + o.lane * 80 * perspective;
        const size = 30 * perspective;
        if (o.type === "coin") {
          ctx.fillStyle = "#f0b90b";
          ctx.beginPath();
          ctx.arc(ox, y - size / 2, size / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#0a0a1a";
          ctx.font = `${size * 0.6}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("$", ox, y - size / 2 + size * 0.2);
        } else if (o.type === "box") {
          ctx.fillStyle = "#ff4444";
          ctx.fillRect(ox - size / 2, y - size, size, size);
          ctx.fillStyle = "#cc0000";
          ctx.fillRect(ox - size / 2, y - size, size, size * 0.3);
        } else {
          ctx.fillStyle = "#ff6600";
          ctx.beginPath();
          ctx.moveTo(ox, y - size * 1.2);
          ctx.lineTo(ox - size / 2, y);
          ctx.lineTo(ox + size / 2, y);
          ctx.fill();
        }
      });

      // Draw player
      const px = W / 2 + s.lane * 60;
      const py = H - 140 + s.jumpY;
      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(px, H - 120, 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Body
      ctx.fillStyle = "#3ea6ff";
      ctx.fillRect(px - 12, py - 30, 24, 30);
      // Head
      ctx.fillStyle = "#65b8ff";
      ctx.beginPath();
      ctx.arc(px, py - 38, 12, 0, Math.PI * 2);
      ctx.fill();
      // Eyes
      ctx.fillStyle = "white";
      ctx.fillRect(px - 6, py - 42, 4, 4);
      ctx.fillRect(px + 2, py - 42, 4, 4);

      // Stars bg
      if (s.frame % 3 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(Math.random() * W, Math.random() * H * 0.4, 1, 1);
        }
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", handleKey); };
  }, [started]);

  const handleTouch = (dir: "left" | "right" | "jump") => {
    const s = stateRef.current;
    if (dir === "left" && s.lane > -1) s.lane--;
    if (dir === "right" && s.lane < 1) s.lane++;
    if (dir === "jump" && !s.jumping) { s.jumping = true; s.jumpV = -12; }
  };

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8 text-center">
        <h1 className="text-xl font-bold mb-2"><i className="fas fa-person-running mr-2 text-[#3ea6ff]" />像素跑酷</h1>
        <div className="flex justify-center gap-4 text-sm mb-3">
          <span className="text-[#3ea6ff]"><i className="fas fa-road mr-1" />{score}m</span>
          <span className="text-[#f0b90b]"><i className="fas fa-coins mr-1" />{coins}</span>
        </div>
        <div className="relative inline-block">
          <canvas ref={canvasRef} width={W} height={H} className="rounded-xl border border-[#333] bg-[#0a0a1a] max-w-full" style={{ touchAction: "none" }} />
          {!started && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl">
              <button onClick={start} className="px-8 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-lg hover:bg-[#65b8ff] transition active:scale-95">
                <i className="fas fa-play mr-2" />开始跑酷
              </button>
            </div>
          )}
          {gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-xl">
              <p className="text-2xl font-bold text-[#ff4444] mb-2">游戏结束</p>
              <p className="text-[#aaa] mb-1">跑了 {score} 米</p>
              <p className="text-[#f0b90b] mb-4">收集 {coins} 金币</p>
              <button onClick={start} className="px-6 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold hover:bg-[#65b8ff] transition active:scale-95">
                <i className="fas fa-redo mr-1" />再来一局
              </button>
            </div>
          )}
        </div>
        {/* 手机触控 */}
        <div className="flex justify-center gap-3 mt-3 md:hidden">
          <button onTouchStart={() => handleTouch("left")} className="w-16 h-16 rounded-xl bg-[#212121] border border-[#333] text-xl active:bg-[#3ea6ff]/20">
            <i className="fas fa-arrow-left" />
          </button>
          <button onTouchStart={() => handleTouch("jump")} className="w-16 h-16 rounded-xl bg-[#212121] border border-[#333] text-xl active:bg-[#3ea6ff]/20">
            <i className="fas fa-arrow-up" />
          </button>
          <button onTouchStart={() => handleTouch("right")} className="w-16 h-16 rounded-xl bg-[#212121] border border-[#333] text-xl active:bg-[#3ea6ff]/20">
            <i className="fas fa-arrow-right" />
          </button>
        </div>
        <p className="text-[11px] text-[#666] mt-3">← → 切换车道 · ↑/空格 跳跃 · 躲避障碍收集金币</p>
      </main>
    </>
  );
}
