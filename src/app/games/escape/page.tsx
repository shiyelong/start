"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, KeyRound } from "lucide-react";

const W = 400, H = 480;
type Phase = "title" | "playing" | "win" | "gameover";
interface Puzzle { id: number; type: "code" | "switch" | "sequence"; solved: boolean; x: number; y: number; w: number; h: number; data: number[]; answer: number[]; attempts: number; }
interface Room { puzzles: Puzzle[]; keysNeeded: number; keysFound: number; doorX: number; doorY: number; }

function generateRoom(level: number): Room {
  const puzzles: Puzzle[] = [];
  const count = 2 + Math.min(level, 3);
  for (let i = 0; i < count; i++) {
    const type = (["code", "switch", "sequence"] as const)[i % 3];
    const len = type === "code" ? 3 + Math.min(level, 2) : type === "switch" ? 4 : 3 + Math.min(level, 2);
    const answer = Array.from({ length: len }, () => Math.floor(Math.random() * (type === "switch" ? 2 : 4)));
    puzzles.push({ id: i, type, solved: false, x: 40 + (i % 3) * 120, y: 100 + Math.floor(i / 3) * 140, w: 100, h: 100, data: Array(len).fill(0), answer, attempts: 0 });
  }
  return { puzzles, keysNeeded: count, keysFound: 0, doorX: W / 2 - 30, doorY: 20 };
}

export default function EscapeRoom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [hint, setHint] = useState("");
  const sRef = useRef<Room>(generateRoom(1));
  const rafRef = useRef(0);

  const startGame = useCallback(() => {
    sRef.current = generateRoom(1); setScore(0); setLevel(1); setPhase("playing"); setHint("Solve puzzles to find keys!");
  }, []);

  const nextLevel = useCallback(() => {
    const nl = level + 1; setLevel(nl); sRef.current = generateRoom(nl); setHint(`Room ${nl}!`);
  }, [level]);

  const handleClick = useCallback((mx: number, my: number) => {
    if (phase === "title" || phase === "gameover") { startGame(); return; }
    if (phase === "win") { nextLevel(); setPhase("playing"); return; }
    const room = sRef.current;
    // Check door
    if (room.keysFound >= room.keysNeeded && mx >= room.doorX && mx <= room.doorX + 60 && my >= room.doorY && my <= room.doorY + 50) {
      setScore(s => s + level * 100); setPhase("win"); setHint("Room cleared!"); return;
    }
    // Check puzzles
    for (const p of room.puzzles) {
      if (p.solved) continue;
      if (mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h) {
        // Cycle the clicked element
        const relX = mx - p.x;
        const idx = Math.floor(relX / (p.w / p.data.length));
        if (idx >= 0 && idx < p.data.length) {
          const max = p.type === "switch" ? 2 : 4;
          p.data[idx] = (p.data[idx] + 1) % max;
          p.attempts++;
          // Check solution
          if (p.data.every((v, i) => v === p.answer[i])) {
            p.solved = true; room.keysFound++;
            setScore(s => s + Math.max(10, 50 - p.attempts * 5));
            setHint(`Key found! (${room.keysFound}/${room.keysNeeded})`);
          }
        }
        return;
      }
    }
  }, [phase, level, startGame, nextLevel]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;

    const COLORS = ["#333", "#3ea6ff", "#2ed573", "#ffa502"];

    const render = () => {
      ctx.save(); ctx.scale(dpr, dpr);
      ctx.fillStyle = "#0f0f0f"; ctx.fillRect(0, 0, W, H);
      const room = sRef.current;

      if (phase === "title") {
        ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Escape Room", W / 2, H / 2 - 40);
        ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
        ctx.fillText("Solve puzzles to escape!", W / 2, H / 2 - 10);
        ctx.fillText("Click to Start", W / 2, H / 2 + 20);
      } else {
        // Room walls
        ctx.strokeStyle = "#333"; ctx.lineWidth = 3;
        ctx.strokeRect(10, 10, W - 20, H - 60);
        // Door
        const doorOpen = room.keysFound >= room.keysNeeded;
        ctx.fillStyle = doorOpen ? "#2ed573" : "#555";
        ctx.fillRect(room.doorX, room.doorY, 60, 50);
        ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(doorOpen ? "EXIT" : "LOCKED", room.doorX + 30, room.doorY + 30);
        // Puzzles
        for (const p of room.puzzles) {
          ctx.fillStyle = p.solved ? "#1a3a1a" : "#1a1a2e";
          ctx.strokeStyle = p.solved ? "#2ed573" : "#3ea6ff";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, 8); ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#aaa"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(p.solved ? "SOLVED" : p.type.toUpperCase(), p.x + p.w / 2, p.y + 14);
          if (!p.solved) {
            const slotW = p.w / p.data.length;
            for (let i = 0; i < p.data.length; i++) {
              const sx = p.x + i * slotW + 4, sy = p.y + 24, sw = slotW - 8, sh = p.h - 36;
              ctx.fillStyle = COLORS[p.data[i]]; ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, 4); ctx.fill();
              if (p.type === "switch") {
                ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(p.data[i] ? "ON" : "OFF", sx + sw / 2, sy + sh / 2);
              } else {
                ctx.fillStyle = "#fff"; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(`${p.data[i]}`, sx + sw / 2, sy + sh / 2);
              }
            }
          } else {
            ctx.fillStyle = "#2ed573"; ctx.font = "bold 24px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("*", p.x + p.w / 2, p.y + p.h / 2 + 6);
          }
        }
        // HUD
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, H - 45, W, 45);
        ctx.fillStyle = "#fff"; ctx.font = "14px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`Room: ${level}  Keys: ${room.keysFound}/${room.keysNeeded}  Score: ${score}`, 10, H - 22);
        ctx.fillStyle = "#ffd700"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(hint, W / 2, H - 6);

        if (phase === "win") {
          ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = "#2ed573"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("Room Cleared!", W / 2, H / 2 - 10);
          ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
          ctx.fillText("Click for next room", W / 2, H / 2 + 20);
        }
        if (phase === "gameover") {
          ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = "#ff4757"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("Game Over", W / 2, H / 2); ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
          ctx.fillText("Click to Restart", W / 2, H / 2 + 30);
        }
      }
      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    const onClick = (e: MouseEvent) => { const rect = canvas.getBoundingClientRect(); handleClick((e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height)); };
    const onTouch = (e: TouchEvent) => { e.preventDefault(); const t = e.changedTouches[0]; const rect = canvas.getBoundingClientRect(); handleClick((t.clientX - rect.left) * (W / rect.width), (t.clientY - rect.top) * (H / rect.height)); };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => { cancelAnimationFrame(rafRef.current); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchend", onTouch); };
  }, [phase, score, level, hint, handleClick]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link>
        <div className="flex items-center gap-2 mb-4"><KeyRound size={24} className="text-[#3ea6ff]" /><h1 className="text-xl font-bold">Escape Room</h1></div>
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" />
        <button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3ea6ff] rounded-lg text-sm font-medium hover:bg-[#3ea6ff]/80"><RotateCcw size={14} /> Restart</button>
      </div>
    </div>
  );
}
