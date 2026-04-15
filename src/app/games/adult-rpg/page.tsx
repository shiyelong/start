"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import {
  ChevronLeft, Volume2, VolumeX, Sword, Shield, Heart,
  Zap, Star, Package, Lock, Play, RotateCcw,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Flame, Sparkles, Trophy
} from "lucide-react";
import { ageGate } from "@/lib/age-gate";
import { SoundEngine } from "@/lib/game-engine/sound-engine";

// ─── Constants ───────────────────────────────────────────────────────────────
const GAME_ID = "adult-rpg";
const TILE = 28;
const MAP_W = 16, MAP_H = 12;
const CW = MAP_W * TILE, CH = MAP_H * TILE + 80;
const PRIMARY = "#a55eea", ACCENT = "#3ea6ff", BG = "#0f0f0f";
const FPS = 60;

// ─── Types ───────────────────────────────────────────────────────────────────
type Difficulty = "easy" | "normal" | "hard";
type Phase = "title" | "explore" | "combat" | "inventory" | "result" | "gameover" | "cg";
type Direction = "up" | "down" | "left" | "right";

interface Stats {
  hp: number; maxHp: number; mp: number; maxMp: number;
  atk: number; def: number; level: number;
  xp: number; xpNext: number; gold: number;
  statPoints: number;
}

interface Item {
  id: string; name: string; type: "weapon" | "armor" | "potion" | "mpPotion";
  atk?: number; def?: number; heal?: number; mpHeal?: number; desc: string;
}

interface Equipment { weapon: Item | null; armor: Item | null; }

interface Enemy {
  name: string; hp: number; maxHp: number; atk: number; def: number;
  xpReward: number; goldReward: number; isBoss: boolean; color: string;
  drops: Item[];
}

interface MapTile { walkable: boolean; type: "floor" | "wall" | "door" | "stairs" | "chest"; }

interface CombatState {
  enemy: Enemy; turn: "player" | "enemy"; log: string[];
  playerAction: "choose" | "skill" | "item" | "animating";
  animFrame: number;
}

// ─── Data ────────────────────────────────────────────────────────────────────
const WEAPONS: Item[] = [
  { id: "w1", name: "铁剑", type: "weapon", atk: 3, desc: "基础铁剑" },
  { id: "w2", name: "钢剑", type: "weapon", atk: 6, desc: "锋利的钢剑" },
  { id: "w3", name: "魔剑", type: "weapon", atk: 10, desc: "附魔的魔剑" },
  { id: "w4", name: "暗影之刃", type: "weapon", atk: 15, desc: "传说中的暗影之刃" },
];

const ARMORS: Item[] = [
  { id: "a1", name: "皮甲", type: "armor", def: 2, desc: "基础皮甲" },
  { id: "a2", name: "锁子甲", type: "armor", def: 5, desc: "坚固的锁子甲" },
  { id: "a3", name: "板甲", type: "armor", def: 8, desc: "厚重的板甲" },
  { id: "a4", name: "暗影铠甲", type: "armor", def: 12, desc: "传说中的暗影铠甲" },
];

const POTIONS: Item[] = [
  { id: "p1", name: "生命药水", type: "potion", heal: 30, desc: "恢复30HP" },
  { id: "p2", name: "大生命药水", type: "potion", heal: 60, desc: "恢复60HP" },
  { id: "mp1", name: "魔力药水", type: "mpPotion", mpHeal: 20, desc: "恢复20MP" },
];

const SKILLS = [
  { id: "s1", name: "火焰斩", mpCost: 8, dmgMult: 1.8, desc: "火焰附魔攻击" },
  { id: "s2", name: "冰霜刺", mpCost: 12, dmgMult: 2.2, desc: "冰霜穿刺攻击" },
  { id: "s3", name: "雷霆击", mpCost: 18, dmgMult: 3.0, desc: "雷电强力一击" },
  { id: "s4", name: "暗影爆发", mpCost: 25, dmgMult: 4.0, desc: "暗影能量爆发" },
];

function makeEnemies(floor: number, diff: Difficulty): Enemy[] {
  const m = diff === "easy" ? 0.7 : diff === "hard" ? 1.4 : 1.0;
  const base = [
    { name: "骷髅兵", hp: 20, atk: 5, def: 2, xp: 15, gold: 10, color: "#aaa", drops: [POTIONS[0]] },
    { name: "暗影蝙蝠", hp: 15, atk: 7, def: 1, xp: 12, gold: 8, color: "#8854d0" , drops: [POTIONS[2]] },
    { name: "地牢蜘蛛", hp: 25, atk: 6, def: 3, xp: 18, gold: 12, color: "#20bf6b", drops: [POTIONS[0]] },
    { name: "暗影骑士", hp: 35, atk: 9, def: 5, xp: 25, gold: 20, color: "#eb3b5a", drops: [POTIONS[1]] },
    { name: "恶魔法师", hp: 30, atk: 11, def: 3, xp: 22, gold: 18, color: "#fa8231", drops: [POTIONS[2]] },
  ];
  const fMult = 1 + (floor - 1) * 0.5;
  return base.map(b => ({
    name: b.name, hp: Math.floor(b.hp * fMult * m), maxHp: Math.floor(b.hp * fMult * m),
    atk: Math.floor(b.atk * fMult * m), def: Math.floor(b.def * fMult * m),
    xpReward: Math.floor(b.xp * fMult), goldReward: Math.floor(b.gold * fMult),
    isBoss: false, color: b.color, drops: b.drops,
  }));
}

function makeBoss(floor: number, diff: Difficulty): Enemy {
  const m = diff === "easy" ? 0.7 : diff === "hard" ? 1.5 : 1.0;
  const bosses = [
    { name: "骷髅王", hp: 80, atk: 12, def: 6, xp: 80, gold: 60, color: "#fed330", drops: [WEAPONS[1], ARMORS[1]] },
    { name: "暗影龙", hp: 140, atk: 18, def: 10, xp: 150, gold: 100, color: "#a55eea", drops: [WEAPONS[2], ARMORS[2]] },
    { name: "深渊魔王", hp: 220, atk: 25, def: 14, xp: 250, gold: 180, color: "#ff4757", drops: [WEAPONS[3], ARMORS[3]] },
  ];
  const b = bosses[Math.min(floor - 1, 2)];
  return {
    name: b.name, hp: Math.floor(b.hp * m), maxHp: Math.floor(b.hp * m),
    atk: Math.floor(b.atk * m), def: Math.floor(b.def * m),
    xpReward: b.xp, goldReward: b.gold,
    isBoss: true, color: b.color, drops: b.drops,
  };
}

