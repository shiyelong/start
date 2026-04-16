"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import {
  ChevronLeft, Volume2, VolumeX, Zap, Lock, Play,
  RotateCcw, Swords, Shield, Heart, Flame, Trophy,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight
} from "lucide-react";
import { ageGate } from "@/lib/age-gate";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "adult-fight";
const CW = 480, CH = 320;
const GROUND_Y = 240;
const GRAVITY = 1800;
const PRIMARY = "#a55eea";

type Difficulty = "easy" | "normal" | "hard";
type Phase = "title" | "charSelect" | "playing" | "victory" | "defeat" | "reward";
type AttackType = "lightPunch" | "heavyPunch" | "kick" | "special";

// ─── Character Definitions ───────────────────────────────────────────────────
interface CharDef {
  id: string; name: string; type: string;
  speed: number; power: number; defense: number;
  maxHp: number; maxEnergy: number;
  color: string; accentColor: string;
  desc: string;
}

const CHARACTERS: CharDef[] = [
  {
    id: "shadow", name: "暗影", type: "速度型",
    speed: 6, power: 7, defense: 5,
    maxHp: 100, maxEnergy: 100,
    color: "#8854d0", accentColor: "#a55eea",
    desc: "迅捷如风，连击之王",
  },
  {
    id: "titan", name: "泰坦", type: "力量型",
    speed: 3, power: 10, defense: 8,
    maxHp: 130, maxEnergy: 80,
    color: "#e74c3c", accentColor: "#ff6b6b",
    desc: "力大无穷，一击必杀",
  },
  {
    id: "blade", name: "刃舞", type: "平衡型",
    speed: 5, power: 8, defense: 7,
    maxHp: 110, maxEnergy: 90,
    color: "#3ea6ff", accentColor: "#74b9ff",
    desc: "攻守兼备，全能战士",
  },
];

// ─── Opponent Definitions ────────────────────────────────────────────────────
interface OpponentDef {
  name: string; color: string; hpMult: number; atkMult: number;
  speedMult: number; aggressiveness: number;
}

const OPPONENTS: OpponentDef[] = [
  { name: "铁拳", color: "#95a5a6", hpMult: 0.7, atkMult: 0.6, speedMult: 0.7, aggressiveness: 0.3 },
  { name: "烈焰", color: "#e67e22", hpMult: 0.85, atkMult: 0.8, speedMult: 0.85, aggressiveness: 0.45 },
  { name: "毒蛇", color: "#27ae60", hpMult: 1.0, atkMult: 1.0, speedMult: 1.0, aggressiveness: 0.55 },
  { name: "雷神", color: "#f1c40f", hpMult: 1.2, atkMult: 1.2, speedMult: 1.1, aggressiveness: 0.65 },
  { name: "魔王", color: "#9b59b6", hpMult: 1.5, atkMult: 1.5, speedMult: 1.2, aggressiveness: 0.8 },
];

// ─── Attack Data ─────────────────────────────────────────────────────────────
interface AttackData {
  name: string; damage: number; energyCost: number;
  cooldown: number; range: number; startup: number;
  hitstun: number; knockback: number;
}

const ATTACKS: Record<AttackType, AttackData> = {
  lightPunch: { name: "轻拳", damage: 8, energyCost: 0, cooldown: 0.25, range: 60, startup: 0.05, hitstun: 0.15, knockback: 30 },
  heavyPunch: { name: "重拳", damage: 18, energyCost: 5, cooldown: 0.5, range: 65, startup: 0.12, hitstun: 0.3, knockback: 60 },
  kick: { name: "踢击", damage: 14, energyCost: 3, cooldown: 0.4, range: 75, startup: 0.08, hitstun: 0.2, knockback: 50 },
  special: { name: "必杀技", damage: 35, energyCost: 30, cooldown: 1.0, range: 90, startup: 0.2, hitstun: 0.5, knockback: 100 },
};

// ─── Combo System ────────────────────────────────────────────────────────────
interface ComboRoute { sequence: AttackType[]; name: string; bonusDmg: number; }

const COMBO_ROUTES: ComboRoute[] = [
  { sequence: ["lightPunch", "lightPunch", "heavyPunch"], name: "连环拳", bonusDmg: 15 },
  { sequence: ["lightPunch", "kick", "heavyPunch"], name: "风暴连击", bonusDmg: 20 },
  { sequence: ["kick", "kick", "special"], name: "旋风终结", bonusDmg: 30 },
  { sequence: ["lightPunch", "lightPunch", "kick", "special"], name: "暗夜裁决", bonusDmg: 45 },
];

