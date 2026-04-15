"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, BookOpen, Lock } from "lucide-react";
import { ageGate } from "@/lib/age-gate";

const W = 400, H = 500;
type Phase = "title" | "playing" | "choice" | "ending";
interface Scene { id: number; text: string; speaker: string; bg: string; choices?: { text: string; next: number }[]; ending?: string; }

const SCENES: Scene[] = [
  { id: 0, text: "You arrive at a mysterious mansion on a stormy night...", speaker: "Narrator", bg: "#1a0a2e" },
  { id: 1, text: "A beautiful woman opens the door. 'Welcome, I've been expecting you.'", speaker: "???", bg: "#2a1a3e", choices: [{ text: "Enter the mansion", next: 2 }, { text: "Ask who she is", next: 3 }] },
  { id: 2, text: "The interior is lavish. Candles flicker in the dim light.", speaker: "Narrator", bg: "#1a1a0a", choices: [{ text: "Explore the library", next: 4 }, { text: "Follow her upstairs", next: 5 }] },
  { id: 3, text: "'I am Lady Scarlet. This mansion holds many... secrets.'", speaker: "Lady Scarlet", bg: "#2a0a1a", choices: [{ text: "Enter the mansion", next: 2 }, { text: "Leave", next: 7 }] },
  { id: 4, text: "The library contains ancient tomes. One book glows faintly...", speaker: "Narrator", bg: "#0a1a2a", choices: [{ text: "Read the glowing book", next: 6 }, { text: "Go back", next: 2 }] },
  { id: 5, text: "She leads you to a private chamber. 'Make yourself comfortable...'", speaker: "Lady Scarlet", bg: "#2a0a2a", ending: "Romance Ending - You spend the night at the mansion." },
  { id: 6, text: "The book reveals the mansion's dark history and a hidden treasure!", speaker: "Narrator", bg: "#1a2a0a", ending: "Mystery Ending - You discover the mansion's secret treasure." },
  { id: 7, text: "You walk away into the storm. Some mysteries are best left unsolved.", speaker: "Narrator", bg: "#0a0a1a", ending: "Escape Ending - You chose safety over adventure." },
];