function generateMap(floor: number): MapTile[][] {
  const map: MapTile[][] = [];
  for (let y = 0; y < MAP_H; y++) {
    const row: MapTile[] = [];
    for (let x = 0; x < MAP_W; x++) {
      if (y === 0 || y === MAP_H - 1 || x === 0 || x === MAP_W - 1) {
        row.push({ walkable: false, type: "wall" });
      } else if (Math.random() < 0.12 + floor * 0.02) {
        row.push({ walkable: false, type: "wall" });
      } else if (Math.random() < 0.04) {
        row.push({ walkable: true, type: "chest" });
      } else {
        row.push({ walkable: true, type: "floor" });
      }
    }
    map.push(row);
  }
  // Ensure start and stairs are clear
  map[1][1] = { walkable: true, type: "floor" };
  map[1][2] = { walkable: true, type: "floor" };
  map[2][1] = { walkable: true, type: "floor" };
  map[MAP_H - 2][MAP_W - 2] = { walkable: true, type: "stairs" };
  map[MAP_H - 2][MAP_W - 3] = { walkable: true, type: "floor" };
  map[MAP_H - 3][MAP_W - 2] = { walkable: true, type: "floor" };
  return map;
}

function initStats(): Stats {
  return { hp: 50, maxHp: 50, mp: 20, maxMp: 20, atk: 8, def: 4, level: 1, xp: 0, xpNext: 30, gold: 0, statPoints: 0 };
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AdultRPG() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef<SoundEngine | null>(null);
  const rafRef = useRef(0);
  const frameRef = useRef(0);

  const [blocked, setBlocked] = useState(false);
  const [phase, setPhase] = useState<Phase>("title");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [muted, setMuted] = useState(false);

  // Game state
  const [stats, setStats] = useState<Stats>(initStats);
  const [equipment, setEquipment] = useState<Equipment>({ weapon: WEAPONS[0], armor: ARMORS[0] });
  const [inventory, setInventory] = useState<Item[]>([POTIONS[0], POTIONS[0], POTIONS[2]]);
  const [floor, setFloor] = useState(1);
  const [playerX, setPlayerX] = useState(1);
  const [playerY, setPlayerY] = useState(1);
  const [playerDir, setPlayerDir] = useState<Direction>("down");
  const [map, setMap] = useState<MapTile[][]>(() => generateMap(1));
  const [openedChests, setOpenedChests] = useState<Set<string>>(new Set());
  const [enemyPositions, setEnemyPositions] = useState<{ x: number; y: number; enemy: Enemy }[]>([]);
  const [bossPos, setBossPos] = useState<{ x: number; y: number } | null>(null);
  const [combat, setCombat] = useState<CombatState | null>(null);
  const [score, setScore] = useState(0);
  const [bossesDefeated, setBossesDefeated] = useState(0);
  const [cgUnlocked, setCgUnlocked] = useState<number[]>([]);
  const [showStatAlloc, setShowStatAlloc] = useState(false);
  const [gameLog, setGameLog] = useState<string[]>(["欢迎来到暗影地牢..."]);

  // Refs for render loop
  const stateRef = useRef({
    phase, stats, equipment, inventory, floor, playerX, playerY, playerDir,
    map, openedChests, enemyPositions, bossPos, combat, score, bossesDefeated,
    cgUnlocked, difficulty, gameLog, showStatAlloc, muted,
  });

  useEffect(() => {
    stateRef.current = {
      phase, stats, equipment, inventory, floor, playerX, playerY, playerDir,
      map, openedChests, enemyPositions, bossPos, combat, score, bossesDefeated,
      cgUnlocked, difficulty, gameLog, showStatAlloc, muted,
    };
  });

  // ─── Age Gate ──────────────────────────────────────────────────────────────
  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  // ─── Sound ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    return () => { soundRef.current?.dispose(); };
  }, []);

  const playSound = useCallback((type: "move" | "click" | "score" | "levelUp" | "gameOver" | "error" | "combo") => {
    const s = soundRef.current;
    if (!s || stateRef.current.muted) return;
    switch (type) {
      case "move": s.playMove(); break;
      case "click": s.playClick(); break;
      case "score": s.playScore(100); break;
      case "levelUp": s.playLevelUp(); break;
      case "gameOver": s.playGameOver(); break;
      case "error": s.playError(); break;
      case "combo": s.playCombo(3); break;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const m = soundRef.current?.toggleMute();
    setMuted(m ?? false);
  }, []);

  // ─── Spawn enemies for floor ───────────────────────────────────────────────
  const spawnFloor = useCallback((f: number, m: MapTile[][], diff: Difficulty) => {
    const enemies = makeEnemies(f, diff);
    const positions: { x: number; y: number; enemy: Enemy }[] = [];
    const count = 4 + f;
    for (let i = 0; i < count; i++) {
      let ex: number, ey: number, tries = 0;
      do {
        ex = 2 + Math.floor(Math.random() * (MAP_W - 4));
        ey = 2 + Math.floor(Math.random() * (MAP_H - 4));
        tries++;
      } while (tries < 50 && (!m[ey][ex].walkable || (ex <= 2 && ey <= 2) || positions.some(p => p.x === ex && p.y === ey)));
      positions.push({ x: ex, y: ey, enemy: { ...enemies[i % enemies.length] } });
    }
    setEnemyPositions(positions);
    // Boss near stairs
    const boss = makeBoss(f, diff);
    const bx = MAP_W - 3, by = MAP_H - 3;
    positions.push({ x: bx, y: by, enemy: boss });
    setBossPos({ x: bx, y: by });
    setEnemyPositions([...positions]);
  }, []);

  // ─── Start Game ────────────────────────────────────────────────────────────
  const startGame = useCallback((diff: Difficulty) => {
    setDifficulty(diff);
    const s = initStats();
    if (diff === "easy") { s.maxHp = 70; s.hp = 70; s.maxMp = 30; s.mp = 30; s.atk = 10; }
    if (diff === "hard") { s.maxHp = 35; s.hp = 35; s.maxMp = 15; s.mp = 15; }
    setStats(s);
    setEquipment({ weapon: WEAPONS[0], armor: ARMORS[0] });
    setInventory([POTIONS[0], POTIONS[0], POTIONS[2]]);
    setFloor(1);
    setPlayerX(1); setPlayerY(1); setPlayerDir("down");
    const m = generateMap(1);
    setMap(m);
    setOpenedChests(new Set());
    setCombat(null);
    setScore(0);
    setBossesDefeated(0);
    setCgUnlocked([]);
    setShowStatAlloc(false);
    setGameLog(["你踏入了暗影地牢第1层..."]);
    setPhase("explore");
    spawnFloor(1, m, diff);
    playSound("click");
  }, [spawnFloor, playSound]);

  // ─── Level Up ──────────────────────────────────────────────────────────────
  const checkLevelUp = useCallback((st: Stats): Stats => {
    const ns = { ...st };
    while (ns.xp >= ns.xpNext) {
      ns.xp -= ns.xpNext;
      ns.level++;
      ns.xpNext = Math.floor(ns.xpNext * 1.5);
      ns.maxHp += 8;
      ns.hp = ns.maxHp;
      ns.maxMp += 5;
      ns.mp = ns.maxMp;
      ns.atk += 2;
      ns.def += 1;
      ns.statPoints += 3;
      playSound("levelUp");
    }
    return ns;
  }, [playSound]);

  // ─── Combat Actions ────────────────────────────────────────────────────────
  const startCombat = useCallback((enemy: Enemy) => {
    setCombat({
      enemy: { ...enemy },
      turn: "player",
      log: [`遭遇了 ${enemy.name}！`],
      playerAction: "choose",
      animFrame: 0,
    });
    setPhase("combat");
    playSound("error");
  }, [playSound]);

  const combatAttack = useCallback(() => {
    if (!combat || combat.turn !== "player") return;
    const totalAtk = stats.atk + (equipment.weapon?.atk || 0);
    const dmg = Math.max(1, totalAtk - combat.enemy.def + Math.floor(Math.random() * 4));
    const newEnemy = { ...combat.enemy, hp: combat.enemy.hp - dmg };
    const newLog = [...combat.log, `你攻击了 ${combat.enemy.name}，造成 ${dmg} 点伤害！`];
    playSound("click");

    if (newEnemy.hp <= 0) {
      // Enemy defeated
      const xpGain = newEnemy.xpReward;
      const goldGain = newEnemy.goldReward;
      newLog.push(`${newEnemy.name} 被击败！获得 ${xpGain}经验 ${goldGain}金币`);
      const ns = checkLevelUp({ ...stats, xp: stats.xp + xpGain, gold: stats.gold + goldGain });
      setStats(ns);
      setScore(prev => prev + xpGain * 10);
      playSound("score");

      // Drop items
      if (newEnemy.drops.length > 0 && Math.random() < 0.5) {
        const drop = newEnemy.drops[Math.floor(Math.random() * newEnemy.drops.length)];
        setInventory(prev => [...prev, { ...drop }]);
        newLog.push(`获得了 ${drop.name}！`);
      }

      // Remove enemy from map
      setEnemyPositions(prev => prev.filter(e => !(e.enemy.name === newEnemy.name && e.enemy.hp > 0 && e.x === playerX && e.y === playerY)));

      if (newEnemy.isBoss) {
        setBossesDefeated(prev => {
          const nb = prev + 1;
          setCgUnlocked(prevCg => [...prevCg, floor]);
          if (floor >= 3) {
            setPhase("result");
            setGameLog(prev2 => [...prev2, "你征服了暗影地牢！"]);
            playSound("combo");
          } else {
            setPhase("cg");
            setGameLog(prev2 => [...prev2, `第${floor}层Boss被击败！解锁奖励场景！`]);
          }
          return nb;
        });
        setBossPos(null);
      } else {
        setEnemyPositions(prev => {
          const idx = prev.findIndex(e => e.x === playerX + (playerDir === "right" ? 1 : playerDir === "left" ? -1 : 0) && e.y === playerY + (playerDir === "down" ? 1 : playerDir === "up" ? -1 : 0));
          if (idx >= 0) return prev.filter((_, i) => i !== idx);
          return prev;
        });
        setPhase("explore");
      }
      setCombat(null);
      setGameLog(prev => [...prev, ...newLog]);
      return;
    }

    // Enemy turn
    const totalDef = stats.def + (equipment.armor?.def || 0);
    const eDmg = Math.max(1, newEnemy.atk - totalDef + Math.floor(Math.random() * 3));
    const newHp = stats.hp - eDmg;
    newLog.push(`${newEnemy.name} 攻击了你，造成 ${eDmg} 点伤害！`);

    if (newHp <= 0) {
      setStats(prev => ({ ...prev, hp: 0 }));
      setCombat({ ...combat, enemy: newEnemy, log: newLog, turn: "player", playerAction: "choose" });
      setPhase("gameover");
      playSound("gameOver");
      return;
    }

    setStats(prev => ({ ...prev, hp: newHp }));
    setCombat({ ...combat, enemy: newEnemy, log: newLog, turn: "player", playerAction: "choose" });
  }, [combat, stats, equipment, floor, playerX, playerY, playerDir, checkLevelUp, playSound]);

  const combatSkill = useCallback((skillIdx: number) => {
    if (!combat || combat.turn !== "player") return;
    const skill = SKILLS[skillIdx];
    if (stats.mp < skill.mpCost) {
      setCombat({ ...combat, log: [...combat.log, "魔力不足！"] });
      return;
    }
    const totalAtk = stats.atk + (equipment.weapon?.atk || 0);
    const dmg = Math.max(1, Math.floor(totalAtk * skill.dmgMult) - combat.enemy.def);
    const newMp = stats.mp - skill.mpCost;
    const newEnemy = { ...combat.enemy, hp: combat.enemy.hp - dmg };
    const newLog = [...combat.log, `使用 ${skill.name}！造成 ${dmg} 点伤害！`];
    playSound("combo");

    setStats(prev => ({ ...prev, mp: newMp }));

    if (newEnemy.hp <= 0) {
      const xpGain = newEnemy.xpReward;
      const goldGain = newEnemy.goldReward;
      newLog.push(`${newEnemy.name} 被击败！获得 ${xpGain}经验 ${goldGain}金币`);
      const ns = checkLevelUp({ ...stats, mp: newMp, xp: stats.xp + xpGain, gold: stats.gold + goldGain });
      setStats(ns);
      setScore(prev => prev + xpGain * 10);

      if (newEnemy.drops.length > 0 && Math.random() < 0.6) {
        const drop = newEnemy.drops[Math.floor(Math.random() * newEnemy.drops.length)];
        setInventory(prev => [...prev, { ...drop }]);
        newLog.push(`获得了 ${drop.name}！`);
      }

      if (newEnemy.isBoss) {
        setBossesDefeated(prev => {
          const nb = prev + 1;
          setCgUnlocked(prevCg => [...prevCg, floor]);
          if (floor >= 3) {
            setPhase("result");
            playSound("combo");
          } else {
            setPhase("cg");
          }
          return nb;
        });
        setBossPos(null);
      } else {
        setEnemyPositions(prev => {
          const dx = playerDir === "right" ? 1 : playerDir === "left" ? -1 : 0;
          const dy = playerDir === "down" ? 1 : playerDir === "up" ? -1 : 0;
          return prev.filter(e => !(e.x === playerX + dx && e.y === playerY + dy));
        });
        setPhase("explore");
      }
      setCombat(null);
      setGameLog(prev => [...prev, ...newLog]);
      return;
    }

    // Enemy counter
    const totalDef = stats.def + (equipment.armor?.def || 0);
    const eDmg = Math.max(1, newEnemy.atk - totalDef + Math.floor(Math.random() * 3));
    const newHp = stats.hp - eDmg;
    newLog.push(`${newEnemy.name} 反击，造成 ${eDmg} 点伤害！`);

    if (newHp <= 0) {
      setStats(prev => ({ ...prev, hp: 0, mp: newMp }));
      setPhase("gameover");
      playSound("gameOver");
      setCombat(null);
      return;
    }
    setStats(prev => ({ ...prev, hp: newHp, mp: newMp }));
    setCombat({ ...combat, enemy: newEnemy, log: newLog, turn: "player", playerAction: "choose" });
  }, [combat, stats, equipment, floor, playerX, playerY, playerDir, checkLevelUp, playSound]);

  const combatUseItem = useCallback((itemIdx: number) => {
    if (!combat) return;
    const item = inventory[itemIdx];
    if (!item) return;
    const newLog = [...combat.log];
    if (item.type === "potion" && item.heal) {
      const newHp = Math.min(stats.maxHp, stats.hp + item.heal);
      setStats(prev => ({ ...prev, hp: newHp }));
      newLog.push(`使用了 ${item.name}，恢复 ${item.heal} HP！`);
    } else if (item.type === "mpPotion" && item.mpHeal) {
      const newMp = Math.min(stats.maxMp, stats.mp + item.mpHeal);
      setStats(prev => ({ ...prev, mp: newMp }));
      newLog.push(`使用了 ${item.name}，恢复 ${item.mpHeal} MP！`);
    }
    setInventory(prev => prev.filter((_, i) => i !== itemIdx));
    playSound("click");

    // Enemy still attacks
    const totalDef = stats.def + (equipment.armor?.def || 0);
    const eDmg = Math.max(1, combat.enemy.atk - totalDef + Math.floor(Math.random() * 3));
    const newHp2 = (item.type === "potion" ? Math.min(stats.maxHp, stats.hp + (item.heal || 0)) : stats.hp) - eDmg;
    newLog.push(`${combat.enemy.name} 攻击了你，造成 ${eDmg} 点伤害！`);

    if (newHp2 <= 0) {
      setStats(prev => ({ ...prev, hp: 0 }));
      setPhase("gameover");
      playSound("gameOver");
      setCombat(null);
      return;
    }
    setStats(prev => ({ ...prev, hp: Math.max(0, prev.hp - eDmg) }));
    setCombat({ ...combat, log: newLog, turn: "player", playerAction: "choose" });
  }, [combat, inventory, stats, equipment, playSound]);

  const combatFlee = useCallback(() => {
    if (!combat) return;
    const chance = combat.enemy.isBoss ? 0.1 : 0.5;
    if (Math.random() < chance) {
      setGameLog(prev => [...prev, "成功逃跑！"]);
      setCombat(null);
      setPhase("explore");
      playSound("move");
    } else {
      const totalDef = stats.def + (equipment.armor?.def || 0);
      const eDmg = Math.max(1, combat.enemy.atk - totalDef + Math.floor(Math.random() * 3));
      const newHp = stats.hp - eDmg;
      const newLog = [...combat.log, "逃跑失败！", `${combat.enemy.name} 攻击了你，造成 ${eDmg} 点伤害！`];
      if (newHp <= 0) {
        setStats(prev => ({ ...prev, hp: 0 }));
        setPhase("gameover");
        playSound("gameOver");
        setCombat(null);
        return;
      }
      setStats(prev => ({ ...prev, hp: newHp }));
      setCombat({ ...combat, log: newLog, turn: "player", playerAction: "choose" });
      playSound("error");
    }
  }, [combat, stats, equipment, playSound]);

  // ─── Movement ──────────────────────────────────────────────────────────────
  const tryMove = useCallback((dx: number, dy: number) => {
    if (phase !== "explore") return;
    const nx = playerX + dx, ny = playerY + dy;
    const dir: Direction = dx > 0 ? "right" : dx < 0 ? "left" : dy > 0 ? "down" : "up";
    setPlayerDir(dir);

    if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return;
    if (!map[ny][nx].walkable) return;

    // Check enemy collision
    const enemyHit = enemyPositions.find(e => e.x === nx && e.y === ny);
    if (enemyHit) {
      startCombat(enemyHit.enemy);
      return;
    }

    setPlayerX(nx);
    setPlayerY(ny);
    playSound("move");

    // Check chest
    if (map[ny][nx].type === "chest" && !openedChests.has(`${nx},${ny}`)) {
      setOpenedChests(prev => new Set(prev).add(`${nx},${ny}`));
      const loot = Math.random();
      let item: Item;
      if (loot < 0.3) item = POTIONS[0];
      else if (loot < 0.5) item = POTIONS[1];
      else if (loot < 0.7) item = POTIONS[2];
      else if (loot < 0.85) item = WEAPONS[Math.min(floor, WEAPONS.length - 1)];
      else item = ARMORS[Math.min(floor, ARMORS.length - 1)];
      setInventory(prev => [...prev, { ...item }]);
      setGameLog(prev => [...prev, `打开宝箱，获得了 ${item.name}！`]);
      playSound("score");
    }

    // Check stairs
    if (map[ny][nx].type === "stairs") {
      if (bossPos) {
        setGameLog(prev => [...prev, "需要先击败本层Boss才能前进！"]);
        return;
      }
      if (floor >= 3) {
        setPhase("result");
        playSound("combo");
        return;
      }
      const nf = floor + 1;
      setFloor(nf);
      const nm = generateMap(nf);
      setMap(nm);
      setPlayerX(1); setPlayerY(1);
      setOpenedChests(new Set());
      spawnFloor(nf, nm, difficulty);
      setGameLog(prev => [...prev, `进入暗影地牢第${nf}层...`]);
      playSound("levelUp");
    }
  }, [phase, playerX, playerY, map, enemyPositions, openedChests, bossPos, floor, difficulty, startCombat, spawnFloor, playSound]);

  // ─── Stat Allocation ───────────────────────────────────────────────────────
  const allocStat = useCallback((stat: "hp" | "mp" | "atk" | "def") => {
    if (stats.statPoints <= 0) return;
    setStats(prev => {
      const ns = { ...prev, statPoints: prev.statPoints - 1 };
      switch (stat) {
        case "hp": ns.maxHp += 5; ns.hp = Math.min(ns.hp + 5, ns.maxHp); break;
        case "mp": ns.maxMp += 3; ns.mp = Math.min(ns.mp + 3, ns.maxMp); break;
        case "atk": ns.atk += 2; break;
        case "def": ns.def += 1; break;
      }
      return ns;
    });
    playSound("click");
  }, [stats.statPoints, playSound]);

  // ─── Equip Item ────────────────────────────────────────────────────────────
  const equipItem = useCallback((itemIdx: number) => {
    const item = inventory[itemIdx];
    if (!item) return;
    if (item.type === "weapon") {
      const old = equipment.weapon;
      setEquipment(prev => ({ ...prev, weapon: item }));
      const newInv = inventory.filter((_, i) => i !== itemIdx);
      if (old) newInv.push(old);
      setInventory(newInv);
      playSound("click");
    } else if (item.type === "armor") {
      const old = equipment.armor;
      setEquipment(prev => ({ ...prev, armor: item }));
      const newInv = inventory.filter((_, i) => i !== itemIdx);
      if (old) newInv.push(old);
      setInventory(newInv);
      playSound("click");
    } else if (item.type === "potion" && item.heal) {
      if (stats.hp < stats.maxHp) {
        setStats(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + (item.heal || 0)) }));
        setInventory(prev => prev.filter((_, i) => i !== itemIdx));
        setGameLog(prev => [...prev, `使用了 ${item.name}，恢复 ${item.heal} HP`]);
        playSound("click");
      }
    } else if (item.type === "mpPotion" && item.mpHeal) {
      if (stats.mp < stats.maxMp) {
        setStats(prev => ({ ...prev, mp: Math.min(prev.maxMp, prev.mp + (item.mpHeal || 0)) }));
        setInventory(prev => prev.filter((_, i) => i !== itemIdx));
        setGameLog(prev => [...prev, `使用了 ${item.name}，恢复 ${item.mpHeal} MP`]);
        playSound("click");
      }
    }
  }, [inventory, equipment, stats, playSound]);

  // ─── CG Scene (abstract art) ──────────────────────────────────────────────
  const advanceFromCG = useCallback(() => {
    if (floor >= 3) {
      setPhase("result");
      playSound("combo");
      return;
    }
    const nf = floor + 1;
    setFloor(nf);
    const nm = generateMap(nf);
    setMap(nm);
    setPlayerX(1); setPlayerY(1);
    setOpenedChests(new Set());
    spawnFloor(nf, nm, difficulty);
    setPhase("explore");
    setGameLog(prev => [...prev, `进入暗影地牢第${nf}层...`]);
    playSound("levelUp");
  }, [floor, difficulty, spawnFloor, playSound]);

  // ─── Save / Load ──────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    return {
      phase: phase === "combat" ? "explore" : phase,
      difficulty, stats, equipment, inventory, floor,
      playerX, playerY, playerDir, score, bossesDefeated,
      cgUnlocked, openedChests: Array.from(openedChests),
    };
  }, [phase, difficulty, stats, equipment, inventory, floor, playerX, playerY, playerDir, score, bossesDefeated, cgUnlocked, openedChests]);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d || typeof d !== "object") return;
    setDifficulty((d.difficulty as Difficulty) || "normal");
    setStats((d.stats as Stats) || initStats());
    setEquipment((d.equipment as Equipment) || { weapon: WEAPONS[0], armor: ARMORS[0] });
    setInventory((d.inventory as Item[]) || []);
    const f = (d.floor as number) || 1;
    setFloor(f);
    setPlayerX((d.playerX as number) || 1);
    setPlayerY((d.playerY as number) || 1);
    setPlayerDir((d.playerDir as Direction) || "down");
    setScore((d.score as number) || 0);
    setBossesDefeated((d.bossesDefeated as number) || 0);
    setCgUnlocked((d.cgUnlocked as number[]) || []);
    setOpenedChests(new Set((d.openedChests as string[]) || []));
    const nm = generateMap(f);
    setMap(nm);
    spawnFloor(f, nm, (d.difficulty as Difficulty) || "normal");
    setCombat(null);
    setPhase("explore");
    setGameLog(["存档已加载..."]);
    playSound("click");
  }, [spawnFloor, playSound]);

  // ─── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (s.phase === "title") return;
      if (s.phase === "cg") { advanceFromCG(); return; }
      if (s.phase === "gameover" || s.phase === "result") return;
      if (s.phase === "explore") {
        switch (e.key) {
          case "ArrowUp": case "w": case "W": tryMove(0, -1); break;
          case "ArrowDown": case "s": case "S": tryMove(0, 1); break;
          case "ArrowLeft": case "a": case "A": tryMove(-1, 0); break;
          case "ArrowRight": case "d": case "D": tryMove(1, 0); break;
          case "i": case "I": setPhase("inventory"); break;
        }
      }
      if (s.phase === "inventory") {
        if (e.key === "Escape" || e.key === "i" || e.key === "I") setPhase("explore");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tryMove, advanceFromCG]);

  // ─── Canvas Render ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CW * dpr;
    canvas.height = CH * dpr;
    canvas.style.width = `${CW}px`;
    canvas.style.height = `${CH}px`;

    const render = () => {
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, CW, CH);
      const s = stateRef.current;
      frameRef.current++;

      if (s.phase === "title") {
        // Title screen
        ctx.fillStyle = PRIMARY;
        ctx.font = "bold 32px monospace";
        ctx.textAlign = "center";
        ctx.fillText("暗影地牢", CW / 2, CH / 2 - 60);
        ctx.fillStyle = "#ff4757";
        ctx.font = "14px monospace";
        ctx.fillText("NC-17 成人RPG", CW / 2, CH / 2 - 30);
        ctx.fillStyle = "#aaa";
        ctx.font = "13px monospace";
        ctx.fillText("地牢探索 · 回合制战斗 · Boss挑战", CW / 2, CH / 2);
        // Animated glow
        const glow = 0.5 + 0.5 * Math.sin(frameRef.current * 0.05);
        ctx.fillStyle = `rgba(165, 94, 234, ${glow})`;
        ctx.font = "16px monospace";
        ctx.fillText("选择难度开始冒险", CW / 2, CH / 2 + 40);
      } else if (s.phase === "explore") {
        // Draw map
        for (let y = 0; y < MAP_H; y++) {
          for (let x = 0; x < MAP_W; x++) {
            const tile = s.map[y]?.[x];
            if (!tile) continue;
            const tx = x * TILE, ty = y * TILE;
            switch (tile.type) {
              case "wall": ctx.fillStyle = "#2d1b4e"; break;
              case "floor": ctx.fillStyle = "#1a0a2e"; break;
              case "chest":
                ctx.fillStyle = s.openedChests.has(`${x},${y}`) ? "#1a0a2e" : "#1a0a2e";
                break;
              case "stairs": ctx.fillStyle = "#0d3b66"; break;
              default: ctx.fillStyle = "#1a0a2e";
            }
            ctx.fillRect(tx, ty, TILE - 1, TILE - 1);
            // Chest icon
            if (tile.type === "chest" && !s.openedChests.has(`${x},${y}`)) {
              ctx.fillStyle = "#fed330";
              ctx.font = "16px monospace";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("$", tx + TILE / 2, ty + TILE / 2);
            }
            // Stairs icon
            if (tile.type === "stairs") {
              ctx.fillStyle = ACCENT;
              ctx.font = "14px monospace";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(">", tx + TILE / 2, ty + TILE / 2);
            }
          }
        }
        // Draw enemies
        for (const ep of s.enemyPositions) {
          const ex = ep.x * TILE, ey = ep.y * TILE;
          ctx.fillStyle = ep.enemy.color;
          ctx.font = ep.enemy.isBoss ? "bold 20px monospace" : "bold 16px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(ep.enemy.isBoss ? "B" : "E", ex + TILE / 2, ey + TILE / 2);
        }
        // Draw player
        const px = s.playerX * TILE, py = s.playerY * TILE;
        ctx.fillStyle = PRIMARY;
        ctx.font = "bold 18px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("@", px + TILE / 2, py + TILE / 2);
        // HUD bar at bottom
        const hudY = MAP_H * TILE + 4;
        ctx.fillStyle = "#111";
        ctx.fillRect(0, hudY, CW, 76);
        ctx.fillStyle = "#fff";
        ctx.font = "12px monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        // HP bar
        ctx.fillStyle = "#333";
        ctx.fillRect(8, hudY + 4, 140, 12);
        ctx.fillStyle = "#ff4757";
        ctx.fillRect(8, hudY + 4, 140 * (s.stats.hp / s.stats.maxHp), 12);
        ctx.fillStyle = "#fff";
        ctx.font = "10px monospace";
        ctx.fillText(`HP ${s.stats.hp}/${s.stats.maxHp}`, 10, hudY + 5);
        // MP bar
        ctx.fillStyle = "#333";
        ctx.fillRect(8, hudY + 20, 140, 12);
        ctx.fillStyle = "#3ea6ff";
        ctx.fillRect(8, hudY + 20, 140 * (s.stats.mp / s.stats.maxMp), 12);
        ctx.fillStyle = "#fff";
        ctx.fillText(`MP ${s.stats.mp}/${s.stats.maxMp}`, 10, hudY + 21);
        // Stats
        ctx.fillStyle = "#ccc";
        ctx.font = "11px monospace";
        ctx.fillText(`Lv.${s.stats.level}  攻:${s.stats.atk + (s.equipment.weapon?.atk || 0)}  防:${s.stats.def + (s.equipment.armor?.def || 0)}`, 8, hudY + 38);
        ctx.fillText(`第${s.floor}层  金币:${s.stats.gold}  分数:${s.score}`, 8, hudY + 54);
        // Right side info
        ctx.textAlign = "right";
        ctx.fillStyle = "#888";
        ctx.fillText(`武器: ${s.equipment.weapon?.name || "无"}`, CW - 8, hudY + 5);
        ctx.fillText(`防具: ${s.equipment.armor?.name || "无"}`, CW - 8, hudY + 21);
        ctx.fillText(`背包: ${s.inventory.length}件  [I]打开`, CW - 8, hudY + 38);
        if (s.stats.statPoints > 0) {
          ctx.fillStyle = "#fed330";
          ctx.fillText(`可分配点数: ${s.stats.statPoints}`, CW - 8, hudY + 54);
        }
      } else if (s.phase === "combat" && s.combat) {
        // Combat screen
        const c = s.combat;
        ctx.fillStyle = "#0d0020";
        ctx.fillRect(0, 0, CW, CH);
        // Enemy
        ctx.fillStyle = c.enemy.color;
        ctx.font = c.enemy.isBoss ? "bold 48px monospace" : "bold 36px monospace";
        ctx.textAlign = "center";
        ctx.fillText(c.enemy.isBoss ? "B" : "E", CW / 2, 80);
        ctx.fillStyle = "#fff";
        ctx.font = "14px monospace";
        ctx.fillText(c.enemy.name, CW / 2, 110);
        // Enemy HP bar
        ctx.fillStyle = "#333";
        ctx.fillRect(CW / 2 - 80, 120, 160, 14);
        ctx.fillStyle = "#ff4757";
        ctx.fillRect(CW / 2 - 80, 120, 160 * Math.max(0, c.enemy.hp / c.enemy.maxHp), 14);
        ctx.fillStyle = "#fff";
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${c.enemy.hp}/${c.enemy.maxHp}`, CW / 2, 131);
        // Player HP/MP
        ctx.textAlign = "left";
        ctx.fillStyle = "#333";
        ctx.fillRect(20, 160, 180, 12);
        ctx.fillStyle = "#ff4757";
        ctx.fillRect(20, 160, 180 * (s.stats.hp / s.stats.maxHp), 12);
        ctx.fillStyle = "#fff";
        ctx.font = "10px monospace";
        ctx.fillText(`HP ${s.stats.hp}/${s.stats.maxHp}`, 22, 161);
        ctx.fillStyle = "#333";
        ctx.fillRect(20, 176, 180, 12);
        ctx.fillStyle = ACCENT;
        ctx.fillRect(20, 176, 180 * (s.stats.mp / s.stats.maxMp), 12);
        ctx.fillStyle = "#fff";
        ctx.fillText(`MP ${s.stats.mp}/${s.stats.maxMp}`, 22, 177);
        // Combat log
        ctx.fillStyle = "#111";
        ctx.fillRect(10, 200, CW - 20, 100);
        ctx.fillStyle = "#ccc";
        ctx.font = "11px monospace";
        const visibleLog = c.log.slice(-6);
        visibleLog.forEach((line, i) => {
          ctx.fillText(line.substring(0, 40), 16, 216 + i * 15);
        });
        // Action buttons hint
        ctx.fillStyle = "#888";
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillText("使用下方按钮选择行动", CW / 2, CH - 20);
      } else if (s.phase === "cg") {
        // Abstract CG reward scene
        ctx.fillStyle = "#0a0020";
        ctx.fillRect(0, 0, CW, CH);
        const t = frameRef.current * 0.02;
        // Abstract flowing shapes
        for (let i = 0; i < 12; i++) {
          const cx = CW / 2 + Math.sin(t + i * 0.8) * 120;
          const cy = CH / 2 + Math.cos(t + i * 0.6) * 80;
          const r = 20 + Math.sin(t * 2 + i) * 15;
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          const hue = (i * 30 + frameRef.current) % 360;
          grad.addColorStop(0, `hsla(${hue}, 80%, 60%, 0.8)`);
          grad.addColorStop(1, `hsla(${hue}, 80%, 40%, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(cx, cy, r, r * 0.7, t + i, 0, Math.PI * 2);
          ctx.fill();
        }
        // Flowing curves
        ctx.strokeStyle = `hsla(${(frameRef.current * 2) % 360}, 70%, 60%, 0.6)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < CW; i += 2) {
          const y = CH / 2 + Math.sin(i * 0.02 + t) * 60 + Math.cos(i * 0.03 + t * 1.5) * 40;
          if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
        }
        ctx.stroke();
        ctx.strokeStyle = `hsla(${(frameRef.current * 2 + 120) % 360}, 70%, 60%, 0.4)`;
        ctx.beginPath();
        for (let i = 0; i < CW; i += 2) {
          const y = CH / 2 + Math.sin(i * 0.025 + t * 1.2) * 50 + Math.cos(i * 0.015 + t * 0.8) * 60;
          if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
        }
        ctx.stroke();
        // Title
        ctx.fillStyle = "#fff";
        ctx.font = "bold 20px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`第${s.floor}层 Boss击败奖励`, CW / 2, 30);
        ctx.fillStyle = "#aaa";
        ctx.font = "13px monospace";
        ctx.fillText("点击继续...", CW / 2, CH - 20);
      } else if (s.phase === "gameover") {
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(0, 0, CW, CH);
        ctx.fillStyle = "#ff4757";
        ctx.font = "bold 28px monospace";
        ctx.textAlign = "center";
        ctx.fillText("你被击败了", CW / 2, CH / 2 - 40);
        ctx.fillStyle = "#ccc";
        ctx.font = "14px monospace";
        ctx.fillText(`最终分数: ${s.score}`, CW / 2, CH / 2);
        ctx.fillText(`到达第${s.floor}层  等级${s.stats.level}`, CW / 2, CH / 2 + 24);
        ctx.fillStyle = "#888";
        ctx.font = "13px monospace";
        ctx.fillText("点击重新开始", CW / 2, CH / 2 + 60);
      } else if (s.phase === "result") {
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(0, 0, CW, CH);
        // Victory particles
        for (let i = 0; i < 20; i++) {
          const px2 = (Math.sin(frameRef.current * 0.03 + i * 1.2) * 0.5 + 0.5) * CW;
          const py2 = (Math.cos(frameRef.current * 0.02 + i * 0.9) * 0.5 + 0.5) * CH;
          ctx.fillStyle = `hsla(${(i * 18 + frameRef.current) % 360}, 80%, 60%, 0.6)`;
          ctx.beginPath();
          ctx.arc(px2, py2, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#fed330";
        ctx.font = "bold 28px monospace";
        ctx.textAlign = "center";
        ctx.fillText("征服暗影地牢！", CW / 2, CH / 2 - 60);
        ctx.fillStyle = "#fff";
        ctx.font = "14px monospace";
        ctx.fillText(`最终分数: ${s.score}`, CW / 2, CH / 2 - 20);
        ctx.fillText(`等级: ${s.stats.level}  击败Boss: ${s.bossesDefeated}`, CW / 2, CH / 2 + 4);
        ctx.fillText(`解锁CG: ${s.cgUnlocked.length}/3`, CW / 2, CH / 2 + 28);
        ctx.fillStyle = "#888";
        ctx.font = "13px monospace";
        ctx.fillText("点击返回标题", CW / 2, CH / 2 + 64);
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ─── Touch on canvas ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let touchStart: { x: number; y: number } | null = null;

    const onTS = (e: TouchEvent) => {
      e.preventDefault();
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTE = (e: TouchEvent) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;
      const s = stateRef.current;
      if (Math.abs(dx) + Math.abs(dy) < 15) {
        // Tap
        if (s.phase === "cg") advanceFromCG();
        if (s.phase === "gameover" || s.phase === "result") setPhase("title");
        return;
      }
      if (s.phase === "explore") {
        if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? 1 : -1, 0);
        else tryMove(0, dy > 0 ? 1 : -1);
      }
    };
    const onClick = () => {
      const s = stateRef.current;
      if (s.phase === "cg") advanceFromCG();
      if (s.phase === "gameover" || s.phase === "result") setPhase("title");
    };

    canvas.addEventListener("touchstart", onTS, { passive: false });
    canvas.addEventListener("touchend", onTE);
    canvas.addEventListener("click", onClick);
    return () => {
      canvas.removeEventListener("touchstart", onTS);
      canvas.removeEventListener("touchend", onTE);
      canvas.removeEventListener("click", onClick);
    };
  }, [tryMove, advanceFromCG]);

  // ─── Blocked ───────────────────────────────────────────────────────────────
  if (blocked) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <Lock size={48} className="mx-auto text-gray-600 mb-4" />
          <h1 className="text-xl font-bold mb-2">需要成人模式</h1>
          <p className="text-gray-400 mb-4">此内容需要NC-17成人模式才能访问。</p>
          <Link href="/zone/games" className="text-[#3ea6ff] hover:underline">
            返回游戏中心
          </Link>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-4">
        {/* Nav */}
        <Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-3">
          <ChevronLeft size={16} /> 返回游戏
        </Link>

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sword size={22} className="text-[#a55eea]" />
            <h1 className="text-lg font-bold">暗影地牢</h1>
            <span className="text-xs px-1.5 py-0.5 bg-red-900/50 text-red-400 rounded">NC-17</span>
          </div>
          <button onClick={toggleMute} className="p-2 text-gray-400 hover:text-white">
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="w-full max-w-[448px] mx-auto rounded-lg border border-white/10 block"
          style={{ imageRendering: "pixelated" }}
        />

        {/* Title Phase - Difficulty Selection */}
        {phase === "title" && (
          <div className="mt-4 space-y-3">
            <p className="text-center text-gray-400 text-sm">选择难度开始冒险</p>
            <div className="grid grid-cols-3 gap-2">
              {([["easy", "简单", "text-green-400"], ["normal", "普通", "text-yellow-400"], ["hard", "困难", "text-red-400"]] as const).map(([d, label, color]) => (
                <button
                  key={d}
                  onClick={() => startGame(d)}
                  className="px-3 py-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <Play size={16} className={`mx-auto mb-1 ${color}`} />
                  <span className={`text-sm font-medium ${color}`}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Explore Phase - D-pad + Inventory button */}
        {phase === "explore" && (
          <div className="mt-3 space-y-3">
            {/* Mobile D-pad */}
            <div className="flex justify-center md:hidden">
              <div className="grid grid-cols-3 gap-1 w-36">
                <div />
                <button onClick={() => tryMove(0, -1)} className="p-3 bg-white/10 rounded-lg active:bg-white/20 flex items-center justify-center">
                  <ArrowUp size={18} />
                </button>
                <div />
                <button onClick={() => tryMove(-1, 0)} className="p-3 bg-white/10 rounded-lg active:bg-white/20 flex items-center justify-center">
                  <ArrowLeft size={18} />
                </button>
                <div className="p-3 bg-white/5 rounded-lg flex items-center justify-center text-xs text-gray-500">
                  移动
                </div>
                <button onClick={() => tryMove(1, 0)} className="p-3 bg-white/10 rounded-lg active:bg-white/20 flex items-center justify-center">
                  <ArrowRight size={18} />
                </button>
                <div />
                <button onClick={() => tryMove(0, 1)} className="p-3 bg-white/10 rounded-lg active:bg-white/20 flex items-center justify-center">
                  <ArrowDown size={18} />
                </button>
                <div />
              </div>
            </div>

            <div className="flex gap-2 flex-wrap justify-center">
              <button onClick={() => setPhase("inventory")} className="px-3 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/15 flex items-center gap-1">
                <Package size={14} /> 背包 ({inventory.length})
              </button>
              {stats.statPoints > 0 && (
                <button onClick={() => setShowStatAlloc(!showStatAlloc)} className="px-3 py-2 bg-yellow-900/30 border border-yellow-600/30 rounded-lg text-sm text-yellow-400 hover:bg-yellow-900/50 flex items-center gap-1">
                  <Star size={14} /> 加点 ({stats.statPoints})
                </button>
              )}
            </div>

            {/* Stat Allocation */}
            {showStatAlloc && stats.statPoints > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                <p className="text-sm text-gray-400 mb-2">可用点数: {stats.statPoints}</p>
                <div className="grid grid-cols-2 gap-2">
                  {([["hp", "生命+5", Heart, "#ff4757"], ["mp", "魔力+3", Zap, "#3ea6ff"], ["atk", "攻击+2", Sword, "#fed330"], ["def", "防御+1", Shield, "#20bf6b"]] as const).map(([stat, label, Icon, color]) => (
                    <button
                      key={stat}
                      onClick={() => allocStat(stat)}
                      className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded hover:bg-white/10 text-sm"
                    >
                      <Icon size={14} style={{ color }} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Game log */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-2 max-h-24 overflow-y-auto">
              {gameLog.slice(-5).map((line, i) => (
                <p key={i} className="text-xs text-gray-400">{line}</p>
              ))}
            </div>
          </div>
        )}

        {/* Combat Phase */}
        {phase === "combat" && combat && (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={combatAttack} className="px-3 py-2.5 bg-red-900/30 border border-red-600/30 rounded-lg text-sm font-medium text-red-400 hover:bg-red-900/50 flex items-center justify-center gap-1">
                <Sword size={14} /> 攻击
              </button>
              <button onClick={combatFlee} className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-400 hover:bg-white/10 flex items-center justify-center gap-1">
                <ArrowRight size={14} /> 逃跑
              </button>
            </div>

            {/* Skills */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-2">
              <p className="text-xs text-gray-500 mb-1.5">技能</p>
              <div className="grid grid-cols-2 gap-1.5">
                {SKILLS.map((skill, i) => (
                  <button
                    key={skill.id}
                    onClick={() => combatSkill(i)}
                    disabled={stats.mp < skill.mpCost}
                    className="px-2 py-1.5 bg-purple-900/20 border border-purple-600/20 rounded text-xs hover:bg-purple-900/40 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <Flame size={12} className="text-purple-400" />
                    <span>{skill.name}</span>
                    <span className="text-gray-500 ml-auto">{skill.mpCost}MP</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Combat Items */}
            {inventory.filter(it => it.type === "potion" || it.type === "mpPotion").length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-2">
                <p className="text-xs text-gray-500 mb-1.5">道具</p>
                <div className="flex flex-wrap gap-1.5">
                  {inventory.map((item, i) => (
                    (item.type === "potion" || item.type === "mpPotion") && (
                      <button
                        key={i}
                        onClick={() => combatUseItem(i)}
                        className="px-2 py-1 bg-green-900/20 border border-green-600/20 rounded text-xs hover:bg-green-900/40"
                      >
                        {item.name}
                      </button>
                    )
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Inventory Phase */}
        {phase === "inventory" && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold flex items-center gap-1"><Package size={16} /> 背包</h2>
              <button onClick={() => setPhase("explore")} className="text-xs text-gray-400 hover:text-white px-2 py-1 bg-white/5 rounded">
                关闭 [I]
              </button>
            </div>

            {/* Equipment */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-2">当前装备</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <Sword size={14} className="text-yellow-400" />
                  <span>武器: {equipment.weapon?.name || "无"}</span>
                  {equipment.weapon?.atk && <span className="text-xs text-gray-500">+{equipment.weapon.atk}攻</span>}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Shield size={14} className="text-blue-400" />
                  <span>防具: {equipment.armor?.name || "无"}</span>
                  {equipment.armor?.def && <span className="text-xs text-gray-500">+{equipment.armor.def}防</span>}
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-2">物品 ({inventory.length})</p>
              {inventory.length === 0 ? (
                <p className="text-xs text-gray-600">背包为空</p>
              ) : (
                <div className="space-y-1">
                  {inventory.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => equipItem(i)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 bg-white/5 rounded hover:bg-white/10 text-left text-sm"
                    >
                      {item.type === "weapon" && <Sword size={12} className="text-yellow-400" />}
                      {item.type === "armor" && <Shield size={12} className="text-blue-400" />}
                      {item.type === "potion" && <Heart size={12} className="text-red-400" />}
                      {item.type === "mpPotion" && <Zap size={12} className="text-blue-400" />}
                      <span>{item.name}</span>
                      <span className="text-xs text-gray-500 ml-auto">{item.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-2">角色属性</p>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span className="text-gray-400">等级: <span className="text-white">{stats.level}</span></span>
                <span className="text-gray-400">经验: <span className="text-white">{stats.xp}/{stats.xpNext}</span></span>
                <span className="text-gray-400">生命: <span className="text-red-400">{stats.hp}/{stats.maxHp}</span></span>
                <span className="text-gray-400">魔力: <span className="text-blue-400">{stats.mp}/{stats.maxMp}</span></span>
                <span className="text-gray-400">攻击: <span className="text-yellow-400">{stats.atk}+{equipment.weapon?.atk || 0}</span></span>
                <span className="text-gray-400">防御: <span className="text-green-400">{stats.def}+{equipment.armor?.def || 0}</span></span>
                <span className="text-gray-400">金币: <span className="text-yellow-300">{stats.gold}</span></span>
                <span className="text-gray-400">分数: <span className="text-white">{score}</span></span>
              </div>
            </div>
          </div>
        )}

        {/* Game Over / Result - restart button */}
        {(phase === "gameover" || phase === "result") && (
          <div className="mt-4 text-center space-y-3">
            {phase === "result" && (
              <div className="flex items-center justify-center gap-2 text-yellow-400">
                <Trophy size={20} />
                <span className="font-bold">恭喜通关！</span>
              </div>
            )}
            <button
              onClick={() => setPhase("title")}
              className="px-4 py-2 bg-[#a55eea] rounded-lg text-sm font-medium hover:bg-[#a55eea]/80 inline-flex items-center gap-2"
            >
              <RotateCcw size={14} /> 重新开始
            </button>
          </div>
        )}

        {/* CG Scene - continue button */}
        {phase === "cg" && (
          <div className="mt-4 text-center">
            <button
              onClick={advanceFromCG}
              className="px-4 py-2 bg-[#a55eea] rounded-lg text-sm font-medium hover:bg-[#a55eea]/80 inline-flex items-center gap-2"
            >
              <Sparkles size={14} /> 继续冒险
            </button>
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