// ─── Fighter State ───────────────────────────────────────────────────────────
interface Fighter {
  x: number; y: number; vx: number; vy: number;
  hp: number; maxHp: number; energy: number; maxEnergy: number;
  power: number; defense: number; speed: number;
  facing: 1 | -1;
  state: "idle" | "walk" | "jump" | "attack" | "hit" | "block" | "down";
  attackType: AttackType | null;
  attackTimer: number; cooldownTimer: number; hitTimer: number;
  blockTimer: number;
  color: string; accentColor: string; name: string;
  comboHistory: AttackType[]; comboTimer: number;
  animFrame: number;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

interface GameState {
  player: Fighter;
  enemy: Fighter;
  stage: number;
  score: number;
  comboCount: number;
  maxCombo: number;
  particles: Particle[];
  shakeTimer: number;
  shakeIntensity: number;
  msg: string;
  msgTimer: number;
  roundTimer: number;
  rewardsUnlocked: number[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hexToNum(hex: string): number {
  if (hex.startsWith("#")) return parseInt(hex.slice(1, 7), 16);
  return 0xffffff;
}

function makeFighter(charDef: CharDef, x: number, facing: 1 | -1): Fighter {
  return {
    x, y: GROUND_Y, vx: 0, vy: 0,
    hp: charDef.maxHp, maxHp: charDef.maxHp,
    energy: charDef.maxEnergy, maxEnergy: charDef.maxEnergy,
    power: charDef.power, defense: charDef.defense, speed: charDef.speed,
    facing, state: "idle", attackType: null,
    attackTimer: 0, cooldownTimer: 0, hitTimer: 0, blockTimer: 0,
    color: charDef.color, accentColor: charDef.accentColor, name: charDef.name,
    comboHistory: [], comboTimer: 0, animFrame: 0,
  };
}

function makeEnemy(charDef: CharDef, opp: OpponentDef, diff: Difficulty): Fighter {
  const dm = diff === "easy" ? 0.7 : diff === "hard" ? 1.4 : 1.0;
  const f = makeFighter(charDef, CW - 100, -1);
  f.name = opp.name;
  f.color = opp.color;
  f.accentColor = opp.color;
  f.maxHp = Math.floor(charDef.maxHp * opp.hpMult * dm);
  f.hp = f.maxHp;
  f.power = Math.floor(charDef.power * opp.atkMult * dm);
  f.defense = Math.floor(charDef.defense * dm * 0.8);
  f.speed = Math.floor(charDef.speed * opp.speedMult);
  return f;
}

function spawnParticles(particles: Particle[], x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y: y - 20,
      vx: (Math.random() - 0.5) * 300,
      vy: -Math.random() * 250 - 50,
      life: 0.3 + Math.random() * 0.4,
      maxLife: 0.3 + Math.random() * 0.4,
      color, size: 2 + Math.random() * 3,
    });
  }
}

function checkCombo(history: AttackType[]): ComboRoute | null {
  for (const route of COMBO_ROUTES) {
    const seq = route.sequence;
    if (history.length >= seq.length) {
      const tail = history.slice(-seq.length);
      if (tail.every((a, i) => a === seq[i])) return route;
    }
  }
  return null;
}

const diffLabel = (d: Difficulty) => d === "easy" ? "简单" : d === "hard" ? "困难" : "普通";


