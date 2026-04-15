"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Shield } from "lucide-react";

const W = 400, H = 480, GRID = 40, COLS = 10, ROWS = 10;
type Phase = "title" | "playing" | "gameover";
type TowerType = "arrow" | "cannon" | "ice";
interface Tower { type: TowerType; x: number; y: number; cooldown: number; range: number; damage: number; }
interface Enemy { x: number; y: number; hp: number; maxHp: number; speed: number; pathIdx: number; reward: number; }
interface Bullet { x: number; y: number; tx: number; ty: number; speed: number; damage: number; color: string; }

const PATH: [number, number][] = [[0,4],[1,4],[2,4],[3,4],[3,3],[3,2],[4,2],[5,2],[6,2],[6,3],[6,4],[6,5],[6,6],[7,6],[8,6],[9,6]];
const TOWER_INFO: Record<TowerType, { cost: number; damage: number; range: number; rate: number; color: string }> = {
  arrow:  { cost: 10, damage: 2, range: 3, rate: 0.8, color: "#3ea6ff" },
  cannon: { cost: 20, damage: 5, range: 2, rate: 1.5, color: "#ff4757" },
  ice:    { cost: 15, damage: 1, range: 3, rate: 1.0, color: "#70a1ff" },
};

export default function TowerDefense() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [score, setScore] = useState(0);
  const [selectedTower, setSelectedTower] = useState<TowerType>("arrow");
  const sRef = useRef({ towers: [] as Tower[], enemies: [] as Enemy[], bullets: [] as Bullet[], gold: 50, lives: 10, wave: 0, spawnTimer: 0, spawnCount: 0, waveDelay: 2, score: 0 });
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  const startGame = useCallback(() => {
    sRef.current = { towers: [], enemies: [], bullets: [], gold: 50, lives: 10, wave: 0, spawnTimer: 0, spawnCount: 0, waveDelay: 2, score: 0 };
    setScore(0); setPhase("playing"); lastRef.current = 0;
  }, []);

  const isPath = (x: number, y: number) => PATH.some(([px, py]) => px === x && py === y);

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
        // Wave spawning
        s.waveDelay -= dt;
        if (s.waveDelay <= 0 && s.spawnCount <= 0) {
          s.wave++; s.spawnCount = 4 + s.wave * 2; s.waveDelay = 0;
        }
        if (s.spawnCount > 0) {
          s.spawnTimer -= dt;
          if (s.spawnTimer <= 0) {
            s.spawnTimer = 0.6;
            const hp = 5 + s.wave * 3;
            s.enemies.push({ x: PATH[0][0] * GRID + GRID / 2, y: PATH[0][1] * GRID + GRID / 2, hp, maxHp: hp, speed: 50 + s.wave * 5, pathIdx: 0, reward: 5 + s.wave });
            s.spawnCount--;
          }
        }
        // Move enemies
        for (const e of s.enemies) {
          if (e.hp <= 0) continue;
          const target = PATH[e.pathIdx + 1];
          if (!target) { e.hp = 0; s.lives--; continue; }
          const tx = target[0] * GRID + GRID / 2, ty = target[1] * GRID + GRID / 2;
          const dx = tx - e.x, dy = ty - e.y, dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 4) { e.pathIdx++; } else { e.x += (dx / dist) * e.speed * dt; e.y += (dy / dist) * e.speed * dt; }
        }
        // Tower shooting
        for (const t of s.towers) {
          t.cooldown -= dt;
          if (t.cooldown > 0) continue;
          const info = TOWER_INFO[t.type];
          const target = s.enemies.find(e => e.hp > 0 && Math.sqrt((e.x - (t.x * GRID + GRID / 2)) ** 2 + (e.y - (t.y * GRID + GRID / 2)) ** 2) < info.range * GRID);
          if (target) {
            t.cooldown = info.rate;
            s.bullets.push({ x: t.x * GRID + GRID / 2, y: t.y * GRID + GRID / 2, tx: target.x, ty: target.y, speed: 300, damage: info.damage, color: info.color });
          }
        }
        // Move bullets
        for (const b of s.bullets) {
          const dx = b.tx - b.x, dy = b.ty - b.y, dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 8) {
            const hit = s.enemies.find(e => e.hp > 0 && Math.sqrt((e.x - b.tx) ** 2 + (e.y - b.ty) ** 2) < 20);
            if (hit) { hit.hp -= b.damage; if (hit.hp <= 0) { s.gold += hit.reward; s.score += hit.reward * 10; setScore(s.score); } }
            b.speed = 0;
          } else { b.x += (dx / dist) * b.speed * dt; b.y += (dy / dist) * b.speed * dt; }
        }
        s.bullets = s.bullets.filter(b => b.speed > 0);
        s.enemies = s.enemies.filter(e => e.hp > 0 || e.pathIdx < PATH.length - 1);
        if (s.enemies.length === 0 && s.spawnCount <= 0) s.waveDelay = 3;
        if (s.lives <= 0) setPhase("gameover");
      }

      ctx.save(); ctx.scale(dpr, dpr);
      ctx.fillStyle = "#0f0f0f"; ctx.fillRect(0, 0, W, H);

      if (phase === "title") {
        ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Tower Defense", W / 2, H / 2 - 30);
        ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
        ctx.fillText("Click to Start", W / 2, H / 2 + 10);
      } else {
        // Grid
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          ctx.fillStyle = isPath(c, r) ? "#2a1a0a" : "#111";
          ctx.fillRect(c * GRID, r * GRID, GRID - 1, GRID - 1);
        }
        // Path
        ctx.strokeStyle = "#4a3a1a"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(PATH[0][0] * GRID + GRID / 2, PATH[0][1] * GRID + GRID / 2);
        for (const [px, py] of PATH) ctx.lineTo(px * GRID + GRID / 2, py * GRID + GRID / 2);
        ctx.stroke();
        // Towers
        for (const t of s.towers) {
          const info = TOWER_INFO[t.type];
          ctx.fillStyle = info.color; ctx.beginPath();
          ctx.arc(t.x * GRID + GRID / 2, t.y * GRID + GRID / 2, GRID / 2 - 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(t.type[0].toUpperCase(), t.x * GRID + GRID / 2, t.y * GRID + GRID / 2);
        }
        // Enemies
        for (const e of s.enemies) {
          if (e.hp <= 0) continue;
          ctx.fillStyle = "#ff4757"; ctx.beginPath(); ctx.arc(e.x, e.y, 10, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#333"; ctx.fillRect(e.x - 10, e.y - 16, 20, 3);
          ctx.fillStyle = "#2ed573"; ctx.fillRect(e.x - 10, e.y - 16, 20 * (e.hp / e.maxHp), 3);
        }
        // Bullets
        for (const b of s.bullets) { ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill(); }
        // HUD
        ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, ROWS * GRID, W, H - ROWS * GRID);
        ctx.fillStyle = "#fff"; ctx.font = "14px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`Wave: ${s.wave}  Gold: ${s.gold}  Lives: ${s.lives}  Score: ${s.score}`, 10, ROWS * GRID + 20);
        // Tower buttons
        const types: TowerType[] = ["arrow", "cannon", "ice"];
        for (let i = 0; i < types.length; i++) {
          const t = types[i], info = TOWER_INFO[t];
          const bx = 10 + i * 130, by = ROWS * GRID + 30;
          ctx.fillStyle = selectedTower === t ? "#2a2a4e" : "#1a1a2e";
          ctx.strokeStyle = info.color; ctx.lineWidth = selectedTower === t ? 2 : 1;
          ctx.beginPath(); ctx.roundRect(bx, by, 120, 36, 6); ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#fff"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(`${t} ($${info.cost})`, bx + 60, by + 22);
        }
        if (phase === "gameover") {
          ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = "#ff4757"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("Game Over", W / 2, H / 2 - 20);
          ctx.fillStyle = "#fff"; ctx.font = "16px sans-serif";
          ctx.fillText(`Score: ${s.score} | Wave: ${s.wave}`, W / 2, H / 2 + 10);
          ctx.fillStyle = "#aaa"; ctx.font = "14px sans-serif";
          ctx.fillText("Click to Restart", W / 2, H / 2 + 40);
        }
      }
      ctx.restore();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const onClick = (e: MouseEvent) => {
      if (phase === "title" || phase === "gameover") { startGame(); return; }
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width), my = (e.clientY - rect.top) * (H / rect.height);
      const s = sRef.current;
      // Tower selection buttons
      const types: TowerType[] = ["arrow", "cannon", "ice"];
      for (let i = 0; i < types.length; i++) {
        const bx = 10 + i * 130, by = ROWS * GRID + 30;
        if (mx >= bx && mx <= bx + 120 && my >= by && my <= by + 36) { setSelectedTower(types[i]); return; }
      }
      // Place tower
      const gx = Math.floor(mx / GRID), gy = Math.floor(my / GRID);
      if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS && !isPath(gx, gy)) {
        const info = TOWER_INFO[selectedTower];
        if (s.gold >= info.cost && !s.towers.some(t => t.x === gx && t.y === gy)) {
          s.gold -= info.cost;
          s.towers.push({ type: selectedTower, x: gx, y: gy, cooldown: 0, range: info.range, damage: info.damage });
        }
      }
    };
    const onTouch = (e: TouchEvent) => { e.preventDefault(); const t = e.changedTouches[0]; onClick({ clientX: t.clientX, clientY: t.clientY } as MouseEvent); };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => { cancelAnimationFrame(rafRef.current); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchend", onTouch); };
  }, [phase, selectedTower, startGame]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link>
        <div className="flex items-center gap-2 mb-4"><Shield size={24} className="text-[#3ea6ff]" /><h1 className="text-xl font-bold">Tower Defense</h1></div>
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" />
        <button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3ea6ff] rounded-lg text-sm font-medium hover:bg-[#3ea6ff]/80"><RotateCcw size={14} /> Restart</button>
      </div>
    </div>
  );
}
