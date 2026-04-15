"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/* ========== 常量 ========== */
const W = 400, H = 640;
const PLAYER_W = 32, PLAYER_H = 24;
const STAR_COUNT = 80;
const MAX_BULLETS = 30;
const MAX_ENEMIES = 12;
const MAX_PARTICLES = 60;
const MAX_POWERUPS = 3;
const BOSS_INTERVAL = 15; // 每15波出Boss

/* ========== 类型 ========== */
interface Star { x: number; y: number; speed: number; size: number; brightness: number; }
interface Bullet { x: number; y: number; vx: number; vy: number; damage: number; piercing: boolean; }
interface EBullet { x: number; y: number; vx: number; vy: number; size: number; color: string; }
interface Enemy {
  x: number; y: number; w: number; h: number;
  hp: number; maxHp: number; speed: number; type: EnemyType;
  shootTimer: number; shootRate: number; reward: number;
  color: string; pattern: number; age: number;
}
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}
interface PowerUp {
  x: number; y: number; type: "spread" | "shield" | "rapid" | "bomb";
  vy: number;
}
type EnemyType = "scout" | "fighter" | "tank" | "sniper" | "boss";
type WeaponType = "normal" | "spread" | "rapid";

interface GameState {
  // Player
  px: number; py: number;
  hp: number; maxHp: number;
  shield: number; shieldMax: number;
  weapon: WeaponType; weaponTimer: number;
  invincible: number;
  // Game
  score: number; combo: number; maxCombo: number;
  wave: number; waveTimer: number; waveEnemiesLeft: number;
  bossActive: boolean;
  // Collections
  bullets: Bullet[]; eBullets: EBullet[];
  enemies: Enemy[]; particles: Particle[];
  stars: Star[]; powerups: PowerUp[];
  // Input
  keys: Set<string>; touchX: number | null;
  // Timing
  frame: number; shootCooldown: number;
  // Stats
  enemiesKilled: number; bossesKilled: number;
}

/* ========== 工具函数 ========== */
function initStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    speed: 0.5 + Math.random() * 2.5, size: 0.5 + Math.random() * 1.5,
    brightness: 0.3 + Math.random() * 0.7,
  }));
}

function spawnEnemy(wave: number, isBoss: boolean): Enemy {
  if (isBoss) {
    return {
      x: W / 2 - 40, y: -80, w: 80, h: 60,
      hp: 200 + wave * 30, maxHp: 200 + wave * 30,
      speed: 0.5, type: "boss", shootTimer: 0, shootRate: 15,
      reward: 500 + wave * 50, color: "#ff4444",
      pattern: 0, age: 0,
    };
  }
  const types: { type: EnemyType; w: number; h: number; hp: number; speed: number; rate: number; reward: number; color: string }[] = [
    { type: "scout", w: 20, h: 16, hp: 15 + wave * 3, speed: 2 + wave * 0.1, rate: 80, reward: 10, color: "#3ea6ff" },
    { type: "fighter", w: 24, h: 20, hp: 30 + wave * 5, speed: 1.5 + wave * 0.08, rate: 50, reward: 25, color: "#f0b90b" },
    { type: "tank", w: 30, h: 26, hp: 60 + wave * 8, speed: 0.8, rate: 40, reward: 50, color: "#a855f7" },
    { type: "sniper", w: 22, h: 18, hp: 20 + wave * 4, speed: 1, rate: 60, reward: 35, color: "#ff4444" },
  ];
  const t = types[Math.floor(Math.random() * Math.min(types.length, 1 + Math.floor(wave / 3)))];
  return {
    x: 20 + Math.random() * (W - 40 - t.w), y: -t.h - Math.random() * 100,
    w: t.w, h: t.h, hp: t.hp, maxHp: t.hp, speed: t.speed,
    type: t.type, shootTimer: Math.random() * t.rate, shootRate: t.rate,
    reward: t.reward, color: t.color, pattern: Math.floor(Math.random() * 3), age: 0,
  };
}

function spawnParticles(particles: Particle[], x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 4;
    particles.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 20 + Math.random() * 20, maxLife: 40, color,
      size: 1 + Math.random() * 3,
    });
  }
}

