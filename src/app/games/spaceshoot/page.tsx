"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";

const W = 400, H = 600;
interface Bullet { x: number; y: number; }
interface EBullet { x: number; y: number; dx: number; dy: number; }
interface Enemy { x: number; y: number; hp: number; maxHp: number; type: number; speed: number; shootTimer: number; }

export default function SpaceShootPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [started, setStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [, setBossHp] = useState(0);
  const sRef = useRef({
    px: W / 2, bullets: [] as Bullet[], eBullets: [] as EBullet[], enemies: [] as Enemy[],
    score: 0, lives: 3, frame: 0, keys: new Set<string>(), boss: null as Enemy | null,
  });

  const start = useCallback(() => {
    const s = sRef.current;
    s.px = W / 2; s.bullets = []; s.eBullets = []; s.enemies = []; s.score = 0; s.lives = 3; s.frame = 0; s.boss = null;
    setScore(0); setLives(3); setGameOver(false); setBossHp(0); setStarted(true);
  }, []);

  useEffect(() => {
    if (!started || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    const s = sRef.current;
    let raf: number;

    const onKey = (e: KeyboardEvent, down: boolean) => { if (down) s.keys.add(e.key); else s.keys.delete(e.key); };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    // Touch
    let touchX = s.px;
    const onTouchMove = (e: TouchEvent) => { e.preventDefault(); touchX = (e.touches[0].clientX - (canvasRef.current?.getBoundingClientRect().left || 0)); };
    const onTouchStart = (e: TouchEvent) => { touchX = (e.touches[0].clientX - (canvasRef.current?.getBoundingClientRect().left || 0)); };
    canvasRef.current.addEventListener("touchmove", onTouchMove, { passive: false });
    canvasRef.current.addEventListener("touchstart", onTouchStart);

    const loop = () => {
      if (s.lives <= 0) { setGameOver(true); return; }
      s.frame++;

      // Move player
      if (s.keys.has("ArrowLeft") || s.keys.has("a")) s.px = Math.max(20, s.px - 5);
      if (s.keys.has("ArrowRight") || s.keys.has("d")) s.px = Math.min(W - 20, s.px + 5);
      // Touch control
      s.px += (touchX - s.px) * 0.15;

      // Auto shoot
      if (s.frame % 8 === 0) s.bullets.push({ x: s.px, y: H - 60 });

      // Spawn enemies
      if (!s.boss && s.frame % 50 === 0) {
        const type = Math.random() < 0.3 ? 1 : 0;
        s.enemies.push({ x: 30 + Math.random() * (W - 60), y: -20, hp: type === 1 ? 3 : 1, maxHp: type === 1 ? 3 : 1, type, speed: 1 + Math.random(), shootTimer: 0 });
      }

      // Boss every 500 points
      if (!s.boss && s.score > 0 && s.score % 500 === 0 && s.enemies.length === 0) {
        const bossHpVal = 50 + Math.floor(s.score / 500) * 30;
        s.boss = { x: W / 2, y: 60, hp: bossHpVal, maxHp: bossHpVal, type: 2, speed: 1.5, shootTimer: 0 };
        setBossHp(bossHpVal);
      }

      // Move enemies
      s.enemies = s.enemies.filter(e => {
        e.y += e.speed;
        e.shootTimer++;
        if (e.type === 1 && e.shootTimer % 60 === 0) {
          const dx = s.px - e.x, dy = (H - 50) - e.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          s.eBullets.push({ x: e.x, y: e.y, dx: (dx / dist) * 3, dy: (dy / dist) * 3 });
        }
        if (e.y > H + 20) return false;
        // Collision with player
        if (Math.abs(e.x - s.px) < 20 && Math.abs(e.y - (H - 50)) < 20) { s.lives--; setLives(s.lives); return false; }
        return e.hp > 0;
      });

      // Boss logic
      if (s.boss) {
        s.boss.x += Math.sin(s.frame * 0.02) * 2;
        s.boss.shootTimer++;
        if (s.boss.shootTimer % 20 === 0) {
          for (let a = -2; a <= 2; a++) {
            const angle = Math.PI / 2 + a * 0.3;
            s.eBullets.push({ x: s.boss.x, y: s.boss.y + 30, dx: Math.cos(angle) * 3, dy: Math.sin(angle) * 3 });
          }
        }
        setBossHp(s.boss.hp);
      }

      // Move bullets
      s.bullets = s.bullets.filter(b => {
        b.y -= 8;
        if (b.y < -10) return false;
        // Hit enemies
        for (const e of s.enemies) {
          if (Math.abs(b.x - e.x) < 16 && Math.abs(b.y - e.y) < 16) {
            e.hp--;
            if (e.hp <= 0) { s.score += e.type === 1 ? 20 : 10; setScore(s.score); }
            return false;
          }
        }
        // Hit boss
        if (s.boss && Math.abs(b.x - s.boss.x) < 30 && Math.abs(b.y - s.boss.y) < 30) {
          s.boss.hp--;
          if (s.boss.hp <= 0) { s.score += 200; setScore(s.score); s.boss = null; setBossHp(0); }
          return false;
        }
        return true;
      });

      // Enemy bullets
      s.eBullets = s.eBullets.filter(b => {
        b.x += b.dx; b.y += b.dy;
        if (b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) return false;
        if (Math.abs(b.x - s.px) < 12 && Math.abs(b.y - (H - 50)) < 12) { s.lives--; setLives(s.lives); return false; }
        return true;
      });

      // Draw
      ctx.fillStyle = "#050510";
      ctx.fillRect(0, 0, W, H);
      // Stars
      for (let i = 0; i < 50; i++) {
        const sx = (i * 97 + s.frame * (i % 3 + 1) * 0.3) % W;
        const sy = (i * 53 + s.frame * (i % 2 + 0.5)) % H;
        ctx.fillStyle = `rgba(255,255,255,${0.2 + (i % 5) * 0.1})`;
        ctx.fillRect(sx, sy, 1, 1);
      }

      // Player
      ctx.fillStyle = "#3ea6ff";
      ctx.beginPath();
      ctx.moveTo(s.px, H - 65);
      ctx.lineTo(s.px - 15, H - 40);
      ctx.lineTo(s.px + 15, H - 40);
      ctx.fill();
      ctx.fillStyle = "#65b8ff";
      ctx.fillRect(s.px - 3, H - 40, 6, 8);
      // Engine glow
      ctx.fillStyle = s.frame % 4 < 2 ? "#f0b90b" : "#ff6600";
      ctx.beginPath();
      ctx.moveTo(s.px - 4, H - 32);
      ctx.lineTo(s.px, H - 24 - Math.random() * 4);
      ctx.lineTo(s.px + 4, H - 32);
      ctx.fill();

      // Bullets
      ctx.fillStyle = "#f0b90b";
      s.bullets.forEach(b => { ctx.fillRect(b.x - 1.5, b.y, 3, 8); });
      // Enemy bullets
      ctx.fillStyle = "#ff4444";
      s.eBullets.forEach(b => { ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill(); });

      // Enemies
      s.enemies.forEach(e => {
        ctx.fillStyle = e.type === 1 ? "#ff4444" : "#a855f7";
        ctx.beginPath();
        ctx.moveTo(e.x, e.y + 12);
        ctx.lineTo(e.x - 12, e.y - 8);
        ctx.lineTo(e.x + 12, e.y - 8);
        ctx.fill();
        if (e.type === 1) { ctx.fillStyle = "#ff6666"; ctx.fillRect(e.x - 2, e.y - 8, 4, -6); }
      });

      // Boss
      if (s.boss) {
        const b = s.boss;
        ctx.fillStyle = "#ff4444";
        ctx.fillRect(b.x - 30, b.y - 15, 60, 30);
        ctx.fillStyle = "#cc0000";
        ctx.fillRect(b.x - 25, b.y - 10, 50, 20);
        ctx.fillStyle = "#ff6666";
        ctx.fillRect(b.x - 8, b.y + 15, 6, 10);
        ctx.fillRect(b.x + 2, b.y + 15, 6, 10);
        // Boss HP bar
        ctx.fillStyle = "#333";
        ctx.fillRect(W / 2 - 80, 10, 160, 8);
        ctx.fillStyle = "#ff4444";
        ctx.fillRect(W / 2 - 80, 10, 160 * (b.hp / b.maxHp), 8);
        ctx.fillStyle = "#fff";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("BOSS", W / 2, 8);
      }

      // Lives
      ctx.fillStyle = "#fff";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "left";
      for (let i = 0; i < s.lives; i++) { ctx.fillText("❤️", 10 + i * 20, 20); }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      canvasRef.current?.removeEventListener("touchmove", onTouchMove);
      canvasRef.current?.removeEventListener("touchstart", onTouchStart);
    };
  }, [started]);

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8 text-center">
        <h1 className="text-xl font-bold mb-2"><i className="fas fa-rocket mr-2 text-[#3ea6ff]" />太空射击</h1>
        <div className="flex justify-center gap-4 text-sm mb-3">
          <span className="text-[#f0b90b]"><i className="fas fa-crosshairs mr-1" />{score}</span>
          <span className="text-[#ff4444]">{"❤️".repeat(lives)}</span>
        </div>
        <div className="relative inline-block">
          <canvas ref={canvasRef} width={W} height={H} className="rounded-xl border border-[#333] bg-[#050510] max-w-full" style={{ touchAction: "none" }} />
          {!started && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl">
              <button onClick={start} className="px-8 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-lg hover:bg-[#65b8ff] transition active:scale-95">
                <i className="fas fa-rocket mr-2" />开始战斗
              </button>
            </div>
          )}
          {gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-xl">
              <p className="text-2xl font-bold text-[#ff4444] mb-2">飞船坠毁</p>
              <p className="text-[#f0b90b] text-lg mb-4">得分：{score}</p>
              <button onClick={start} className="px-6 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold">再来一局</button>
            </div>
          )}
        </div>
        <p className="text-[11px] text-[#666] mt-3">← → 移动 · 自动射击 · 手机触屏滑动控制</p>
      </main>
    </>
  );
}
