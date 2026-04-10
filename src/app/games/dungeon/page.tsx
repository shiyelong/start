"use client";
import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

const SIZE = 9;
type Cell = "floor" | "wall" | "exit" | "chest" | "enemy" | "potion";
interface Enemy { x: number; y: number; hp: number; maxHp: number; atk: number; name: string; emoji: string; }

function generateMap(level: number): { map: Cell[][]; enemies: Enemy[]; px: number; py: number } {
  const map: Cell[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill("wall"));
  // Carve rooms
  const rooms: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < 4 + level; i++) {
    const w = 2 + Math.floor(Math.random() * 2), h = 2 + Math.floor(Math.random() * 2);
    const x = 1 + Math.floor(Math.random() * (SIZE - w - 2)), y = 1 + Math.floor(Math.random() * (SIZE - h - 2));
    rooms.push({ x, y, w, h });
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) map[y + dy][x + dx] = "floor";
  }
  // Connect rooms
  for (let i = 1; i < rooms.length; i++) {
    let cx = rooms[i - 1].x, cy = rooms[i - 1].y;
    const tx = rooms[i].x, ty = rooms[i].y;
    while (cx !== tx) { map[cy][cx] = "floor"; cx += cx < tx ? 1 : -1; }
    while (cy !== ty) { map[cy][cx] = "floor"; cy += cy < ty ? 1 : -1; }
  }
  // Place exit
  const lastRoom = rooms[rooms.length - 1];
  map[lastRoom.y][lastRoom.x] = "exit";
  // Place items
  const floors: [number, number][] = [];
  map.forEach((row, y) => row.forEach((c, x) => { if (c === "floor") floors.push([x, y]); }));
  const shuffle = floors.sort(() => Math.random() - 0.5);
  for (let i = 0; i < Math.min(2, shuffle.length); i++) { const [x, y] = shuffle[i]; map[y][x] = "chest"; }
  for (let i = 2; i < Math.min(4, shuffle.length); i++) { const [x, y] = shuffle[i]; map[y][x] = "potion"; }
  // Enemies
  const enemyTypes = [
    { name: "史莱姆", emoji: "🟢", hp: 15 + level * 5, atk: 3 + level },
    { name: "骷髅兵", emoji: "💀", hp: 25 + level * 8, atk: 5 + level * 2 },
    { name: "暗影蝠", emoji: "🦇", hp: 12 + level * 4, atk: 7 + level * 2 },
  ];
  const enemies: Enemy[] = [];
  for (let i = 4; i < Math.min(4 + 2 + level, shuffle.length); i++) {
    const [x, y] = shuffle[i];
    const et = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
    enemies.push({ x, y, ...et, maxHp: et.hp });
    map[y][x] = "enemy";
  }
  const px = rooms[0].x + 1, py = rooms[0].y + 1;
  map[py][px] = "floor";
  return { map, enemies, px, py };
}

const CELL_ICONS: Record<Cell, string> = { floor: "", wall: "🧱", exit: "🚪", chest: "📦", enemy: "", potion: "💊" };

