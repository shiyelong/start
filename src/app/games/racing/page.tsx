"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Car } from "lucide-react";

const W = 400, H = 600;
interface RoadObj { x: number; y: number; w: number; h: number; type: "car" | "coin"; color: string; }

export default function RacingGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"title" | "playing" | "gameover">("title");
  const [score, setScore] = useState(0);
  const stateRef = useRef({ px: W / 2, speed: 200, roadY: 0, objects: [] as RoadObj[], score: 0, spawnTimer: 0, speedBoost: 0 });
  const keysRef = useRef(new Set<string>());
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  const startGame = useCallback(() => {
    stateRef.current = { px: W / 2, speed: 200, roadY: 0, objects: [], score: 0, spawnTimer: 0, speedBoost: 0 };
    setScore(0); setPhase("playing"); lastRef.current = 0;
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
      const s = stateRef.current;

      if (phase === "playing") {
        // Input
        const keys = keysRef.current;
        if (keys.has("ArrowLeft") || keys.has("a")) s.px = Math.max(80, s.px - 300 * dt);
        if (keys.has("ArrowRight") || keys.has("d")) s.px = Math.min(W - 80, s.px + 300 * dt);
        s.speed = Math.min(600, 200 + s.score * 0.5);
        s.roadY += s.speed * dt;
        s.score += dt * 10; setScore(Math.floor(s.score));
        // Spawn
        s.spawnTimer -= dt;
        if (s.spawnTimer <= 0) {
          s.spawnTimer = 0.6 + Math.random() * 0.8;
          if (Math.random() < 0.3) {
            s.objects.push({ x: 100 + Math.random() * (W - 200), y: -40, w: 30, h: 50, type: "coin", color: "#ffd700" });
          } else {
            s.objects.push({ x: 100 + Math.random() * (W - 200), y: -60, w: 40, h: 60, type: "car", color: `hsl(${Math.random() * 360}, 70%, 50%)` });
          }
        }
        // Update objects
        for (const o of s.objects) o.y += s.speed * dt * 0.8;
        // Collision
        for (const o of s.objects) {
          if (o.y > H + 60) continue;
          const dx = Math.abs(o.x - s.px), dy = Math.abs(o.y - (H - 80));
          if (dx < (o.w + 30) / 2 && dy < (o.h + 50) / 2) {
            if (o.type === "coin") { s.score += 50; setScore(Math.floor(s.score)); o.y = H + 100; }
            else { setPhase("gameover"); }
          }
        }
        s.objects = s.objects.filter(o => o.y < H + 100);
      }

      // Render
      ctx.save(); ctx.scale(dpr, dpr);
      // Road
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#1a1a2e"); grad.addColorStop(1, "#0f0f0f");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      // Road markings
      ctx.strokeStyle = "#333"; ctx.lineWidth = 2; ctx.setLineDash([30, 20]);
      for (let lx = 120; lx < W - 60; lx += 80) {
        ctx.beginPath(); ctx.moveTo(lx, (s.roadY % 50) - 50); ctx.lineTo(lx, H); ctx.stroke();
      }
      ctx.setLineDash([]);
      // Road edges
      ctx.fillStyle = "#ff4757"; ctx.fillRect(60, 0, 4, H); ctx.fillRect(W - 64, 0, 4, H);

      if (phase === "title") {
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 32px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("2D Racing", W / 2, H / 2 - 30);
        ctx.fillStyle = "#aaa"; ctx.font = "16px sans-serif";
        ctx.fillText("Click or Enter to Start", W / 2, H / 2 + 10);
        ctx.fillText("Arrow keys / swipe to steer", W / 2, H / 2 + 40);
      } else {
        // Objects
        for (const o of s.objects) {
          if (o.type === "coin") {
            ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(o.x, o.y, 12, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#000"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("$", o.x, o.y);
          } else {
            ctx.fillStyle = o.color;
            ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
            ctx.fillStyle = "#222"; ctx.fillRect(o.x - o.w / 2 + 4, o.y - o.h / 2 + 4, o.w - 8, 12);
            ctx.fillRect(o.x - o.w / 2 + 4, o.y + o.h / 2 - 16, o.w - 8, 12);
          }
        }
        // Player car
        ctx.fillStyle = "#3ea6ff";
        ctx.fillRect(s.px - 20, H - 110, 40, 60);
        ctx.fillStyle = "#1a6fb5";
        ctx.fillRect(s.px - 16, H - 104, 32, 14);
        ctx.fillRect(s.px - 16, H - 66, 32, 14);
        // Wheels
        ctx.fillStyle = "#333";
        ctx.fillRect(s.px - 24, H - 100, 6, 16); ctx.fillRect(s.px + 18, H - 100, 6, 16);
        ctx.fillRect(s.px - 24, H - 66, 6, 16); ctx.fillRect(s.px + 18, H - 66, 6, 16);
        // HUD
        ctx.fillStyle = "#fff"; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`Score: ${Math.floor(s.score)}`, 10, 30);
        ctx.fillText(`Speed: ${Math.floor(s.speed)}`, 10, 54);

        if (phase === "gameover") {
          ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = "#ff4757"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("Crash!", W / 2, H / 2 - 20);
          ctx.fillStyle = "#fff"; ctx.font = "18px sans-serif";
          ctx.fillText(`Score: ${Math.floor(s.score)}`, W / 2, H / 2 + 14);
          ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
          ctx.fillText("Click to Restart", W / 2, H / 2 + 44);
        }
      }
      ctx.restore();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => { keysRef.current.add(e.key); if ((e.key === "Enter" || e.key === " ") && phase !== "playing") startGame(); };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    const onClick = () => { if (phase !== "playing") startGame(); };
    let touchX = 0;
    const onTouchStart = (e: TouchEvent) => { e.preventDefault(); touchX = e.touches[0].clientX; if (phase !== "playing") startGame(); };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault(); const dx = e.touches[0].clientX - touchX; touchX = e.touches[0].clientX;
      stateRef.current.px = Math.max(80, Math.min(W - 80, stateRef.current.px + dx));
    };
    window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchstart", onTouchStart); canvas.removeEventListener("touchmove", onTouchMove); };
  }, [phase, startGame]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link>
        <div className="flex items-center gap-2 mb-4"><Car size={24} className="text-[#3ea6ff]" /><h1 className="text-xl font-bold">2D Racing</h1></div>
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" />
        <button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3ea6ff] rounded-lg text-sm font-medium hover:bg-[#3ea6ff]/80"><RotateCcw size={14} /> Restart</button>
      </div>
    </div>
  );
}