export default function AdultVN() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [sceneIdx, setSceneIdx] = useState(0);
  const [textProgress, setTextProgress] = useState(0);
  const [endings, setEndings] = useState<string[]>([]);
  const [blocked, setBlocked] = useState(false);
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  const startGame = useCallback(() => { setSceneIdx(0); setTextProgress(0); setPhase("playing"); }, []);

  const advance = useCallback(() => {
    const scene = SCENES[sceneIdx];
    if (!scene) return;
    const fullLen = scene.text.length;
    if (textProgress < fullLen) { setTextProgress(fullLen); return; }
    if (scene.ending) {
      if (!endings.includes(scene.ending)) setEndings(e => [...e, scene.ending!]);
      setPhase("ending"); return;
    }
    if (scene.choices) { setPhase("choice"); return; }
    if (sceneIdx + 1 < SCENES.length) { setSceneIdx(sceneIdx + 1); setTextProgress(0); setPhase("playing"); }
  }, [sceneIdx, textProgress, endings]);

  const choose = useCallback((next: number) => {
    setSceneIdx(next); setTextProgress(0); setPhase("playing");
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
      const scene = SCENES[sceneIdx];

      if (phase === "playing" && scene) {
        setTextProgress(p => Math.min(p + dt * 30, scene.text.length));
      }

      ctx.save(); ctx.scale(dpr, dpr);
      ctx.fillStyle = scene?.bg || "#0f0f0f"; ctx.fillRect(0, 0, W, H);

      if (phase === "title") {
        ctx.fillStyle = "#a55eea"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Visual Novel", W / 2, H / 2 - 50);
        ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
        ctx.fillText("A branching story adventure", W / 2, H / 2 - 20);
        ctx.fillText("Click to Start", W / 2, H / 2 + 10);
        ctx.fillStyle = "#666"; ctx.font = "12px sans-serif";
        ctx.fillText(`Endings found: ${endings.length}/3`, W / 2, H / 2 + 40);
      } else if (scene) {
        // Character area
        ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(0, 0, W, H - 160);
        // Speaker silhouette
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.beginPath(); ctx.arc(W / 2, H / 2 - 60, 80, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(scene.speaker, W / 2, H / 2 - 50);
        // Text box
        ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.beginPath(); ctx.roundRect(10, H - 160, W - 20, 150, 8); ctx.fill();
        ctx.strokeStyle = "#a55eea"; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(10, H - 160, W - 20, 150, 8); ctx.stroke();
        // Speaker name
        ctx.fillStyle = "#a55eea"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(scene.speaker, 24, H - 138);
        // Text
        const displayText = scene.text.substring(0, Math.floor(textProgress));
        ctx.fillStyle = "#ddd"; ctx.font = "14px sans-serif";
        const words = displayText.split(" "); let line = ""; let ly = H - 114;
        for (const word of words) {
          const test = line + word + " ";
          if (ctx.measureText(test).width > W - 50) { ctx.fillText(line, 24, ly); ly += 20; line = word + " "; }
          else line = test;
        }
        ctx.fillText(line, 24, ly);

        if (phase === "choice" && scene.choices) {
          for (let i = 0; i < scene.choices.length; i++) {
            const cy = H - 80 + i * 36;
            ctx.fillStyle = "#2a1a3e"; ctx.beginPath(); ctx.roundRect(30, cy, W - 60, 30, 6); ctx.fill();
            ctx.strokeStyle = "#a55eea"; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(30, cy, W - 60, 30, 6); ctx.stroke();
            ctx.fillStyle = "#fff"; ctx.font = "14px sans-serif"; ctx.textAlign = "center";
            ctx.fillText(scene.choices[i].text, W / 2, cy + 20);
          }
        }
        if (phase === "ending") {
          ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, W, H - 160);
          ctx.fillStyle = "#ffd700"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("Ending Reached", W / 2, H / 2 - 80);
          ctx.fillStyle = "#fff"; ctx.font = "14px sans-serif";
          ctx.fillText(scene.ending || "", W / 2, H / 2 - 50);
          ctx.fillStyle = "#aaa"; ctx.font = "12px sans-serif";
          ctx.fillText("Click to play again", W / 2, H / 2 - 20);
        }
      }
      ctx.restore();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const onClick = (e: MouseEvent) => {
      if (phase === "title" || phase === "ending") { startGame(); return; }
      if (phase === "choice") {
        const rect = canvas.getBoundingClientRect();
        const my = (e.clientY - rect.top) * (H / rect.height);
        const scene = SCENES[sceneIdx];
        if (scene?.choices) {
          for (let i = 0; i < scene.choices.length; i++) {
            const cy = H - 80 + i * 36;
            if (my >= cy && my <= cy + 30) { choose(scene.choices[i].next); return; }
          }
        }
      }
      advance();
    };
    const onTouch = (e: TouchEvent) => { e.preventDefault(); onClick({ clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY } as MouseEvent); };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => { cancelAnimationFrame(rafRef.current); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchend", onTouch); };
  }, [phase, sceneIdx, textProgress, endings, startGame, advance, choose]);

  if (blocked) return (
    <div className="min-h-screen bg-[#0f0f0f] text-white"><Header />
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <Lock size={48} className="mx-auto text-gray-600 mb-4" />
        <h1 className="text-xl font-bold mb-2">Access Restricted</h1>
        <p className="text-gray-400">This content requires adult mode (NC-17).</p>
        <Link href="/games" className="mt-4 inline-block text-[#3ea6ff]">Back to Games</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link>
        <div className="flex items-center gap-2 mb-4"><BookOpen size={24} className="text-[#a55eea]" /><h1 className="text-xl font-bold">Visual Novel</h1></div>
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" />
        <button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#a55eea] rounded-lg text-sm font-medium hover:bg-[#a55eea]/80"><RotateCcw size={14} /> Restart</button>
      </div>
    </div>
  );
}
