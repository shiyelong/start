"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

const W = 480, H = 480, GRID = 32, COLS = W / GRID, ROWS = H / GRID;
type TowerType = "arrow" | "cannon" | "ice";
interface Tower { x: number; y: number; type: TowerType; cooldown: number; range: number; damage: number; }
interface Enemy { x: number; y: number; hp: number; maxHp: number; speed: number; pathIdx: number; reward: number; slow: number; }
interface Bullet { x: number; y: number; tx: number; ty: number; speed: number; damage: number; type: TowerType; }

const PATH = [[0,7],[1,7],[2,7],[3,7],[3,6],[3,5],[3,4],[3,3],[4,3],[5,3],[6,3],[7,3],[7,4],[7,5],[7,6],[7,7],[8,7],[9,7],[10,7],[10,6],[10,5],[10,4],[10,3],[10,2],[10,1],[11,1],[12,1],[13,1],[14,1]];
const TOWER_INFO: Record<TowerType, { name: string; cost: number; color: string; range: number; damage: number; rate: number }> = {
  arrow: { name: "箭塔", cost: 50, color: "#3ea6ff", range: 3, damage: 10, rate: 30 },
  cannon: { name: "炮塔", cost: 100, color: "#ff4444", range: 2.5, damage: 30, rate: 60 },
  ice: { name: "冰塔", cost: 75, color: "#65b8ff", range: 3, damage: 5, rate: 45 },
};

function colorToNum(hex: string): number {
  if (hex.startsWith("#")) return parseInt(hex.slice(1, 7), 16);
  return 0xffffff;
}

function drawGamePixi(g: PixiGraphics, texts: Map<string, PixiText>, s: { towers: Tower[]; enemies: Enemy[]; bullets: Bullet[] }) {
  g.clear();
  texts.forEach(t => { t.visible = false; });

  const showText = (key: string, text: string, x: number, y: number, ax = 0, ay = 0) => {
    const t = texts.get(key);
    if (!t) return;
    t.text = text; t.x = x; t.y = y; t.anchor.set(ax, ay); t.alpha = 1; t.visible = true;
  };

  // Background
  g.rect(0, 0, W, H).fill({ color: 0x111111 });

  // Grid lines
  for (let x = 0; x <= COLS; x++) {
    g.rect(x * GRID, 0, 1, H).fill({ color: 0x1a1a1a });
  }
  for (let y = 0; y <= ROWS; y++) {
    g.rect(0, y * GRID, W, 1).fill({ color: 0x1a1a1a });
  }

  // Path
  for (const [px, py] of PATH) {
    g.rect(px * GRID, py * GRID, GRID, GRID).fill({ color: 0x1a1a2e });
  }

  // Towers
  s.towers.forEach((t, i) => {
    const info = TOWER_INFO[t.type];
    g.rect(t.x * GRID + 4, t.y * GRID + 4, GRID - 8, GRID - 8).fill({ color: colorToNum(info.color) });
    const label = t.type === "arrow" ? "弓" : t.type === "cannon" ? "炮" : "冰";
    if (i < 60) showText(`tw_${i}`, label, t.x * GRID + GRID / 2, t.y * GRID + GRID / 2, 0.5, 0.5);
  });

  // Enemies
  s.enemies.forEach((e, i) => {
    const ec = e.slow > 0 ? 0x65b8ff : 0xff4444;
    g.circle(e.x, e.y, 10).fill({ color: ec });
    // HP bar
    g.rect(e.x - 12, e.y - 16, 24, 4).fill({ color: 0x333333 });
    g.rect(e.x - 12, e.y - 16, 24 * (e.hp / e.maxHp), 4).fill({ color: 0x2ba640 });
    // Enemy index label (optional, skip for perf)
    void i;
  });

  // Bullets
  for (const b of s.bullets) {
    g.circle(b.x, b.y, 3).fill({ color: colorToNum(TOWER_INFO[b.type].color) });
  }
}

