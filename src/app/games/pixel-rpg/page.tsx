"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Sword } from "lucide-react";

const W = 400, H = 400, TILE = 32, COLS = 12, ROWS = 12;
type Phase = "title" | "playing" | "battle" | "gameover";
interface Entity { x: number; y: number; hp: number; maxHp: number; atk: number; def: number; sprite: string; color: string; }
interface Item { x: number; y: number; type: "potion" | "key" | "sword"; }

function generateMap(): number[][] {
  const map: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) map[r][c] = 1;
    else if (Math.random() < 0.2) map[r][c] = 1;
  }
  map[1][1] = 0; map[ROWS - 2][COLS - 2] = 0;
  return map;
}

function spawnEnemies(level: number): Entity[] {
  const enemies: Entity[] = [];
  const count = 3 + level;
  for (let i = 0; i < count; i++) {
    let x, y;
    do { x = 2 + Math.floor(Math.random() * (COLS - 4)); y = 2 + Math.floor(Math.random() * (ROWS - 4)); } while (x < 3 && y < 3);
    enemies.push({ x, y, hp: 3 + level, maxHp: 3 + level, atk: 2 + Math.floor(level / 2), def: 1, sprite: "E", color: "#ff4757" });
  }
  return enemies;
}

function spawnItems(): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < 3; i++) {
    items.push({ x: 2 + Math.floor(Math.random() * (COLS - 4)), y: 2 + Math.floor(Math.random() * (ROWS - 4)), type: i === 0 ? "sword" : "potion" });
  }
  return items;
}

