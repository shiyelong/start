"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, CircleDot } from "lucide-react";

const W = 400, H = 500;
type Phase = "title" | "playing" | "goal" | "gameover";

export default function SoccerGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [score, setScore] = useState({ player: 0, cpu: 0 });
  const sRef = useRef({
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    player: { x: W / 2, y: H - 60 },
    cpu: { x: W / 2, y: 60 },
    time: 90, goalMsg: "", playerScore: 0, cpuScore: 0,
  });
  const keysRef = useRef(new Set<string>());
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  const startGame = useCallback(() => {
    sRef.current = { ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 }, player: { x: W / 2, y: H - 60 }, cpu: { x: W / 2, y: 60 }, time: 90, goalMsg: "", playerScore: 0, cpuScore: 0 };
    setScore({ player: 0, cpu: 0 }); setPhase("playing"); lastRef.current = 0;
  }, []);

  const resetBall = useCallback(() => {
    const s = sRef.current;
    s.ball = { x: W / 2, y: H / 2, vx: (Math.random() - 0.5) * 100, vy: (Math.random() > 0.5 ? 1 : -1) * 80 };
    s.player.x = W / 2; s.cpu.x = W / 2;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;

    const loop = (ts: number) => {
      if (!lastRef.current) lastRef.current = ts;
      const dt = Math.min((ts - lastRef.current) / 1000, 0.05);
      lastRef.current = ts;
      const s = sRef.current;

      if (phase === "playing") {
        const keys = keysRef.current;
        const spd = 250;
        if (keys.has("ArrowLeft") || keys.has("a")) s.player.x = Math.max(30, s.player.x - spd * dt);
        if (keys.has("ArrowRight") || keys.has("d")) s.player.x = Math.min(W - 30, s.player.x + spd * dt);
        // CPU AI
        const cpuSpd = 150 + s.cpuScore * 20;
        if (s.ball.x < s.cpu.x - 10) s.cpu.x -= cpuSpd * dt;
        if (s.ball.x > s.cpu.x + 10) s.cpu.x += cpuSpd * dt;
        s.cpu.x = Math.max(30, Math.min(W - 30, s.cpu.x));
        // Ball physics
        s.ball.x += s.ball.vx * dt; s.ball.y += s.ball.vy * dt;
        // Wall bounce
        if (s.ball.x < 10 || s.ball.x > W - 10) { s.ball.vx *= -1; s.ball.x = Math.max(10, Math.min(W - 10, s.ball.x)); }
        // Player paddle collision
        if (s.ball.vy > 0 && Math.abs(s.ball.y - s.player.y) < 16 && Math.abs(s.ball.x - s.player.x) < 40) {
          s.ball.vy = -Math.abs(s.ball.vy) * 1.05;
          s.ball.vx += (s.ball.x - s.player.x) * 3;
        }
        // CPU paddle collision
        if (s.ball.vy < 0 && Math.abs(s.ball.y - s.cpu.y) < 16 && Math.abs(s.ball.x - s.cpu.x) < 40) {
          s.ball.vy = Math.abs(s.ball.vy) * 1.05;
          s.ball.vx += (s.ball.x - s.cpu.x) * 3;
        }
        // Goals
        const goalW = 100;
        if (s.ball.y < 10 && Math.abs(s.ball.x - W / 2) < goalW / 2) {
          s.playerScore++; setScore({ player: s.playerScore, cpu: s.cpuScore });
          s.goalMsg = "GOAL!"; setPhase("goal");
          setTimeout(() => { resetBall(); setPhase("playing"); }, 1500);
        }
        if (s.ball.y > H - 10 && Math.abs(s.ball.x - W / 2) < goalW / 2) {
          s.cpuScore++; setScore({ player: s.playerScore, cpu: s.cpuScore });
          s.goalMsg = "CPU Goal..."; setPhase("goal");
          setTimeout(() => { resetBall(); setPhase("playing"); }, 1500);
        }
        // Bounce off top/bottom walls (outside goal)
        if (s.ball.y < 10) { s.ball.vy = Math.abs(s.ball.vy); }
        if (s.ball.y > H - 10) { s.ball.vy = -Math.abs(s.ball.vy); }
        // Timer
        s.time -= dt;
        if (s.time <= 0) { s.time = 0; setPhase("gameover"); }
        // Speed cap
        const maxV = 400;
        s.ball.vx = Math.max(-maxV, Math.min(maxV, s.ball.vx));
        s.ball.vy = Math.max(-maxV, Math.min(maxV, s.ball.vy));
      }

      ctx.save(); ctx.scale(dpr, dpr);
      // Field
      ctx.fillStyle = "#0a2e0a"; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#1a4a1a"; ctx.lineWidth = 1;
      ctx.strokeRect(20, 20, W - 40, H - 40);
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 50, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(20, H / 2); ctx.lineTo(W - 20, H / 2); ctx.stroke();
      // Goals
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
      ctx.strokeRect(W / 2 - 50, 0, 100, 10);
      ctx.strokeRect(W / 2 - 50, H - 10, 100, 10);

      if (phase === "title") {
        ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Soccer Mini", W / 2, H / 2 - 30);
        ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
        ctx.fillText("Arrow keys to move", W / 2, H / 2 + 5);
        ctx.fillText("Click to Start", W / 2, H / 2 + 30);
      } else {
        // CPU paddle
        ctx.fillStyle = "#ff4757";
        ctx.beginPath(); ctx.roundRect(s.cpu.x - 30, s.cpu.y - 8, 60, 16, 8); ctx.fill();
        // Player paddle
        ctx.fillStyle = "#3ea6ff";
        ctx.beginPath(); ctx.roundRect(s.player.x - 30, s.player.y - 8, 60, 16, 8); ctx.fill();
        // Ball
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s.ball.x, s.ball.y, 8, 0, Math.PI * 2); ctx.fill();
        // HUD
        ctx.fillStyle = "#fff"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(`${s.playerScore} - ${s.cpuScore}`, W / 2, H / 2 + 6);
        ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
        ctx.fillText(`${Math.ceil(s.time)}s`, W / 2, H / 2 + 26);

        if (phase === "goal") {
          ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, H / 2 - 40, W, 80);
          ctx.fillStyle = "#ffd700"; ctx.font = "bold 32px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(s.goalMsg, W / 2, H / 2 + 10);
        }
        if (phase === "gameover") {
          ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = s.playerScore > s.cpuScore ? "#2ed573" : "#ff4757";
          ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(s.playerScore > s.cpuScore ? "You Win!" : s.playerScore < s.cpuScore ? "CPU Wins" : "Draw", W / 2, H / 2 - 20);
          ctx.fillStyle = "#fff"; ctx.font = "18px sans-serif";
          ctx.fillText(`${s.playerScore} - ${s.cpuScore}`, W / 2, H / 2 + 14);
          ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
          ctx.fillText("Click to Restart", W / 2, H / 2 + 44);
        }
      }
      ctx.restore();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => { keysRef.current.add(e.key); if ((e.key === "Enter" || e.key === " ") && phase !== "playing" && phase !== "goal") startGame(); };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    const onClick = () => { if (phase !== "playing" && phase !== "goal") startGame(); };
    let touchX = 0;
    const onTouchStart = (e: TouchEvent) => { e.preventDefault(); touchX = e.touches[0].clientX; if (phase !== "playing" && phase !== "goal") startGame(); };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault(); const dx = e.touches[0].clientX - touchX; touchX = e.touches[0].clientX;
      sRef.current.player.x = Math.max(30, Math.min(W - 30, sRef.current.player.x + dx));
    };
    window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchstart", onTouchStart); canvas.removeEventListener("touchmove", onTouchMove); };
  }, [phase, startGame, resetBall]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link>
        <div className="flex items-center gap-2 mb-4"><CircleDot size={24} className="text-[#3ea6ff]" /><h1 className="text-xl font-bold">Soccer Mini</h1></div>
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" />
        <button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3ea6ff] rounded-lg text-sm font-medium hover:bg-[#3ea6ff]/80"><RotateCcw size={14} /> Restart</button>
      </div>
    </div>
  );
}
