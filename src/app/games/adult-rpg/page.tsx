"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Sword, Lock } from "lucide-react";
import { ageGate } from "@/lib/age-gate";

const W = 400, H = 400, TILE = 32, COLS = 12, ROWS = 10;
type Phase = "title" | "playing" | "gameover";
interface Entity { x: number; y: number; hp: number; maxHp: number; atk: number; sprite: string; color: string; }

export default function AdultRPG() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [score, setScore] = useState(0);
  const [log, setLog] = useState("");
  const [blocked, setBlocked] = useState(false);
  const sRef = useRef({ player: { x: 1, y: 1, hp: 25, maxHp: 25, atk: 5, sprite: "@", color: "#a55eea" } as Entity, enemies: [] as Entity[], map: [] as number[][], level: 1, score: 0, exp: 0 });
  const rafRef = useRef(0);

  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  const genMap = () => {
    const m: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) m[r][c] = 1; else if (Math.random() < 0.15) m[r][c] = 1; }
    m[1][1] = 0; return m;
  };

  const startGame = useCallback(() => {
    const enemies: Entity[] = [];
    for (let i = 0; i < 5; i++) { enemies.push({ x: 3 + Math.floor(Math.random() * 7), y: 2 + Math.floor(Math.random() * 6), hp: 5, maxHp: 5, atk: 3, sprite: "D", color: "#ff4757" }); }
    sRef.current = { player: { x: 1, y: 1, hp: 25, maxHp: 25, atk: 5, sprite: "@", color: "#a55eea" }, enemies, map: genMap(), level: 1, score: 0, exp: 0 };
    setScore(0); setPhase("playing"); setLog("Explore the dungeon!");
  }, []);

  const tryMove = useCallback((dx: number, dy: number) => {
    const s = sRef.current; const nx = s.player.x + dx, ny = s.player.y + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || s.map[ny][nx] === 1) return;
    const enemy = s.enemies.find(e => e.hp > 0 && e.x === nx && e.y === ny);
    if (enemy) {
      const dmg = Math.max(1, s.player.atk - 1); enemy.hp -= dmg;
      const eDmg = Math.max(1, enemy.atk - 1); s.player.hp -= eDmg;
      setLog(`Hit for ${dmg}, took ${eDmg}`);
      if (enemy.hp <= 0) { s.score += 100; s.exp += 20; setScore(s.score); setLog("Enemy defeated! +100"); if (s.exp >= 50) { s.player.atk += 1; s.player.maxHp += 5; s.player.hp = Math.min(s.player.hp + 10, s.player.maxHp); s.exp = 0; setLog("Level up!"); } }
      if (s.player.hp <= 0) { setPhase("gameover"); setLog("Defeated!"); }
      if (!s.enemies.some(e => e.hp > 0)) {
        s.level++; s.map = genMap(); s.player.x = 1; s.player.y = 1;
        for (let i = 0; i < 4 + s.level; i++) s.enemies.push({ x: 3 + Math.floor(Math.random() * 7), y: 2 + Math.floor(Math.random() * 6), hp: 5 + s.level * 2, maxHp: 5 + s.level * 2, atk: 3 + s.level, sprite: "D", color: "#ff4757" });
        setLog(`Floor ${s.level}!`);
      }
    } else { s.player.x = nx; s.player.y = ny; }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    const render = () => {
      ctx.save(); ctx.scale(dpr, dpr); ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, W, H);
      const s = sRef.current;
      if (phase === "title") {
        ctx.fillStyle = "#a55eea"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Adult RPG", W / 2, H / 2 - 30); ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
        ctx.fillText("Click to Start", W / 2, H / 2 + 10);
      } else {
        const ox = (W - COLS * TILE) / 2, oy = 4;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { ctx.fillStyle = s.map[r][c] === 1 ? "#333" : "#1a0a2e"; ctx.fillRect(ox + c * TILE, oy + r * TILE, TILE - 1, TILE - 1); }
        for (const e of s.enemies) { if (e.hp <= 0) continue; ctx.fillStyle = e.color; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(e.sprite, ox + e.x * TILE + TILE / 2, oy + e.y * TILE + TILE / 2); }
        ctx.fillStyle = s.player.color; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(s.player.sprite, ox + s.player.x * TILE + TILE / 2, oy + s.player.y * TILE + TILE / 2);
        ctx.fillStyle = "#fff"; ctx.font = "13px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`HP:${s.player.hp}/${s.player.maxHp} ATK:${s.player.atk} Floor:${s.level} Score:${s.score}`, 8, ROWS * TILE + 20);
        ctx.fillStyle = "#aaa"; ctx.font = "12px sans-serif"; ctx.fillText(log, 8, ROWS * TILE + 40);
        if (phase === "gameover") { ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "#ff4757"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center"; ctx.fillText("Game Over", W / 2, H / 2 - 10); ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif"; ctx.fillText(`Score: ${s.score}`, W / 2, H / 2 + 20); ctx.fillText("Click to Restart", W / 2, H / 2 + 44); }
      }
      ctx.restore(); rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    const onKey = (e: KeyboardEvent) => { if (phase === "title" || phase === "gameover") { startGame(); return; } if (phase !== "playing") return; switch (e.key) { case "ArrowUp": case "w": tryMove(0, -1); break; case "ArrowDown": case "s": tryMove(0, 1); break; case "ArrowLeft": case "a": tryMove(-1, 0); break; case "ArrowRight": case "d": tryMove(1, 0); break; } };
    const onClick = () => { if (phase !== "playing") startGame(); };
    let ts: { x: number; y: number } | null = null;
    const onTS = (e: TouchEvent) => { e.preventDefault(); ts = { x: e.touches[0].clientX, y: e.touches[0].clientY }; if (phase !== "playing") startGame(); };
    const onTE = (e: TouchEvent) => { if (!ts) return; const t = e.changedTouches[0]; const dx = t.clientX - ts.x, dy = t.clientY - ts.y; if (Math.abs(dx) + Math.abs(dy) < 20) return; if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? 1 : -1, 0); else tryMove(0, dy > 0 ? 1 : -1); ts = null; };
    window.addEventListener("keydown", onKey); canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchstart", onTS, { passive: false }); canvas.addEventListener("touchend", onTE);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("keydown", onKey); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchstart", onTS); canvas.removeEventListener("touchend", onTE); };
  }, [phase, score, log, startGame, tryMove]);

  if (blocked) return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-20 text-center"><Lock size={48} className="mx-auto text-gray-600 mb-4" /><h1 className="text-xl font-bold mb-2">Access Restricted</h1><p className="text-gray-400">NC-17 mode required.</p><Link href="/games" className="mt-4 inline-block text-[#3ea6ff]">Back</Link></div></div>);

  return (<div className="min-h-screen bg-[#0f0f0f] text-white"><Header /><div className="max-w-lg mx-auto px-4 py-6"><Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link><div className="flex items-center gap-2 mb-4"><Sword size={24} className="text-[#a55eea]" /><h1 className="text-xl font-bold">Adult RPG</h1></div><canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" /><button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#a55eea] rounded-lg text-sm font-medium hover:bg-[#a55eea]/80"><RotateCcw size={14} /> Restart</button></div></div>);
}
