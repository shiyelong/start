"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Layers, Lock } from "lucide-react";
import { ageGate } from "@/lib/age-gate";

const W = 400, H = 460;
type Phase = "title" | "playing" | "gameover";
interface Card { id: number; power: number; type: string; color: string; }

const TYPES = [{ name: "Warrior", color: "#ff4757" }, { name: "Mage", color: "#a55eea" }, { name: "Rogue", color: "#2ed573" }, { name: "Healer", color: "#3ea6ff" }];
function makeCard(id: number): Card { const t = TYPES[Math.floor(Math.random() * TYPES.length)]; return { id, power: 2 + Math.floor(Math.random() * 8), type: t.name, color: t.color }; }

export default function AdultCards() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [score, setScore] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const sRef = useRef({ hand: [] as Card[], enemyPower: 5, round: 1, hp: 20, score: 0, msg: "Pick a card!", nextId: 0 });
  const rafRef = useRef(0);

  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  const startGame = useCallback(() => {
    let id = 0; const hand = Array.from({ length: 5 }, () => makeCard(id++));
    sRef.current = { hand, enemyPower: 5, round: 1, hp: 20, score: 0, msg: "Pick a card to play!", nextId: id };
    setScore(0); setPhase("playing");
  }, []);

  const playCard = useCallback((idx: number) => {
    const s = sRef.current; const card = s.hand[idx];
    const diff = card.power - s.enemyPower;
    if (diff >= 0) { s.score += card.power * 10 + s.round * 5; s.msg = `Won! +${card.power * 10} pts`; }
    else { s.hp += diff; s.msg = `Lost! ${diff} HP`; }
    s.hand.splice(idx, 1); s.hand.push(makeCard(s.nextId++));
    s.round++; s.enemyPower = 3 + Math.floor(s.round * 1.5) + Math.floor(Math.random() * 3);
    setScore(s.score);
    if (s.hp <= 0) { setPhase("gameover"); s.msg = "Defeated!"; }
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
        ctx.fillText("Adult Card Battle", W / 2, H / 2 - 30); ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif"; ctx.fillText("Click to Start", W / 2, H / 2 + 10);
      } else {
        // Enemy
        ctx.fillStyle = "#1a1a2e"; ctx.beginPath(); ctx.roundRect(W / 2 - 50, 20, 100, 80, 8); ctx.fill();
        ctx.strokeStyle = "#ff4757"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(W / 2 - 50, 20, 100, 80, 8); ctx.stroke();
        ctx.fillStyle = "#ff4757"; ctx.font = "bold 24px sans-serif"; ctx.textAlign = "center"; ctx.fillText(`${s.enemyPower}`, W / 2, 65);
        ctx.fillStyle = "#aaa"; ctx.font = "11px sans-serif"; ctx.fillText("Enemy Power", W / 2, 88);
        // Stats
        ctx.fillStyle = "#fff"; ctx.font = "14px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`HP: ${s.hp}/20 | Round: ${s.round} | Score: ${s.score}`, 10, 130);
        ctx.fillStyle = "#ffd700"; ctx.font = "13px sans-serif"; ctx.textAlign = "center"; ctx.fillText(s.msg, W / 2, 155);
        // Hand
        const cardW = 70, cardH = 100, gap = 6;
        const startX = (W - (s.hand.length * (cardW + gap) - gap)) / 2;
        for (let i = 0; i < s.hand.length; i++) {
          const c = s.hand[i]; const cx = startX + i * (cardW + gap), cy = 180;
          ctx.fillStyle = "#1a1a2e"; ctx.beginPath(); ctx.roundRect(cx, cy, cardW, cardH, 6); ctx.fill();
          ctx.strokeStyle = c.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(cx, cy, cardW, cardH, 6); ctx.stroke();
          ctx.fillStyle = c.color; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.fillText(c.type, cx + cardW / 2, cy + 18);
          ctx.fillStyle = "#fff"; ctx.font = "bold 24px sans-serif"; ctx.fillText(`${c.power}`, cx + cardW / 2, cy + 55);
          ctx.fillStyle = c.power >= s.enemyPower ? "#2ed573" : "#ff4757"; ctx.font = "10px sans-serif";
          ctx.fillText(c.power >= s.enemyPower ? "WIN" : "LOSE", cx + cardW / 2, cy + 80);
        }
        if (phase === "gameover") { ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#ff4757"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center"; ctx.fillText("Game Over", W / 2, H / 2 - 10); ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif"; ctx.fillText(`Score: ${s.score} | Rounds: ${s.round}`, W / 2, H / 2 + 20); ctx.fillText("Click to Restart", W / 2, H / 2 + 44); }
      }
      ctx.restore(); rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    const onClick = (e: MouseEvent) => {
      if (phase !== "playing") { startGame(); return; }
      const rect = canvas.getBoundingClientRect(); const mx = (e.clientX - rect.left) * (W / rect.width), my = (e.clientY - rect.top) * (H / rect.height);
      const s = sRef.current; const cardW = 70, gap = 6; const startX = (W - (s.hand.length * (cardW + gap) - gap)) / 2;
      for (let i = 0; i < s.hand.length; i++) { const cx = startX + i * (cardW + gap); if (mx >= cx && mx <= cx + cardW && my >= 180 && my <= 280) { playCard(i); return; } }
    };
    const onTouch = (e: TouchEvent) => { e.preventDefault(); onClick({ clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY } as MouseEvent); };
    canvas.addEventListener("click", onClick); canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => { cancelAnimationFrame(rafRef.current); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchend", onTouch); };
  }, [phase, startGame, playCard]);

  if (blocked) return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-20 text-center"><Lock size={48} className="mx-auto text-gray-600 mb-4" /><h1 className="text-xl font-bold mb-2">Access Restricted</h1><p className="text-gray-400">NC-17 mode required.</p><Link href="/games" className="mt-4 inline-block text-[#3ea6ff]">Back</Link></div></div>);

  return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-6"><Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link><div className="flex items-center gap-2 mb-4"><Layers size={24} className="text-[#a55eea]" /><h1 className="text-xl font-bold">Adult Card Battle</h1></div><canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" /><button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#a55eea] rounded-lg text-sm font-medium hover:bg-[#a55eea]/80"><RotateCcw size={14} /> Restart</button></div></div>);
}