// ─── Main Component ──────────────────────────────────────────────────────────
export default function AdultFight() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef<SoundEngine | null>(null);
  const keysRef = useRef(new Set<string>());

  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());
  const pixiInitRef = useRef(false);

  const [blocked, setBlocked] = useState(false);
  const [phase, setPhase] = useState<Phase>("title");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [selectedChar, setSelectedChar] = useState(0);
  const [muted, setMuted] = useState(false);
  const [score, setScore] = useState(0);
  const [stage, setStage] = useState(1);
  const [, setComboDisplay] = useState(0);

  const gsRef = useRef<GameState | null>(null);
  const lastRef = useRef(0);

  // Refs for render loop access
  const phaseRef = useRef(phase);
  const difficultyRef = useRef(difficulty);
  const stageRef = useRef(stage);
  const scoreRef = useRef(score);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);
  useEffect(() => { stageRef.current = stage; }, [stage]);
  useEffect(() => { scoreRef.current = score; }, [score]);

  // ─── Age Gate ──────────────────────────────────────────────────────────────
  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  // ─── Sound ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    return () => { soundRef.current?.dispose(); };
  }, []);

  const playSound = useCallback((type: "hit" | "block" | "special" | "ko" | "win" | "combo" | "click") => {
    const s = soundRef.current;
    if (!s || muted) return;
    switch (type) {
      case "hit": s.playClick(); break;
      case "block": s.playMove(); break;
      case "special": s.playCombo(3); break;
      case "ko": s.playGameOver(); break;
      case "win": s.playLevelUp(); break;
      case "combo": s.playScore(200); break;
      case "click": s.playClick(); break;
    }
  }, [muted]);

  const toggleMute = useCallback(() => {
    const m = soundRef.current?.toggleMute();
    setMuted(m ?? false);
  }, []);

  // ─── Init Game State ───────────────────────────────────────────────────────
  const initGameState = useCallback((charIdx: number, diff: Difficulty, stageNum: number, prevScore: number, rewards: number[]): GameState => {
    const charDef = CHARACTERS[charIdx];
    const opp = OPPONENTS[Math.min(stageNum - 1, OPPONENTS.length - 1)];
    const player = makeFighter(charDef, 100, 1);
    const enemy = makeEnemy(charDef, opp, diff);
    return {
      player, enemy, stage: stageNum, score: prevScore,
      comboCount: 0, maxCombo: 0, particles: [],
      shakeTimer: 0, shakeIntensity: 0,
      msg: `第${stageNum}关 - ${opp.name}`, msgTimer: 2,
      roundTimer: 99, rewardsUnlocked: [...rewards],
    };
  }, []);

  // ─── Start Game ────────────────────────────────────────────────────────────
  const startGame = useCallback((charIdx: number, diff: Difficulty) => {
    setSelectedChar(charIdx);
    setDifficulty(diff);
    setStage(1);
    setScore(0);
    setComboDisplay(0);
    const gs = initGameState(charIdx, diff, 1, 0, []);
    gsRef.current = gs;
    setPhase("playing");
    lastRef.current = 0;
    playSound("click");
  }, [initGameState, playSound]);

  // ─── Next Stage ────────────────────────────────────────────────────────────
  const nextStage = useCallback(() => {
    const gs = gsRef.current;
    if (!gs) return;
    const ns = gs.stage + 1;
    if (ns > 5) { setPhase("victory"); playSound("win"); return; }
    setStage(ns);
    const newGs = initGameState(selectedChar, difficulty, ns, gs.score, gs.rewardsUnlocked);
    newGs.player.hp = Math.min(gs.player.hp + 30, newGs.player.maxHp);
    newGs.player.energy = newGs.player.maxEnergy;
    gsRef.current = newGs;
    setPhase("playing");
    lastRef.current = 0;
  }, [selectedChar, difficulty, initGameState, playSound]);

  // ─── Attack Logic ──────────────────────────────────────────────────────────
  const performAttack = useCallback((gs: GameState, attacker: Fighter, defender: Fighter, atkType: AttackType, isPlayer: boolean) => {
    const atk = ATTACKS[atkType];
    if (attacker.cooldownTimer > 0 || attacker.energy < atk.energyCost) return;
    if (attacker.state === "hit" || attacker.state === "down") return;

    attacker.state = "attack";
    attacker.attackType = atkType;
    attacker.attackTimer = atk.startup + 0.1;
    attacker.cooldownTimer = atk.cooldown;
    attacker.energy = Math.max(0, attacker.energy - atk.energyCost);

    const dist = Math.abs(attacker.x - defender.x);
    if (dist <= atk.range) {
      if (defender.state === "block" && defender.blockTimer > 0) {
        spawnParticles(gs.particles, defender.x, defender.y, "#ffffff", 3);
        playSound("block");
        defender.vx = defender.facing * -20;
        gs.msg = "格挡"; gs.msgTimer = 0.5;
      } else {
        const baseDmg = atk.damage * (attacker.power / 8);
        const defReduction = defender.defense * 0.5;
        let dmg = Math.max(1, Math.floor(baseDmg - defReduction + (Math.random() * 4 - 2)));

        if (isPlayer) {
          gs.comboCount++;
          if (gs.comboCount > gs.maxCombo) gs.maxCombo = gs.comboCount;
          const comboMult = 1 + gs.comboCount * 0.1;
          dmg = Math.floor(dmg * comboMult);

          attacker.comboHistory.push(atkType);
          attacker.comboTimer = 1.5;
          const combo = checkCombo(attacker.comboHistory);
          if (combo) {
            dmg += combo.bonusDmg;
            gs.msg = combo.name; gs.msgTimer = 1.0;
            spawnParticles(gs.particles, defender.x, defender.y, "#ffd700", 15);
            attacker.comboHistory = [];
            playSound("combo");
          } else {
            playSound("hit");
          }

          gs.score += dmg * gs.comboCount;
          setScore(gs.score);
          setComboDisplay(gs.comboCount);
        } else {
          gs.comboCount = 0;
          setComboDisplay(0);
          playSound("hit");
        }

        defender.hp = Math.max(0, defender.hp - dmg);
        defender.state = "hit";
        defender.hitTimer = atk.hitstun;
        defender.vx = defender.facing * -atk.knockback;

        spawnParticles(gs.particles, defender.x, defender.y, isPlayer ? "#ffd700" : "#ff4757", 8);
        gs.shakeTimer = 0.1;
        gs.shakeIntensity = atkType === "special" ? 8 : 4;

        if (!isPlayer) {
          gs.msg = `${atk.name} -${dmg}`; gs.msgTimer = 0.6;
        }
      }
    }
  }, [playSound]);

  // ─── AI Logic ──────────────────────────────────────────────────────────────
  const aiUpdate = useCallback((gs: GameState, dt: number) => {
    const e = gs.enemy;
    const p = gs.player;
    if (e.state === "hit" || e.state === "down" || e.hp <= 0) return;
    if (e.cooldownTimer > 0) return;

    const opp = OPPONENTS[Math.min(gs.stage - 1, OPPONENTS.length - 1)];
    const aggr = opp.aggressiveness;
    const diffMult = difficulty === "easy" ? 0.5 : difficulty === "hard" ? 1.5 : 1.0;
    const dist = Math.abs(e.x - p.x);

    e.facing = p.x < e.x ? -1 : 1;

    const actionRoll = Math.random();

    if (dist > 100) {
      e.vx = e.facing * e.speed * 40;
      e.state = "walk";
    } else if (dist <= 90) {
      if (actionRoll < aggr * diffMult * 0.6) {
        const atkRoll = Math.random();
        let atkType: AttackType;
        if (atkRoll < 0.4) atkType = "lightPunch";
        else if (atkRoll < 0.65) atkType = "kick";
        else if (atkRoll < 0.85) atkType = "heavyPunch";
        else atkType = e.energy >= 30 ? "special" : "lightPunch";
        performAttack(gs, e, p, atkType, false);
      } else if (actionRoll < aggr * diffMult * 0.6 + 0.2) {
        e.state = "block";
        e.blockTimer = 0.5 + Math.random() * 0.5;
      } else {
        e.vx = -e.facing * e.speed * 30;
        e.state = "walk";
      }
    }

    e.energy = Math.min(e.maxEnergy, e.energy + dt * 8);
  }, [difficulty, performAttack]);

  // ─── Save / Load ───────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const gs = gsRef.current;
    if (!gs) return null;
    return {
      selectedChar, difficulty, stage: gs.stage, score: gs.score,
      playerHp: gs.player.hp, playerEnergy: gs.player.energy,
      rewardsUnlocked: gs.rewardsUnlocked, maxCombo: gs.maxCombo,
    };
  }, [selectedChar, difficulty]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d || typeof d !== "object") return;
    const ci = (d.selectedChar as number) ?? 0;
    const diff = (d.difficulty as Difficulty) ?? "normal";
    const st = (d.stage as number) ?? 1;
    const sc = (d.score as number) ?? 0;
    const rewards = (d.rewardsUnlocked as number[]) ?? [];
    setSelectedChar(ci);
    setDifficulty(diff);
    setStage(st);
    setScore(sc);
    const gs = initGameState(ci, diff, st, sc, rewards);
    gs.player.hp = (d.playerHp as number) ?? gs.player.maxHp;
    gs.player.energy = (d.playerEnergy as number) ?? gs.player.maxEnergy;
    gs.maxCombo = (d.maxCombo as number) ?? 0;
    gsRef.current = gs;
    setPhase("playing");
    lastRef.current = 0;
  }, [initGameState]);

  // ─── PixiJS Render Loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;

    async function initPixi() {
      if (pixiInitRef.current || destroyed) return;
      pixiInitRef.current = true;
      const pixi = await loadPixi();
      if (destroyed) return;
      const app = await createPixiApp({ canvas: canvas!, width: CW, height: CH, backgroundColor: 0x0a0a1a, antialias: true });
      if (destroyed) { app.destroy(true); return; }
      pixiAppRef.current = app;

      const gfx = new pixi.Graphics();
      app.stage.addChild(gfx);
      pixiGfxRef.current = gfx;

      const textContainer = new pixi.Container();
      app.stage.addChild(textContainer);
      const texts = pixiTextsRef.current;
      texts.clear();

      const makeText = (key: string, opts: { fontSize?: number; fill?: string | number; fontWeight?: string }) => {
        const t = new pixi.Text({ text: "", style: new pixi.TextStyle({
          fontSize: opts.fontSize ?? 12,
          fill: opts.fill ?? "#ffffff",
          fontWeight: (opts.fontWeight ?? "normal") as "normal" | "bold",
          fontFamily: "sans-serif",
        })});
        t.visible = false;
        textContainer.addChild(t);
        texts.set(key, t);
      };

      for (let i = 0; i < 80; i++) makeText(`t${i}`, { fontSize: 12 });

      let textIdx = 0;
      const showText = (text: string, x: number, y: number, opts?: { fill?: string; fontSize?: number; fontWeight?: string; ax?: number; ay?: number; alpha?: number }) => {
        if (textIdx >= 80) return;
        const t = texts.get(`t${textIdx}`)!;
        textIdx++;
        t.text = text;
        t.x = x; t.y = y;
        t.anchor.set(opts?.ax ?? 0, opts?.ay ?? 0);
        t.alpha = opts?.alpha ?? 1;
        t.style.fill = opts?.fill ?? "#ffffff";
        t.style.fontSize = opts?.fontSize ?? 12;
        t.style.fontWeight = (opts?.fontWeight ?? "normal") as "normal" | "bold";
        t.visible = true;
      };

      const cn = hexToNum;

      let prevTime = 0;

      app.ticker.add((ticker) => {
        if (destroyed) return;
        const now = ticker.lastTime;
        if (!prevTime) prevTime = now;
        const dt = Math.min((now - prevTime) / 1000, 0.05);
        prevTime = now;

        gfx.clear();
        texts.forEach(tx => { tx.visible = false; });
        textIdx = 0;

        const currentPhase = phaseRef.current;
        const gs = gsRef.current;

        if (currentPhase === "playing" && gs) {
          const keys = keysRef.current;
          const p = gs.player;
          const e = gs.enemy;

          // ─── Player Input ────────────────────────────────────────────
          if (p.state !== "hit" && p.state !== "down" && p.hp > 0) {
            let moving = false;
            if (keys.has("a") || keys.has("A") || keys.has("ArrowLeft")) {
              p.vx = -p.speed * 50; p.facing = -1; moving = true;
            } else if (keys.has("d") || keys.has("D") || keys.has("ArrowRight")) {
              p.vx = p.speed * 50; p.facing = 1; moving = true;
            } else {
              p.vx *= 0.8;
            }
            if ((keys.has("w") || keys.has("W") || keys.has("ArrowUp")) && p.y >= GROUND_Y) {
              p.vy = -500; p.state = "jump";
            }
            if (keys.has("s") || keys.has("S") || keys.has("ArrowDown")) {
              p.state = "block"; p.blockTimer = 0.3;
            }
            if (moving && p.state !== "attack" && p.state !== "jump" && p.state !== "block") {
              p.state = "walk";
            }
          }

          // ─── Update Fighters ─────────────────────────────────────────
          for (const f of [p, e]) {
            f.x += f.vx * dt;
            f.vy += GRAVITY * dt;
            f.y += f.vy * dt;
            if (f.y >= GROUND_Y) { f.y = GROUND_Y; f.vy = 0; if (f.state === "jump") f.state = "idle"; }
            f.x = Math.max(30, Math.min(CW - 30, f.x));
            f.vx *= 0.9;

            f.cooldownTimer = Math.max(0, f.cooldownTimer - dt);
            f.animFrame += dt * 8;

            if (f.attackTimer > 0) {
              f.attackTimer -= dt;
              if (f.attackTimer <= 0) { f.state = "idle"; f.attackType = null; }
            }
            if (f.hitTimer > 0) {
              f.hitTimer -= dt;
              if (f.hitTimer <= 0) { f.state = f.hp > 0 ? "idle" : "down"; }
            }
            if (f.blockTimer > 0) {
              f.blockTimer -= dt;
              if (f.blockTimer <= 0 && f.state === "block") f.state = "idle";
            }
            if (f.comboTimer > 0) {
              f.comboTimer -= dt;
              if (f.comboTimer <= 0) f.comboHistory = [];
            }
          }

          p.energy = Math.min(p.maxEnergy, p.energy + dt * 12);

          if (p.state === "idle" || p.state === "walk") {
            p.facing = e.x > p.x ? 1 : -1;
          }

          // AI
          aiUpdate(gs, dt);

          // Particles
          for (const pt of gs.particles) {
            pt.x += pt.vx * dt;
            pt.y += pt.vy * dt;
            pt.vy += 400 * dt;
            pt.life -= dt;
          }
          gs.particles = gs.particles.filter(pt => pt.life > 0);

          gs.shakeTimer = Math.max(0, gs.shakeTimer - dt);
          gs.msgTimer = Math.max(0, gs.msgTimer - dt);
          gs.roundTimer -= dt;

          // Check win/lose
          if (e.hp <= 0 && e.state !== "down") {
            e.state = "down";
            gs.rewardsUnlocked.push(gs.stage);
            gs.score += 500 * gs.stage;
            setScore(gs.score);
            setTimeout(() => {
              if (gs.stage >= 5) {
                setPhase("victory");
              } else {
                setPhase("reward");
              }
            }, 1500);
          }
          if (p.hp <= 0 && p.state !== "down") {
            p.state = "down";
            setTimeout(() => setPhase("defeat"), 1500);
          }
          if (gs.roundTimer <= 0) {
            if (p.hp > e.hp) {
              e.hp = 0; e.state = "down";
            } else {
              p.hp = 0; p.state = "down";
            }
          }

          // ─── Render Playing ──────────────────────────────────────────
          const sx = gs.shakeTimer > 0 ? (Math.random() - 0.5) * gs.shakeIntensity : 0;
          const sy = gs.shakeTimer > 0 ? (Math.random() - 0.5) * gs.shakeIntensity : 0;

          // Background
          gfx.rect(sx - 10, sy - 10, CW + 20, CH * 0.5 + 10).fill({ color: 0x0a0a1a });
          gfx.rect(sx - 10, sy + CH * 0.5, CW + 20, CH * 0.5 + 10).fill({ color: 0x1a0a2e });

          // Arena floor
          gfx.rect(sx, sy + GROUND_Y + 30, CW, CH - GROUND_Y - 30).fill({ color: 0x1a1a2e });
          gfx.moveTo(sx, sy + GROUND_Y + 30).lineTo(sx + CW, sy + GROUND_Y + 30).stroke({ color: 0x333333, width: 2 });

          // Stage indicator
          showText(`第${gs.stage}关 - ${diffLabel(difficultyRef.current)}`, CW / 2 + sx, 14 + sy, { fill: "#555555", fontSize: 11, ax: 0.5, ay: 0.5 });

          // Draw fighters
          for (const f of [p, e]) {
            const isP = f === p;
            const fx = f.x + sx;
            const fy = f.y + sy;

            // Shadow
            gfx.ellipse(fx, fy + 30, 20, 6).fill({ color: 0x000000, alpha: 0.3 });

            const bodyBob = f.state === "walk" ? Math.sin(f.animFrame * 3) * 3 : 0;
            const hitFlash = f.state === "hit" && Math.floor(f.animFrame * 20) % 2 === 0;

            // Legs
            const legColor = hitFlash ? 0xffffff : 0x333333;
            const legSpread = f.state === "walk" ? Math.sin(f.animFrame * 4) * 8 : 4;
            gfx.rect(fx - legSpread - 3, fy + 10, 6, 20).fill({ color: legColor });
            gfx.rect(fx + legSpread - 3, fy + 10, 6, 20).fill({ color: legColor });

            // Torso
            const torsoColor = hitFlash ? 0xffffff : cn(f.color);
            gfx.rect(fx - 12, fy - 20 + bodyBob, 24, 30).fill({ color: torsoColor });

            // Head
            const headColor = hitFlash ? 0xffffff : cn(f.accentColor);
            gfx.circle(fx, fy - 28 + bodyBob, 10).fill({ color: headColor });

            // Arms
            const armColor = hitFlash ? 0xffffff : cn(f.color);
            if (f.state === "attack") {
              gfx.rect(f.facing > 0 ? fx + 12 : fx - 37, fy - 15 + bodyBob, 25, 6).fill({ color: armColor });
              const fistColor = hitFlash ? 0xffffff : cn(f.accentColor);
              const armX = f.facing * 25;
              gfx.circle(fx + armX + f.facing * 10, fy - 12 + bodyBob, 5).fill({ color: fistColor });
            } else if (f.state === "block") {
              gfx.rect(fx - 8, fy - 18 + bodyBob, 6, 16).fill({ color: armColor });
              gfx.rect(fx + 2, fy - 18 + bodyBob, 6, 16).fill({ color: armColor });
            } else {
              gfx.rect(fx - 16, fy - 15 + bodyBob, 6, 14).fill({ color: armColor });
              gfx.rect(fx + 10, fy - 15 + bodyBob, 6, 14).fill({ color: armColor });
            }

            // Down state alpha handled via separate draw (PixiJS Graphics doesn't support per-shape alpha easily for complex shapes)

            // Name
            showText(f.name, fx, fy - 42, { fill: isP ? "#3ea6ff" : "#ff6b6b", fontSize: 10, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          }

          // Particles
          for (const pt of gs.particles) {
            const alpha = pt.life / pt.maxLife;
            gfx.circle(pt.x + sx, pt.y + sy, pt.size).fill({ color: cn(pt.color), alpha });
          }

          // ─── HUD ─────────────────────────────────────────────────────
          // Player HP bar
          gfx.rect(10, 24, 160, 10).fill({ color: 0x222222 });
          const pHpColor = p.hp / p.maxHp > 0.3 ? 0x27ae60 : 0xe74c3c;
          gfx.rect(10, 24, 160 * Math.max(0, p.hp / p.maxHp), 10).fill({ color: pHpColor });
          gfx.rect(10, 24, 160, 10).stroke({ color: 0x555555, width: 1 });
          showText(`${Math.max(0, Math.ceil(p.hp))}/${p.maxHp}`, 12, 29, { fill: "#ffffff", fontSize: 9, ay: 0.5 });

          // Player Energy bar
          gfx.rect(10, 36, 120, 6).fill({ color: 0x222222 });
          gfx.rect(10, 36, 120 * Math.max(0, p.energy / p.maxEnergy), 6).fill({ color: 0x3ea6ff });
          gfx.rect(10, 36, 120, 6).stroke({ color: 0x555555, width: 1 });

          // Enemy HP bar
          gfx.rect(CW - 170, 24, 160, 10).fill({ color: 0x222222 });
          const eHpColor = e.hp / e.maxHp > 0.3 ? 0xe74c3c : 0xff6b6b;
          gfx.rect(CW - 170, 24, 160 * Math.max(0, e.hp / e.maxHp), 10).fill({ color: eHpColor });
          gfx.rect(CW - 170, 24, 160, 10).stroke({ color: 0x555555, width: 1 });
          showText(`${Math.max(0, Math.ceil(e.hp))}/${e.maxHp}`, CW - 12, 29, { fill: "#ffffff", fontSize: 9, ax: 1, ay: 0.5 });

          // Enemy Energy bar
          gfx.rect(CW - 130, 36, 120, 6).fill({ color: 0x222222 });
          gfx.rect(CW - 130, 36, 120 * Math.max(0, e.energy / e.maxEnergy), 6).fill({ color: 0xe67e22 });
          gfx.rect(CW - 130, 36, 120, 6).stroke({ color: 0x555555, width: 1 });

          // Combo counter
          if (gs.comboCount > 1) {
            showText(`${gs.comboCount} 连击`, 10, 55, { fill: "#ffd700", fontSize: 18, fontWeight: "bold" });
          }

          // Timer
          showText(`${Math.max(0, Math.ceil(gs.roundTimer))}`, CW / 2, 28, {
            fill: gs.roundTimer < 10 ? "#ff4757" : "#aaaaaa", fontSize: 16, fontWeight: "bold", ax: 0.5, ay: 0.5,
          });

          // Score
          showText(`分数: ${gs.score}`, CW / 2, CH - 8, { fill: "#aaaaaa", fontSize: 11, ax: 0.5, ay: 0.5 });

          // Message
          if (gs.msgTimer > 0) {
            showText(gs.msg, CW / 2, CH / 2 - 40, {
              fill: "#ffd700", fontSize: 16, fontWeight: "bold", ax: 0.5, ay: 0.5,
              alpha: Math.min(1, gs.msgTimer * 2),
            });
          }

        } else {
          // Non-playing phases
          gfx.rect(0, 0, CW, CH).fill({ color: 0x0a0a1a });

          if (currentPhase === "title") {
            showText("暗夜格斗", CW / 2, CH / 2 - 50, { fill: PRIMARY, fontSize: 32, fontWeight: "bold", ax: 0.5, ay: 0.5 });
            showText("NC-17 成人格斗游戏", CW / 2, CH / 2 - 20, { fill: "#aaaaaa", fontSize: 13, ax: 0.5, ay: 0.5 });
            showText("WASD 移动 / J 轻拳 / K 重拳 / L 踢 / U 必杀", CW / 2, CH / 2 + 10, { fill: "#666666", fontSize: 11, ax: 0.5, ay: 0.5 });
            showText("S 格挡 / W 跳跃", CW / 2, CH / 2 + 28, { fill: "#666666", fontSize: 11, ax: 0.5, ay: 0.5 });
            showText("点击开始", CW / 2, CH / 2 + 60, { fill: "#3ea6ff", fontSize: 14, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          } else if (currentPhase === "victory") {
            showText("全关通过", CW / 2, CH / 2 - 40, { fill: "#ffd700", fontSize: 28, fontWeight: "bold", ax: 0.5, ay: 0.5 });
            showText(`最终分数: ${scoreRef.current}`, CW / 2, CH / 2, { fill: "#aaaaaa", fontSize: 14, ax: 0.5, ay: 0.5 });
            showText(`最大连击: ${gsRef.current?.maxCombo ?? 0}`, CW / 2, CH / 2 + 22, { fill: "#aaaaaa", fontSize: 14, ax: 0.5, ay: 0.5 });
            showText("点击重新开始", CW / 2, CH / 2 + 60, { fill: "#3ea6ff", fontSize: 13, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          } else if (currentPhase === "defeat") {
            showText("战败", CW / 2, CH / 2 - 30, { fill: "#ff4757", fontSize: 28, fontWeight: "bold", ax: 0.5, ay: 0.5 });
            showText(`分数: ${scoreRef.current}`, CW / 2, CH / 2 + 5, { fill: "#aaaaaa", fontSize: 14, ax: 0.5, ay: 0.5 });
            showText("点击重新开始", CW / 2, CH / 2 + 45, { fill: "#3ea6ff", fontSize: 13, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          } else if (currentPhase === "reward") {
            showText("胜利", CW / 2, CH / 2 - 50, { fill: "#ffd700", fontSize: 22, fontWeight: "bold", ax: 0.5, ay: 0.5 });
            showText(`第${stageRef.current}关 通过`, CW / 2, CH / 2 - 20, { fill: PRIMARY, fontSize: 16, ax: 0.5, ay: 0.5 });
            showText("奖励场景已解锁", CW / 2, CH / 2 + 10, { fill: "#aaaaaa", fontSize: 13, ax: 0.5, ay: 0.5 });
            showText("点击进入下一关", CW / 2, CH / 2 + 50, { fill: "#3ea6ff", fontSize: 13, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          }
        }
      });
    }

    initPixi();

    return () => {
      destroyed = true;
      if (pixiAppRef.current) {
        pixiAppRef.current.destroy(true);
        pixiAppRef.current = null;
      }
      pixiGfxRef.current = null;
      pixiTextsRef.current.clear();
      pixiInitRef.current = false;
    };
  }, []);

  // ─── Keyboard Input ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);

      if (phase === "title") { setPhase("charSelect"); return; }
      if (phase === "victory" || phase === "defeat") { setPhase("title"); return; }
      if (phase === "reward") { nextStage(); return; }

      if (phase === "playing" && gsRef.current) {
        const gs = gsRef.current;
        if (e.key === "j" || e.key === "J") performAttack(gs, gs.player, gs.enemy, "lightPunch", true);
        if (e.key === "k" || e.key === "K") performAttack(gs, gs.player, gs.enemy, "heavyPunch", true);
        if (e.key === "l" || e.key === "L") performAttack(gs, gs.player, gs.enemy, "kick", true);
        if (e.key === "u" || e.key === "U") performAttack(gs, gs.player, gs.enemy, "special", true);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [phase, performAttack, nextStage]);

  // ─── Touch Attack Handler ──────────────────────────────────────────────────
  const touchAttack = useCallback((atkType: AttackType) => {
    const gs = gsRef.current;
    if (!gs || phase !== "playing") return;
    performAttack(gs, gs.player, gs.enemy, atkType, true);
  }, [phase, performAttack]);

  const touchMove = useCallback((dir: "left" | "right" | "up" | "down") => {
    if (dir === "left") { keysRef.current.add("a"); setTimeout(() => keysRef.current.delete("a"), 100); }
    if (dir === "right") { keysRef.current.add("d"); setTimeout(() => keysRef.current.delete("d"), 100); }
    if (dir === "up") { keysRef.current.add("w"); setTimeout(() => keysRef.current.delete("w"), 100); }
    if (dir === "down") { keysRef.current.add("s"); setTimeout(() => keysRef.current.delete("s"), 100); }
  }, []);

  const canvasClick = useCallback(() => {
    if (phase === "title") setPhase("charSelect");
    else if (phase === "victory" || phase === "defeat") setPhase("title");
    else if (phase === "reward") nextStage();
  }, [phase, nextStage]);

  // ─── Blocked ───────────────────────────────────────────────────────────────
  if (blocked) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <Lock size={48} className="mx-auto text-gray-600 mb-4" />
          <h1 className="text-xl font-bold mb-2">访问受限</h1>
          <p className="text-gray-400">需要 NC-17 成人模式才能访问此内容。</p>
          <Link href="/zone/games" className="mt-4 inline-block text-[#3ea6ff]">返回</Link>
        </div>
      </div>
    );
  }

  // ─── Character Select Phase ────────────────────────────────────────────────
  if (phase === "charSelect") {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-6">
          <Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4">
            <ChevronLeft size={16} /> 返回
          </Link>

          <div className="flex items-center gap-2 mb-6">
            <Swords size={24} className="text-[#a55eea]" />
            <h1 className="text-xl font-bold">暗夜格斗 - 选择角色</h1>
          </div>

          {/* Character Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {CHARACTERS.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setSelectedChar(i)}
                className={`p-4 rounded-xl border-2 transition text-left ${
                  selectedChar === i
                    ? "border-[#3ea6ff] bg-[#3ea6ff]/10"
                    : "border-[#333] bg-[#1a1a1a] hover:border-[#555]"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full" style={{ backgroundColor: c.color }} />
                  <div>
                    <div className="font-bold text-sm">{c.name}</div>
                    <div className="text-[10px] text-gray-400">{c.type}</div>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mb-2">{c.desc}</p>
                <div className="space-y-1 text-[10px]">
                  <div className="flex items-center gap-1">
                    <Zap size={10} className="text-yellow-400" />
                    <span className="text-gray-400 w-8">速度</span>
                    <div className="flex-1 h-1.5 bg-[#333] rounded-full">
                      <div className="h-full rounded-full bg-yellow-400" style={{ width: `${c.speed * 10}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Flame size={10} className="text-red-400" />
                    <span className="text-gray-400 w-8">力量</span>
                    <div className="flex-1 h-1.5 bg-[#333] rounded-full">
                      <div className="h-full rounded-full bg-red-400" style={{ width: `${c.power * 10}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Shield size={10} className="text-blue-400" />
                    <span className="text-gray-400 w-8">防御</span>
                    <div className="flex-1 h-1.5 bg-[#333] rounded-full">
                      <div className="h-full rounded-full bg-blue-400" style={{ width: `${c.defense * 10}%` }} />
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Difficulty */}
          <div className="mb-6">
            <h3 className="text-sm font-bold mb-2 text-gray-300">难度选择</h3>
            <div className="flex gap-2">
              {(["easy", "normal", "hard"] as Difficulty[]).map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`px-4 py-2 rounded-lg text-sm border transition ${
                    difficulty === d
                      ? "border-[#3ea6ff] bg-[#3ea6ff]/20 text-[#3ea6ff] font-bold"
                      : "border-[#333] text-gray-400 hover:border-[#555]"
                  }`}
                >
                  {diffLabel(d)}
                </button>
              ))}
            </div>
          </div>

          {/* Opponents Preview */}
          <div className="mb-6">
            <h3 className="text-sm font-bold mb-2 text-gray-300">对手一览</h3>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {OPPONENTS.map((o, i) => (
                <div key={i} className="flex-shrink-0 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-center min-w-[70px]">
                  <div className="w-6 h-6 rounded-full mx-auto mb-1" style={{ backgroundColor: o.color }} />
                  <div className="text-xs font-bold">{o.name}</div>
                  <div className="text-[10px] text-gray-500">第{i + 1}关</div>
                </div>
              ))}
            </div>
          </div>

          {/* Start Button */}
          <button
            onClick={() => startGame(selectedChar, difficulty)}
            className="w-full py-3 rounded-xl bg-[#a55eea] hover:bg-[#a55eea]/80 text-white font-bold text-sm flex items-center justify-center gap-2 transition"
          >
            <Play size={16} /> 开始战斗
          </button>

          {/* Controls Info */}
          <div className="mt-4 p-3 rounded-lg bg-[#1a1a1a] border border-[#333] text-xs text-gray-400">
            <div className="font-bold text-gray-300 mb-1">操作说明</div>
            <div className="grid grid-cols-2 gap-1">
              <span>WASD / 方向键 - 移动</span>
              <span>J - 轻拳</span>
              <span>K - 重拳</span>
              <span>L - 踢击</span>
              <span>U - 必杀技</span>
              <span>S / 下 - 格挡</span>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ─── Main Game UI ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff]">
            <ChevronLeft size={16} /> 返回
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="p-1.5 rounded-lg hover:bg-white/10 transition text-gray-400">
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button
              onClick={() => setPhase("title")}
              className="p-1.5 rounded-lg hover:bg-white/10 transition text-gray-400"
              title="重新开始"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <Swords size={22} className="text-[#a55eea]" />
          <h1 className="text-lg font-bold">暗夜格斗</h1>
          {phase === "playing" && (
            <span className="text-xs text-gray-500 ml-auto">
              第{stage}关 / {diffLabel(difficulty)}
            </span>
          )}
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          onClick={canvasClick}
          className="w-full rounded-xl border border-white/10 cursor-pointer"
          style={{ maxWidth: CW, aspectRatio: `${CW}/${CH}` }}
        />

        {/* Touch Controls */}
        {phase === "playing" && (
          <div className="mt-3 flex items-start justify-between gap-2 md:hidden">
            {/* D-Pad */}
            <div className="grid grid-cols-3 gap-1 w-28">
              <div />
              <button
                onTouchStart={(e) => { e.preventDefault(); touchMove("up"); }}
                className="p-2 rounded-lg bg-[#1a1a1a] border border-[#333] active:bg-[#333] flex items-center justify-center"
              >
                <ArrowUp size={16} />
              </button>
              <div />
              <button
                onTouchStart={(e) => { e.preventDefault(); touchMove("left"); }}
                className="p-2 rounded-lg bg-[#1a1a1a] border border-[#333] active:bg-[#333] flex items-center justify-center"
              >
                <ArrowLeft size={16} />
              </button>
              <button
                onTouchStart={(e) => { e.preventDefault(); touchMove("down"); }}
                className="p-2 rounded-lg bg-[#1a1a1a] border border-[#333] active:bg-[#333] flex items-center justify-center"
              >
                <ArrowDown size={16} />
              </button>
              <button
                onTouchStart={(e) => { e.preventDefault(); touchMove("right"); }}
                className="p-2 rounded-lg bg-[#1a1a1a] border border-[#333] active:bg-[#333] flex items-center justify-center"
              >
                <ArrowRight size={16} />
              </button>
            </div>

            {/* Attack Buttons */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onTouchStart={(e) => { e.preventDefault(); touchAttack("lightPunch"); }}
                className="px-3 py-2.5 rounded-lg bg-[#27ae60]/20 border border-[#27ae60]/40 text-[#27ae60] text-xs font-bold active:bg-[#27ae60]/40"
              >
                轻拳
              </button>
              <button
                onTouchStart={(e) => { e.preventDefault(); touchAttack("heavyPunch"); }}
                className="px-3 py-2.5 rounded-lg bg-[#e74c3c]/20 border border-[#e74c3c]/40 text-[#e74c3c] text-xs font-bold active:bg-[#e74c3c]/40"
              >
                重拳
              </button>
              <button
                onTouchStart={(e) => { e.preventDefault(); touchAttack("kick"); }}
                className="px-3 py-2.5 rounded-lg bg-[#f39c12]/20 border border-[#f39c12]/40 text-[#f39c12] text-xs font-bold active:bg-[#f39c12]/40"
              >
                踢击
              </button>
              <button
                onTouchStart={(e) => { e.preventDefault(); touchAttack("special"); }}
                className="px-3 py-2.5 rounded-lg bg-[#a55eea]/20 border border-[#a55eea]/40 text-[#a55eea] text-xs font-bold active:bg-[#a55eea]/40"
              >
                必杀
              </button>
            </div>
          </div>
        )}

        {/* Combo Moves Reference */}
        {phase === "playing" && (
          <div className="mt-3 p-3 rounded-lg bg-[#1a1a1a] border border-[#333]">
            <h3 className="text-xs font-bold text-gray-300 mb-1.5">连招表</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px] text-gray-400">
              {COMBO_ROUTES.map((c, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className="text-[#ffd700] font-bold">{c.name}</span>
                  <span>-</span>
                  <span>{c.sequence.map(a => ATTACKS[a].name).join(" → ")}</span>
                  <span className="text-[#27ae60]">+{c.bonusDmg}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rewards Unlocked */}
        {gsRef.current && gsRef.current.rewardsUnlocked.length > 0 && (
          <div className="mt-3 p-3 rounded-lg bg-[#1a1a1a] border border-[#333]">
            <h3 className="text-xs font-bold text-gray-300 mb-1.5 flex items-center gap-1">
              <Trophy size={12} className="text-[#ffd700]" /> 已解锁奖励
            </h3>
            <div className="flex gap-2">
              {gsRef.current.rewardsUnlocked.map(r => (
                <div key={r} className="px-2 py-1 rounded bg-[#a55eea]/20 text-[#a55eea] text-[10px] font-bold">
                  第{r}关奖励
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save/Load + Leaderboard */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </div>
  );
}
