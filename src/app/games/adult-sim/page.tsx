"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Building2, Lock } from "lucide-react";
import { ageGate } from "@/lib/age-gate";

const W = 400, H = 440;
type Phase = "title" | "playing" | "gameover";
interface Room { name: string; income: number; cost: number; count: number; color: string; }

export default function AdultSim() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [blocked, setBlocked] = useState(false);
  const sRef = useRef({ gold: 100, day: 1, reputation: 50, rooms: [{ name: "Lounge", income: 5, cost: 50, count: 1, color: "#a55eea" }, { name: "VIP Room", income: 15, cost: 150, count: 0, color: "#ff4757" }, { name: "Spa", income: 10, cost: 100, count: 0, color: "#3ea6ff" }, { name: "Bar", income: 8, cost: 80, count: 0, color: "#ffa502" }] as Room[], score: 0, msg: "Welcome! Build your establishment." });
  const rafRef = useRef(0);

  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  const startGame = useCallback(() => {
    sRef.current = { gold: 100, day: 1, reputation: 50, rooms: [{ name: "Lounge", income: 5, cost: 50, count: 1, color: "#a55eea" }, { name: "VIP Room", income: 15, cost: 150, count: 0, color: "#ff4757" }, { name: "Spa", income: 10, cost: 100, count: 0, color: "#3ea6ff" }, { name: "Bar", income: 8, cost: 80, count: 0, color: "#ffa502" }], score: 0, msg: "Day 1 - Build rooms to earn gold!" };
    setPhase("playing");
  }, []);

  const nextDay = useCallback(() => {
    const s = sRef.current;
    let income = 0; for (const r of s.rooms) income += r.income * r.count;
    const upkeep = s.rooms.reduce((a, r) => a + r.count * 3, 0);
    s.gold += income - upkeep; s.day++; s.score += income;
    s.reputation = Math.min(100, s.reputation + (income > 20 ? 2 : -1));
    s.msg = `Day ${s.day}: +${income} income, -${upkeep} upkeep`;
    if (s.gold < 0) { setPhase("gameover"); s.msg = "Bankrupt!"; }
  }, []);

  const buyRoom = useCallback((idx: number) => {
    const s = sRef.current; const r = s.rooms[idx];
    if (s.gold >= r.cost) { s.gold -= r.cost; r.count++; s.msg = `Built ${r.name}!`; }
    else s.msg = "Not enough gold!";
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    const render = () => {
      ctx.save(); ctx.scale(dpr, dpr); ctx.fillStyle = "#0f0f0f"; ctx.fillRect(0, 0, W, H);
      const s = sRef.current;
      if (phase === "title") {
        ctx.fillStyle = "#a55eea"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Adult Sim", W / 2, H / 2 - 40); ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
        ctx.fillText("Build & manage your establishment", W / 2, H / 2 - 10); ctx.fillText("Click to Start", W / 2, H / 2 + 20);
      } else {
        // Stats
        ctx.fillStyle = "#1a1a2e"; ctx.beginPath(); ctx.roundRect(10, 10, W - 20, 50, 8); ctx.fill();
        ctx.fillStyle = "#ffd700"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`Gold: ${s.gold}`, 20, 30); ctx.fillStyle = "#3ea6ff"; ctx.fillText(`Day: ${s.day}`, 140, 30);
        ctx.fillStyle = "#2ed573"; ctx.fillText(`Rep: ${s.reputation}`, 240, 30);
        ctx.fillStyle = "#aaa"; ctx.font = "12px sans-serif"; ctx.fillText(`Score: ${s.score}`, 330, 30);
        ctx.fillStyle = "#ffd700"; ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.fillText(s.msg, W / 2, 52);
        // Rooms
        for (let i = 0; i < s.rooms.length; i++) {
          const r = s.rooms[i]; const ry = 75 + i * 70;
          ctx.fillStyle = "#1a1a2e"; ctx.beginPath(); ctx.roundRect(10, ry, W - 20, 60, 8); ctx.fill();
          ctx.strokeStyle = r.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(10, ry, W - 20, 60, 8); ctx.stroke();
          ctx.fillStyle = r.color; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "left";
          ctx.fillText(`${r.name} (x${r.count})`, 20, ry + 22);
          ctx.fillStyle = "#aaa"; ctx.font = "12px sans-serif";
          ctx.fillText(`Income: +${r.income}/day | Cost: ${r.cost}g`, 20, ry + 42);
          // Buy button
          ctx.fillStyle = s.gold >= r.cost ? "#2a2a4e" : "#1a1a1a";
          ctx.beginPath(); ctx.roundRect(W - 80, ry + 14, 60, 30, 6); ctx.fill();
          ctx.fillStyle = s.gold >= r.cost ? "#fff" : "#555"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("Build", W - 50, ry + 34);
        }
        // Next day button
        ctx.fillStyle = "#a55eea"; ctx.beginPath(); ctx.roundRect(W / 2 - 60, H - 60, 120, 40, 8); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Next Day", W / 2, H - 34);
        if (phase === "gameover") { ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#ff4757"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center"; ctx.fillText("Bankrupt!", W / 2, H / 2 - 10); ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif"; ctx.fillText(`Score: ${s.score} | Days: ${s.day}`, W / 2, H / 2 + 20); ctx.fillText("Click to Restart", W / 2, H / 2 + 44); }
      }
      ctx.restore(); rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    const onClick = (e: MouseEvent) => {
      if (phase !== "playing") { startGame(); return; }
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width), my = (e.clientY - rect.top) * (H / rect.height);
      for (let i = 0; i < 4; i++) { if (mx >= W - 80 && mx <= W - 20 && my >= 89 + i * 70 && my <= 119 + i * 70) { buyRoom(i); return; } }
      if (mx >= W / 2 - 60 && mx <= W / 2 + 60 && my >= H - 60 && my <= H - 20) nextDay();
    };
    const onTouch = (e: TouchEvent) => { e.preventDefault(); onClick({ clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY } as MouseEvent); };
    canvas.addEventListener("click", onClick); canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => { cancelAnimationFrame(rafRef.current); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchend", onTouch); };
  }, [phase, startGame, nextDay, buyRoom]);

  if (blocked) return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-20 text-center"><Lock size={48} className="mx-auto text-gray-600 mb-4" /><h1 className="text-xl font-bold mb-2">Access Restricted</h1><p className="text-gray-400">NC-17 mode required.</p><Link href="/games" className="mt-4 inline-block text-[#3ea6ff]">Back</Link></div></div>);

  return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-6"><Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link><div className="flex items-center gap-2 mb-4"><Building2 size={24} className="text-[#a55eea]" /><h1 className="text-xl font-bold">Adult Sim</h1></div><canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" /><button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#a55eea] rounded-lg text-sm font-medium hover:bg-[#a55eea]/80"><RotateCcw size={14} /> Restart</button></div></div>);
}
