"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, Crosshair } from "lucide-react";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

const W = 400, H = 600;
type Phase = "title" | "playing" | "gameover";
interface Star { x: number; y: number; speed: number; size: number; }
interface Bullet { x: number; y: number; vy: number; }
interface Enemy { x: number; y: number; hp: number; speed: number; type: number; w: number; h: number; shootTimer: number; }
interface EBullet { x: number; y: number; vy: number; }
interface Powerup { x: number; y: number; type: "spread" | "shield" | "rapid"; vy: number; }

/* ========== PixiJS 绘制 ========== */
function drawTitle(g: PixiGraphics, texts: Map<string, PixiText>, s: { stars: Star[] }) {
  g.clear();
  g.rect(0, 0, W, H).fill({ color: 0x050510 });
  for (const star of s.stars) {
    g.rect(star.x, star.y, star.size, star.size).fill({ color: 0xffffff, alpha: 0.3 + star.size * 0.2 });
  }
  showText(texts, "title_main", "Space Shooter", W / 2, H / 2 - 40, 0.5, 0.5);
  showText(texts, "title_hint1", "Arrow keys to move, auto-fire", W / 2, H / 2 - 5, 0.5, 0.5);
  showText(texts, "title_hint2", "Click to Start", W / 2, H / 2 + 25, 0.5, 0.5);
  // hide playing/gameover texts
  hideTexts(texts, ["hud_score", "hud_wave", "go_title", "go_score", "go_hint"]);
  for (let i = 0; i < 5; i++) { const t = texts.get(`hp_${i}`); if (t) t.visible = false; }
  for (let i = 0; i < 10; i++) { const t = texts.get(`pu_${i}`); if (t) t.visible = false; }
}

function drawPlaying(g: PixiGraphics, texts: Map<string, PixiText>, s: {
  px: number; py: number; shield: number; hp: number; score: number; wave: number;
  bullets: Bullet[]; enemies: Enemy[]; eBullets: EBullet[]; powerups: Powerup[]; stars: Star[];
}) {
  g.clear();
  g.rect(0, 0, W, H).fill({ color: 0x050510 });
  // Stars
  for (const star of s.stars) {
    g.rect(star.x, star.y, star.size, star.size).fill({ color: 0xffffff, alpha: 0.3 + star.size * 0.2 });
  }
  // Player triangle
  const pc = s.shield > 0 ? 0x70a1ff : 0x3ea6ff;
  g.moveTo(s.px, s.py - 14).lineTo(s.px - 12, s.py + 10).lineTo(s.px + 12, s.py + 10).closePath().fill({ color: pc });
  if (s.shield > 0) {
    g.circle(s.px, s.py, 18).stroke({ color: 0x70a1ff, width: 2, alpha: 0.5 });
  }
  // Bullets
  for (const b of s.bullets) {
    g.rect(b.x - 1.5, b.y - 4, 3, 8).fill({ color: 0xffd700 });
  }
  // Enemies
  for (const e of s.enemies) {
    const ec = e.type === 1 ? 0xff4757 : 0xff6b81;
    g.rect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h).fill({ color: ec });
  }
  // Enemy bullets
  for (const eb of s.eBullets) {
    g.rect(eb.x - 2, eb.y - 3, 4, 6).fill({ color: 0xff4757 });
  }
  // Powerups
  s.powerups.forEach((p, i) => {
    const color = p.type === "spread" ? 0xffa502 : p.type === "shield" ? 0x70a1ff : 0x2ed573;
    g.circle(p.x, p.y, 8).fill({ color });
    if (i < 10) showText(texts, `pu_${i}`, p.type[0].toUpperCase(), p.x, p.y, 0.5, 0.5);
  });
  // Hide unused powerup texts
  for (let i = s.powerups.length; i < 10; i++) { const t = texts.get(`pu_${i}`); if (t) t.visible = false; }
  // HUD
  showText(texts, "hud_score", `Score: ${s.score}`, 10, 16, 0, 0.5);
  showText(texts, "hud_wave", `Wave: ${s.wave}`, 10, 36, 0, 0.5);
  // HP hearts
  for (let i = 0; i < 5; i++) {
    const t = texts.get(`hp_${i}`);
    if (t) {
      if (i < s.hp) { t.text = "\u2665"; t.x = W - 10 - i * 20; t.y = 16; t.anchor.set(1, 0.5); t.visible = true; }
      else { t.visible = false; }
    }
  }
  // Hide title/gameover texts
  hideTexts(texts, ["title_main", "title_hint1", "title_hint2", "go_title", "go_score", "go_hint"]);
}

