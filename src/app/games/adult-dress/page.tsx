"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Shirt, Lock } from "lucide-react";
import { ageGate } from "@/lib/age-gate";

const W = 400, H = 500;
type Phase = "title" | "playing";
interface Outfit { name: string; color: string; slot: "hair" | "top" | "bottom" | "shoes" | "accessory"; }

const ITEMS: Record<string, Outfit[]> = {
  hair: [{ name: "Long", color: "#ffd700", slot: "hair" }, { name: "Short", color: "#ff6b81", slot: "hair" }, { name: "Ponytail", color: "#a55eea", slot: "hair" }, { name: "Curly", color: "#2ed573", slot: "hair" }],
  top: [{ name: "T-Shirt", color: "#3ea6ff", slot: "top" }, { name: "Dress", color: "#ff4757", slot: "top" }, { name: "Jacket", color: "#333", slot: "top" }, { name: "None", color: "#1a1a2e", slot: "top" }],
  bottom: [{ name: "Skirt", color: "#a55eea", slot: "bottom" }, { name: "Jeans", color: "#1e90ff", slot: "bottom" }, { name: "Shorts", color: "#ffa502", slot: "bottom" }, { name: "None", color: "#1a1a2e", slot: "bottom" }],
  shoes: [{ name: "Heels", color: "#ff4757", slot: "shoes" }, { name: "Boots", color: "#333", slot: "shoes" }, { name: "Sneakers", color: "#fff", slot: "shoes" }, { name: "Barefoot", color: "#1a1a2e", slot: "shoes" }],
  accessory: [{ name: "Necklace", color: "#ffd700", slot: "accessory" }, { name: "Glasses", color: "#3ea6ff", slot: "accessory" }, { name: "Hat", color: "#ff6b81", slot: "accessory" }, { name: "None", color: "#1a1a2e", slot: "accessory" }],
};
const SLOTS = ["hair", "top", "bottom", "shoes", "accessory"];

