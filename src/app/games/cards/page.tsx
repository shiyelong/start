"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Layers } from "lucide-react";

const W = 400, H = 520;
type Element = "fire" | "water" | "earth" | "wind";
interface Card { id: number; name: string; element: Element; atk: number; def: number; cost: number; }
type Phase = "title" | "playing" | "gameover";

const ELEMENTS: Element[] = ["fire", "water", "earth", "wind"];
const EL_COLORS: Record<Element, string> = { fire: "#ff4757", water: "#3ea6ff", earth: "#ffa502", wind: "#2ed573" };
const EL_BEATS: Record<Element, Element> = { fire: "wind", water: "fire", earth: "water", wind: "earth" };

function makeCard(id: number): Card {
  const el = ELEMENTS[Math.floor(Math.random() * 4)];
  const atk = 2 + Math.floor(Math.random() * 6);
  const def = 1 + Math.floor(Math.random() * 4);
  return { id, name: `${el[0].toUpperCase()}${el.slice(1)} ${atk > 5 ? "Dragon" : atk > 3 ? "Knight" : "Imp"}`, element: el, atk, def, cost: Math.ceil((atk + def) / 3) };
}

function makeDeck(count: number): Card[] { return Array.from({ length: count }, (_, i) => makeCard(i)); }

export default function CardBattle() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [score, setScore] = useState(0);
  const sRef = useRef({ hand: [] as Card[], enemyHand: [] as Card[], playerHp: 20, enemyHp: 20, mana: 3, maxMana: 3, round: 1, score: 0, msg: "", selectedCard: -1, nextId: 100, animTimer: 0 });
  const rafRef = useRef(0);

  const drawCards = useCallback((count: number, startId: number): Card[] => {
    return Array.from({ length: count }, (_, i) => makeCard(startId + i));
  }, []);

  const startGame = useCallback(() => {
    sRef.current = { hand: makeDeck(5), enemyHand: makeDeck(5), playerHp: 20, enemyHp: 20, mana: 3, maxMana: 3, round: 1, score: 0, msg: "Select a card to play!", selectedCard: -1, nextId: 100, animTimer: 0 };
    setScore(0); setPhase("playing");
  }, []);

  const playCard = useCallback((idx: number) => {
    const s = sRef.current;
    if (idx < 0 || idx >= s.hand.length) return;
    const card = s.hand[idx];
    if (card.cost > s.mana) { s.msg = "Not enough mana!"; return; }
    s.mana -= card.cost;
    // Enemy plays random card
    const eIdx = Math.floor(Math.random() * s.enemyHand.length);
    const eCard = s.enemyHand[eIdx];
    // Calculate damage
    let pDmg = card.atk, eDmg = eCard.atk;
    if (EL_BEATS[card.element] === eCard.element) { pDmg = Math.floor(pDmg * 1.5); s.msg = "Super effective!"; }
    else if (EL_BEATS[eCard.element] === card.element) { eDmg = Math.floor(eDmg * 1.5); s.msg = "Resisted..."; }
    else { s.msg = `${card.name} vs ${eCard.name}`; }
    const pBlock = Math.max(0, pDmg - eCard.def);
    const eBlock = Math.max(0, eDmg - card.def);
    s.enemyHp -= pBlock; s.playerHp -= eBlock;
    s.msg += ` | You deal ${pBlock}, take ${eBlock}`;
    s.score += pBlock * 10; setScore(s.score);
    // Remove played cards, draw new
    s.hand.splice(idx, 1); s.enemyHand.splice(eIdx, 1);
    s.hand.push(makeCard(s.nextId++)); s.enemyHand.push(makeCard(s.nextId++));
    s.selectedCard = -1;
    if (s.enemyHp <= 0) {
      s.round++; s.enemyHp = 15 + s.round * 5; s.mana = s.maxMana;
      s.msg = `Round ${s.round}! Enemy HP restored.`; s.score += 200; setScore(s.score);
    }
    if (s.playerHp <= 0) { setPhase("gameover"); s.msg = "Defeated!"; }
    // Regen mana
    if (s.mana < s.maxMana) s.mana = Math.min(s.maxMana, s.mana + 1);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;

    const render = () => {
      ctx.save(); ctx.scale(dpr, dpr);
      ctx.fillStyle = "#0f0f0f"; ctx.fillRect(0, 0, W, H);
      const s = sRef.current;

      if (phase === "title") {
        ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Card Battle", W / 2, H / 2 - 40);
        ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
        ctx.fillText("Elemental card combat", W / 2, H / 2 - 10);
        ctx.fillText("Click to Start", W / 2, H / 2 + 20);
        // Element chart
        ctx.font = "12px sans-serif"; ctx.fillStyle = "#666";
        ctx.fillText("Fire > Wind > Earth > Water > Fire", W / 2, H / 2 + 50);
      } else {
        // Enemy area
        ctx.fillStyle = "#1a1a2e"; ctx.fillRect(10, 10, W - 20, 80);
        ctx.fillStyle = "#ff4757"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`Enemy HP: ${s.enemyHp}`, 20, 35);
        ctx.fillStyle = "#aaa"; ctx.font = "12px sans-serif";
        ctx.fillText(`Round ${s.round} | Cards: ${s.enemyHand.length}`, 20, 55);
        // Enemy HP bar
        ctx.fillStyle = "#333"; ctx.fillRect(20, 65, W - 60, 10);
        ctx.fillStyle = "#ff4757"; ctx.fillRect(20, 65, Math.max(0, (W - 60) * (s.enemyHp / (15 + s.round * 5))), 10);
        // Message
        ctx.fillStyle = "#ffd700"; ctx.font = "14px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(s.msg, W / 2, 115);
        // Player hand
        const cardW = 70, cardH = 100, gap = 6;
        const startX = (W - (s.hand.length * (cardW + gap) - gap)) / 2;
        for (let i = 0; i < s.hand.length; i++) {
          const c = s.hand[i];
          const cx = startX + i * (cardW + gap), cy = 140;
          const sel = i === s.selectedCard;
          ctx.fillStyle = sel ? "#2a2a4e" : "#1a1a2e";
          ctx.strokeStyle = sel ? "#fff" : EL_COLORS[c.element];
          ctx.lineWidth = sel ? 2 : 1;
          ctx.beginPath(); ctx.roundRect(cx, cy, cardW, cardH, 6); ctx.fill(); ctx.stroke();
          ctx.fillStyle = EL_COLORS[c.element]; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(c.element.toUpperCase(), cx + cardW / 2, cy + 16);
          ctx.fillStyle = "#fff"; ctx.font = "bold 20px sans-serif";
          ctx.fillText(`${c.atk}`, cx + cardW / 2, cy + 46);
          ctx.fillStyle = "#aaa"; ctx.font = "11px sans-serif";
          ctx.fillText(`DEF:${c.def}`, cx + cardW / 2, cy + 66);
          ctx.fillStyle = "#3ea6ff"; ctx.font = "10px sans-serif";
          ctx.fillText(`Cost:${c.cost}`, cx + cardW / 2, cy + 84);
          if (c.cost > s.mana) { ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(cx, cy, cardW, cardH); }
        }
        // Player stats
        ctx.fillStyle = "#1a1a2e"; ctx.fillRect(10, 260, W - 20, 60);
        ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`HP: ${s.playerHp}/20`, 20, 285);
        ctx.fillStyle = "#a55eea"; ctx.fillText(`Mana: ${s.mana}/${s.maxMana}`, 160, 285);
        ctx.fillStyle = "#ffd700"; ctx.fillText(`Score: ${s.score}`, 280, 285);
        // HP bar
        ctx.fillStyle = "#333"; ctx.fillRect(20, 300, W - 60, 10);
        ctx.fillStyle = "#3ea6ff"; ctx.fillRect(20, 300, Math.max(0, (W - 60) * (s.playerHp / 20)), 10);
        // Instructions
        ctx.fillStyle = "#666"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Click a card to play it", W / 2, 340);

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
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    const onClick = (e: MouseEvent) => {
      if (phase === "title" || phase === "gameover") { startGame(); return; }
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width), my = (e.clientY - rect.top) * (H / rect.height);
      const s = sRef.current;
      const cardW = 70, gap = 6;
      const startX = (W - (s.hand.length * (cardW + gap) - gap)) / 2;
      for (let i = 0; i < s.hand.length; i++) {
        const cx = startX + i * (cardW + gap);
        if (mx >= cx && mx <= cx + cardW && my >= 140 && my <= 240) {
          if (s.selectedCard === i) playCard(i);
          else s.selectedCard = i;
          return;
        }
      }
    };
    const onTouch = (e: TouchEvent) => { e.preventDefault(); const t = e.changedTouches[0]; onClick({ clientX: t.clientX, clientY: t.clientY, ...e } as unknown as MouseEvent); };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => { cancelAnimationFrame(rafRef.current); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchend", onTouch); };
  }, [phase, startGame, playCard]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link>
        <div className="flex items-center gap-2 mb-4"><Layers size={24} className="text-[#3ea6ff]" /><h1 className="text-xl font-bold">Card Battle</h1></div>
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" />
        <button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3ea6ff] rounded-lg text-sm font-medium hover:bg-[#3ea6ff]/80"><RotateCcw size={14} /> Restart</button>
      </div>
    </div>
  );
}
