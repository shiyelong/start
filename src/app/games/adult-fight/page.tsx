"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Zap, Lock } from "lucide-react";
import { ageGate } from "@/lib/age-gate";

const W = 400, H = 300;
type Phase = "title" | "playing" | "gameover";
interface Fighter { x: number; hp: number; maxHp: number; atk: number; name: string; color: string; cooldown: number; }

export default function AdultFight() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [score, setScore] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const sRef = useRef({ player: { x: 80, hp: 100, maxHp: 100, atk: 10, name: "Hero", color: "#a55eea", cooldown: 0 } as Fighter, enemy: { x: W - 80, hp: 50, maxHp: 50, atk: 8, name: "Rival", color: "#ff4757", cooldown: 0 } as Fighter, round: 1, score: 0, msg: "", combo: 0, particles: [] as { x: number; y: number; vx: number; vy: number; life: number; color: string }[] });
  const keysRef = useRef(new Set<string>());
  const rafRef = useRef(0); const lastRef = useRef(0);

  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  const startGame = useCallback(() => {
    sRef.current = { player: { x: 80, hp: 100, maxHp: 100, atk: 10, name: "Hero", color: "#a55eea", cooldown: 0 }, enemy: { x: W - 80, hp: 50, maxHp: 50, atk: 8, name: "Rival", color: "#ff4757", cooldown: 0 }, round: 1, score: 0, msg: "Fight!", combo: 0, particles: [] };
    setScore(0); setPhase("playing"); lastRef.current = 0;
  }, []);

  const attack = useCallback(() => {
    const s = sRef.current; if (s.player.cooldown > 0) return;
    s.player.cooldown = 0.4; const dmg = s.player.atk + Math.floor(Math.random() * 4);
    s.enemy.hp -= dmg; s.combo++; s.score += dmg * s.combo; setScore(s.score);
    s.msg = `Hit! ${dmg} dmg (x${s.combo})`;
    for (let i = 0; i < 5; i++) s.particles.push({ x: s.enemy.x, y: H / 2, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, life: 0.5, color: "#ffd700" });
    if (s.enemy.hp <= 0) {
      s.round++; s.enemy.hp = 40 + s.round * 15; s.enemy.maxHp = s.enemy.hp; s.enemy.atk = 6 + s.round * 2;
      s.player.hp = Math.min(s.player.hp + 20, s.player.maxHp); s.msg = `Round ${s.round}!`; s.combo = 0;
    }
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
        s.player.cooldown = Math.max(0, s.player.cooldown - dt);
        s.enemy.cooldown -= dt;
        if (s.enemy.cooldown <= 0) { s.enemy.cooldown = 1.2 + Math.random(); const dmg = s.enemy.atk + Math.floor(Math.random() * 3); s.player.hp -= dmg; s.combo = 0; s.msg = `Enemy hits for ${dmg}!`; if (s.player.hp <= 0) setPhase("gameover"); }
        for (const p of s.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
        s.particles = s.particles.filter(p => p.life > 0);
      }
      ctx.save(); ctx.scale(dpr, dpr); ctx.fillStyle = "#0a0a1a"; ctx.fillRect(0, 0, W, H);
      if (phase === "title") {
        ctx.fillStyle = "#a55eea"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Adult Fighter", W / 2, H / 2 - 20); ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif"; ctx.fillText("Click/Space to attack", W / 2, H / 2 + 10); ctx.fillText("Click to Start", W / 2, H / 2 + 35);
      } else {
        // Arena
        ctx.fillStyle = "#1a0a2e"; ctx.fillRect(20, H / 2 - 60, W - 40, 120);
        // Player
        ctx.fillStyle = s.player.color; ctx.beginPath(); ctx.arc(s.player.x, H / 2, 30, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText("P", s.player.x, H / 2 + 5);
        // Enemy
        ctx.fillStyle = s.enemy.color; ctx.beginPath(); ctx.arc(s.enemy.x, H / 2, 30, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.fillText("E", s.enemy.x, H / 2 + 5);
        // HP bars
        ctx.fillStyle = "#333"; ctx.fillRect(20, 20, 160, 12); ctx.fillStyle = "#a55eea"; ctx.fillRect(20, 20, 160 * Math.max(0, s.player.hp / s.player.maxHp), 12);
        ctx.fillStyle = "#333"; ctx.fillRect(W - 180, 20, 160, 12); ctx.fillStyle = "#ff4757"; ctx.fillRect(W - 180, 20, 160 * Math.max(0, s.enemy.hp / s.enemy.maxHp), 12);
        ctx.fillStyle = "#fff"; ctx.font = "12px sans-serif"; ctx.textAlign = "left"; ctx.fillText(`${Math.max(0, s.player.hp)}/${s.player.maxHp}`, 20, 48);
        ctx.textAlign = "right"; ctx.fillText(`${Math.max(0, s.enemy.hp)}/${s.enemy.maxHp}`, W - 20, 48);
        // Particles
        for (const p of s.particles) { ctx.globalAlpha = p.life * 2; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
        // HUD
        ctx.fillStyle = "#ffd700"; ctx.font = "14px sans-serif"; ctx.textAlign = "center"; ctx.fillText(s.msg, W / 2, H - 30);
        ctx.fillStyle = "#aaa"; ctx.font = "12px sans-serif"; ctx.fillText(`Round: ${s.round} | Score: ${s.score}`, W / 2, H - 10);
        if (phase === "gameover") { ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#ff4757"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center"; ctx.fillText("KO!", W / 2, H / 2 - 10); ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif"; ctx.fillText(`Score: ${s.score}`, W / 2, H / 2 + 20); ctx.fillText("Click to Restart", W / 2, H / 2 + 44); }
      }
      ctx.restore(); rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    const onKey = (e: KeyboardEvent) => { if (phase !== "playing") startGame(); else if (e.key === " " || e.key === "Enter") attack(); };
    const onClick = () => { if (phase !== "playing") startGame(); else attack(); };
    const onTouch = (e: TouchEvent) => { e.preventDefault(); onClick(); };
    window.addEventListener("keydown", onKey); canvas.addEventListener("click", onClick); canvas.addEventListener("touchstart", onTouch, { passive: false });
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("keydown", onKey); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchstart", onTouch); };
  }, [phase, startGame, attack]);

  if (blocked) return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-20 text-center"><Lock size={48} className="mx-auto text-gray-600 mb-4" /><h1 className="text-xl font-bold mb-2">Access Restricted</h1><p className="text-gray-400">NC-17 mode required.</p><Link href="/games" className="mt-4 inline-block text-[#3ea6ff]">Back</Link></div></div>);

  return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-6"><Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link><div className="flex items-center gap-2 mb-4"><Zap size={24} className="text-[#a55eea]" /><h1 className="text-xl font-bold">Adult Fighter</h1></div><canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" /><button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#a55eea] rounded-lg text-sm font-medium hover:bg-[#a55eea]/80"><RotateCcw size={14} /> Restart</button></div></div>);
}
