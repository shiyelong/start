"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Crosshair } from "lucide-react";

const W = 400, H = 600;
type Phase = "title" | "playing" | "gameover";
interface Star { x: number; y: number; speed: number; size: number; }
interface Bullet { x: number; y: number; vy: number; }
interface Enemy { x: number; y: number; hp: number; speed: number; type: number; w: number; h: number; shootTimer: number; }
interface EBullet { x: number; y: number; vy: number; }
interface Powerup { x: number; y: number; type: "spread" | "shield" | "rapid"; vy: number; }

export default function ShooterGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [score, setScore] = useState(0);
  const sRef = useRef({
    px: W / 2, py: H - 60, bullets: [] as Bullet[], enemies: [] as Enemy[], eBullets: [] as EBullet[],
    powerups: [] as Powerup[], stars: [] as Star[], score: 0, hp: 3, maxHp: 3,
    fireTimer: 0, fireRate: 0.15, spread: 1, shield: 0, spawnTimer: 0, wave: 1, kills: 0,
  });
  const keysRef = useRef(new Set<string>());
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  const startGame = useCallback(() => {
    const stars: Star[] = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, speed: 30 + Math.random() * 80, size: 1 + Math.random() * 2 }));
    sRef.current = { px: W / 2, py: H - 60, bullets: [], enemies: [], eBullets: [], powerups: [], stars, score: 0, hp: 3, maxHp: 3, fireTimer: 0, fireRate: 0.15, spread: 1, shield: 0, spawnTimer: 0, wave: 1, kills: 0 };
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
      const s = sRef.current;

      if (phase === "playing") {
        const keys = keysRef.current;
        const spd = 280;
        if (keys.has("ArrowLeft") || keys.has("a")) s.px = Math.max(16, s.px - spd * dt);
        if (keys.has("ArrowRight") || keys.has("d")) s.px = Math.min(W - 16, s.px + spd * dt);
        if (keys.has("ArrowUp") || keys.has("w")) s.py = Math.max(16, s.py - spd * dt);
        if (keys.has("ArrowDown") || keys.has("s")) s.py = Math.min(H - 16, s.py + spd * dt);
        // Auto fire
        s.fireTimer -= dt;
        if (s.fireTimer <= 0) {
          s.fireTimer = s.fireRate;
          s.bullets.push({ x: s.px, y: s.py - 12, vy: -500 });
          if (s.spread >= 2) { s.bullets.push({ x: s.px - 10, y: s.py - 8, vy: -480 }); s.bullets.push({ x: s.px + 10, y: s.py - 8, vy: -480 }); }
          if (s.spread >= 3) { s.bullets.push({ x: s.px - 18, y: s.py - 4, vy: -460 }); s.bullets.push({ x: s.px + 18, y: s.py - 4, vy: -460 }); }
        }
        // Spawn enemies
        s.spawnTimer -= dt;
        if (s.spawnTimer <= 0) {
          s.spawnTimer = Math.max(0.3, 1.2 - s.wave * 0.05);
          const type = Math.random() < 0.2 ? 1 : 0;
          const hp = type === 1 ? 3 + s.wave : 1 + Math.floor(s.wave / 3);
          const w = type === 1 ? 40 : 24;
          s.enemies.push({ x: 20 + Math.random() * (W - 40), y: -30, hp, speed: 60 + Math.random() * 40 + s.wave * 5, type, w, h: type === 1 ? 30 : 20, shootTimer: 1 + Math.random() * 2 });
        }
        // Update
        for (const b of s.bullets) b.y += b.vy * dt;
        for (const e of s.enemies) {
          e.y += e.speed * dt;
          e.shootTimer -= dt;
          if (e.shootTimer <= 0 && e.type === 1) { e.shootTimer = 2; s.eBullets.push({ x: e.x, y: e.y + e.h / 2, vy: 200 }); }
        }
        for (const eb of s.eBullets) eb.y += eb.vy * dt;
        for (const p of s.powerups) p.y += p.vy * dt;
        for (const star of s.stars) { star.y += star.speed * dt; if (star.y > H) { star.y = 0; star.x = Math.random() * W; } }
        // Collision: bullets vs enemies
        for (const b of s.bullets) {
          for (const e of s.enemies) {
            if (e.hp <= 0) continue;
            if (Math.abs(b.x - e.x) < e.w / 2 + 4 && Math.abs(b.y - e.y) < e.h / 2 + 4) {
              e.hp--; b.y = -100;
              if (e.hp <= 0) {
                s.score += (e.type + 1) * 10; s.kills++; setScore(s.score);
                if (Math.random() < 0.1) {
                  const types: Powerup["type"][] = ["spread", "shield", "rapid"];
                  s.powerups.push({ x: e.x, y: e.y, type: types[Math.floor(Math.random() * 3)], vy: 60 });
                }
              }
            }
          }
        }
        // Collision: enemy bullets vs player
        for (const eb of s.eBullets) {
          if (Math.abs(eb.x - s.px) < 14 && Math.abs(eb.y - s.py) < 14) {
            eb.y = H + 100;
            if (s.shield > 0) { s.shield--; } else { s.hp--; if (s.hp <= 0) setPhase("gameover"); }
          }
        }
        // Collision: enemies vs player
        for (const e of s.enemies) {
          if (e.hp <= 0) continue;
          if (Math.abs(e.x - s.px) < e.w / 2 + 12 && Math.abs(e.y - s.py) < e.h / 2 + 12) {
            e.hp = 0; s.hp--; if (s.hp <= 0) setPhase("gameover");
          }
        }
        // Powerup pickup
        for (const p of s.powerups) {
          if (Math.abs(p.x - s.px) < 20 && Math.abs(p.y - s.py) < 20) {
            if (p.type === "spread") s.spread = Math.min(3, s.spread + 1);
            else if (p.type === "shield") s.shield += 2;
            else s.fireRate = Math.max(0.06, s.fireRate - 0.02);
            p.y = H + 100;
          }
        }
        // Cleanup
        s.bullets = s.bullets.filter(b => b.y > -20);
        s.enemies = s.enemies.filter(e => e.y < H + 40 && e.hp > 0);
        s.eBullets = s.eBullets.filter(eb => eb.y < H + 20);
        s.powerups = s.powerups.filter(p => p.y < H + 20);
        if (s.kills >= s.wave * 8) { s.wave++; s.kills = 0; }
      }

      ctx.save(); ctx.scale(dpr, dpr);
      ctx.fillStyle = "#050510"; ctx.fillRect(0, 0, W, H);
      // Stars
      for (const star of s.stars) { ctx.fillStyle = `rgba(255,255,255,${0.3 + star.size * 0.2})`; ctx.fillRect(star.x, star.y, star.size, star.size); }

      if (phase === "title") {
        ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Space Shooter", W / 2, H / 2 - 40);
        ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
        ctx.fillText("Arrow keys to move, auto-fire", W / 2, H / 2 - 5);
        ctx.fillText("Click to Start", W / 2, H / 2 + 25);
      } else {
        // Player
        ctx.fillStyle = s.shield > 0 ? "#70a1ff" : "#3ea6ff";
        ctx.beginPath(); ctx.moveTo(s.px, s.py - 14); ctx.lineTo(s.px - 12, s.py + 10); ctx.lineTo(s.px + 12, s.py + 10); ctx.closePath(); ctx.fill();
        if (s.shield > 0) { ctx.strokeStyle = "rgba(112,161,255,0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.px, s.py, 18, 0, Math.PI * 2); ctx.stroke(); }
        // Bullets
        ctx.fillStyle = "#ffd700";
        for (const b of s.bullets) ctx.fillRect(b.x - 1.5, b.y - 4, 3, 8);
        // Enemies
        for (const e of s.enemies) {
          ctx.fillStyle = e.type === 1 ? "#ff4757" : "#ff6b81";
          ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
        }
        // Enemy bullets
        ctx.fillStyle = "#ff4757";
        for (const eb of s.eBullets) ctx.fillRect(eb.x - 2, eb.y - 3, 4, 6);
        // Powerups
        for (const p of s.powerups) {
          ctx.fillStyle = p.type === "spread" ? "#ffa502" : p.type === "shield" ? "#70a1ff" : "#2ed573";
          ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(p.type[0].toUpperCase(), p.x, p.y);
        }
        // HUD
        ctx.fillStyle = "#fff"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`Score: ${s.score}`, 10, 24);
        ctx.fillText(`Wave: ${s.wave}`, 10, 44);
        ctx.fillStyle = "#ff4757"; ctx.textAlign = "right";
        for (let i = 0; i < s.hp; i++) ctx.fillText("\u2665", W - 10 - i * 20, 24);

        if (phase === "gameover") {
          ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = "#ff4757"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("Game Over", W / 2, H / 2 - 20);
          ctx.fillStyle = "#fff"; ctx.font = "18px sans-serif";
          ctx.fillText(`Score: ${s.score}`, W / 2, H / 2 + 14);
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
    let touchId = -1;
    const onTouchStart = (e: TouchEvent) => { e.preventDefault(); if (phase !== "playing") { startGame(); return; } touchId = e.touches[0].identifier; };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === touchId) {
          const rect = canvas.getBoundingClientRect();
          sRef.current.px = Math.max(16, Math.min(W - 16, (e.touches[i].clientX - rect.left) * (W / rect.width)));
          sRef.current.py = Math.max(16, Math.min(H - 16, (e.touches[i].clientY - rect.top) * (H / rect.height)));
        }
      }
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
        <div className="flex items-center gap-2 mb-4"><Crosshair size={24} className="text-[#3ea6ff]" /><h1 className="text-xl font-bold">Space Shooter</h1></div>
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" />
        <button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3ea6ff] rounded-lg text-sm font-medium hover:bg-[#3ea6ff]/80"><RotateCcw size={14} /> Restart</button>
      </div>
    </div>
  );
}
