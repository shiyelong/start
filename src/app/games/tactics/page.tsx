"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Swords } from "lucide-react";

const W = 400, H = 480, GRID = 40, COLS = 10, ROWS = 10;
type UnitType = "infantry" | "cavalry" | "archer" | "mage";
type Team = "player" | "enemy";
type Phase = "title" | "select" | "move" | "attack" | "enemy" | "gameover";

interface Unit {
  type: UnitType; team: Team; x: number; y: number;
  hp: number; maxHp: number; atk: number; def: number; range: number; moved: boolean;
}

const UNIT_STATS: Record<UnitType, { hp: number; atk: number; def: number; range: number; color: string; icon: string }> = {
  infantry: { hp: 10, atk: 4, def: 3, range: 1, color: "#3ea6ff", icon: "I" },
  cavalry:  { hp: 8,  atk: 5, def: 2, range: 1, color: "#ff9f43", icon: "C" },
  archer:   { hp: 6,  atk: 4, def: 1, range: 3, color: "#2ed573", icon: "A" },
  mage:     { hp: 5,  atk: 6, def: 1, range: 2, color: "#a55eea", icon: "M" },
};

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function createUnit(type: UnitType, team: Team, x: number, y: number): Unit {
  const s = UNIT_STATS[type];
  return { type, team, x, y, hp: s.hp, maxHp: s.hp, atk: s.atk, def: s.def, range: s.range, moved: false };
}

function initUnits(level: number): Unit[] {
  const units: Unit[] = [
    createUnit("infantry", "player", 1, 7), createUnit("cavalry", "player", 3, 8),
    createUnit("archer", "player", 2, 9), createUnit("mage", "player", 4, 9),
  ];
  const enemyCount = 3 + level;
  const types: UnitType[] = ["infantry", "cavalry", "archer", "mage"];
  for (let i = 0; i < enemyCount; i++) {
    const t = types[i % types.length];
    units.push(createUnit(t, "enemy", 2 + (i % 6), 1 + Math.floor(i / 6)));
  }
  return units;
}