/* ========== 绘制函数 ========== */
function drawGame(ctx: CanvasRenderingContext2D, s: GameState) {
  // 背景
  ctx.fillStyle = "#050510";
  ctx.fillRect(0, 0, W, H);

  // 星空
  for (const star of s.stars) {
    ctx.globalAlpha = star.brightness;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
  ctx.globalAlpha = 1;

  // 粒子
  for (const p of s.particles) {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 能量道具
  for (const pu of s.powerups) {
    const colors = { spread: "#f0b90b", shield: "#3ea6ff", rapid: "#2ba640", bomb: "#ff4444" };
    const icons = { spread: "S", shield: "D", rapid: "R", bomb: "B" };
    ctx.fillStyle = colors[pu.type];
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icons[pu.type], pu.x, pu.y);
  }

  // 敌人
  for (const e of s.enemies) {
    // 机体
    ctx.fillStyle = e.color;
    if (e.type === "boss") {
      // Boss绘制 — 更大更复杂
      ctx.fillStyle = "#ff4444";
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = "#cc0000";
      ctx.fillRect(e.x + 5, e.y + 5, e.w - 10, e.h - 10);
      // Boss眼睛
      ctx.fillStyle = "#fff";
      ctx.fillRect(e.x + 15, e.y + 15, 8, 8);
      ctx.fillRect(e.x + e.w - 23, e.y + 15, 8, 8);
      ctx.fillStyle = "#ff0";
      ctx.fillRect(e.x + 17, e.y + 17, 4, 4);
      ctx.fillRect(e.x + e.w - 21, e.y + 17, 4, 4);
      // Boss血条
      const hpRatio = e.hp / e.maxHp;
      ctx.fillStyle = "#333";
      ctx.fillRect(W / 2 - 80, 8, 160, 6);
      ctx.fillStyle = hpRatio > 0.5 ? "#2ba640" : hpRatio > 0.25 ? "#f0b90b" : "#ff4444";
      ctx.fillRect(W / 2 - 80, 8, 160 * hpRatio, 6);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("BOSS", W / 2, 22);
    } else {
      // 普通敌人 — 三角形飞船
      ctx.beginPath();
      ctx.moveTo(e.x + e.w / 2, e.y + e.h);
      ctx.lineTo(e.x, e.y);
      ctx.lineTo(e.x + e.w, e.y);
      ctx.closePath();
      ctx.fill();
      // 引擎光
      ctx.fillStyle = e.color + "80";
      ctx.fillRect(e.x + e.w / 2 - 3, e.y - 4, 6, 4);
      // 血条（受伤时显示）
      if (e.hp < e.maxHp) {
        const ratio = e.hp / e.maxHp;
        ctx.fillStyle = "#333";
        ctx.fillRect(e.x, e.y - 6, e.w, 3);
        ctx.fillStyle = ratio > 0.5 ? "#2ba640" : "#ff4444";
        ctx.fillRect(e.x, e.y - 6, e.w * ratio, 3);
      }
    }
  }

  // 敌人子弹
  for (const b of s.eBullets) {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
    ctx.fill();
    // 发光效果
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.size * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 玩家子弹
  for (const b of s.bullets) {
    ctx.fillStyle = b.piercing ? "#f0b90b" : "#3ea6ff";
    ctx.fillRect(b.x - 1.5, b.y - 4, 3, 8);
    // 发光
    ctx.globalAlpha = 0.4;
    ctx.fillRect(b.x - 3, b.y - 6, 6, 12);
    ctx.globalAlpha = 1;
  }

  // 玩家飞船
  if (s.invincible <= 0 || s.frame % 4 < 2) {
    const px = s.px, py = s.py;
    // 护盾
    if (s.shield > 0) {
      ctx.strokeStyle = "#3ea6ff";
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.4 + 0.2 * Math.sin(s.frame * 0.1);
      ctx.beginPath();
      ctx.arc(px, py, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 机体
    ctx.fillStyle = "#3ea6ff";
    ctx.beginPath();
    ctx.moveTo(px, py - PLAYER_H / 2);
    ctx.lineTo(px - PLAYER_W / 2, py + PLAYER_H / 2);
    ctx.lineTo(px - PLAYER_W / 4, py + PLAYER_H / 3);
    ctx.lineTo(px + PLAYER_W / 4, py + PLAYER_H / 3);
    ctx.lineTo(px + PLAYER_W / 2, py + PLAYER_H / 2);
    ctx.closePath();
    ctx.fill();
    // 驾驶舱
    ctx.fillStyle = "#65b8ff";
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    // 引擎火焰
    const flameH = 6 + Math.sin(s.frame * 0.5) * 3;
    ctx.fillStyle = "#f0b90b";
    ctx.beginPath();
    ctx.moveTo(px - 5, py + PLAYER_H / 3);
    ctx.lineTo(px, py + PLAYER_H / 3 + flameH);
    ctx.lineTo(px + 5, py + PLAYER_H / 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ff4444";
    ctx.beginPath();
    ctx.moveTo(px - 3, py + PLAYER_H / 3);
    ctx.lineTo(px, py + PLAYER_H / 3 + flameH * 0.6);
    ctx.lineTo(px + 3, py + PLAYER_H / 3);
    ctx.closePath();
    ctx.fill();
  }

  // HUD
  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`分数: ${s.score}`, 8, H - 8);
  ctx.textAlign = "right";
  ctx.fillText(`波次: ${s.wave}`, W - 8, H - 8);
  // HP条
  ctx.fillStyle = "#333";
  ctx.fillRect(8, H - 24, 80, 6);
  ctx.fillStyle = s.hp > s.maxHp * 0.3 ? "#2ba640" : "#ff4444";
  ctx.fillRect(8, H - 24, 80 * (s.hp / s.maxHp), 6);
  // Combo
  if (s.combo > 1) {
    ctx.fillStyle = "#f0b90b";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${s.combo}x COMBO`, W / 2, H - 8);
  }
  // 武器指示
  const weaponNames = { normal: "普通", spread: "散射", rapid: "速射" };
  if (s.weapon !== "normal") {
    ctx.fillStyle = "#f0b90b";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`[${weaponNames[s.weapon]}] ${Math.ceil(s.weaponTimer / 60)}s`, 8, H - 32);
  }
}

/* ========== 主组件 ========== */
export default function SpaceShootPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(0);
  const [hp, setHp] = useState(100);
  const [started, setStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [stats, setStats] = useState({ score: 0, wave: 0, killed: 0, bosses: 0, combo: 0 });
  const sRef = useRef<GameState | null>(null);

  const initState = useCallback((): GameState => ({
    px: W / 2, py: H - 60, hp: 100, maxHp: 100,
    shield: 0, shieldMax: 50, weapon: "normal", weaponTimer: 0, invincible: 0,
    score: 0, combo: 0, maxCombo: 0, wave: 0, waveTimer: 120, waveEnemiesLeft: 0, bossActive: false,
    bullets: [], eBullets: [], enemies: [], particles: [], stars: initStars(), powerups: [],
    keys: new Set(), touchX: null, frame: 0, shootCooldown: 0,
    enemiesKilled: 0, bossesKilled: 0,
  }), []);

  const start = useCallback(() => {
    sRef.current = initState();
    setScore(0); setWave(0); setHp(100); setGameOver(false); setStarted(true);
  }, [initState]);

  useEffect(() => {
    if (!started || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const s = sRef.current!;
    let raf: number;

    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","a","d","w","s"," "].includes(e.key)) {
        e.preventDefault();
        if (down) s.keys.add(e.key); else s.keys.delete(e.key);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => onKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => onKey(e, false);
    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      s.touchX = (e.touches[0].clientX - rect.left) * (W / rect.width);
    };
    const onTouchEnd = () => { s.touchX = null; };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("touchmove", onTouch, { passive: false });
    canvas.addEventListener("touchstart", onTouch, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);

    function update() {
      s.frame++;

      // 星空滚动
      for (const star of s.stars) {
        star.y += star.speed;
        if (star.y > H) { star.y = 0; star.x = Math.random() * W; }
      }

      // 玩家移动
      const spd = 4;
      if (s.keys.has("ArrowLeft") || s.keys.has("a")) s.px -= spd;
      if (s.keys.has("ArrowRight") || s.keys.has("d")) s.px += spd;
      if (s.keys.has("ArrowUp") || s.keys.has("w")) s.py -= spd;
      if (s.keys.has("ArrowDown") || s.keys.has("s")) s.py += spd;
      if (s.touchX !== null) {
        const diff = s.touchX - s.px;
        s.px += Math.sign(diff) * Math.min(Math.abs(diff), spd);
      }
      s.px = Math.max(PLAYER_W / 2, Math.min(W - PLAYER_W / 2, s.px));
      s.py = Math.max(PLAYER_H, Math.min(H - PLAYER_H, s.py));
      if (s.invincible > 0) s.invincible--;
      if (s.weaponTimer > 0) { s.weaponTimer--; if (s.weaponTimer <= 0) s.weapon = "normal"; }

      // 自动射击
      s.shootCooldown--;
      const rate = s.weapon === "rapid" ? 4 : 8;
      if (s.shootCooldown <= 0 && s.bullets.length < MAX_BULLETS) {
        s.shootCooldown = rate;
        if (s.weapon === "spread") {
          s.bullets.push({ x: s.px, y: s.py - PLAYER_H / 2, vx: -2, vy: -8, damage: 8, piercing: false });
          s.bullets.push({ x: s.px, y: s.py - PLAYER_H / 2, vx: 0, vy: -9, damage: 10, piercing: false });
          s.bullets.push({ x: s.px, y: s.py - PLAYER_H / 2, vx: 2, vy: -8, damage: 8, piercing: false });
        } else {
          s.bullets.push({ x: s.px, y: s.py - PLAYER_H / 2, vx: 0, vy: -9, damage: s.weapon === "rapid" ? 8 : 12, piercing: false });
        }
      }

      // 波次管理
      s.waveTimer--;
      if (s.waveTimer <= 0 && s.enemies.length === 0 && s.waveEnemiesLeft <= 0) {
        s.wave++;
        setWave(s.wave);
        const isBossWave = s.wave % BOSS_INTERVAL === 0;
        if (isBossWave) {
          s.enemies.push(spawnEnemy(s.wave, true));
          s.bossActive = true;
          s.waveEnemiesLeft = 0;
        } else {
          s.waveEnemiesLeft = 3 + Math.floor(s.wave * 1.5);
        }
        s.waveTimer = 60;
      }
      // 生成敌人
      if (s.waveEnemiesLeft > 0 && s.enemies.length < MAX_ENEMIES && s.frame % 30 === 0) {
        s.enemies.push(spawnEnemy(s.wave, false));
        s.waveEnemiesLeft--;
      }

      // 更新子弹
      s.bullets = s.bullets.filter(b => {
        b.x += b.vx; b.y += b.vy;
        return b.y > -10 && b.y < H + 10 && b.x > -10 && b.x < W + 10;
      });
      s.eBullets = s.eBullets.filter(b => {
        b.x += b.vx; b.y += b.vy;
        return b.y > -10 && b.y < H + 10 && b.x > -10 && b.x < W + 10;
      });

      // 更新敌人
      for (const e of s.enemies) {
        e.age++;
        if (e.type === "boss") {
          // Boss移动模式
          if (e.y < 60) e.y += e.speed;
          else e.x += Math.sin(e.age * 0.02) * 2;
          // Boss射击
          e.shootTimer--;
          if (e.shootTimer <= 0) {
            e.shootTimer = e.shootRate;
            e.pattern = (e.pattern + 1) % 3;
            if (e.pattern === 0) {
              // 扇形弹幕
              for (let a = -3; a <= 3; a++) {
                const angle = Math.PI / 2 + a * 0.2;
                s.eBullets.push({ x: e.x + e.w / 2, y: e.y + e.h, vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3, size: 4, color: "#ff4444" });
              }
            } else if (e.pattern === 1) {
              // 瞄准弹
              const dx = s.px - (e.x + e.w / 2), dy = s.py - (e.y + e.h);
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              s.eBullets.push({ x: e.x + e.w / 2, y: e.y + e.h, vx: dx / dist * 4, vy: dy / dist * 4, size: 5, color: "#f0b90b" });
            } else {
              // 环形弹幕
              for (let i = 0; i < 8; i++) {
                const angle = (Math.PI * 2 / 8) * i + e.age * 0.05;
                s.eBullets.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: Math.cos(angle) * 2.5, vy: Math.sin(angle) * 2.5, size: 3, color: "#a855f7" });
              }
            }
          }
        } else {
          e.y += e.speed;
          // 横向移动模式
          if (e.pattern === 1) e.x += Math.sin(e.age * 0.05) * 1.5;
          else if (e.pattern === 2) e.x += Math.cos(e.age * 0.03) * 2;
          e.x = Math.max(0, Math.min(W - e.w, e.x));
          // 射击
          e.shootTimer--;
          if (e.shootTimer <= 0 && e.y > 0) {
            e.shootTimer = e.shootRate;
            if (e.type === "sniper") {
              const dx = s.px - (e.x + e.w / 2), dy = s.py - (e.y + e.h);
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              s.eBullets.push({ x: e.x + e.w / 2, y: e.y + e.h, vx: dx / dist * 4, vy: dy / dist * 4, size: 3, color: "#ff4444" });
            } else {
              s.eBullets.push({ x: e.x + e.w / 2, y: e.y + e.h, vx: 0, vy: 3, size: 3, color: e.color });
            }
          }
        }
      }
      // 移除出界敌人
      s.enemies = s.enemies.filter(e => e.y < H + 50 || e.type === "boss");

      // 碰撞检测：玩家子弹 vs 敌人
      for (let bi = s.bullets.length - 1; bi >= 0; bi--) {
        const b = s.bullets[bi];
        for (let ei = s.enemies.length - 1; ei >= 0; ei--) {
          const e = s.enemies[ei];
          if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
            e.hp -= b.damage;
            if (!b.piercing) { s.bullets.splice(bi, 1); }
            spawnParticles(s.particles, b.x, b.y, e.color, 3);
            if (e.hp <= 0) {
              s.score += e.reward * (1 + Math.floor(s.combo / 5));
              s.combo++;
              if (s.combo > s.maxCombo) s.maxCombo = s.combo;
              s.enemiesKilled++;
              spawnParticles(s.particles, e.x + e.w / 2, e.y + e.h / 2, e.color, 12);
              if (e.type === "boss") { s.bossActive = false; s.bossesKilled++; }
              // 掉落道具
              if (Math.random() < 0.15 && s.powerups.length < MAX_POWERUPS) {
                const types: PowerUp["type"][] = ["spread", "shield", "rapid", "bomb"];
                s.powerups.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, type: types[Math.floor(Math.random() * types.length)], vy: 1.5 });
              }
              s.enemies.splice(ei, 1);
            }
            break;
          }
        }
      }

      // 碰撞检测：敌人子弹 vs 玩家
      if (s.invincible <= 0) {
        for (let i = s.eBullets.length - 1; i >= 0; i--) {
          const b = s.eBullets[i];
          const dx = b.x - s.px, dy = b.y - s.py;
          if (Math.sqrt(dx * dx + dy * dy) < 14) {
            s.eBullets.splice(i, 1);
            if (s.shield > 0) { s.shield -= 10; spawnParticles(s.particles, s.px, s.py, "#3ea6ff", 5); }
            else { s.hp -= 15; s.combo = 0; s.invincible = 60; spawnParticles(s.particles, s.px, s.py, "#ff4444", 8); }
          }
        }
        // 敌人撞玩家
        for (const e of s.enemies) {
          if (s.px > e.x - 10 && s.px < e.x + e.w + 10 && s.py > e.y - 10 && s.py < e.y + e.h + 10) {
            s.hp -= 25; s.combo = 0; s.invincible = 90;
            spawnParticles(s.particles, s.px, s.py, "#ff4444", 10);
          }
        }
      }

      // 道具拾取
      for (let i = s.powerups.length - 1; i >= 0; i--) {
        const pu = s.powerups[i];
        pu.y += pu.vy;
        if (pu.y > H + 20) { s.powerups.splice(i, 1); continue; }
        const dx = pu.x - s.px, dy = pu.y - s.py;
        if (Math.sqrt(dx * dx + dy * dy) < 20) {
          s.powerups.splice(i, 1);
          if (pu.type === "spread") { s.weapon = "spread"; s.weaponTimer = 600; }
          else if (pu.type === "rapid") { s.weapon = "rapid"; s.weaponTimer = 480; }
          else if (pu.type === "shield") { s.shield = Math.min(s.shield + 30, s.shieldMax); }
          else if (pu.type === "bomb") {
            // 全屏清除
            for (const e of s.enemies) { if (e.type !== "boss") e.hp = 0; }
            s.eBullets = [];
            spawnParticles(s.particles, W / 2, H / 2, "#f0b90b", 30);
          }
        }
      }

      // 更新粒子
      s.particles = s.particles.filter(p => {
        p.x += p.vx; p.y += p.vy; p.life--;
        p.vx *= 0.96; p.vy *= 0.96;
        return p.life > 0;
      });

      // 更新UI状态
      setScore(s.score);
      setHp(s.hp);

      // 死亡检测
      if (s.hp <= 0) {
        setGameOver(true);
        setStarted(false);
        setStats({ score: s.score, wave: s.wave, killed: s.enemiesKilled, bosses: s.bossesKilled, combo: s.maxCombo });
        return;
      }

      drawGame(ctx, s);
      raf = requestAnimationFrame(update);
    }

    raf = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("touchmove", onTouch);
      canvas.removeEventListener("touchstart", onTouch);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [started]);

  return (
    <>
      <Header />
      <main className="max-w-[500px] mx-auto px-4 py-4 pb-20 md:pb-8">
        <div className="flex items-center gap-2 mb-3">
          <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-[#3ea6ff] transition"><ChevronLeft size={16} /></Link>
          <h1 className="text-lg font-bold">太空射击</h1>
        </div>

        <div className="relative bg-black rounded-2xl overflow-hidden border border-[#333]/50 shadow-2xl">
          <canvas ref={canvasRef} width={W} height={H} className="w-full block" style={{ imageRendering: "pixelated" }} />

          {/* 开始界面 */}
          {!started && !gameOver && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-[#3ea6ff]/15 flex items-center justify-center mb-4"></div>
              <h2 className="text-2xl font-black mb-2 text-[#3ea6ff]">太空射击</h2>
              <p className="text-[#8a8a8a] text-sm mb-6 text-center px-8">
                方向键/WASD移动 · 自动射击<br/>
                手机触摸左右移动
              </p>
              <button onClick={start} className="px-8 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition active:scale-95">
                开始游戏
              </button>
            </div>
          )}

          {/* 游戏结束 */}
          {gameOver && (
            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-[#ff4444]/15 flex items-center justify-center mb-3"></div>
              <h2 className="text-xl font-black mb-4 text-[#ff4444]">游戏结束</h2>
              <div className="grid grid-cols-2 gap-3 mb-6 text-center">
                <div className="p-3 rounded-xl bg-[#1a1a1a] border border-[#333]/50">
                  <p className="text-2xl font-black text-[#3ea6ff]">{stats.score}</p>
                  <p className="text-[10px] text-[#8a8a8a]">总分</p>
                </div>
                <div className="p-3 rounded-xl bg-[#1a1a1a] border border-[#333]/50">
                  <p className="text-2xl font-black text-[#f0b90b]">{stats.wave}</p>
                  <p className="text-[10px] text-[#8a8a8a]">波次</p>
                </div>
                <div className="p-3 rounded-xl bg-[#1a1a1a] border border-[#333]/50">
                  <p className="text-2xl font-black text-[#2ba640]">{stats.killed}</p>
                  <p className="text-[10px] text-[#8a8a8a]">击杀</p>
                </div>
                <div className="p-3 rounded-xl bg-[#1a1a1a] border border-[#333]/50">
                  <p className="text-2xl font-black text-[#a855f7]">{stats.combo}x</p>
                  <p className="text-[10px] text-[#8a8a8a]">最高连击</p>
                </div>
              </div>
              <button onClick={start} className="px-8 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition active:scale-95">
                再来一局
              </button>
            </div>
          )}
        </div>

        {/* 操作说明 */}
        {started && (
          <div className="mt-3 flex items-center justify-between text-[11px] text-[#666]">
            <span>分数: {score}</span>
            <span>波次: {wave}</span>
            <span>HP: {hp}</span>
          </div>
        )}
      </main>
    </>
  );
}
