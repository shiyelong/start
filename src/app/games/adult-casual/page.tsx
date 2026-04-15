"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Gamepad2, Lock } from "lucide-react";
import { ageGate } from "@/lib/age-gate";

const W = 400, H = 500;
type Phase = "title" | "playing" | "gameover";
type MiniGame = "catch" | "dodge" | "tap";
interface FallingObj { x: number; y: number; type: "good" | "bad"; speed: number; size: number; color: string; }

export default function AdultCasual() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [score, setScore] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [game, setGame] = useState<MiniGame>("catch");
  const sRef = useRef({ px: W / 2, objects: [] as FallingObj[], score: 0, lives: 3, spawnTimer: 0, speed: 150, tapTargets: [] as { x: number; y: number; life: number; size: number }[], tapScore: 0 });
  const keysRef = useRef(new Set<string>());
  const rafRef = useRef(0); const lastRef = useRef(0);

  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  const startGame = useCallback((g: MiniGame) => {
    setGame(g); sRef.current = { px: W / 2, objects: [], score: 0, lives: 3, spawnTimer: 0, speed: 150, tapTargets: [], tapScore: 0 };
    setScore(0); setPhase("playing"); lastRef.current = 0;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    const loop = (ts: number) => {
      if (!lastRef.current) lastRef.current = ts;
      const dt = Math.min((ts - lastRef.current) / 1000, 0.05); lastRef.current = ts;
      const s = sRef.current;
      if (phase === "playing") {
        if (game === "catch" || game === "dodge") {
          const keys = keysRef.current;
          if (keys.has("ArrowLeft") || keys.has("a")) s.px = Math.max(20, s.px - 280 * dt);
          if (keys.has("ArrowRight") || keys.has("d")) s.px = Math.min(W - 20, s.px + 280 * dt);
          s.speed = 150 + s.score * 0.3;
          s.spawnTimer -= dt;
          if (s.spawnTimer <= 0) {
            s.spawnTimer = 0.4 + Math.random() * 0.5;
            const isGood = game === "catch" ? Math.random() < 0.7 : Math.random() < 0.3;
            s.objects.push({ x: 20 + Math.random() * (W - 40), y: -20, type: isGood ? "good" : "bad", speed: s.speed + Math.random() * 50, size: 14, color: isGood ? "#ff6b81" : "#555" });
          }
          for (const o of s.objects) o.y += o.speed * dt;
          for (const o of s.objects) {
            if (Math.abs(o.x - s.px) < 24 && Math.abs(o.y - (H - 40)) < 24) {
              if ((game === "catch" && o.type === "good") || (game === "dodge" && o.type === "bad")) {
                if (game === "catch") { s.score += 10; setScore(s.score); } else { s.lives--; if (s.lives <= 0) setPhase("gameover"); }
              } else if (game === "catch" && o.type === "bad") { s.lives--; if (s.lives <= 0) setPhase("gameover"); }
              else { s.score += 10; setScore(s.score); }
              o.y = H + 100;
            }
          }
          s.objects = s.objects.filter(o => o.y < H + 50);
          if (game === "dodge") { s.score += Math.floor(dt * 10); setScore(s.score); }
        } else if (game === "tap") {
          s.spawnTimer -= dt;
          if (s.spawnTimer <= 0) { s.spawnTimer = 0.8 + Math.random() * 0.6; s.tapTargets.push({ x: 40 + Math.random() * (W - 80), y: 40 + Math.random() * (H - 120), life: 2, size: 30 + Math.random() * 20 }); }
          for (const t of s.tapTargets) t.life -= dt;
          const missed = s.tapTargets.filter(t => t.life <= 0).length;
          s.lives -= missed;
          s.tapTargets = s.tapTargets.filter(t => t.life > 0);
          if (s.lives <= 0) setPhase("gameover");
        }
      }
      ctx.save(); ctx.scale(dpr, dpr); ctx.fillStyle = "#0a0a1a"; ctx.fillRect(0, 0, W, H);
      if (phase === "title") {
        ctx.fillStyle = "#a55eea"; ctx.font = "bold 26px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Casual Mini Games", W / 2, H / 2 - 80);
        const games: { label: string; g: MiniGame; y: number }[] = [{ label: "Catch Game", g: "catch", y: H / 2 - 30 }, { label: "Dodge Game", g: "dodge", y: H / 2 + 10 }, { label: "Tap Game", g: "tap", y: H / 2 + 50 }];
        for (const gm of games) {
          ctx.fillStyle = "#1a1a2e"; ctx.beginPath(); ctx.roundRect(W / 2 - 80, gm.y, 160, 32, 8); ctx.fill();
          ctx.strokeStyle = "#a55eea"; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(W / 2 - 80, gm.y, 160, 32, 8); ctx.stroke();
          ctx.fillStyle = "#fff"; ctx.font = "14px sans-serif"; ctx.fillText(gm.label, W / 2, gm.y + 21);
        }
      } else {
        if (game === "catch" || game === "dodge") {
          for (const o of s.objects) { ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(o.x, o.y, o.size, 0, Math.PI * 2); ctx.fill(); }
          ctx.fillStyle = "#a55eea"; ctx.beginPath(); ctx.arc(s.px, H - 40, 18, 0, Math.PI * 2); ctx.fill();
        } else {
          for (const t of s.tapTargets) {
            ctx.globalAlpha = Math.min(1, t.life); ctx.fillStyle = "#ff6b81";
            ctx.beginPath(); ctx.arc(t.x, t.y, t.size * (0.5 + t.life * 0.25), 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
        ctx.fillStyle = "#fff"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`Score: ${s.score}`, 10, 24);
        ctx.fillStyle = "#ff4757"; ctx.textAlign = "right";
        for (let i = 0; i < s.lives; i++) ctx.fillText("\u2665", W - 10 - i * 20, 24);
        if (phase === "gameover") { ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#ff4757"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center"; ctx.fillText("Game Over", W / 2, H / 2 - 10); ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif"; ctx.fillText(`Score: ${s.score}`, W / 2, H / 2 + 20); ctx.fillText("Click to go back", W / 2, H / 2 + 44); }
      }
      ctx.restore(); rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    const onKey = (e: KeyboardEvent) => { keysRef.current.add(e.key); };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    const onClick = (e: MouseEvent) => {
      if (phase === "gameover") { setPhase("title"); return; }
      if (phase === "title") {
        const rect = canvas.getBoundingClientRect(); const my = (e.clientY - rect.top) * (H / rect.height);
        if (my >= H / 2 - 30 && my <= H / 2 + 2) startGame("catch");
        else if (my >= H / 2 + 10 && my <= H / 2 + 42) startGame("dodge");
        else if (my >= H / 2 + 50 && my <= H / 2 + 82) startGame("tap");
        return;
      }
      if (game === "tap") {
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (W / rect.width), my = (e.clientY - rect.top) * (H / rect.height);
        const s = sRef.current;
        for (let i = s.tapTargets.length - 1; i >= 0; i--) {
          const t = s.tapTargets[i];
          if (Math.sqrt((mx - t.x) ** 2 + (my - t.y) ** 2) < t.size) { s.tapTargets.splice(i, 1); s.score += 20; setScore(s.score); break; }
        }
      }
    };
    const onTouch = (e: TouchEvent) => { e.preventDefault(); onClick({ clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY } as MouseEvent); };
    let touchX = 0;
    const onTouchStart = (e: TouchEvent) => { e.preventDefault(); touchX = e.touches[0].clientX; onClick({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY } as MouseEvent); };
    const onTouchMove = (e: TouchEvent) => { e.preventDefault(); const dx = e.touches[0].clientX - touchX; touchX = e.touches[0].clientX; sRef.current.px = Math.max(20, Math.min(W - 20, sRef.current.px + dx)); };
    window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("click", onClick); canvas.addEventListener("touchstart", onTouchStart, { passive: false }); canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchstart", onTouchStart); canvas.removeEventListener("touchmove", onTouchMove); };
  }, [phase, game, startGame]);

  if (blocked) return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-20 text-center"><Lock size={48} className="mx-auto text-gray-600 mb-4" /><h1 className="text-xl font-bold mb-2">Access Restricted</h1><p className="text-gray-400">NC-17 mode required.</p><Link href="/games" className="mt-4 inline-block text-[#3ea6ff]">Back</Link></div></div>);

  return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-6"><Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link><div className="flex items-center gap-2 mb-4"><Gamepad2 size={24} className="text-[#a55eea]" /><h1 className="text-xl font-bold">Casual Mini Games</h1></div><canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" /></div></div>);
}
