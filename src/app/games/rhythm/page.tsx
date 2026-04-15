"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Music } from "lucide-react";

const W = 400, H = 600, LANES = 4, LANE_W = 80, NOTE_H = 20, HIT_Y = H - 80;
type Phase = "title" | "playing" | "gameover";
interface Note { lane: number; y: number; hit: boolean; missed: boolean; }
const LANE_COLORS = ["#ff4757", "#3ea6ff", "#2ed573", "#ffa502"];
const LANE_KEYS = ["d", "f", "j", "k"];

export default function RhythmGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [score, setScore] = useState(0);
  const sRef = useRef({ notes: [] as Note[], score: 0, combo: 0, maxCombo: 0, speed: 300, spawnTimer: 0, hitFlash: [-1, -1, -1, -1], perfect: 0, good: 0, miss: 0 });
  const keysRef = useRef(new Set<string>());
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  const startGame = useCallback(() => {
    sRef.current = { notes: [], score: 0, combo: 0, maxCombo: 0, speed: 300, spawnTimer: 0, hitFlash: [-1, -1, -1, -1], perfect: 0, good: 0, miss: 0 };
    setScore(0); setPhase("playing"); lastRef.current = 0;
  }, []);

  const hitLane = useCallback((lane: number) => {
    const s = sRef.current;
    const note = s.notes.find(n => !n.hit && !n.missed && n.lane === lane && Math.abs(n.y - HIT_Y) < 50);
    if (note) {
      note.hit = true;
      const dist = Math.abs(note.y - HIT_Y);
      if (dist < 15) { s.score += 100 * (1 + Math.floor(s.combo / 10)); s.perfect++; }
      else { s.score += 50 * (1 + Math.floor(s.combo / 10)); s.good++; }
      s.combo++; s.maxCombo = Math.max(s.maxCombo, s.combo);
      s.hitFlash[lane] = 0.2;
      setScore(s.score);
    }
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
        s.speed = Math.min(500, 300 + s.score * 0.02);
        s.spawnTimer -= dt;
        if (s.spawnTimer <= 0) {
          s.spawnTimer = 0.3 + Math.random() * 0.4;
          const lane = Math.floor(Math.random() * LANES);
          s.notes.push({ lane, y: -NOTE_H, hit: false, missed: false });
        }
        for (const n of s.notes) {
          if (!n.hit && !n.missed) n.y += s.speed * dt;
          if (!n.hit && !n.missed && n.y > HIT_Y + 60) { n.missed = true; s.combo = 0; s.miss++; }
        }
        s.notes = s.notes.filter(n => n.y < H + 40 || n.hit);
        for (let i = 0; i < 4; i++) if (s.hitFlash[i] > 0) s.hitFlash[i] -= dt;
        if (s.miss >= 20) { setPhase("gameover"); }
      }

      ctx.save(); ctx.scale(dpr, dpr);
      ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, W, H);
      const laneStart = (W - LANES * LANE_W) / 2;

      if (phase === "title") {
        ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 32px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Rhythm Game", W / 2, H / 2 - 40);
        ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
        ctx.fillText("Keys: D F J K", W / 2, H / 2);
        ctx.fillText("Click to Start", W / 2, H / 2 + 30);
      } else {
        // Lane backgrounds
        for (let i = 0; i < LANES; i++) {
          const lx = laneStart + i * LANE_W;
          ctx.fillStyle = `rgba(${i === 0 ? "255,71,87" : i === 1 ? "62,166,255" : i === 2 ? "46,213,115" : "255,165,2"}, 0.05)`;
          ctx.fillRect(lx, 0, LANE_W, H);
          ctx.strokeStyle = "#222"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, H); ctx.stroke();
        }
        // Hit line
        ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fillRect(laneStart, HIT_Y - 2, LANES * LANE_W, 4);
        // Hit zone indicators
        for (let i = 0; i < LANES; i++) {
          const lx = laneStart + i * LANE_W;
          const flash = s.hitFlash[i] > 0;
          ctx.fillStyle = flash ? LANE_COLORS[i] : "rgba(255,255,255,0.1)";
          ctx.beginPath(); ctx.roundRect(lx + 4, HIT_Y - 12, LANE_W - 8, 24, 6); ctx.fill();
          ctx.fillStyle = flash ? "#fff" : "#666"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(LANE_KEYS[i].toUpperCase(), lx + LANE_W / 2, HIT_Y + 4);
        }
        // Notes
        for (const n of s.notes) {
          if (n.hit || n.missed) continue;
          const lx = laneStart + n.lane * LANE_W;
          ctx.fillStyle = LANE_COLORS[n.lane];
          ctx.beginPath(); ctx.roundRect(lx + 6, n.y - NOTE_H / 2, LANE_W - 12, NOTE_H, 4); ctx.fill();
        }
        // HUD
        ctx.fillStyle = "#fff"; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`${s.score}`, 10, 30);
        ctx.fillStyle = s.combo > 10 ? "#ffd700" : "#aaa"; ctx.font = "bold 14px sans-serif";
        ctx.fillText(`${s.combo}x combo`, 10, 52);
        ctx.fillStyle = "#ff4757"; ctx.font = "12px sans-serif"; ctx.textAlign = "right";
        ctx.fillText(`Miss: ${s.miss}/20`, W - 10, 30);
        // Touch buttons at bottom
        for (let i = 0; i < LANES; i++) {
          const lx = laneStart + i * LANE_W;
          ctx.fillStyle = `rgba(${i === 0 ? "255,71,87" : i === 1 ? "62,166,255" : i === 2 ? "46,213,115" : "255,165,2"}, 0.2)`;
          ctx.beginPath(); ctx.roundRect(lx + 2, H - 50, LANE_W - 4, 44, 8); ctx.fill();
        }

        if (phase === "gameover") {
          ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = "#ff4757"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("Game Over", W / 2, H / 2 - 40);
          ctx.fillStyle = "#fff"; ctx.font = "18px sans-serif";
          ctx.fillText(`Score: ${s.score}`, W / 2, H / 2 - 6);
          ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
          ctx.fillText(`Max Combo: ${s.maxCombo} | Perfect: ${s.perfect} | Good: ${s.good}`, W / 2, H / 2 + 24);
          ctx.fillText("Click to Restart", W / 2, H / 2 + 54);
        }
      }
      ctx.restore();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && phase !== "playing") { startGame(); return; }
      const idx = LANE_KEYS.indexOf(e.key.toLowerCase());
      if (idx >= 0 && phase === "playing") hitLane(idx);
    };
    const onClick = (e: MouseEvent) => {
      if (phase !== "playing") { startGame(); return; }
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const laneStart = (W - LANES * LANE_W) / 2;
      const lane = Math.floor((mx - laneStart) / LANE_W);
      if (lane >= 0 && lane < LANES) hitLane(lane);
    };
    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      if (phase !== "playing") { startGame(); return; }
      const rect = canvas.getBoundingClientRect();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const mx = (t.clientX - rect.left) * (W / rect.width);
        const laneStart = (W - LANES * LANE_W) / 2;
        const lane = Math.floor((mx - laneStart) / LANE_W);
        if (lane >= 0 && lane < LANES) hitLane(lane);
      }
    };
    window.addEventListener("keydown", onKey);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchstart", onTouch, { passive: false });
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("keydown", onKey); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchstart", onTouch); };
  }, [phase, startGame, hitLane]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link>
        <div className="flex items-center gap-2 mb-4"><Music size={24} className="text-[#3ea6ff]" /><h1 className="text-xl font-bold">Rhythm Game</h1></div>
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" />
        <button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3ea6ff] rounded-lg text-sm font-medium hover:bg-[#3ea6ff]/80"><RotateCcw size={14} /> Restart</button>
      </div>
    </div>
  );
}