export default function TacticsGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [units, setUnits] = useState<Unit[]>([]);
  const [selected, setSelected] = useState<number>(-1);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [message, setMessage] = useState("");
  const rafRef = useRef(0);

  const startGame = useCallback(() => {
    setUnits(initUnits(1)); setSelected(-1); setScore(0); setLevel(1);
    setPhase("select"); setMessage("Select a unit to move");
  }, []);

  const nextTurn = useCallback((u: Unit[]) => {
    u.forEach(unit => { if (unit.team === "player") unit.moved = false; });
    setUnits([...u]); setPhase("select"); setMessage("Your turn - select a unit");
  }, []);

  const enemyTurn = useCallback((u: Unit[]) => {
    setPhase("enemy"); setMessage("Enemy turn...");
    setTimeout(() => {
      const enemies = u.filter(x => x.team === "enemy" && x.hp > 0);
      const players = u.filter(x => x.team === "player" && x.hp > 0);
      for (const e of enemies) {
        if (players.length === 0) break;
        const target = players.reduce((a, b) => dist(e, a) < dist(e, b) ? a : b);
        if (dist(e, target) <= e.range) {
          const dmg = Math.max(1, e.atk - target.def);
          target.hp -= dmg;
        } else {
          const dx = Math.sign(target.x - e.x), dy = Math.sign(target.y - e.y);
          const nx = e.x + dx, ny = e.y + dy;
          if (!u.some(o => o.hp > 0 && o.x === nx && o.y === ny) && nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
            e.x = nx; e.y = ny;
          }
        }
      }
      const alive = u.filter(x => x.hp > 0);
      setUnits([...alive]);
      if (!alive.some(x => x.team === "player")) { setPhase("gameover"); setMessage("Defeat!"); }
      else if (!alive.some(x => x.team === "enemy")) {
        const nl = level + 1; setLevel(nl); setScore(s => s + level * 100);
        const newUnits = alive.filter(x => x.team === "player");
        newUnits.forEach(x => { x.hp = Math.min(x.hp + 3, x.maxHp); x.moved = false; });
        const fresh = initUnits(nl).filter(x => x.team === "enemy");
        setUnits([...newUnits, ...fresh]); setPhase("select"); setMessage(`Wave ${nl}!`);
      } else { nextTurn(alive); }
    }, 600);
  }, [level, nextTurn]);

  const handleClick = useCallback((cx: number, cy: number) => {
    if (phase === "title") { startGame(); return; }
    if (phase === "gameover") { startGame(); return; }
    if (phase === "enemy") return;
    const gx = Math.floor(cx / GRID), gy = Math.floor(cy / GRID);
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return;

    if (phase === "select") {
      const idx = units.findIndex(u => u.hp > 0 && u.team === "player" && u.x === gx && u.y === gy && !u.moved);
      if (idx >= 0) { setSelected(idx); setPhase("move"); setMessage("Click to move or attack"); }
    } else if (phase === "move" && selected >= 0) {
      const u = units[selected];
      const target = units.find(t => t.hp > 0 && t.x === gx && t.y === gy);
      if (target && target.team === "enemy" && dist(u, target) <= u.range) {
        const dmg = Math.max(1, u.atk - target.def);
        target.hp -= dmg; u.moved = true;
        setScore(s => s + dmg * 10);
        const alive = units.filter(x => x.hp > 0);
        setUnits([...alive]); setSelected(-1);
        if (!alive.some(x => x.team === "player" && !x.moved)) { enemyTurn(alive); }
        else { setPhase("select"); setMessage("Select next unit"); }
      } else if (!target && dist(u, { x: gx, y: gy }) <= 3) {
        u.x = gx; u.y = gy; u.moved = true;
        setUnits([...units]); setSelected(-1);
        if (!units.some(x => x.team === "player" && x.hp > 0 && !x.moved)) { enemyTurn(units.filter(x => x.hp > 0)); }
        else { setPhase("select"); setMessage("Select next unit"); }
      }
    }
  }, [phase, units, selected, startGame, enemyTurn]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;

    const render = () => {
      ctx.save(); ctx.scale(dpr, dpr);
      ctx.fillStyle = "#0f0f0f"; ctx.fillRect(0, 0, W, H);
      // Grid
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? "#1a1a2e" : "#16213e";
        ctx.fillRect(c * GRID, r * GRID, GRID, GRID);
      }
      if (phase === "title") {
        ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#3ea6ff"; ctx.font = "bold 32px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Turn-Based Tactics", W / 2, H / 2 - 30);
        ctx.fillStyle = "#aaa"; ctx.font = "16px sans-serif";
        ctx.fillText("Click to Start", W / 2, H / 2 + 10);
      } else {
        // Draw units
        for (let i = 0; i < units.length; i++) {
          const u = units[i]; if (u.hp <= 0) continue;
          const s = UNIT_STATS[u.type];
          const baseColor = u.team === "player" ? s.color : "#ff4757";
          ctx.fillStyle = u.moved && u.team === "player" ? "#555" : baseColor;
          ctx.beginPath(); ctx.arc(u.x * GRID + GRID / 2, u.y * GRID + GRID / 2, GRID / 2 - 4, 0, Math.PI * 2); ctx.fill();
          if (i === selected) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); }
          ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(s.icon, u.x * GRID + GRID / 2, u.y * GRID + GRID / 2);
          // HP bar
          const bw = GRID - 8, bh = 3;
          ctx.fillStyle = "#333"; ctx.fillRect(u.x * GRID + 4, u.y * GRID + GRID - 6, bw, bh);
          ctx.fillStyle = u.hp / u.maxHp > 0.5 ? "#2ed573" : "#ff4757";
          ctx.fillRect(u.x * GRID + 4, u.y * GRID + GRID - 6, bw * (u.hp / u.maxHp), bh);
        }
        if (phase === "gameover") {
          ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = "#ff4757"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("Game Over", W / 2, H / 2 - 20);
          ctx.fillStyle = "#aaa"; ctx.font = "16px sans-serif";
          ctx.fillText(`Score: ${score}`, W / 2, H / 2 + 10);
          ctx.fillText("Click to Restart", W / 2, H / 2 + 40);
        }
      }
      // HUD
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, ROWS * GRID, W, H - ROWS * GRID);
      ctx.fillStyle = "#fff"; ctx.font = "14px sans-serif"; ctx.textAlign = "left";
      ctx.fillText(`Wave: ${level}  Score: ${score}`, 10, ROWS * GRID + 24);
      ctx.fillStyle = "#aaa"; ctx.font = "12px sans-serif";
      ctx.fillText(message, 10, ROWS * GRID + 48);
      ctx.textAlign = "center"; ctx.fillStyle = "#666"; ctx.font = "11px sans-serif";
      ctx.fillText("I=Infantry C=Cavalry A=Archer M=Mage", W / 2, ROWS * GRID + 68);
      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      handleClick(e.clientX - rect.left, e.clientY - rect.top);
    };
    const onTouch = (e: TouchEvent) => {
      e.preventDefault(); const t = e.changedTouches[0]; const rect = canvas.getBoundingClientRect();
      handleClick(t.clientX - rect.left, t.clientY - rect.top);
    };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => { cancelAnimationFrame(rafRef.current); canvas.removeEventListener("click", onClick); canvas.removeEventListener("touchend", onTouch); };
  }, [phase, units, selected, score, level, message, handleClick]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4">
          <ChevronLeft size={16} /> Back to Games
        </Link>
        <div className="flex items-center gap-2 mb-4">
          <Swords size={24} className="text-[#3ea6ff]" />
          <h1 className="text-xl font-bold">Turn-Based Tactics</h1>
        </div>
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" />
        <button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3ea6ff] rounded-lg text-sm font-medium hover:bg-[#3ea6ff]/80">
          <RotateCcw size={14} /> Restart
        </button>
      </div>
    </div>
  );
}