export default function AdultDress() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [blocked, setBlocked] = useState(false);
  const [equipped, setEquipped] = useState<Record<string, number>>({ hair: 0, top: 0, bottom: 0, shoes: 0, accessory: 0 });
  const [activeSlot, setActiveSlot] = useState("hair");
  const rafRef = useRef(0);

  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    const render = () => {
      ctx.save(); ctx.scale(dpr, dpr); ctx.fillStyle = "#0f0f0f"; ctx.fillRect(0, 0, W, H);
      if (phase === "title") {
        ctx.fillStyle = "#ff6b81"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Dress Up", W / 2, H / 2 - 30); ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
        ctx.fillText("Customize your character", W / 2, H / 2); ctx.fillText("Click to Start", W / 2, H / 2 + 30);
      } else {
        // Character display
        const cx = 120, cy = 60;
        // Body
        ctx.fillStyle = "#f5d0c5"; ctx.beginPath(); ctx.arc(cx, cy + 30, 25, 0, Math.PI * 2); ctx.fill(); // head
        ctx.fillRect(cx - 20, cy + 55, 40, 80); // torso
        ctx.fillRect(cx - 15, cy + 135, 12, 60); ctx.fillRect(cx + 3, cy + 135, 12, 60); // legs
        // Hair
        const hair = ITEMS.hair[equipped.hair];
        ctx.fillStyle = hair.color; ctx.beginPath(); ctx.arc(cx, cy + 20, 28, Math.PI, 0); ctx.fill();
        if (hair.name === "Long") { ctx.fillRect(cx - 28, cy + 20, 10, 50); ctx.fillRect(cx + 18, cy + 20, 10, 50); }
        // Top
        const top = ITEMS.top[equipped.top];
        if (top.name !== "None") { ctx.fillStyle = top.color; ctx.fillRect(cx - 22, cy + 55, 44, 40); }
        // Bottom
        const bottom = ITEMS.bottom[equipped.bottom];
        if (bottom.name !== "None") { ctx.fillStyle = bottom.color; ctx.fillRect(cx - 18, cy + 95, 36, 42); }
        // Shoes
        const shoes = ITEMS.shoes[equipped.shoes];
        if (shoes.name !== "Barefoot") { ctx.fillStyle = shoes.color; ctx.fillRect(cx - 18, cy + 190, 16, 10); ctx.fillRect(cx + 2, cy + 190, 16, 10); }
        // Accessory
        const acc = ITEMS.accessory[equipped.accessory];
        if (acc.name === "Necklace") { ctx.strokeStyle = acc.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy + 52, 12, 0, Math.PI); ctx.stroke(); }
        else if (acc.name === "Glasses") { ctx.strokeStyle = acc.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx - 10, cy + 28, 8, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + 10, cy + 28, 8, 0, Math.PI * 2); ctx.stroke(); }
        else if (acc.name === "Hat") { ctx.fillStyle = acc.color; ctx.fillRect(cx - 30, cy, 60, 12); ctx.fillRect(cx - 18, cy - 15, 36, 18); }
        // Face
        ctx.fillStyle = "#333"; ctx.beginPath(); ctx.arc(cx - 8, cy + 26, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 8, cy + 26, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#ff6b81"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy + 36, 6, 0.1, Math.PI - 0.1); ctx.stroke();
        // Slot tabs
        for (let i = 0; i < SLOTS.length; i++) {
          const sx = 200, sy = 20 + i * 36;
          ctx.fillStyle = activeSlot === SLOTS[i] ? "#2a1a3e" : "#1a1a2e";
          ctx.beginPath(); ctx.roundRect(sx, sy, 80, 28, 6); ctx.fill();
          ctx.strokeStyle = activeSlot === SLOTS[i] ? "#a55eea" : "#333"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect(sx, sy, 80, 28, 6); ctx.stroke();
          ctx.fillStyle = "#fff"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(SLOTS[i], sx + 40, sy + 18);
        }
        // Items for active slot
        const items = ITEMS[activeSlot];
        for (let i = 0; i < items.length; i++) {
          const ix = 200, iy = 210 + i * 44;
          const sel = equipped[activeSlot] === i;
          ctx.fillStyle = sel ? "#2a1a3e" : "#1a1a2e"; ctx.beginPath(); ctx.roundRect(ix, iy, 180, 36, 6); ctx.fill();
          ctx.strokeStyle = sel ? "#a55eea" : "#333"; ctx.lineWidth = sel ? 2 : 1;
          ctx.beginPath(); ctx.roundRect(ix, iy, 180, 36, 6); ctx.stroke();
          ctx.fillStyle = items[i].color; ctx.beginPath(); ctx.arc(ix + 20, iy + 18, 10, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.font = "13px sans-serif"; ctx.textAlign = "left"; ctx.fillText(items[i].name, ix + 38, iy + 22);
        }
      }
      ctx.restore(); rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    const onClick = (e: MouseEvent) => {
      if (phase === "title") { setPhase("playing"); return; }
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width), my = (e.clientY - rect.top) * (H / rect.height);
      // Slot tabs
      for (let i = 0; i < SLOTS.length; i++) { if (mx >= 200 && mx <= 280 && my >= 20 + i * 36 && my <= 48 + i * 36) { setActiveSlot(SLOTS[i]); return; } }
      // Items
      const items = ITEMS[activeSlot];
      for (let i = 0; i < items.length; i++) { if (mx >= 200 && mx <= 380 && my >= 210 + i * 44 && my <= 246 + i * 44) { setEquipped(e => ({ ...e, [activeSlot]: i })); return; } }
    };
    const onTouch = (e: TouchEvent) => { e.preventDefault(); onClick({ clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY } as MouseEvent); };
    canvas.addEventListener("click", onClick); canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => { cancelAnimationFrame(rafRef.current); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchend", onTouch); };
  }, [phase, equipped, activeSlot]);

  if (blocked) return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-20 text-center"><Lock size={48} className="mx-auto text-gray-600 mb-4" /><h1 className="text-xl font-bold mb-2">Access Restricted</h1><p className="text-gray-400">NC-17 mode required.</p><Link href="/games" className="mt-4 inline-block text-[#3ea6ff]">Back</Link></div></div>);

  return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-6"><Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link><div className="flex items-center gap-2 mb-4"><Shirt size={24} className="text-[#ff6b81]" /><h1 className="text-xl font-bold">Dress Up</h1></div><canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" /></div></div>);
}