function drawGameOver(g: PixiGraphics, texts: Map<string, PixiText>, s: {
  px: number; py: number; shield: number; hp: number; score: number; wave: number;
  bullets: Bullet[]; enemies: Enemy[]; eBullets: EBullet[]; powerups: Powerup[]; stars: Star[];
}) {
  // Draw playing state underneath
  drawPlaying(g, texts, s);
  // Overlay
  g.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.7 });
  showText(texts, "go_title", "Game Over", W / 2, H / 2 - 20, 0.5, 0.5);
  showText(texts, "go_score", `Score: ${s.score}`, W / 2, H / 2 + 14, 0.5, 0.5);
  showText(texts, "go_hint", "Click to Restart", W / 2, H / 2 + 44, 0.5, 0.5);
}

function showText(texts: Map<string, PixiText>, key: string, text: string, x: number, y: number, ax = 0, ay = 0) {
  const t = texts.get(key);
  if (!t) return;
  t.text = text; t.x = x; t.y = y; t.anchor.set(ax, ay); t.visible = true;
}

function hideTexts(texts: Map<string, PixiText>, keys: string[]) {
  for (const k of keys) { const t = texts.get(k); if (t) t.visible = false; }
}

export default function ShooterGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixiAppRef = useRef<Application | null>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [score, setScore] = useState(0);
  const sRef = useRef({
    px: W / 2, py: H - 60, bullets: [] as Bullet[], enemies: [] as Enemy[], eBullets: [] as EBullet[],
    powerups: [] as Powerup[], stars: [] as Star[], score: 0, hp: 3, maxHp: 3,
    fireTimer: 0, fireRate: 0.15, spread: 1, shield: 0, spawnTimer: 0, wave: 1, kills: 0,
  });
  const keysRef = useRef(new Set<string>());
  const phaseRef = useRef<Phase>("title");
  const lastRef = useRef(0);

  const startGame = useCallback(() => {
    const stars: Star[] = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, speed: 30 + Math.random() * 80, size: 1 + Math.random() * 2 }));
    sRef.current = { px: W / 2, py: H - 60, bullets: [], enemies: [], eBullets: [], powerups: [], stars, score: 0, hp: 3, maxHp: 3, fireTimer: 0, fireRate: 0.15, spread: 1, shield: 0, spawnTimer: 0, wave: 1, kills: 0 };
    setScore(0); setPhase("playing"); phaseRef.current = "playing"; lastRef.current = 0;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    let destroyed = false;

    const onKey = (e: KeyboardEvent) => { keysRef.current.add(e.key); if ((e.key === "Enter" || e.key === " ") && phaseRef.current !== "playing") startGame(); };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    const onClick = () => { if (phaseRef.current !== "playing") startGame(); };
    let touchId = -1;
    const onTouchStart = (e: TouchEvent) => { e.preventDefault(); if (phaseRef.current !== "playing") { startGame(); return; } touchId = e.touches[0].identifier; };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === touchId) {
          const rect = canvas.getBoundingClientRect();
          sRef.current.px = Math.max(16, Math.min(W - 16, (e.touches[i].clientX - rect.left) * (W / rect.width)));
          sRef.current.py = Math.max(16, Math.min(H - 16, (e.touches[i].clientY - rect.top) * (H / rect.height)));
        }
      }
    };
    window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });

    async function initAndRun() {
      const pixi = await loadPixi();
      if (destroyed) return;
      const app = await createPixiApp({ canvas: canvas!, width: W, height: H, backgroundColor: 0x050510 });
      if (destroyed) { app.destroy(true); return; }
      pixiAppRef.current = app;

      const gfx = new pixi.Graphics();
      app.stage.addChild(gfx);

      const textContainer = new pixi.Container();
      app.stage.addChild(textContainer);
      const texts = new Map<string, PixiText>();

      const makeText = (key: string, opts: { fontSize?: number; fill?: string | number; fontWeight?: string }) => {
        const t = new pixi.Text({ text: "", style: new pixi.TextStyle({
          fontSize: opts.fontSize ?? 14,
          fill: opts.fill ?? "#ffffff",
          fontWeight: (opts.fontWeight ?? "normal") as "normal" | "bold",
          fontFamily: "sans-serif",
        })});
        t.visible = false;
        textContainer.addChild(t);
        texts.set(key, t);
      };

      // Pre-create text pool (~70 texts)
      makeText("title_main", { fontSize: 30, fill: "#3ea6ff", fontWeight: "bold" });
      makeText("title_hint1", { fontSize: 14, fill: "#aaaaaa" });
      makeText("title_hint2", { fontSize: 14, fill: "#aaaaaa" });
      makeText("hud_score", { fontSize: 16, fill: "#ffffff", fontWeight: "bold" });
      makeText("hud_wave", { fontSize: 16, fill: "#ffffff", fontWeight: "bold" });
      for (let i = 0; i < 5; i++) makeText(`hp_${i}`, { fontSize: 16, fill: "#ff4757", fontWeight: "bold" });
      for (let i = 0; i < 10; i++) makeText(`pu_${i}`, { fontSize: 10, fill: "#ffffff", fontWeight: "bold" });
      makeText("go_title", { fontSize: 28, fill: "#ff4757", fontWeight: "bold" });
      makeText("go_score", { fontSize: 18, fill: "#ffffff" });
      makeText("go_hint", { fontSize: 14, fill: "#aaaaaa" });

      let prevTs = 0;
      app.ticker.add((ticker) => {
        if (destroyed) return;
        const now = performance.now();
        if (!prevTs) prevTs = now;
        const dt = Math.min((now - prevTs) / 1000, 0.05);
        prevTs = now;
        const s = sRef.current;
        const currentPhase = phaseRef.current;

        if (currentPhase === "playing") {
          const keys = keysRef.current;
          const spd = 280;
          if (keys.has("ArrowLeft") || keys.has("a")) s.px = Math.max(16, s.px - spd * dt);
          if (keys.has("ArrowRight") || keys.has("d")) s.px = Math.min(W - 16, s.px + spd * dt);
          if (keys.has("ArrowUp") || keys.has("w")) s.py = Math.max(16, s.py - spd * dt);
          if (keys.has("ArrowDown") || keys.has("s")) s.py = Math.min(H - 16, s.py + spd * dt);
          // Auto fire
          s.fireTimer -= dt;
          if (s.fireTimer <= 0) {
            s.fireTimer = s.fireRate;
            s.bullets.push({ x: s.px, y: s.py - 12, vy: -500 });
            if (s.spread >= 2) { s.bullets.push({ x: s.px - 10, y: s.py - 8, vy: -480 }); s.bullets.push({ x: s.px + 10, y: s.py - 8, vy: -480 }); }
            if (s.spread >= 3) { s.bullets.push({ x: s.px - 18, y: s.py - 4, vy: -460 }); s.bullets.push({ x: s.px + 18, y: s.py - 4, vy: -460 }); }
          }
          // Spawn enemies
          s.spawnTimer -= dt;
          if (s.spawnTimer <= 0) {
            s.spawnTimer = Math.max(0.3, 1.2 - s.wave * 0.05);
            const type = Math.random() < 0.2 ? 1 : 0;
            const hp = type === 1 ? 3 + s.wave : 1 + Math.floor(s.wave / 3);
            const w = type === 1 ? 40 : 24;
            s.enemies.push({ x: 20 + Math.random() * (W - 40), y: -30, hp, speed: 60 + Math.random() * 40 + s.wave * 5, type, w, h: type === 1 ? 30 : 20, shootTimer: 1 + Math.random() * 2 });
          }
          // Update
          for (const b of s.bullets) b.y += b.vy * dt;
          for (const e of s.enemies) {
            e.y += e.speed * dt;
            e.shootTimer -= dt;
            if (e.shootTimer <= 0 && e.type === 1) { e.shootTimer = 2; s.eBullets.push({ x: e.x, y: e.y + e.h / 2, vy: 200 }); }
          }
          for (const eb of s.eBullets) eb.y += eb.vy * dt;
          for (const p of s.powerups) p.y += p.vy * dt;
          for (const star of s.stars) { star.y += star.speed * dt; if (star.y > H) { star.y = 0; star.x = Math.random() * W; } }
          // Collision: bullets vs enemies
          for (const b of s.bullets) {
            for (const e of s.enemies) {
              if (e.hp <= 0) continue;
              if (Math.abs(b.x - e.x) < e.w / 2 + 4 && Math.abs(b.y - e.y) < e.h / 2 + 4) {
                e.hp--; b.y = -100;
                if (e.hp <= 0) {
                  s.score += (e.type + 1) * 10; s.kills++; setScore(s.score);
                  if (Math.random() < 0.1) {
                    const types: Powerup["type"][] = ["spread", "shield", "rapid"];
                    s.powerups.push({ x: e.x, y: e.y, type: types[Math.floor(Math.random() * 3)], vy: 60 });
                  }
                }
              }
            }
          }
          // Collision: enemy bullets vs player
          for (const eb of s.eBullets) {
            if (Math.abs(eb.x - s.px) < 14 && Math.abs(eb.y - s.py) < 14) {
              eb.y = H + 100;
              if (s.shield > 0) { s.shield--; } else { s.hp--; if (s.hp <= 0) { setPhase("gameover"); phaseRef.current = "gameover"; } }
            }
          }
          // Collision: enemies vs player
          for (const e of s.enemies) {
            if (e.hp <= 0) continue;
            if (Math.abs(e.x - s.px) < e.w / 2 + 12 && Math.abs(e.y - s.py) < e.h / 2 + 12) {
              e.hp = 0; s.hp--; if (s.hp <= 0) { setPhase("gameover"); phaseRef.current = "gameover"; }
            }
          }
          // Powerup pickup
          for (const p of s.powerups) {
            if (Math.abs(p.x - s.px) < 20 && Math.abs(p.y - s.py) < 20) {
              if (p.type === "spread") s.spread = Math.min(3, s.spread + 1);
              else if (p.type === "shield") s.shield += 2;
              else s.fireRate = Math.max(0.06, s.fireRate - 0.02);
              p.y = H + 100;
            }
          }
          // Cleanup
          s.bullets = s.bullets.filter(b => b.y > -20);
          s.enemies = s.enemies.filter(e => e.y < H + 40 && e.hp > 0);
          s.eBullets = s.eBullets.filter(eb => eb.y < H + 20);
          s.powerups = s.powerups.filter(p => p.y < H + 20);
          if (s.kills >= s.wave * 8) { s.wave++; s.kills = 0; }
        }

        // Stars scroll even on title/gameover
        if (currentPhase !== "playing") {
          for (const star of s.stars) { star.y += star.speed * dt; if (star.y > H) { star.y = 0; star.x = Math.random() * W; } }
        }

        // === DRAW ===
        if (currentPhase === "title") {
          drawTitle(gfx, texts, s);
        } else if (currentPhase === "gameover") {
          drawGameOver(gfx, texts, s);
        } else {
          drawPlaying(gfx, texts, s);
        }
      });
    }

    initAndRun();

    return () => {
      destroyed = true;
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true);
        pixiAppRef.current = null;
      }
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
    };
  }, [startGame]);

  // Sync phase ref
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> Back</Link>
        <div className="flex items-center gap-2 mb-4"><Crosshair size={24} className="text-[#3ea6ff]" /><h1 className="text-xl font-bold">Space Shooter</h1></div>
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" />
        <button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3ea6ff] rounded-lg text-sm font-medium hover:bg-[#3ea6ff]/80"><RotateCcw size={14} /> Restart</button>
      </div>
    </div>
  );
}