export default function DungeonPage() {
  const [level, setLevel] = useState(1);
  const [hp, setHp] = useState(100);
  const [maxHp] = useState(100);
  const [atk, setAtk] = useState(10);
  const [gold, setGold] = useState(0);
  const [{ map, enemies, px, py }, setDungeon] = useState(() => generateMap(1));
  const [playerPos, setPlayerPos] = useState({ x: px, y: py });
  const [log, setLog] = useState<string[]>(["🏰 你进入了地牢第1层..."]);
  const [gameOver, setGameOver] = useState(false);
  const [battleEnemy, setBattleEnemy] = useState<Enemy | null>(null);

  const addLog = useCallback((msg: string) => setLog(prev => [...prev.slice(-8), msg]), []);

  const move = useCallback((dx: number, dy: number) => {
    if (gameOver || battleEnemy) return;
    const nx = playerPos.x + dx, ny = playerPos.y + dy;
    if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) return;
    const cell = map[ny][nx];
    if (cell === "wall") return;

    if (cell === "enemy") {
      const e = enemies.find(en => en.x === nx && en.y === ny);
      if (e) { setBattleEnemy(e); addLog(`⚔️ 遭遇 ${e.emoji}${e.name}！`); }
      return;
    }
    if (cell === "chest") { const g = 10 + Math.floor(Math.random() * 20); setGold(prev => prev + g); addLog(`📦 打开宝箱获得 ${g} 金币！`); map[ny][nx] = "floor"; }
    if (cell === "potion") { const h = 20 + Math.floor(Math.random() * 15); setHp(prev => Math.min(maxHp, prev + h)); addLog(`💊 使用药水回复 ${h} HP`); map[ny][nx] = "floor"; }
    if (cell === "exit") {
      const nl = level + 1;
      setLevel(nl);
      const d = generateMap(nl);
      setDungeon(d);
      setPlayerPos({ x: d.px, y: d.py });
      addLog(`🚪 进入第${nl}层！怪物更强了...`);
      return;
    }
    setPlayerPos({ x: nx, y: ny });
  }, [playerPos, map, enemies, gameOver, battleEnemy, level, maxHp, addLog]);

  const attackEnemy = useCallback(() => {
    if (!battleEnemy) return;
    const dmg = atk + Math.floor(Math.random() * 5);
    battleEnemy.hp -= dmg;
    addLog(`🗡️ 你攻击 ${battleEnemy.name} 造成 ${dmg} 伤害`);
    if (battleEnemy.hp <= 0) {
      addLog(`🏆 击败了 ${battleEnemy.name}！`);
      map[battleEnemy.y][battleEnemy.x] = "floor";
      const idx = enemies.indexOf(battleEnemy);
      if (idx > -1) enemies.splice(idx, 1);
      setGold(prev => prev + 5 + level * 3);
      setBattleEnemy(null);
      setPlayerPos({ x: battleEnemy.x, y: battleEnemy.y });
      return;
    }
    // Enemy attacks back
    const eDmg = Math.max(1, battleEnemy.atk - Math.floor(Math.random() * 3));
    setHp(prev => {
      const newHp = prev - eDmg;
      addLog(`💥 ${battleEnemy.name} 反击造成 ${eDmg} 伤害`);
      if (newHp <= 0) { setGameOver(true); addLog("💀 你倒下了..."); }
      return Math.max(0, newHp);
    });
  }, [battleEnemy, atk, map, enemies, level, addLog]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (battleEnemy) { if (e.key === " " || e.key === "Enter") attackEnemy(); return; }
      if (e.key === "ArrowUp" || e.key === "w") move(0, -1);
      if (e.key === "ArrowDown" || e.key === "s") move(0, 1);
      if (e.key === "ArrowLeft" || e.key === "a") move(-1, 0);
      if (e.key === "ArrowRight" || e.key === "d") move(1, 0);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [move, attackEnemy, battleEnemy]);

  const restart = () => {
    setLevel(1); setHp(100); setAtk(10); setGold(0); setGameOver(false); setBattleEnemy(null);
    const d = generateMap(1); setDungeon(d); setPlayerPos({ x: d.px, y: d.py });
    setLog(["🏰 你进入了地牢第1层..."]);
  };

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8">
        <h1 className="text-xl font-bold mb-2 text-center"><i className="fas fa-dungeon mr-2 text-[#f97316]" />地牢探险</h1>
        <div className="flex justify-center gap-3 text-sm mb-3">
          <span className="text-[#ff4444]">❤️ {hp}/{maxHp}</span>
          <span className="text-[#f0b90b]">💰 {gold}</span>
          <span className="text-[#3ea6ff]">⚔️ {atk}</span>
          <span className="text-[#aaa]">🏰 第{level}层</span>
        </div>

        {/* 地图 */}
        <div className="grid gap-0.5 mx-auto mb-3" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)`, maxWidth: SIZE * 40 }}>
          {map.map((row, y) => row.map((cell, x) => {
            const isPlayer = playerPos.x === x && playerPos.y === y;
            const enemy = enemies.find(e => e.x === x && e.y === y);
            return (
              <div key={`${x}-${y}`}
                onClick={() => { const dx = x - playerPos.x, dy = y - playerPos.y; if (Math.abs(dx) + Math.abs(dy) === 1) move(dx, dy); }}
                className={clsx(
                  "aspect-square rounded-sm flex items-center justify-center text-sm cursor-pointer select-none transition",
                  cell === "wall" ? "bg-[#2a2a2a]" : "bg-[#1a1a2e]",
                  isPlayer && "ring-2 ring-[#3ea6ff] bg-[#3ea6ff]/20",
                )}>
                {isPlayer ? "🧙" : enemy ? enemy.emoji : CELL_ICONS[cell]}
              </div>
            );
          }))}
        </div>

        {/* 战斗 */}
        {battleEnemy && !gameOver && (
          <div className="p-4 rounded-xl bg-[#1a1a1a] border border-[#ff4444]/30 mb-3 text-center">
            <p className="text-2xl mb-1">{battleEnemy.emoji}</p>
            <p className="font-bold text-sm text-[#ff4444]">{battleEnemy.name}</p>
            <div className="h-2 bg-[#333] rounded-full overflow-hidden my-2 max-w-[200px] mx-auto">
              <div className="h-full bg-[#ff4444] transition-all rounded-full" style={{ width: `${(battleEnemy.hp / battleEnemy.maxHp) * 100}%` }} />
            </div>
            <p className="text-[11px] text-[#8a8a8a] mb-2">{battleEnemy.hp}/{battleEnemy.maxHp} HP</p>
            <button onClick={attackEnemy} className="px-6 py-2 rounded-xl bg-[#ff4444] text-white font-bold text-sm hover:bg-[#ff6666] transition active:scale-95">
              ⚔️ 攻击
            </button>
          </div>
        )}

        {gameOver && (
          <div className="text-center py-6">
            <p className="text-2xl mb-2">💀</p>
            <p className="text-xl font-bold text-[#ff4444] mb-1">你倒下了</p>
            <p className="text-[#8a8a8a] text-sm mb-4">探索到第{level}层 · 收集{gold}金币</p>
            <button onClick={restart} className="px-6 py-2.5 rounded-xl bg-[#f97316] text-white font-bold">重新探险</button>
          </div>
        )}

        {/* 日志 */}
        <div className="h-24 overflow-y-auto rounded-xl bg-[#0a0a0a] border border-[#333] p-3 text-[11px] text-[#8a8a8a] space-y-0.5">
          {log.map((l, i) => <p key={i}>{l}</p>)}
        </div>

        {/* 手机方向键 */}
        <div className="flex flex-col items-center gap-1 mt-3 md:hidden">
          <button onClick={() => battleEnemy ? attackEnemy() : move(0, -1)} className="w-14 h-14 rounded-xl bg-[#212121] border border-[#333] text-lg active:bg-[#3ea6ff]/20">
            {battleEnemy ? "⚔️" : "↑"}
          </button>
          <div className="flex gap-1">
            <button onClick={() => move(-1, 0)} className="w-14 h-14 rounded-xl bg-[#212121] border border-[#333] text-lg active:bg-[#3ea6ff]/20">←</button>
            <button onClick={() => move(0, 1)} className="w-14 h-14 rounded-xl bg-[#212121] border border-[#333] text-lg active:bg-[#3ea6ff]/20">↓</button>
            <button onClick={() => move(1, 0)} className="w-14 h-14 rounded-xl bg-[#212121] border border-[#333] text-lg active:bg-[#3ea6ff]/20">→</button>
          </div>
        </div>
        <p className="text-[11px] text-[#666] mt-2 text-center">方向键/WASD移动 · 空格攻击 · 📦宝箱 💊药水 🚪下一层</p>
      </main>
    </>
  );
}