export default function PixelRPG() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [log, setLog] = useState("Explore the dungeon!");
  const stateRef = useRef({ player: { x: 1, y: 1, hp: 20, maxHp: 20, atk: 4, def: 2, sprite: "@", color: "#3ea6ff" } as Entity, enemies: [] as Entity[], items: [] as Item[], map: [] as number[][], level: 1, score: 0 });
  const rafRef = useRef(0);

  const startGame = useCallback(() => {
    const map = generateMap();
    stateRef.current = { player: { x: 1, y: 1, hp: 20, maxHp: 20, atk: 4, def: 2, sprite: "@", color: "#3ea6ff" }, enemies: spawnEnemies(1), items: spawnItems(), map, level: 1, score: 0 };
    setPhase("playing"); setScore(0); setLevel(1); setLog("Explore the dungeon!");
  }, []);

  const tryMove = useCallback((dx: number, dy: number) => {
    const s = stateRef.current; if (!s) return;
    const nx = s.player.x + dx, ny = s.player.y + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || s.map[ny][nx] === 1) return;
    const enemy = s.enemies.find(e => e.hp > 0 && e.x === nx && e.y === ny);
    if (enemy) {
      const dmg = Math.max(1, s.player.atk - enemy.def);
      enemy.hp -= dmg; setLog(`Hit enemy for ${dmg} dmg!`);
      if (enemy.hp <= 0) { s.score += 50; setScore(s.score); setLog("Enemy defeated!"); }
      const eDmg = Math.max(1, enemy.atk - s.player.def);
      if (enemy.hp > 0) { s.player.hp -= eDmg; setLog(`Hit for ${dmg}, took ${eDmg} dmg`); }
      if (s.player.hp <= 0) { setPhase("gameover"); setLog("You died!"); return; }
    } else {
      s.player.x = nx; s.player.y = ny;
      const item = s.items.find(i => i.x === nx && i.y === ny);
      if (item) {
        s.items = s.items.filter(i => i !== item);
        if (item.type === "potion") { s.player.hp = Math.min(s.player.hp + 5, s.player.maxHp); setLog("+5 HP!"); }
        else if (item.type === "sword") { s.player.atk += 2; setLog("+2 ATK!"); }
        else { s.score += 100; setScore(s.score); setLog("+100 pts!"); }
      }
    }
    // Enemy AI
    for (const e of s.enemies) {
      if (e.hp <= 0) continue;
      const edx = Math.sign(s.player.x - e.x), edy = Math.sign(s.player.y - e.y);
      if (Math.random() < 0.5) { const tnx = e.x + edx; if (tnx >= 0 && tnx < COLS && s.map[e.y][tnx] !== 1) e.x = tnx; }
      else { const tny = e.y + edy; if (tny >= 0 && tny < ROWS && s.map[tny][e.x] !== 1) e.y = tny; }
    }
    // Check level clear
    if (!s.enemies.some(e => e.hp > 0)) {
      s.level++; setLevel(s.level); s.enemies = spawnEnemies(s.level); s.items = [...s.items, ...spawnItems()];
      s.map = generateMap(); s.player.x = 1; s.player.y = 1;
      s.player.hp = Math.min(s.player.hp + 5, s.player.maxHp);
      setLog(`Floor ${s.level}!`);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;

    const render = () => {
      ctx.save(); ctx.scale(dpr, dpr);
      ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, W, H);
      const s = stateRef.current;
      if (phase === "title") {
        ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Pixel Dungeon RPG", W / 2, H / 2 - 30);
        ctx.fillStyle = "#aaa"; ctx.font = "16px sans-serif";
        ctx.fillText("Click or press Enter to start", W / 2, H / 2 + 10);
      } else {
        const ox = (W - COLS * TILE) / 2, oy = 10;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          ctx.fillStyle = s.map[r][c] === 1 ? "#333" : "#1a1a2e";
          ctx.fillRect(ox + c * TILE, oy + r * TILE, TILE - 1, TILE - 1);
        }
        for (const item of s.items) {
          ctx.fillStyle = item.type === "potion" ? "#2ed573" : item.type === "sword" ? "#ffa502" : "#ffd700";
          ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(item.type === "potion" ? "+" : item.type === "sword" ? "/" : "*", ox + item.x * TILE + TILE / 2, oy + item.y * TILE + TILE / 2);
        }
        for (const e of s.enemies) {
          if (e.hp <= 0) continue;
          ctx.fillStyle = e.color; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(e.sprite, ox + e.x * TILE + TILE / 2, oy + e.y * TILE + TILE / 2);
          ctx.fillStyle = "#ff4757"; ctx.fillRect(ox + e.x * TILE + 2, oy + e.y * TILE - 2, (TILE - 4) * (e.hp / e.maxHp), 3);
        }
        ctx.fillStyle = s.player.color; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(s.player.sprite, ox + s.player.x * TILE + TILE / 2, oy + s.player.y * TILE + TILE / 2);
        // HUD
        ctx.fillStyle = "#fff"; ctx.font = "14px sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`HP: ${s.player.hp}/${s.player.maxHp}  ATK: ${s.player.atk}  DEF: ${s.player.def}`, 10, ROWS * TILE + 30);
        ctx.fillText(`Floor: ${level}  Score: ${score}`, 10, ROWS * TILE + 50);
        ctx.fillStyle = "#aaa"; ctx.font = "12px sans-serif"; ctx.fillText(log, 10, ROWS * TILE + 70);
        if (phase === "gameover") {
          ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = "#ff4757"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("Game Over", W / 2, H / 2 - 20);
          ctx.fillStyle = "#aaa"; ctx.font = "16px sans-serif";
          ctx.fillText(`Score: ${score}`, W / 2, H / 2 + 10);
          ctx.fillText("Click to Restart", W / 2, H / 2 + 40);
        }
      }
      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    const onKey = (e: KeyboardEvent) => {
      if (phase === "title" || phase === "gameover") { if (e.key === "Enter" || e.key === " ") startGame(); return; }
      if (phase !== "playing") return;
      switch (e.key) {
        case "ArrowUp": case "w": tryMove(0, -1); break;
        case "ArrowDown": case "s": tryMove(0, 1); break;
        case "ArrowLeft": case "a": tryMove(-1, 0); break;
        case "ArrowRight": case "d": tryMove(1, 0); break;
      }
    };
    const onClick = (e: MouseEvent) => {
      if (phase === "title" || phase === "gameover") { startGame(); return; }
    };
    let touchStart: { x: number; y: number } | null = null;
    const onTouchStart = (e: TouchEvent) => { e.preventDefault(); const t = e.touches[0]; touchStart = { x: t.clientX, y: t.clientY }; };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStart) return; const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
      if (phase === "title" || phase === "gameover") { startGame(); touchStart = null; return; }
      if (Math.abs(dx) + Math.abs(dy) < 20) { touchStart = null; return; }
      if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? 1 : -1, 0);
      else tryMove(0, dy > 0 ? 1 : -1);
      touchStart = null;
    };
    window.addEventListener("keydown", onKey);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("keydown", onKey); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchstart", onTouchStart); canvas.removeEventListener("touchend", onTouchEnd); };
  }, [phase, score, level, log, startGame, tryMove]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link>
        <div className="flex items-center gap-2 mb-4"><Sword size={24} className="text-[#3ea6ff]" /><h1 className="text-xl font-bold">Pixel Dungeon RPG</h1></div>
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" />
        <button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3ea6ff] rounded-lg text-sm font-medium hover:bg-[#3ea6ff]/80"><RotateCcw size={14} /> Restart</button>
      </div>
    </div>
  );
}