export default function TowerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixiAppRef = useRef<Application | null>(null);
  const [gold, setGold] = useState(200);
  const [lives, setLives] = useState(20);
  const [wave, setWave] = useState(0);
  const [started, setStarted] = useState(false);
  const [selectedTower, setSelectedTower] = useState<TowerType>("arrow");
  const [gameOver, setGameOver] = useState(false);
  const sRef = useRef({ towers: [] as Tower[], enemies: [] as Enemy[], bullets: [] as Bullet[], gold: 200, lives: 20, wave: 0, frame: 0, spawnTimer: 0, enemiesLeft: 0, waveActive: false });

  const startWave = useCallback(() => {
    const s = sRef.current;
    s.wave++;
    s.enemiesLeft = 5 + s.wave * 2;
    s.spawnTimer = 0;
    s.waveActive = true;
    setWave(s.wave);
  }, []);

  const placeTower = useCallback((cx: number, cy: number) => {
    const s = sRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gx = Math.floor((cx - rect.left) / (rect.width / COLS));
    const gy = Math.floor((cy - rect.top) / (rect.height / ROWS));
    if (PATH.some(([px, py]) => px === gx && py === gy)) return;
    if (s.towers.some(t => t.x === gx && t.y === gy)) return;
    const info = TOWER_INFO[selectedTower];
    if (s.gold < info.cost) return;
    s.gold -= info.cost;
    setGold(s.gold);
    s.towers.push({ x: gx, y: gy, type: selectedTower, cooldown: 0, range: info.range, damage: info.damage });
  }, [selectedTower]);

  useEffect(() => {
    if (!started || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const s = sRef.current;
    let destroyed = false;

    async function initAndRun() {
      const pixi = await loadPixi();
      if (destroyed) return;
      const app = await createPixiApp({ canvas, width: W, height: H, backgroundColor: 0x111111, antialias: false });
      if (destroyed) { app.destroy(true); return; }
      pixiAppRef.current = app;

      const gfx = new pixi.Graphics();
      app.stage.addChild(gfx);

      const textContainer = new pixi.Container();
      app.stage.addChild(textContainer);
      const texts = new Map<string, PixiText>();

      const makeText = (key: string, opts: { fontSize?: number; fill?: string | number; fontWeight?: string }) => {
        const t = new pixi.Text({ text: "", style: new pixi.TextStyle({
          fontSize: opts.fontSize ?? 10,
          fill: opts.fill ?? "#ffffff",
          fontWeight: (opts.fontWeight ?? "normal") as "normal" | "bold",
          fontFamily: "sans-serif",
        })});
        t.visible = false;
        textContainer.addChild(t);
        texts.set(key, t);
      };

      // Pre-create text pool for tower labels (up to 60) 
      for (let i = 0; i < 60; i++) makeText(`tw_${i}`, { fontSize: 10, fill: "#ffffff", fontWeight: "bold" });

      app.ticker.add(() => {
        if (destroyed) return;
        if (s.lives <= 0) { setGameOver(true); return; }
        s.frame++;

        // Spawn enemies
        if (s.waveActive && s.enemiesLeft > 0 && s.frame % 40 === 0) {
          const hp = 50 + s.wave * 20;
          s.enemies.push({ x: PATH[0][0] * GRID + GRID / 2, y: PATH[0][1] * GRID + GRID / 2, hp, maxHp: hp, speed: 1 + s.wave * 0.1, pathIdx: 0, reward: 10 + s.wave * 2, slow: 0 });
          s.enemiesLeft--;
          if (s.enemiesLeft === 0) s.waveActive = false;
        }

        // Move enemies
        s.enemies = s.enemies.filter(e => {
          if (e.pathIdx >= PATH.length - 1) { s.lives--; setLives(s.lives); return false; }
          const [tx, ty] = PATH[e.pathIdx + 1];
          const targetX = tx * GRID + GRID / 2, targetY = ty * GRID + GRID / 2;
          const dx = targetX - e.x, dy = targetY - e.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const spd = e.slow > 0 ? e.speed * 0.5 : e.speed;
          if (e.slow > 0) e.slow--;
          if (dist < spd * 2) { e.pathIdx++; } else { e.x += (dx / dist) * spd; e.y += (dy / dist) * spd; }
          return e.hp > 0;
        });

        // Towers shoot
        s.towers.forEach(t => {
          if (t.cooldown > 0) { t.cooldown--; return; }
          const info = TOWER_INFO[t.type];
          const tcx = t.x * GRID + GRID / 2, tcy = t.y * GRID + GRID / 2;
          const target = s.enemies.find(e => { const d = Math.sqrt((e.x - tcx) ** 2 + (e.y - tcy) ** 2); return d < t.range * GRID; });
          if (target) {
            s.bullets.push({ x: tcx, y: tcy, tx: target.x, ty: target.y, speed: 5, damage: t.damage, type: t.type });
            t.cooldown = info.rate;
          }
        });

        // Move bullets
        s.bullets = s.bullets.filter(b => {
          const dx = b.tx - b.x, dy = b.ty - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 8) {
            const hit = s.enemies.find(e => Math.sqrt((e.x - b.tx) ** 2 + (e.y - b.ty) ** 2) < GRID);
            if (hit) { hit.hp -= b.damage; if (b.type === "ice") hit.slow = 60; if (hit.hp <= 0) { s.gold += hit.reward; setGold(s.gold); } }
            return false;
          }
          b.x += (dx / dist) * b.speed;
          b.y += (dy / dist) * b.speed;
          return true;
        });

        // Draw with PixiJS
        drawGamePixi(gfx, texts, s);
      });
    }

    initAndRun();

    return () => {
      destroyed = true;
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true);
        pixiAppRef.current = null;
      }
    };
  }, [started]);

  return (
    <>
      <Header />
      <main className="max-w-xl mx-auto px-4 py-4 pb-20 md:pb-8 text-center">
        <h1 className="text-xl font-bold mb-2">塔防守卫</h1>
        <div className="flex justify-center gap-4 text-sm mb-2">
          <span className="text-[#f0b90b]">{gold}</span>
          <span className="text-[#ff4444]">{lives}</span>
          <span className="text-[#3ea6ff]">第{wave}波</span>
        </div>
        {/* 塔选择 */}
        <div className="flex justify-center gap-2 mb-3">
          {(Object.entries(TOWER_INFO) as [TowerType, typeof TOWER_INFO["arrow"]][]).map(([id, info]) => (
            <button key={id} onClick={() => setSelectedTower(id)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition ${selectedTower === id ? "border-[#3ea6ff] bg-[#3ea6ff]/15 text-[#3ea6ff] font-bold" : "border-[#333] text-[#aaa] hover:text-white"}`}>
              {info.name} ({info.cost}金)
            </button>
          ))}
        </div>
        <div className="relative inline-block">
          <canvas ref={canvasRef} width={W} height={H}
            onClick={e => started && placeTower(e.clientX, e.clientY)}
            className="rounded-xl border border-[#333] bg-[#111] max-w-full cursor-crosshair" />
          {!started && !gameOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl">
              <button onClick={() => { setStarted(true); startWave(); }} className="px-8 py-3 rounded-xl bg-[#ff4444] text-white font-bold text-lg hover:bg-[#ff6666] transition active:scale-95">
                开始防御
              </button>
            </div>
          )}
          {gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-xl">
              <p className="text-2xl font-bold text-[#ff4444] mb-2">基地沦陷</p>
              <p className="text-[#aaa] mb-4">坚持到第 {wave} 波</p>
              <button onClick={() => window.location.reload()} className="px-6 py-2.5 rounded-xl bg-[#ff4444] text-white font-bold">再来一局</button>
            </div>
          )}
        </div>
        {started && !gameOver && !sRef.current.waveActive && sRef.current.enemies.length === 0 && (
          <button onClick={startWave} className="mt-3 px-6 py-2 rounded-xl bg-[#f0b90b] text-[#0f0f0f] font-bold text-sm hover:bg-[#f0b90b]/80 transition active:scale-95">
            下一波
          </button>
        )}
        <p className="text-[11px] text-[#666] mt-3">点击空地放置防御塔 · 选择塔类型后点击地图</p>
      </main>
    </>
  );
}
