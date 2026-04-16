"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";
import {
  ChevronLeft, RotateCcw, Volume2, VolumeX, CircleDot, Trophy,
  Play, ArrowUp, ArrowDown, ArrowLeft, ArrowRight
} from "lucide-react";

/* ================================================================
   常量 & 类型
   ================================================================ */
const GAME_ID = "soccer";
const W = 480, H = 640;
const HALF_TIME = 120; // 每半场120秒
const GOAL_W = 100, GOAL_H = 12;
const BALL_R = 6;
const PLAYER_R = 12;
const FRICTION = 0.985;
const SHOOT_POWER = 420;
const PASS_POWER = 280;

type Phase = "title" | "playing" | "halftime" | "goal" | "matchover" | "leagueresult";
type Difficulty = "easy" | "normal" | "hard";
type Half = "first" | "second";

interface Vec2 { x: number; y: number }
interface Ball { x: number; y: number; vx: number; vy: number }
interface Player {
  x: number; y: number; vx: number; vy: number;
  homeX: number; homeY: number; isGoalkeeper: boolean;
}
interface Team { players: Player[]; color: string; name: string }

interface MatchResult { playerGoals: number; cpuGoals: number; matchIndex: number }

interface GameState {
  ball: Ball;
  teamA: Team;
  teamB: Team;
  half: Half;
  time: number;
  playerGoals: number;
  cpuGoals: number;
  selectedIdx: number;
  goalMsg: string;
  goalTimer: number;
  difficulty: Difficulty;
  matchIndex: number;
  leagueResults: MatchResult[];
  leagueScore: number;
}

const DIFF_LABELS: Record<Difficulty, string> = { easy: "简单", normal: "普通", hard: "困难" };
const DIFF_SPEED: Record<Difficulty, number> = { easy: 100, normal: 150, hard: 200 };
const DIFF_REACT: Record<Difficulty, number> = { easy: 0.02, normal: 0.04, hard: 0.07 };
const DIFF_SHOOT: Record<Difficulty, number> = { easy: 250, normal: 340, hard: 420 };

const LEAGUE_TEAMS = ["蓝色闪电", "红色风暴", "绿色旋风"];

/* ================================================================
   工具函数
   ================================================================ */
