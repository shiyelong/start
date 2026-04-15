"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Heart, Lock } from "lucide-react";
import { ageGate } from "@/lib/age-gate";

const W = 400, H = 460;
type Phase = "title" | "playing" | "ending";
interface Character { name: string; affection: number; mood: number; color: string; }
interface Action { label: string; affection: number; mood: number; cost: number; }

const ACTIONS: Action[] = [
  { label: "Chat", affection: 3, mood: 2, cost: 0 },
  { label: "Gift", affection: 8, mood: 5, cost: 20 },
  { label: "Date", affection: 12, mood: 8, cost: 50 },
  { label: "Compliment", affection: 5, mood: 3, cost: 0 },
  { label: "Cook", affection: 6, mood: 6, cost: 10 },
];

export default function AdultRaise() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [blocked, setBlocked] = useState(false);
  const sRef = useRef({ char: { name: "Sakura", affection: 0, mood: 50, color: "#ff6b81" } as Character, gold: 100, day: 1, msg: "Build your relationship!", log: [] as string[] });
  const rafRef = useRef(0);

  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  const startGame = useCallback(() => {
    sRef.current = { char: { name: "Sakura", affection: 0, mood: 50, color: "#ff6b81" }, gold: 100, day: 1, msg: "Choose an action each day!", log: [] };
    setPhase("playing");
  }, []);

  const doAction = useCallback((idx: number) => {
    const s = sRef.current; const a = ACTIONS[idx];
    if (a.cost > s.gold) { s.msg = "Not enough gold!"; return; }
    s.gold -= a.cost;
    const bonus = s.char.mood > 70 ? 1.5 : s.char.mood < 30 ? 0.5 : 1;
    s.char.affection = Math.min(100, s.char.affection + Math.floor(a.affection * bonus));
    s.char.mood = Math.min(100, Math.max(0, s.char.mood + a.mood - 5));
    s.gold += 15; s.day++;
    s.msg = `${a.label}! Affection +${Math.floor(a.affection * bonus)}`;
    s.log.unshift(`Day ${s.day - 1}: ${a.label}`);
    if (s.log.length > 5) s.log.pop();
    if (s.char.affection >= 100) { setPhase("ending"); s.msg = "Max affection reached!"; }
    if (s.char.mood <= 0) { s.msg = "Mood too low... relationship ended."; setPhase("ending"); }
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
        ctx.fillStyle = "#ff6b81"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Dating Sim", W / 2, H / 2 - 40); ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
        ctx.fillText("Build affection to 100!", W / 2, H / 2 - 10); ctx.fillText("Click to Start", W / 2, H / 2 + 20);
      } else {
        // Character
        ctx.fillStyle = "rgba(255,107,129,0.1)"; ctx.beginPath(); ctx.arc(W / 2, 80, 50, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = s.char.color; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center"; ctx.fillText(s.char.name, W / 2, 85);
        // Bars
        ctx.fillStyle = "#333"; ctx.fillRect(60, 120, W - 120, 12);
        ctx.fillStyle = "#ff6b81"; ctx.fillRect(60, 120, (W - 120) * (s.char.affection / 100), 12);
        ctx.fillStyle = "#fff"; ctx.font = "11px sans-serif"; ctx.textAlign = "left"; ctx.fillText(`Affection: ${s.char.affection}%`, 60, 148);
        ctx.fillStyle = "#333"; ctx.fillRect(60, 155, W - 120, 12);
        ctx.fillStyle = "#ffa502"; ctx.fillRect(60, 155, (W - 120) * (s.char.mood / 100), 12);
        ctx.fillStyle = "#fff"; ctx.fillText(`Mood: ${s.char.mood}%`, 60, 183);
        // Stats
        ctx.fillStyle = "#ffd700"; ctx.fillText(`Gold: ${s.gold} | Day: ${s.day}`, 60, 205);
        ctx.fillStyle = "#ffd700"; ctx.font = "13px sans-serif"; ctx.textAlign = "center"; ctx.fillText(s.msg, W / 2, 228);
        // Actions
        for (let i = 0; i < ACTIONS.length; i++) {
          const a = ACTIONS[i]; const bx = 20, by = 245 + i * 36;
          ctx.fillStyle = s.gold >= a.cost ? "#1a1a2e" : "#111"; ctx.beginPath(); ctx.roundRect(bx, by, W - 40, 30, 6); ctx.fill();
          ctx.strokeStyle = "#a55eea"; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(bx, by, W - 40, 30, 6); ctx.stroke();
          ctx.fillStyle = s.gold >= a.cost ? "#fff" : "#555"; ctx.font = "13px sans-serif"; ctx.textAlign = "left";
          ctx.fillText(`${a.label} (+${a.affection} aff, +${a.mood} mood)${a.cost ? ` - ${a.cost}g` : ""}`, bx + 12, by + 20);
        }
        // Log
        ctx.fillStyle = "#666"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
        for (let i = 0; i < s.log.length; i++) ctx.fillText(s.log[i], 20, H - 40 + i * 14);
        if (phase === "ending") {
          ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = s.char.affection >= 100 ? "#ff6b81" : "#ff4757"; ctx.font = "bold 24px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(s.char.affection >= 100 ? "True Love Ending!" : "Bad Ending...", W / 2, H / 2 - 10);
          ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif"; ctx.fillText(`Days: ${s.day}`, W / 2, H / 2 + 20); ctx.fillText("Click to Restart", W / 2, H / 2 + 44);
        }
      }
      ctx.restore(); rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    const onClick = (e: MouseEvent) => {
      if (phase !== "playing") { startGame(); return; }
      const rect = canvas.getBoundingClientRect(); const my = (e.clientY - rect.top) * (H / rect.height);
      for (let i = 0; i < ACTIONS.length; i++) { if (my >= 245 + i * 36 && my <= 275 + i * 36) { doAction(i); return; } }
    };
    const onTouch = (e: TouchEvent) => { e.preventDefault(); onClick({ clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY } as MouseEvent); };
    canvas.addEventListener("click", onClick); canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => { cancelAnimationFrame(rafRef.current); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchend", onTouch); };
  }, [phase, startGame, doAction]);

  if (blocked) return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-20 text-center"><Lock size={48} className="mx-auto text-gray-600 mb-4" /><h1 className="text-xl font-bold mb-2">Access Restricted</h1><p className="text-gray-400">NC-17 mode required.</p><Link href="/games" className="mt-4 inline-block text-[#3ea6ff]">Back</Link></div></div>);

  return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-6"><Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link><div className="flex items-center gap-2 mb-4"><Heart size={24} className="text-[#ff6b81]" /><h1 className="text-xl font-bold">Dating Sim</h1></div><canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" /><button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#a55eea] rounded-lg text-sm font-medium hover:bg-[#a55eea]/80"><RotateCcw size={14} /> Restart</button></div></div>);
}