function dist(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
function normalize(vx: number, vy: number): [number, number] {
  const len = Math.sqrt(vx * vx + vy * vy);
  if (len < 0.001) return [0, -1];
  return [vx / len, vy / len];
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
function hexToNum(hex: string): number {
  return parseInt(hex.slice(1, 7), 16);
}

function createTeamA(): Player[] {
  return [
    { x: W / 2, y: H - 50, vx: 0, vy: 0, homeX: W / 2, homeY: H - 50, isGoalkeeper: true },
    { x: W / 3, y: H - 180, vx: 0, vy: 0, homeX: W / 3, homeY: H - 180, isGoalkeeper: false },
    { x: (2 * W) / 3, y: H - 180, vx: 0, vy: 0, homeX: (2 * W) / 3, homeY: H - 180, isGoalkeeper: false },
    { x: W / 3, y: H / 2 - 40, vx: 0, vy: 0, homeX: W / 3, homeY: H / 2 - 40, isGoalkeeper: false },
    { x: (2 * W) / 3, y: H / 2 - 40, vx: 0, vy: 0, homeX: (2 * W) / 3, homeY: H / 2 - 40, isGoalkeeper: false },
  ];
}

function createTeamB(): Player[] {
  return [
    { x: W / 2, y: 50, vx: 0, vy: 0, homeX: W / 2, homeY: 50, isGoalkeeper: true },
    { x: W / 3, y: 180, vx: 0, vy: 0, homeX: W / 3, homeY: 180, isGoalkeeper: false },
    { x: (2 * W) / 3, y: 180, vx: 0, vy: 0, homeX: (2 * W) / 3, homeY: 180, isGoalkeeper: false },
    { x: W / 3, y: H / 2 + 40, vx: 0, vy: 0, homeX: W / 3, homeY: H / 2 + 40, isGoalkeeper: false },
    { x: (2 * W) / 3, y: H / 2 + 40, vx: 0, vy: 0, homeX: (2 * W) / 3, homeY: H / 2 + 40, isGoalkeeper: false },
  ];
}

function resetPositions(teamA: Player[], teamB: Player[]) {
  const a = createTeamA();
  const b = createTeamB();
  for (let i = 0; i < teamA.length; i++) {
    teamA[i].x = a[i].x; teamA[i].y = a[i].y;
    teamA[i].vx = 0; teamA[i].vy = 0;
    teamA[i].homeX = a[i].homeX; teamA[i].homeY = a[i].homeY;
  }
  for (let i = 0; i < teamB.length; i++) {
    teamB[i].x = b[i].x; teamB[i].y = b[i].y;
    teamB[i].vx = 0; teamB[i].vy = 0;
    teamB[i].homeX = b[i].homeX; teamB[i].homeY = b[i].homeY;
  }
}


/* ================================================================
   主组件
   ================================================================ */
export default function SoccerGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [muted, setMuted] = useState(false);
  const [displayScore, setDisplayScore] = useState({ player: 0, cpu: 0 });
  const [displayHalf, setDisplayHalf] = useState<Half>("first");
  const [displayTime, setDisplayTime] = useState(HALF_TIME);
  const [goalText, setGoalText] = useState("");
  const [leagueResults, setLeagueResults] = useState<MatchResult[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [leagueMode, setLeagueMode] = useState(false);

  const sRef = useRef<GameState | null>(null);
  const keysRef = useRef(new Set<string>());
  const lastRef = useRef(0);
  const soundRef = useRef<SoundEngine | null>(null);
  const phaseRef = useRef<Phase>("title");

  // Keep phaseRef in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Sound engine
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    return () => { soundRef.current?.dispose(); };
  }, []);

  const playKick = useCallback(() => {
    if (!soundRef.current) return;
    soundRef.current.playTone(220, 0.06, "triangle");
  }, []);
  const playGoalSound = useCallback(() => {
    if (!soundRef.current) return;
    soundRef.current.playLevelUp();
  }, []);
  const playWhistle = useCallback(() => {
    if (!soundRef.current) return;
    soundRef.current.playTone(880, 0.3, "sine");
    setTimeout(() => soundRef.current?.playTone(880, 0.5, "sine"), 350);
  }, []);
  const playBounce = useCallback(() => {
    if (!soundRef.current) return;
    soundRef.current.playTone(330, 0.04, "square");
  }, []);

  const toggleMute = useCallback(() => {
    if (!soundRef.current) return;
    const m = soundRef.current.toggleMute();
    setMuted(m);
  }, []);

  /* ----------------------------------------------------------------
     创建新比赛状态
     ---------------------------------------------------------------- */
  const createGameState = useCallback((diff: Difficulty, mIdx: number, results: MatchResult[]): GameState => {
    return {
      ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
      teamA: { players: createTeamA(), color: "#3ea6ff", name: "我的球队" },
      teamB: { players: createTeamB(), color: "#ff4757", name: LEAGUE_TEAMS[mIdx % LEAGUE_TEAMS.length] },
      half: "first",
      time: HALF_TIME,
      playerGoals: 0,
      cpuGoals: 0,
      selectedIdx: 3,
      goalMsg: "",
      goalTimer: 0,
      difficulty: diff,
      matchIndex: mIdx,
      leagueResults: results,
      leagueScore: results.reduce((s, r) => {
        if (r.playerGoals > r.cpuGoals) return s + 3;
        if (r.playerGoals === r.cpuGoals) return s + 1;
        return s;
      }, 0),
    };
  }, []);

  /* ----------------------------------------------------------------
     开始比赛
     ---------------------------------------------------------------- */
  const startMatch = useCallback((diff: Difficulty, mIdx: number, results: MatchResult[], league: boolean) => {
    const gs = createGameState(diff, mIdx, results);
    sRef.current = gs;
    lastRef.current = 0;
    setDifficulty(diff);
    setMatchIndex(mIdx);
    setLeagueResults(results);
    setLeagueMode(league);
    setDisplayScore({ player: 0, cpu: 0 });
    setDisplayHalf("first");
    setDisplayTime(HALF_TIME);
    setPhase("playing");
    playWhistle();
  }, [createGameState, playWhistle]);

  const startSingleMatch = useCallback((diff: Difficulty) => {
    startMatch(diff, 0, [], false);
  }, [startMatch]);

  const startLeague = useCallback((diff: Difficulty) => {
    startMatch(diff, 0, [], true);
  }, [startMatch]);

  /* ----------------------------------------------------------------
     提交分数
     ---------------------------------------------------------------- */
  const submitScore = useCallback(async (score: number) => {
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score }),
      });
    } catch { /* ignore */ }
  }, []);

  /* ----------------------------------------------------------------
     存档/读档
     ---------------------------------------------------------------- */
  const handleSave = useCallback(() => {
    const s = sRef.current;
    if (!s) return null;
    return {
      ball: { ...s.ball },
      teamAPlayers: s.teamA.players.map(p => ({ ...p })),
      teamBPlayers: s.teamB.players.map(p => ({ ...p })),
      half: s.half, time: s.time,
      playerGoals: s.playerGoals, cpuGoals: s.cpuGoals,
      selectedIdx: s.selectedIdx, difficulty: s.difficulty,
      matchIndex: s.matchIndex, leagueResults: [...s.leagueResults],
      leagueScore: s.leagueScore,
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    if (!d || !d.teamAPlayers) return;
    const gs = createGameState(
      (d.difficulty as Difficulty) || "normal",
      (d.matchIndex as number) || 0,
      (d.leagueResults as MatchResult[]) || [],
    );
    gs.ball = d.ball as Ball;
    gs.teamA.players = (d.teamAPlayers as Player[]).map(p => ({ ...p }));
    gs.teamB.players = (d.teamBPlayers as Player[]).map(p => ({ ...p }));
    gs.half = (d.half as Half) || "first";
    gs.time = (d.time as number) || HALF_TIME;
    gs.playerGoals = (d.playerGoals as number) || 0;
    gs.cpuGoals = (d.cpuGoals as number) || 0;
    gs.selectedIdx = (d.selectedIdx as number) || 3;
    sRef.current = gs;
    lastRef.current = 0;
    setDifficulty(gs.difficulty);
    setMatchIndex(gs.matchIndex);
    setLeagueResults(gs.leagueResults);
    setDisplayScore({ player: gs.playerGoals, cpu: gs.cpuGoals });
    setDisplayHalf(gs.half);
    setDisplayTime(gs.time);
    setPhase("playing");
  }, [createGameState]);

  /* ----------------------------------------------------------------
     找到离球最近的己方球员
     ---------------------------------------------------------------- */
  const findClosestToball = useCallback((players: Player[], ball: Ball): number => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < players.length; i++) {
      const d = dist(players[i], ball);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }, []);


  /* ----------------------------------------------------------------
     游戏主循环 (PixiJS)
     ---------------------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let destroyed = false;
    let app: Application | null = null;

    (async () => {
      const pixi = await loadPixi();
      if (destroyed) return;
      app = await createPixiApp({ canvas: canvas!, width: W, height: H, backgroundColor: 0x0d3d0d, antialias: true });
      if (destroyed) { app.destroy(true); return; }

      const g = new pixi.Graphics();
      app.stage.addChild(g);

      // Text pool
      const TEXT_POOL_SIZE = 70;
      const texts: PixiText[] = [];
      for (let i = 0; i < TEXT_POOL_SIZE; i++) {
        const t = new pixi.Text({ text: "", style: { fontSize: 14, fill: 0xffffff, fontFamily: "sans-serif" } });
        t.visible = false;
        app.stage.addChild(t);
        texts.push(t);
      }
      let textIdx = 0;

      function nextText(str: string, x: number, y: number, opts: {
        fontSize?: number; fill?: number | string; fontWeight?: string;
        align?: "left" | "center" | "right"; alpha?: number;
      } = {}): void {
        if (textIdx >= TEXT_POOL_SIZE) return;
        const t = texts[textIdx++];
        t.text = str;
        t.visible = true;
        t.alpha = opts.alpha ?? 1;
        const fillVal = typeof opts.fill === "string" ? hexToNum(opts.fill) : (opts.fill ?? 0xffffff);
        t.style.fontSize = opts.fontSize ?? 14;
        t.style.fill = fillVal;
        t.style.fontWeight = (opts.fontWeight ?? "normal") as "normal" | "bold";
        t.style.fontFamily = "sans-serif";
        const anchor = opts.align ?? "left";
        if (anchor === "center") { t.anchor.set(0.5, 0); t.x = x; }
        else if (anchor === "right") { t.anchor.set(1, 0); t.x = x; }
        else { t.anchor.set(0, 0); t.x = x; }
        t.y = y - (opts.fontSize ?? 14) * 0.85;
      }

      // Stroke helpers using PixiJS Graphics
      function strokeRect(gfx: PixiGraphics, x: number, y: number, w: number, h: number, color: number, alpha: number, lineW: number) {
        gfx.rect(x, y, w, h).stroke({ color, alpha, width: lineW });
      }
      function strokeCircle(gfx: PixiGraphics, cx: number, cy: number, r: number, color: number, alpha: number, lineW: number) {
        gfx.circle(cx, cy, r).stroke({ color, alpha, width: lineW });
      }
      function strokeLine(gfx: PixiGraphics, x1: number, y1: number, x2: number, y2: number, color: number, alpha: number, lineW: number) {
        gfx.moveTo(x1, y1).lineTo(x2, y2).stroke({ color, alpha, width: lineW });
      }

      app.ticker.add(() => {
        if (destroyed) return;
        const now = performance.now();
        if (!lastRef.current) lastRef.current = now;
        const dt = Math.min((now - lastRef.current) / 1000, 0.05);
        lastRef.current = now;
        const s = sRef.current;
        const currentPhase = phaseRef.current;

        /* ============ UPDATE ============ */
        if (currentPhase === "playing" && s) {
          const keys = keysRef.current;
          const diff = s.difficulty;
          const playerSpeed = 200;

          const cp = s.teamA.players[s.selectedIdx];
          let dx = 0, dy = 0;
          if (keys.has("a") || keys.has("ArrowLeft")) dx -= 1;
          if (keys.has("d") || keys.has("ArrowRight")) dx += 1;
          if (keys.has("w") || keys.has("ArrowUp")) dy -= 1;
          if (keys.has("s") || keys.has("ArrowDown")) dy += 1;
          if (dx !== 0 || dy !== 0) {
            const [nx, ny] = normalize(dx, dy);
            cp.vx = nx * playerSpeed;
            cp.vy = ny * playerSpeed;
          } else {
            cp.vx *= 0.85;
            cp.vy *= 0.85;
          }
          cp.x = clamp(cp.x + cp.vx * dt, PLAYER_R, W - PLAYER_R);
          cp.y = clamp(cp.y + cp.vy * dt, PLAYER_R, H - PLAYER_R);

          if (keys.has(" ")) {
            keys.delete(" ");
            const d = dist(cp, s.ball);
            if (d < PLAYER_R + BALL_R + 8) {
              const goalX = W / 2;
              const goalY = 0;
              const [sx, sy] = normalize(goalX - cp.x, goalY - cp.y);
              s.ball.vx = sx * SHOOT_POWER;
              s.ball.vy = sy * SHOOT_POWER;
              playKick();
            }
          }

          if (keys.has("q") || keys.has("e")) {
            keys.delete("q"); keys.delete("e");
            s.selectedIdx = findClosestToball(s.teamA.players, s.ball);
          }

          for (let i = 0; i < s.teamA.players.length; i++) {
            if (i === s.selectedIdx) continue;
            const p = s.teamA.players[i];
            const dBall = dist(p, s.ball);
            let tx = p.homeX, ty = p.homeY;
            if (dBall < 120 && !p.isGoalkeeper) {
              tx = s.ball.x; ty = s.ball.y;
            } else if (p.isGoalkeeper) {
              tx = clamp(s.ball.x, W / 2 - 60, W / 2 + 60);
              ty = H - 40;
            }
            const [nx, ny] = normalize(tx - p.x, ty - p.y);
            const spd = p.isGoalkeeper ? 160 : 120;
            p.x += nx * spd * dt;
            p.y += ny * spd * dt;
            p.x = clamp(p.x, PLAYER_R, W - PLAYER_R);
            p.y = clamp(p.y, PLAYER_R, H - PLAYER_R);

            if (dBall < PLAYER_R + BALL_R + 4) {
              const [bx, by] = normalize(W / 2 - p.x, -1);
              s.ball.vx += bx * PASS_POWER * 0.5;
              s.ball.vy += by * PASS_POWER * 0.5;
            }
          }

          const aiSpeed = DIFF_SPEED[diff];
          const aiReact = DIFF_REACT[diff];
          const aiShoot = DIFF_SHOOT[diff];
          for (let i = 0; i < s.teamB.players.length; i++) {
            const p = s.teamB.players[i];
            const dBall = dist(p, s.ball);
            let tx = p.homeX, ty = p.homeY;

            if (p.isGoalkeeper) {
              tx = clamp(s.ball.x, W / 2 - 60, W / 2 + 60);
              ty = 40;
            } else {
              const closestAI = findClosestToball(s.teamB.players, s.ball);
              if (i === closestAI) {
                tx = s.ball.x;
                ty = s.ball.y;
              } else {
                tx = p.homeX + (s.ball.x - W / 2) * 0.3;
                ty = p.homeY + (s.ball.y - H / 2) * aiReact * 10;
              }
            }

            const [nx, ny] = normalize(tx - p.x, ty - p.y);
            p.x += nx * aiSpeed * dt;
            p.y += ny * aiSpeed * dt;
            p.x = clamp(p.x, PLAYER_R, W - PLAYER_R);
            p.y = clamp(p.y, PLAYER_R, H - PLAYER_R);

            if (dBall < PLAYER_R + BALL_R + 4) {
              if (p.y < H / 2 && !p.isGoalkeeper) {
                const [sx, sy] = normalize(W / 2 - p.x, H - p.y);
                s.ball.vx = sx * aiShoot;
                s.ball.vy = sy * aiShoot;
              } else {
                const [bx, by] = normalize(W / 2 - p.x + (Math.random() - 0.5) * 100, 1);
                s.ball.vx += bx * PASS_POWER * 0.6;
                s.ball.vy += by * PASS_POWER * 0.6;
              }
              playKick();
            }
          }

          s.ball.vx *= FRICTION;
          s.ball.vy *= FRICTION;
          s.ball.x += s.ball.vx * dt;
          s.ball.y += s.ball.vy * dt;

          if (s.ball.x < BALL_R) { s.ball.x = BALL_R; s.ball.vx = Math.abs(s.ball.vx) * 0.8; playBounce(); }
          if (s.ball.x > W - BALL_R) { s.ball.x = W - BALL_R; s.ball.vx = -Math.abs(s.ball.vx) * 0.8; playBounce(); }

          const goalLeft = W / 2 - GOAL_W / 2;
          const goalRight = W / 2 + GOAL_W / 2;
          const inGoalX = s.ball.x > goalLeft && s.ball.x < goalRight;

          if (s.ball.y < BALL_R && !inGoalX) {
            s.ball.y = BALL_R; s.ball.vy = Math.abs(s.ball.vy) * 0.8; playBounce();
          }
          if (s.ball.y > H - BALL_R && !inGoalX) {
            s.ball.y = H - BALL_R; s.ball.vy = -Math.abs(s.ball.vy) * 0.8; playBounce();
          }

          const allPlayers = [...s.teamA.players, ...s.teamB.players];
          for (const p of allPlayers) {
            const d = dist(p, s.ball);
            if (d < PLAYER_R + BALL_R) {
              const [nx, ny] = normalize(s.ball.x - p.x, s.ball.y - p.y);
              const overlap = PLAYER_R + BALL_R - d;
              s.ball.x += nx * overlap;
              s.ball.y += ny * overlap;
              const dot = s.ball.vx * nx + s.ball.vy * ny;
              if (dot < 0) {
                s.ball.vx -= 1.5 * dot * nx;
                s.ball.vy -= 1.5 * dot * ny;
              }
            }
          }

          const maxV = 500;
          const spd = Math.sqrt(s.ball.vx ** 2 + s.ball.vy ** 2);
          if (spd > maxV) {
            s.ball.vx = (s.ball.vx / spd) * maxV;
            s.ball.vy = (s.ball.vy / spd) * maxV;
          }

          if (s.ball.y < 0 && inGoalX) {
            s.playerGoals++;
            setDisplayScore({ player: s.playerGoals, cpu: s.cpuGoals });
            s.goalMsg = "进球!";
            setGoalText("进球!");
            s.goalTimer = 1.5;
            setPhase("goal");
            playGoalSound();
            s.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
            resetPositions(s.teamA.players, s.teamB.players);
          }
          if (s.ball.y > H && inGoalX) {
            s.cpuGoals++;
            setDisplayScore({ player: s.playerGoals, cpu: s.cpuGoals });
            s.goalMsg = "对方进球...";
            setGoalText("对方进球...");
            s.goalTimer = 1.5;
            setPhase("goal");
            playGoalSound();
            s.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
            resetPositions(s.teamA.players, s.teamB.players);
          }

          s.time -= dt;
          setDisplayTime(Math.max(0, s.time));
          if (s.time <= 0) {
            if (s.half === "first") {
              s.half = "second";
              s.time = HALF_TIME;
              s.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
              resetPositions(s.teamA.players, s.teamB.players);
              setDisplayHalf("second");
              setPhase("halftime");
              playWhistle();
            } else {
              playWhistle();
              const result: MatchResult = {
                playerGoals: s.playerGoals,
                cpuGoals: s.cpuGoals,
                matchIndex: s.matchIndex,
              };
              const newResults = [...s.leagueResults, result];
              s.leagueResults = newResults;
              setLeagueResults(newResults);
              const totalGoals = newResults.reduce((sum, r) => sum + r.playerGoals, 0);
              const wins = newResults.filter(r => r.playerGoals > r.cpuGoals).length;
              submitScore(totalGoals * 100 + wins * 500);
              setPhase("matchover");
            }
          }
        }

        if (currentPhase === "goal" && s) {
          s.goalTimer -= dt;
          if (s.goalTimer <= 0) {
            setPhase("playing");
          }
        }


        /* ============ RENDER ============ */
        g.clear();
        textIdx = 0;
        for (const t of texts) t.visible = false;

        // 球场背景 (already set as backgroundColor, but draw field green)
        g.rect(0, 0, W, H).fill(0x0d3d0d);

        // 球场线条
        strokeRect(g, 16, 16, W - 32, H - 32, 0xffffff, 0.2, 1.5);
        // 中线
        strokeLine(g, 16, H / 2, W - 16, H / 2, 0xffffff, 0.2, 1.5);
        // 中圈
        strokeCircle(g, W / 2, H / 2, 50, 0xffffff, 0.2, 1.5);
        // 中点
        g.circle(W / 2, H / 2, 3).fill({ color: 0xffffff, alpha: 0.3 });

        // 上方禁区
        strokeRect(g, W / 2 - 80, 16, 160, 60, 0xffffff, 0.2, 1.5);
        // 下方禁区
        strokeRect(g, W / 2 - 80, H - 76, 160, 60, 0xffffff, 0.2, 1.5);

        // 球门
        g.rect(W / 2 - GOAL_W / 2, 0, GOAL_W, GOAL_H).fill({ color: 0xffffff, alpha: 0.15 });
        g.rect(W / 2 - GOAL_W / 2, H - GOAL_H, GOAL_W, GOAL_H).fill({ color: 0xffffff, alpha: 0.15 });
        // 上球门框
        g.moveTo(W / 2 - GOAL_W / 2, GOAL_H)
          .lineTo(W / 2 - GOAL_W / 2, 0)
          .lineTo(W / 2 + GOAL_W / 2, 0)
          .lineTo(W / 2 + GOAL_W / 2, GOAL_H)
          .stroke({ color: 0xffffff, width: 2 });
        // 下球门框
        g.moveTo(W / 2 - GOAL_W / 2, H - GOAL_H)
          .lineTo(W / 2 - GOAL_W / 2, H)
          .lineTo(W / 2 + GOAL_W / 2, H)
          .lineTo(W / 2 + GOAL_W / 2, H - GOAL_H)
          .stroke({ color: 0xffffff, width: 2 });

        if (currentPhase === "title") {
          // 标题画面
          g.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.75 });

          nextText("绿茵风暴", W / 2, H / 2 - 100, { fontSize: 36, fill: 0x3ea6ff, fontWeight: "bold", align: "center" });
          nextText("WASD/方向键 移动 | 空格 射门 | Q/E 切换球员", W / 2, H / 2 - 60, { fontSize: 13, fill: 0xaaaaaa, align: "center" });

          // 难度选择
          const diffs: Difficulty[] = ["easy", "normal", "hard"];
          const diffColors = [0x2ed573, 0xf0b90b, 0xff4757];
          for (let i = 0; i < diffs.length; i++) {
            const bx = W / 2 - 120 + i * 85;
            const by = H / 2 - 20;
            const isHover = difficulty === diffs[i];
            g.roundRect(bx, by, 75, 32, 6).fill(isHover ? diffColors[i] : 0x333333);
            nextText(DIFF_LABELS[diffs[i]], bx + 37, by + 21, { fontSize: 13, fill: isHover ? 0x000000 : 0xaaaaaa, fontWeight: "bold", align: "center" });
          }

          // 开始按钮
          g.roundRect(W / 2 - 80, H / 2 + 30, 160, 40, 8).fill(0x3ea6ff);
          nextText("开始比赛", W / 2, H / 2 + 56, { fontSize: 16, fill: 0x000000, fontWeight: "bold", align: "center" });

          // 联赛按钮
          g.roundRect(W / 2 - 80, H / 2 + 85, 160, 40, 8).fill(0xf0b90b);
          nextText("联赛模式 (3场)", W / 2, H / 2 + 111, { fontSize: 16, fill: 0x000000, fontWeight: "bold", align: "center" });

        } else if (s) {
          // 绘制球员
          const drawPlayer = (p: Player, color: string, idx: number, isSelected: boolean) => {
            g.circle(p.x, p.y, PLAYER_R).fill(hexToNum(color));
            if (isSelected) {
              strokeCircle(g, p.x, p.y, PLAYER_R + 3, 0xffffff, 1, 2);
              // 选中指示器三角形
              g.moveTo(p.x, p.y - PLAYER_R - 8)
                .lineTo(p.x - 4, p.y - PLAYER_R - 14)
                .lineTo(p.x + 4, p.y - PLAYER_R - 14)
                .closePath()
                .fill(0xffffff);
            }
            nextText(`${idx + 1}`, p.x, p.y + 3, { fontSize: 9, fill: 0xffffff, fontWeight: "bold", align: "center" });
          };

          for (let i = 0; i < s.teamA.players.length; i++) {
            drawPlayer(s.teamA.players[i], s.teamA.color, i, i === s.selectedIdx);
          }
          for (let i = 0; i < s.teamB.players.length; i++) {
            drawPlayer(s.teamB.players[i], s.teamB.color, i, false);
          }

          // 球
          g.circle(s.ball.x, s.ball.y, BALL_R).fill(0xffffff);
          strokeCircle(g, s.ball.x, s.ball.y, BALL_R, 0x999999, 1, 1);

          // HUD
          g.rect(0, 0, W, 36).fill({ color: 0x000000, alpha: 0.6 });
          nextText("我的球队", 12, 24, { fontSize: 14, fill: 0x3ea6ff, fontWeight: "bold", align: "left" });
          nextText(s.teamB.name, W - 12, 24, { fontSize: 14, fill: 0xff4757, fontWeight: "bold", align: "right" });
          nextText(`${s.playerGoals} - ${s.cpuGoals}`, W / 2, 26, { fontSize: 18, fill: 0xffffff, fontWeight: "bold", align: "center" });
          const halfLabel = s.half === "first" ? "上半场" : "下半场";
          const timeStr = `${halfLabel} ${Math.ceil(s.time)}s`;
          nextText(timeStr, W / 2, 12, { fontSize: 11, fill: 0xaaaaaa, align: "center" });

          // 进球动画
          if (currentPhase === "goal") {
            g.rect(0, H / 2 - 40, W, 80).fill({ color: 0x000000, alpha: 0.5 });
            nextText(s.goalMsg, W / 2, H / 2 + 12, { fontSize: 36, fill: 0xffd700, fontWeight: "bold", align: "center" });
          }

          // 中场休息
          if (currentPhase === "halftime") {
            g.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.7 });
            nextText("中场休息", W / 2, H / 2 - 30, { fontSize: 28, fill: 0x3ea6ff, fontWeight: "bold", align: "center" });
            nextText(`${s.playerGoals} - ${s.cpuGoals}`, W / 2, H / 2 + 10, { fontSize: 22, fill: 0xffffff, fontWeight: "bold", align: "center" });
            nextText("点击继续下半场", W / 2, H / 2 + 45, { fontSize: 14, fill: 0xaaaaaa, align: "center" });
          }

          // 比赛结束
          if (currentPhase === "matchover") {
            g.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.8 });
            const won = s.playerGoals > s.cpuGoals;
            const draw = s.playerGoals === s.cpuGoals;
            const resultColor = won ? 0x2ed573 : draw ? 0xf0b90b : 0xff4757;
            nextText(won ? "胜利!" : draw ? "平局" : "失败", W / 2, H / 2 - 60, { fontSize: 30, fill: resultColor, fontWeight: "bold", align: "center" });
            nextText(`${s.playerGoals} - ${s.cpuGoals}`, W / 2, H / 2 - 20, { fontSize: 24, fill: 0xffffff, fontWeight: "bold", align: "center" });
            nextText("比赛结束", W / 2, H / 2 + 10, { fontSize: 14, fill: 0xaaaaaa, align: "center" });

            if (leagueMode && s.matchIndex < 2) {
              g.roundRect(W / 2 - 70, H / 2 + 30, 140, 36, 6).fill(0x3ea6ff);
              nextText("下一场比赛", W / 2, H / 2 + 53, { fontSize: 14, fill: 0x000000, fontWeight: "bold", align: "center" });
            } else if (leagueMode && s.matchIndex >= 2) {
              g.roundRect(W / 2 - 70, H / 2 + 30, 140, 36, 6).fill(0xf0b90b);
              nextText("查看联赛结果", W / 2, H / 2 + 53, { fontSize: 14, fill: 0x000000, fontWeight: "bold", align: "center" });
            } else {
              g.roundRect(W / 2 - 60, H / 2 + 30, 120, 36, 6).fill(0x3ea6ff);
              nextText("再来一局", W / 2, H / 2 + 53, { fontSize: 14, fill: 0x000000, fontWeight: "bold", align: "center" });
            }
          }

          // 联赛结果
          if (currentPhase === "leagueresult") {
            g.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.85 });
            nextText("联赛结果", W / 2, 80, { fontSize: 28, fill: 0xf0b90b, fontWeight: "bold", align: "center" });

            let totalPts = 0;
            for (let i = 0; i < s.leagueResults.length; i++) {
              const r = s.leagueResults[i];
              const won = r.playerGoals > r.cpuGoals;
              const draw = r.playerGoals === r.cpuGoals;
              const pts = won ? 3 : draw ? 1 : 0;
              totalPts += pts;
              const y = 130 + i * 50;
              nextText(`第${i + 1}场 vs ${LEAGUE_TEAMS[i]}`, 60, y, { fontSize: 13, fill: 0xaaaaaa, align: "left" });
              const rColor = won ? 0x2ed573 : draw ? 0xf0b90b : 0xff4757;
              nextText(`${r.playerGoals} - ${r.cpuGoals}`, W - 100, y, { fontSize: 16, fill: rColor, fontWeight: "bold", align: "right" });
              nextText(`+${pts}分`, W - 50, y, { fontSize: 12, fill: 0xffffff, align: "right" });
            }

            nextText(`总积分: ${totalPts} / 9`, W / 2, 310, { fontSize: 20, fill: 0xffffff, fontWeight: "bold", align: "center" });

            const msgColor = totalPts >= 7 ? 0x2ed573 : totalPts >= 4 ? 0xf0b90b : 0xff4757;
            nextText(
              totalPts >= 7 ? "冠军! 太强了!" : totalPts >= 4 ? "不错的成绩!" : "继续加油!",
              W / 2, 350, { fontSize: 22, fill: msgColor, fontWeight: "bold", align: "center" }
            );

            g.roundRect(W / 2 - 60, 390, 120, 36, 6).fill(0x3ea6ff);
            nextText("返回主页", W / 2, 413, { fontSize: 14, fill: 0x000000, fontWeight: "bold", align: "center" });
          }
        }
      });
    })();

    return () => {
      destroyed = true;
      if (app) { app.destroy(true); app = null; }
    };
  }, [phase, difficulty, leagueMode, playKick, playGoalSound, playWhistle, playBounce, findClosestToball, submitScore]);


  /* ----------------------------------------------------------------
     键盘事件
     ---------------------------------------------------------------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (e.key === " " || e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
      if ((e.key === "Enter" || e.key === " ") && phase === "halftime") {
        setPhase("playing");
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
  }, [phase]);

  /* ----------------------------------------------------------------
     Canvas 点击事件
     ---------------------------------------------------------------- */
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const y = (e.clientY - rect.top) * (H / rect.height);

    if (phase === "title") {
      const diffs: Difficulty[] = ["easy", "normal", "hard"];
      for (let i = 0; i < diffs.length; i++) {
        const bx = W / 2 - 120 + i * 85;
        const by = H / 2 - 20;
        if (x >= bx && x <= bx + 75 && y >= by && y <= by + 32) {
          setDifficulty(diffs[i]);
          return;
        }
      }
      if (x >= W / 2 - 80 && x <= W / 2 + 80 && y >= H / 2 + 30 && y <= H / 2 + 70) {
        startSingleMatch(difficulty);
        return;
      }
      if (x >= W / 2 - 80 && x <= W / 2 + 80 && y >= H / 2 + 85 && y <= H / 2 + 125) {
        startLeague(difficulty);
        return;
      }
    }

    if (phase === "halftime") {
      setPhase("playing");
      return;
    }

    if (phase === "matchover") {
      const s = sRef.current;
      if (!s) return;
      if (leagueMode && s.matchIndex < 2) {
        const nextIdx = s.matchIndex + 1;
        startMatch(s.difficulty, nextIdx, s.leagueResults, true);
      } else if (leagueMode && s.matchIndex >= 2) {
        setPhase("leagueresult");
      } else {
        startSingleMatch(difficulty);
      }
      return;
    }

    if (phase === "leagueresult") {
      setPhase("title");
      return;
    }
  }, [phase, difficulty, leagueMode, startSingleMatch, startLeague, startMatch]);

  /* ----------------------------------------------------------------
     触摸控制
     ---------------------------------------------------------------- */
  const touchRef = useRef<{ id: number; sx: number; sy: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      touchRef.current = { id: t.identifier, sx: t.clientX, sy: t.clientY };

      if (phase !== "playing" && phase !== "goal") {
        const rect = canvas.getBoundingClientRect();
        const x = (t.clientX - rect.left) * (W / rect.width);
        const y = (t.clientY - rect.top) * (H / rect.height);

        if (phase === "title") {
          const diffs: Difficulty[] = ["easy", "normal", "hard"];
          for (let i = 0; i < diffs.length; i++) {
            const bx = W / 2 - 120 + i * 85;
            const by = H / 2 - 20;
            if (x >= bx && x <= bx + 75 && y >= by && y <= by + 32) {
              setDifficulty(diffs[i]);
              return;
            }
          }
          if (x >= W / 2 - 80 && x <= W / 2 + 80 && y >= H / 2 + 30 && y <= H / 2 + 70) {
            startSingleMatch(difficulty);
            return;
          }
          if (x >= W / 2 - 80 && x <= W / 2 + 80 && y >= H / 2 + 85 && y <= H / 2 + 125) {
            startLeague(difficulty);
            return;
          }
        }
        if (phase === "halftime") { setPhase("playing"); return; }
        if (phase === "matchover") {
          const s = sRef.current;
          if (s && leagueMode && s.matchIndex < 2) {
            startMatch(s.difficulty, s.matchIndex + 1, s.leagueResults, true);
          } else if (s && leagueMode && s.matchIndex >= 2) {
            setPhase("leagueresult");
          } else {
            startSingleMatch(difficulty);
          }
          return;
        }
        if (phase === "leagueresult") { setPhase("title"); return; }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!touchRef.current || phase !== "playing") return;
      const t = Array.from(e.changedTouches).find(tt => tt.identifier === touchRef.current!.id);
      if (!t) return;
      const dx = t.clientX - touchRef.current.sx;
      const dy = t.clientY - touchRef.current.sy;
      touchRef.current.sx = t.clientX;
      touchRef.current.sy = t.clientY;

      const s = sRef.current;
      if (!s) return;
      const cp = s.teamA.players[s.selectedIdx];
      cp.x = clamp(cp.x + dx * 1.5, PLAYER_R, W - PLAYER_R);
      cp.y = clamp(cp.y + dy * 1.5, PLAYER_R, H - PLAYER_R);
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      touchRef.current = null;
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [phase, difficulty, leagueMode, startSingleMatch, startLeague, startMatch]);

  /* ----------------------------------------------------------------
     触摸射门按钮
     ---------------------------------------------------------------- */
  const handleShoot = useCallback(() => {
    if (phase !== "playing") return;
    const s = sRef.current;
    if (!s) return;
    const cp = s.teamA.players[s.selectedIdx];
    const d = dist(cp, s.ball);
    if (d < PLAYER_R + BALL_R + 12) {
      const [sx, sy] = normalize(W / 2 - cp.x, -cp.y);
      s.ball.vx = sx * SHOOT_POWER;
      s.ball.vy = sy * SHOOT_POWER;
      playKick();
    }
  }, [phase, playKick]);

  const handleSwitchPlayer = useCallback(() => {
    if (phase !== "playing") return;
    const s = sRef.current;
    if (!s) return;
    s.selectedIdx = findClosestToball(s.teamA.players, s.ball);
  }, [phase, findClosestToball]);


  /* ----------------------------------------------------------------
     JSX 渲染
     ---------------------------------------------------------------- */
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Link href="/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4">
          <ChevronLeft size={16} /> 返回游戏中心
        </Link>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CircleDot size={24} className="text-[#3ea6ff]" />
            <h1 className="text-xl font-bold">绿茵风暴</h1>
          </div>
          <button
            onClick={toggleMute}
            className="p-2 rounded-lg bg-[#1a1a1a] border border-[#333] hover:bg-[#252525] transition"
            title={muted ? "取消静音" : "静音"}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>

        {/* 比赛信息栏 */}
        {phase !== "title" && phase !== "leagueresult" && (
          <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-sm">
            <span className="text-[#3ea6ff] font-bold">我的球队</span>
            <div className="text-center">
              <span className="text-white font-bold text-lg">{displayScore.player} - {displayScore.cpu}</span>
              <div className="text-[10px] text-[#aaa]">
                {displayHalf === "first" ? "上半场" : "下半场"} {Math.ceil(displayTime)}s
              </div>
            </div>
            <span className="text-[#ff4757] font-bold">{LEAGUE_TEAMS[matchIndex % LEAGUE_TEAMS.length]}</span>
          </div>
        )}

        {/* 联赛进度 */}
        {leagueMode && phase !== "title" && phase !== "leagueresult" && (
          <div className="flex items-center gap-2 mb-3 text-xs text-[#aaa]">
            <Trophy size={14} className="text-[#f0b90b]" />
            <span>联赛 第{matchIndex + 1}/3场</span>
            {leagueResults.map((r, i) => {
              const won = r.playerGoals > r.cpuGoals;
              const draw = r.playerGoals === r.cpuGoals;
              return (
                <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] ${won ? "bg-green-900/50 text-green-400" : draw ? "bg-yellow-900/50 text-yellow-400" : "bg-red-900/50 text-red-400"}`}>
                  {r.playerGoals}-{r.cpuGoals}
                </span>
              );
            })}
          </div>
        )}

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="w-full max-w-[480px] mx-auto rounded-lg border border-white/10 cursor-pointer"
          style={{ aspectRatio: `${W}/${H}` }}
        />

        {/* 移动端虚拟按钮 */}
        {phase === "playing" && (
          <div className="md:hidden mt-4 flex items-center justify-between px-2">
            {/* 方向键 */}
            <div className="relative w-32 h-32">
              <button
                onTouchStart={() => keysRef.current.add("w")}
                onTouchEnd={() => keysRef.current.delete("w")}
                className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-10 rounded-lg bg-[#1a1a1a] border border-[#333] flex items-center justify-center active:bg-[#3ea6ff]/30"
              >
                <ArrowUp size={18} />
              </button>
              <button
                onTouchStart={() => keysRef.current.add("s")}
                onTouchEnd={() => keysRef.current.delete("s")}
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-10 rounded-lg bg-[#1a1a1a] border border-[#333] flex items-center justify-center active:bg-[#3ea6ff]/30"
              >
                <ArrowDown size={18} />
              </button>
              <button
                onTouchStart={() => keysRef.current.add("a")}
                onTouchEnd={() => keysRef.current.delete("a")}
                className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg bg-[#1a1a1a] border border-[#333] flex items-center justify-center active:bg-[#3ea6ff]/30"
              >
                <ArrowLeft size={18} />
              </button>
              <button
                onTouchStart={() => keysRef.current.add("d")}
                onTouchEnd={() => keysRef.current.delete("d")}
                className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg bg-[#1a1a1a] border border-[#333] flex items-center justify-center active:bg-[#3ea6ff]/30"
              >
                <ArrowRight size={18} />
              </button>
            </div>

            {/* 动作按钮 */}
            <div className="flex flex-col gap-3">
              <button
                onTouchStart={handleShoot}
                className="w-16 h-16 rounded-full bg-[#3ea6ff]/20 border-2 border-[#3ea6ff] text-[#3ea6ff] font-bold text-xs flex items-center justify-center active:bg-[#3ea6ff]/40"
              >
                射门
              </button>
              <button
                onTouchStart={handleSwitchPlayer}
                className="w-16 h-10 rounded-lg bg-[#f0b90b]/20 border border-[#f0b90b] text-[#f0b90b] font-bold text-xs flex items-center justify-center active:bg-[#f0b90b]/40"
              >
                切换
              </button>
            </div>
          </div>
        )}

        {/* 操作说明 */}
        {phase === "title" && (
          <div className="mt-4 p-3 rounded-lg bg-[#1a1a1a] border border-[#333] text-xs text-[#aaa] space-y-1">
            <p className="text-[#3ea6ff] font-bold text-sm mb-2">操作说明</p>
            <p>WASD / 方向键 - 移动球员</p>
            <p>空格 - 射门（靠近球时）</p>
            <p>Q / E - 切换控制球员</p>
            <p>移动端 - 滑动移动 / 虚拟按钮</p>
          </div>
        )}

        {/* 重新开始按钮 */}
        {(phase === "playing" || phase === "goal") && (
          <button
            onClick={() => setPhase("title")}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-[#aaa] hover:text-white hover:bg-[#252525] transition"
          >
            <RotateCcw size={14} /> 返回主菜单
          </button>
        )}

        {/* 存档 & 排行榜 */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </div>
  );
}
