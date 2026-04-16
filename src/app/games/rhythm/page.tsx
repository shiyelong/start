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
  ChevronLeft, RotateCcw, Music, Volume2, VolumeX,
  Play, Star, Zap, Award, Target,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────
const GAME_ID = "rhythm";
const LANES = 4;
const LANE_KEYS = ["d", "f", "j", "k"];
const LANE_COLORS = ["#ff4757", "#3ea6ff", "#2ed573", "#ffa502"];
const LANE_COLOR_NUMS = [0xff4757, 0x3ea6ff, 0x2ed573, 0xffa502];
const LANE_GLOW_NUMS = [0xff4757, 0x3ea6ff, 0x2ed573, 0xffa502];

// Judgment windows (pixels from hit line)
const PERFECT_WINDOW = 18;
const GOOD_WINDOW = 36;
const OK_WINDOW = 54;

// Score values
const PERFECT_SCORE = 300;
const GOOD_SCORE = 200;
const OK_SCORE = 100;

type Phase = "title" | "playing" | "result";
type Difficulty = "easy" | "normal" | "hard";
type Judgment = "perfect" | "good" | "ok" | "miss";
type Grade = "S" | "A" | "B" | "C" | "D";

interface NoteData {
  lane: number;
  time: number; // beat time in seconds
}

interface ActiveNote {
  lane: number;
  y: number;
  time: number;
  hit: boolean;
  missed: boolean;
  judgment?: Judgment;
  fadeTimer: number;
}

interface Song {
  id: string;
  name: string;
  artist: string;
  bpm: number;
  duration: number; // seconds
  color: string;
  icon: string; // description for visual
  melody: { note: string; octave: number; duration: number; time: number }[];
  patterns: Record<Difficulty, NoteData[]>;
}

interface JudgmentPopup {
  text: string;
  color: string;
  y: number;
  alpha: number;
  scale: number;
}

interface GameState {
  notes: ActiveNote[];
  score: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  good: number;
  ok: number;
  miss: number;
  totalNotes: number;
  hitFlash: number[];
  judgmentPopup: JudgmentPopup | null;
  songTime: number;
  songStarted: boolean;
  songEnded: boolean;
  noteSpeed: number;
  nextNoteIndex: number;
  melodyIndex: number;
}

// ─── Color helper ────────────────────────────────────────
function hexToNum(hex: string): number {
  if (hex.startsWith("#")) return parseInt(hex.slice(1, 7), 16);
  return parseInt(hex, 16);
}

// ─── Song Definitions ────────────────────────────────────

function generatePattern(bpm: number, duration: number, density: number, seed: number): NoteData[] {
  const notes: NoteData[] = [];
  const beatInterval = 60 / bpm;
  const totalBeats = Math.floor(duration / beatInterval);
  let rng = seed;
  const nextRng = () => { rng = (rng * 1664525 + 1013904223) & 0x7fffffff; return rng / 0x7fffffff; };

  for (let b = 4; b < totalBeats - 2; b++) {
    if (nextRng() < density) {
      const lane = Math.floor(nextRng() * LANES);
      notes.push({ lane, time: b * beatInterval });
      // Double notes at higher density
      if (density > 0.5 && nextRng() < 0.3) {
        let lane2 = Math.floor(nextRng() * LANES);
        while (lane2 === lane) lane2 = Math.floor(nextRng() * LANES);
        notes.push({ lane: lane2, time: b * beatInterval });
      }
    }
    // Off-beat notes for harder difficulties
    if (density > 0.4 && nextRng() < density * 0.4) {
      const lane = Math.floor(nextRng() * LANES);
      notes.push({ lane, time: (b + 0.5) * beatInterval });
    }
  }
  return notes.sort((a, b) => a.time - b.time);
}

function generateMelody(baseNotes: string[], octave: number, bpm: number, duration: number): Song["melody"] {
  const melody: Song["melody"] = [];
  const beatInterval = 60 / bpm;
  const totalBeats = Math.floor(duration / beatInterval);
  for (let b = 0; b < totalBeats; b++) {
    const note = baseNotes[b % baseNotes.length];
    if (note !== "-") {
      melody.push({ note, octave, duration: beatInterval * 0.8, time: b * beatInterval });
    }
  }
  return melody;
}

const SONGS: Song[] = [
  {
    id: "starry-fantasy",
    name: "星空幻想",
    artist: "星聚原创",
    bpm: 80,
    duration: 45,
    color: "#6c5ce7",
    icon: "star",
    melody: generateMelody(["C", "E", "G", "A", "G", "E", "D", "C", "-", "E", "G", "A", "B", "A", "G", "-"], 4, 80, 45),
    patterns: {
      easy: generatePattern(80, 45, 0.25, 1001),
      normal: generatePattern(80, 45, 0.4, 1002),
      hard: generatePattern(80, 45, 0.6, 1003),
    },
  },
  {
    id: "electric-pulse",
    name: "电子脉冲",
    artist: "星聚原创",
    bpm: 128,
    duration: 50,
    color: "#00cec9",
    icon: "zap",
    melody: generateMelody(["E", "E", "G", "A", "-", "E", "D", "C", "D", "E", "G", "A", "-", "G", "E", "D"], 5, 128, 50),
    patterns: {
      easy: generatePattern(128, 50, 0.3, 2001),
      normal: generatePattern(128, 50, 0.5, 2002),
      hard: generatePattern(128, 50, 0.7, 2003),
    },
  },
  {
    id: "flame-war",
    name: "烈焰战歌",
    artist: "星聚原创",
    bpm: 160,
    duration: 40,
    color: "#e17055",
    icon: "fire",
    melody: generateMelody(["A", "B", "C", "D", "E", "D", "C", "B", "A", "-", "E", "D", "C", "B", "A", "G"], 4, 160, 40),
    patterns: {
      easy: generatePattern(160, 40, 0.3, 3001),
      normal: generatePattern(160, 40, 0.5, 3002),
      hard: generatePattern(160, 40, 0.75, 3003),
    },
  },
  {
    id: "sakura-fall",
    name: "樱花飘落",
    artist: "星聚原创",
    bpm: 110,
    duration: 48,
    color: "#fd79a8",
    icon: "flower",
    melody: generateMelody(["E", "D", "C", "D", "E", "E", "E", "-", "D", "D", "D", "-", "E", "G", "G", "-"], 5, 110, 48),
    patterns: {
      easy: generatePattern(110, 48, 0.25, 4001),
      normal: generatePattern(110, 48, 0.45, 4002),
      hard: generatePattern(110, 48, 0.65, 4003),
    },
  },
  {
    id: "thunder-storm",
    name: "雷霆万钧",
    artist: "星聚原创",
    bpm: 180,
    duration: 38,
    color: "#fdcb6e",
    icon: "bolt",
    melody: generateMelody(["C", "D", "E", "F", "G", "A", "B", "C", "B", "A", "G", "F", "E", "D", "C", "-"], 5, 180, 38),
    patterns: {
      easy: generatePattern(180, 38, 0.3, 5001),
      normal: generatePattern(180, 38, 0.55, 5002),
      hard: generatePattern(180, 38, 0.8, 5003),
    },
  },
];

const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: "简单", normal: "普通", hard: "困难" };
const DIFFICULTY_COLORS: Record<Difficulty, string> = { easy: "#2ed573", normal: "#ffa502", hard: "#ff4757" };

function calcGrade(score: number, totalNotes: number): Grade {
  if (totalNotes === 0) return "D";
  const maxScore = totalNotes * PERFECT_SCORE;
  const ratio = score / maxScore;
  if (ratio >= 0.95) return "S";
  if (ratio >= 0.85) return "A";
  if (ratio >= 0.70) return "B";
  if (ratio >= 0.50) return "C";
  return "D";
}

const GRADE_COLORS: Record<Grade, string> = {
  S: "#ffd700", A: "#3ea6ff", B: "#2ed573", C: "#ffa502", D: "#ff4757",
};


// ─── Main Component ──────────────────────────────────────

export default function RhythmGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [selectedSong, setSelectedSong] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [muted, setMuted] = useState(false);

  const soundRef = useRef<SoundEngine | null>(null);
  const gameRef = useRef<GameState>({
    notes: [], score: 0, combo: 0, maxCombo: 0,
    perfect: 0, good: 0, ok: 0, miss: 0, totalNotes: 0,
    hitFlash: [0, 0, 0, 0], judgmentPopup: null,
    songTime: -2, songStarted: false, songEnded: false,
    noteSpeed: 400, nextNoteIndex: 0, melodyIndex: 0,
  });
  const lastRef = useRef(0);
  const scoreSubmittedRef = useRef(false);
  const sizeRef = useRef({ w: 400, h: 600 });

  // Initialize sound engine
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    return () => { soundRef.current?.dispose(); };
  }, []);

  // Submit score
  const submitScore = useCallback(async (finalScore: number) => {
    if (scoreSubmittedRef.current || finalScore === 0) return;
    scoreSubmittedRef.current = true;
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: finalScore }),
      });
    } catch { /* silent */ }
  }, []);

  const toggleMute = useCallback(() => {
    const m = soundRef.current?.toggleMute() ?? false;
    setMuted(m);
  }, []);

  // Play hit sound based on judgment
  const playHitSound = useCallback((judgment: Judgment) => {
    const snd = soundRef.current;
    if (!snd) return;
    if (judgment === "perfect") {
      snd.playTone(880, 0.08, "sine");
      snd.playTone(1320, 0.06, "sine");
    } else if (judgment === "good") {
      snd.playTone(660, 0.08, "triangle");
    } else if (judgment === "ok") {
      snd.playTone(440, 0.06, "triangle");
    } else {
      snd.playError();
    }
  }, []);

  // Start game
  const startGame = useCallback(() => {
    const song = SONGS[selectedSong];
    const pattern = song.patterns[difficulty];
    const speeds: Record<Difficulty, number> = { easy: 300, normal: 420, hard: 560 };

    gameRef.current = {
      notes: [],
      score: 0, combo: 0, maxCombo: 0,
      perfect: 0, good: 0, ok: 0, miss: 0,
      totalNotes: pattern.length,
      hitFlash: [0, 0, 0, 0],
      judgmentPopup: null,
      songTime: -2, // 2 second lead-in
      songStarted: false,
      songEnded: false,
      noteSpeed: speeds[difficulty],
      nextNoteIndex: 0,
      melodyIndex: 0,
    };
    scoreSubmittedRef.current = false;
    lastRef.current = 0;
    setScore(0);
    setCombo(0);
    setPhase("playing");
  }, [selectedSong, difficulty]);

  // Hit a lane
  const hitLane = useCallback((lane: number) => {
    if (phase !== "playing") return;
    const g = gameRef.current;
    const { h } = sizeRef.current;
    const hitY = h * 0.85;

    // Find closest unhit note in this lane
    let closest: ActiveNote | null = null;
    let closestDist = Infinity;
    for (const n of g.notes) {
      if (n.hit || n.missed || n.lane !== lane) continue;
      const dist = Math.abs(n.y - hitY);
      if (dist < OK_WINDOW && dist < closestDist) {
        closest = n;
        closestDist = dist;
      }
    }

    if (closest) {
      closest.hit = true;
      closest.fadeTimer = 0.3;
      let judgment: Judgment;
      let pts: number;
      if (closestDist < PERFECT_WINDOW) {
        judgment = "perfect"; pts = PERFECT_SCORE; g.perfect++;
      } else if (closestDist < GOOD_WINDOW) {
        judgment = "good"; pts = GOOD_SCORE; g.good++;
      } else {
        judgment = "ok"; pts = OK_SCORE; g.ok++;
      }
      closest.judgment = judgment;
      g.combo++;
      g.maxCombo = Math.max(g.maxCombo, g.combo);
      // Combo bonus: +10% per 10 combo, max +100%
      const comboMultiplier = 1 + Math.min(Math.floor(g.combo / 10) * 0.1, 1.0);
      g.score += Math.round(pts * comboMultiplier);
      g.hitFlash[lane] = 0.25;

      const judgColors: Record<Judgment, string> = {
        perfect: "#ffd700", good: "#3ea6ff", ok: "#2ed573", miss: "#ff4757",
      };
      const judgTexts: Record<Judgment, string> = {
        perfect: "完美", good: "好", ok: "一般", miss: "失误",
      };
      g.judgmentPopup = {
        text: judgTexts[judgment],
        color: judgColors[judgment],
        y: hitY - 40,
        alpha: 1,
        scale: 1.5,
      };

      playHitSound(judgment);
      setScore(g.score);
      setCombo(g.combo);
    } else {
      // Empty hit - play a soft click
      soundRef.current?.playClick();
    }
  }, [phase, playHitSound]);

  // Save / Load
  const handleSave = useCallback(() => {
    const g = gameRef.current;
    return {
      selectedSong, difficulty,
      score: g.score, combo: g.combo, maxCombo: g.maxCombo,
      perfect: g.perfect, good: g.good, ok: g.ok, miss: g.miss,
      totalNotes: g.totalNotes,
    };
  }, [selectedSong, difficulty]);

  const handleLoad = useCallback((data: unknown) => {
    try {
      const d = data as {
        selectedSong?: number; difficulty?: Difficulty;
        score?: number; combo?: number; maxCombo?: number;
        perfect?: number; good?: number; ok?: number; miss?: number;
        totalNotes?: number;
      };
      if (!d || typeof d.score !== "number") return;
      if (typeof d.selectedSong === "number" && d.selectedSong >= 0 && d.selectedSong < SONGS.length) {
        setSelectedSong(d.selectedSong);
      }
      if (d.difficulty && ["easy", "normal", "hard"].includes(d.difficulty)) {
        setDifficulty(d.difficulty);
      }
    } catch { /* ignore */ }
  }, []);


  // ─── Game Loop (PixiJS) ────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let destroyed = false;
    let app: Application | null = null;

    const song = SONGS[selectedSong];
    const pattern = song.patterns[difficulty];

    // Resize helper
    const resize = () => {
      const pw = Math.min(wrap.clientWidth, 480);
      const ph = Math.round(pw * 1.5);
      sizeRef.current = { w: pw, h: ph };
      if (app) {
        app.renderer.resize(pw, ph);
      }
    };

    (async () => {
      const pixi = await loadPixi();
      if (destroyed) return;

      const pw = Math.min(wrap.clientWidth, 480);
      const ph = Math.round(pw * 1.5);
      sizeRef.current = { w: pw, h: ph };

      app = await createPixiApp({ canvas: canvas!, width: pw, height: ph, backgroundColor: 0x0a0a12, antialias: true });
      if (destroyed) { app.destroy(true); return; }

      const gfx = new pixi.Graphics();
      app.stage.addChild(gfx);

      // Pre-create text pool
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
        anchorX?: number; anchorY?: number; alpha?: number;
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
        t.anchor.set(opts.anchorX ?? 0, opts.anchorY ?? 0);
        t.x = x;
        t.y = y;
      }

      window.addEventListener("resize", resize);

      app.ticker.add(() => {
        if (destroyed) return;
        const now = performance.now();
        if (!lastRef.current) lastRef.current = now;
        const dt = Math.min((now - lastRef.current) / 1000, 0.05);
        lastRef.current = now;
        const gs = gameRef.current;
        const { w, h } = sizeRef.current;
        const laneW = w / LANES;
        const hitY = h * 0.85;
        const noteH = Math.max(14, h * 0.028);

        // ─── UPDATE ──────────────────────────────────────
        gs.songTime += dt;

        // Spawn notes based on song time
        while (gs.nextNoteIndex < pattern.length) {
          const nd = pattern[gs.nextNoteIndex];
          const travelTime = (hitY + noteH) / gs.noteSpeed;
          const spawnTime = nd.time - travelTime;
          if (gs.songTime >= spawnTime) {
            gs.notes.push({
              lane: nd.lane, y: -noteH, time: nd.time,
              hit: false, missed: false, fadeTimer: 0,
            });
            gs.nextNoteIndex++;
          } else {
            break;
          }
        }

        // Play melody notes
        while (gs.melodyIndex < song.melody.length && gs.songTime >= song.melody[gs.melodyIndex].time) {
          const m = song.melody[gs.melodyIndex];
          soundRef.current?.playNote(m.note, m.octave, m.duration);
          gs.melodyIndex++;
        }

        // Update notes
        for (const n of gs.notes) {
          if (!n.hit && !n.missed) {
            n.y += gs.noteSpeed * dt;
            if (n.y > hitY + OK_WINDOW + 10) {
              n.missed = true;
              n.fadeTimer = 0.3;
              gs.miss++;
              gs.combo = 0;
              setCombo(0);
              gs.judgmentPopup = {
                text: "失误", color: "#ff4757",
                y: hitY - 40, alpha: 1, scale: 1.2,
              };
              playHitSound("miss");
            }
          }
          if (n.hit || n.missed) {
            n.fadeTimer -= dt;
          }
        }
        gs.notes = gs.notes.filter(n => !(n.hit && n.fadeTimer <= 0) && !(n.missed && n.fadeTimer <= 0));

        // Update hit flash
        for (let i = 0; i < LANES; i++) {
          if (gs.hitFlash[i] > 0) gs.hitFlash[i] -= dt;
        }

        // Update judgment popup
        if (gs.judgmentPopup) {
          gs.judgmentPopup.alpha -= dt * 3;
          gs.judgmentPopup.y -= dt * 60;
          gs.judgmentPopup.scale = Math.max(1, gs.judgmentPopup.scale - dt * 3);
          if (gs.judgmentPopup.alpha <= 0) gs.judgmentPopup = null;
        }

        // Check song end
        if (gs.songTime >= song.duration + 1 && !gs.songEnded) {
          gs.songEnded = true;
          submitScore(gs.score);
          soundRef.current?.playLevelUp();
          setPhase("result");
        }

        // ─── RENDER (PixiJS) ─────────────────────────────
        gfx.clear();
        textIdx = 0;
        for (const t of texts) t.visible = false;

        // Background
        gfx.rect(0, 0, w, h).fill({ color: 0x0a0a12 });

        // Lane backgrounds & separators
        for (let i = 0; i < LANES; i++) {
          const lx = i * laneW;
          gfx.rect(lx, 0, laneW, h).fill({ color: 0xffffff, alpha: 0.02 });
          gfx.moveTo(lx, 0).lineTo(lx, h).stroke({ color: 0xffffff, alpha: 0.06, width: 1 });
        }

        // Hit line glow
        gfx.rect(0, hitY - 2, w, 4).fill({ color: 0xffffff, alpha: 0.08 });

        // Hit zone indicators
        for (let i = 0; i < LANES; i++) {
          const lx = i * laneW;
          const cx = lx + laneW / 2;
          const flash = gs.hitFlash[i] > 0;

          if (flash) {
            // Glow effect — approximate radial glow with concentric circles
            gfx.circle(cx, hitY, laneW * 0.6).fill({ color: LANE_COLOR_NUMS[i], alpha: 0.15 });
            gfx.circle(cx, hitY, laneW * 0.35).fill({ color: LANE_COLOR_NUMS[i], alpha: 0.1 });
          }

          // Hit zone button
          const btnH = Math.max(24, h * 0.04);
          const btnW = laneW - 12;
          const btnX = lx + 6;
          const btnY = hitY - btnH / 2;
          gfx.roundRect(btnX, btnY, btnW, btnH, 6)
            .fill({ color: flash ? LANE_COLOR_NUMS[i] : 0xffffff, alpha: flash ? 1 : 0.08 });

          // Key label
          nextText(LANE_KEYS[i].toUpperCase(), cx, hitY, {
            fontSize: Math.max(11, h * 0.02),
            fill: flash ? 0xffffff : 0x555555,
            fontWeight: "bold",
            anchorX: 0.5, anchorY: 0.5,
          });
        }

        // Notes
        for (const n of gs.notes) {
          if (n.hit) {
            // Hit animation: expanding glow
            const alpha = Math.max(0, n.fadeTimer / 0.3);
            const expand = 1 + (1 - alpha) * 0.5;
            const ncx = n.lane * laneW + laneW / 2;
            const nw = (laneW - 14) * expand;
            const nh = noteH * expand;
            gfx.roundRect(ncx - nw / 2, n.y - nh / 2, nw, nh, 4)
              .fill({ color: LANE_COLOR_NUMS[n.lane], alpha: alpha * 0.6 });
            continue;
          }
          if (n.missed) {
            const alpha = Math.max(0, n.fadeTimer / 0.3) * 0.4;
            const lx = n.lane * laneW;
            gfx.roundRect(lx + 7, n.y - noteH / 2, laneW - 14, noteH, 4)
              .fill({ color: 0x666666, alpha });
            continue;
          }
          // Normal note
          const lx = n.lane * laneW;
          gfx.roundRect(lx + 7, n.y - noteH / 2, laneW - 14, noteH, 4)
            .fill({ color: LANE_COLOR_NUMS[n.lane] });
        }

        // Judgment popup
        if (gs.judgmentPopup) {
          const jp = gs.judgmentPopup;
          nextText(jp.text, w / 2, jp.y, {
            fontSize: Math.round(22 * jp.scale),
            fill: jp.color,
            fontWeight: "bold",
            anchorX: 0.5, anchorY: 0.5,
            alpha: Math.max(0, jp.alpha),
          });
        }

        // HUD - Top bar
        const hudH = Math.max(50, h * 0.08);
        gfx.rect(0, 0, w, hudH).fill({ color: 0x000000, alpha: 0.6 });

        // Song name
        nextText(song.name, 10, hudH * 0.35, {
          fontSize: Math.max(13, h * 0.022),
          fill: song.color,
          fontWeight: "bold",
          anchorX: 0, anchorY: 0.5,
        });

        // Difficulty
        nextText(DIFFICULTY_LABELS[difficulty], 10, hudH * 0.7, {
          fontSize: Math.max(10, h * 0.016),
          fill: DIFFICULTY_COLORS[difficulty],
          anchorX: 0, anchorY: 0.5,
        });

        // Score
        nextText(gs.score.toLocaleString(), w - 10, hudH * 0.35, {
          fontSize: Math.max(16, h * 0.026),
          fill: 0xffffff,
          fontWeight: "bold",
          anchorX: 1, anchorY: 0.5,
        });

        // Combo
        if (gs.combo > 0) {
          nextText(`${gs.combo}x 连击`, w - 10, hudH * 0.7, {
            fontSize: Math.max(12, h * 0.018),
            fill: gs.combo >= 50 ? 0xffd700 : gs.combo >= 20 ? 0xffa502 : 0xaaaaaa,
            fontWeight: "bold",
            anchorX: 1, anchorY: 0.5,
          });
        }

        // Progress bar
        const progress = Math.max(0, Math.min(1, gs.songTime / song.duration));
        const barY = hudH - 3;
        gfx.rect(0, barY, w, 3).fill({ color: 0xffffff, alpha: 0.1 });
        gfx.rect(0, barY, w * progress, 3).fill({ color: hexToNum(song.color) });

        // Touch zones at bottom
        const touchH = Math.max(50, h * 0.08);
        const touchY = h - touchH;
        const touchRgba: number[] = [0xff4757, 0x3ea6ff, 0x2ed573, 0xffa502];
        for (let i = 0; i < LANES; i++) {
          const lx = i * laneW;
          gfx.roundRect(lx + 3, touchY + 3, laneW - 6, touchH - 6, 8)
            .fill({ color: touchRgba[i], alpha: 0.12 });
          // Touch label
          nextText(LANE_KEYS[i].toUpperCase(), lx + laneW / 2, touchY + touchH / 2, {
            fontSize: Math.max(14, h * 0.022),
            fill: 0xffffff,
            fontWeight: "bold",
            anchorX: 0.5, anchorY: 0.5,
            alpha: 0.2,
          });
        }
      }); // end app.ticker.add
    })(); // end async IIFE

    // Input handlers
    const onKeyDown = (e: KeyboardEvent) => {
      const idx = LANE_KEYS.indexOf(e.key.toLowerCase());
      if (idx >= 0) { e.preventDefault(); hitLane(idx); }
    };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const { w } = sizeRef.current;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const mx = (t.clientX - rect.left) * (w / rect.width);
        const lane = Math.floor(mx / (w / LANES));
        if (lane >= 0 && lane < LANES) hitLane(lane);
      }
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const { w } = sizeRef.current;
      const mx = (e.clientX - rect.left) * (w / rect.width);
      const lane = Math.floor(mx / (w / LANES));
      if (lane >= 0 && lane < LANES) hitLane(lane);
    };

    window.addEventListener("keydown", onKeyDown);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("click", onClick);

    return () => {
      destroyed = true;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("click", onClick);
      if (app) { app.destroy(true); app = null; }
    };
  }, [phase, selectedSong, difficulty, hitLane, submitScore, playHitSound]);


  // ─── Render ────────────────────────────────────────────
  const song = SONGS[selectedSong];
  const g = gameRef.current;

  // Title screen
  if (phase === "title") {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-6 pb-20 md:pb-8">
          <Link href="/games" className="inline-flex items-center gap-1 text-sm text-[#8a8a8a] hover:text-[#3ea6ff] mb-4 transition">
            <ChevronLeft size={16} /> 返回游戏中心
          </Link>

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3ea6ff] to-[#6c5ce7] flex items-center justify-center">
                <Music size={20} />
              </div>
              <div>
                <h1 className="text-2xl font-bold">节奏大师</h1>
                <p className="text-xs text-[#8a8a8a]">DFJK 四键下落式节奏游戏</p>
              </div>
            </div>
            <button onClick={toggleMute} className="p-2 rounded-lg hover:bg-[#1a1a1a] transition" title={muted ? "取消静音" : "静音"}>
              {muted ? <VolumeX size={18} className="text-[#666]" /> : <Volume2 size={18} className="text-[#3ea6ff]" />}
            </button>
          </div>

          {/* Song Selection */}
          <div className="mb-6">
            <h2 className="text-sm font-bold text-[#8a8a8a] mb-3 flex items-center gap-2">
              <Music size={14} /> 选择歌曲
            </h2>
            <div className="space-y-2">
              {SONGS.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSong(i)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition ${
                    selectedSong === i
                      ? "border-[#3ea6ff] bg-[#3ea6ff]/10"
                      : "border-[#222] bg-[#1a1a1a] hover:border-[#333]"
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: s.color + "22" }}
                  >
                    {s.icon === "star" && <Star size={18} style={{ color: s.color }} />}
                    {s.icon === "zap" && <Zap size={18} style={{ color: s.color }} />}
                    {s.icon === "fire" && <Target size={18} style={{ color: s.color }} />}
                    {s.icon === "flower" && <Award size={18} style={{ color: s.color }} />}
                    {s.icon === "bolt" && <Zap size={18} style={{ color: s.color }} />}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-bold text-sm" style={{ color: selectedSong === i ? s.color : "#ccc" }}>
                      {s.name}
                    </div>
                    <div className="text-[10px] text-[#666]">
                      BPM {s.bpm} · {s.duration}秒 · {s.artist}
                    </div>
                  </div>
                  <div className="text-xs text-[#666]">
                    {s.patterns[difficulty].length} 音符
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty Selection */}
          <div className="mb-6">
            <h2 className="text-sm font-bold text-[#8a8a8a] mb-3 flex items-center gap-2">
              <Zap size={14} /> 难度选择
            </h2>
            <div className="flex gap-2">
              {(["easy", "normal", "hard"] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-bold transition ${
                    difficulty === d
                      ? "border-transparent"
                      : "border-[#222] bg-[#1a1a1a] text-[#666] hover:border-[#333]"
                  }`}
                  style={difficulty === d ? {
                    backgroundColor: DIFFICULTY_COLORS[d] + "22",
                    color: DIFFICULTY_COLORS[d],
                    borderColor: DIFFICULTY_COLORS[d],
                  } : undefined}
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          {/* Controls Info */}
          <div className="mb-6 p-4 rounded-xl bg-[#1a1a1a] border border-[#222]">
            <h3 className="text-xs font-bold text-[#8a8a8a] mb-2">操作说明</h3>
            <div className="grid grid-cols-2 gap-2 text-xs text-[#999]">
              <div>键盘: <span className="text-white font-mono">D F J K</span></div>
              <div>触摸: 点击对应轨道</div>
              <div>判定: 完美 / 好 / 一般 / 失误</div>
              <div>连击加成: 每10连击+10%</div>
            </div>
          </div>

          {/* Start Button */}
          <button
            onClick={startGame}
            className="w-full py-3.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-lg hover:bg-[#3ea6ff]/90 transition flex items-center justify-center gap-2"
          >
            <Play size={20} /> 开始演奏
          </button>

          {/* Save/Load + Leaderboard */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            <GameLeaderboard gameId={GAME_ID} />
          </div>
        </main>
      </div>
    );
  }

  // Result screen
  if (phase === "result") {
    const grade = calcGrade(g.score, g.totalNotes);
    const maxPossible = g.totalNotes * PERFECT_SCORE;
    const accuracy = g.totalNotes > 0
      ? ((g.perfect * 100 + g.good * 80 + g.ok * 50) / g.totalNotes).toFixed(1)
      : "0.0";

    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Header />
        <main className="max-w-lg mx-auto px-4 py-6 pb-20 md:pb-8">
          <Link href="/games" className="inline-flex items-center gap-1 text-sm text-[#8a8a8a] hover:text-[#3ea6ff] mb-4 transition">
            <ChevronLeft size={16} /> 返回游戏中心
          </Link>

          {/* Result Card */}
          <div className="rounded-2xl border border-[#222] bg-[#1a1a1a] p-6 text-center mb-6">
            <div className="text-sm text-[#8a8a8a] mb-1">演奏结束</div>
            <div className="font-bold text-lg mb-1" style={{ color: song.color }}>{song.name}</div>
            <div className="text-xs text-[#666] mb-4">{DIFFICULTY_LABELS[difficulty]}</div>

            {/* Grade */}
            <div
              className="text-7xl font-black mb-2"
              style={{ color: GRADE_COLORS[grade], textShadow: `0 0 30px ${GRADE_COLORS[grade]}44` }}
            >
              {grade}
            </div>

            {/* Score */}
            <div className="text-3xl font-bold text-white mb-1">{g.score.toLocaleString()}</div>
            <div className="text-xs text-[#666] mb-6">满分 {maxPossible.toLocaleString()}</div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3 rounded-xl bg-[#0f0f0f]">
                <div className="text-[10px] text-[#8a8a8a]">最大连击</div>
                <div className="text-xl font-bold text-[#ffa502]">{g.maxCombo}</div>
              </div>
              <div className="p-3 rounded-xl bg-[#0f0f0f]">
                <div className="text-[10px] text-[#8a8a8a]">准确率</div>
                <div className="text-xl font-bold text-[#3ea6ff]">{accuracy}%</div>
              </div>
            </div>

            {/* Judgment Breakdown */}
            <div className="grid grid-cols-4 gap-2 mb-6">
              <div className="p-2 rounded-lg bg-[#0f0f0f]">
                <div className="text-[10px] text-[#ffd700]">完美</div>
                <div className="text-lg font-bold text-[#ffd700]">{g.perfect}</div>
              </div>
              <div className="p-2 rounded-lg bg-[#0f0f0f]">
                <div className="text-[10px] text-[#3ea6ff]">好</div>
                <div className="text-lg font-bold text-[#3ea6ff]">{g.good}</div>
              </div>
              <div className="p-2 rounded-lg bg-[#0f0f0f]">
                <div className="text-[10px] text-[#2ed573]">一般</div>
                <div className="text-lg font-bold text-[#2ed573]">{g.ok}</div>
              </div>
              <div className="p-2 rounded-lg bg-[#0f0f0f]">
                <div className="text-[10px] text-[#ff4757]">失误</div>
                <div className="text-lg font-bold text-[#ff4757]">{g.miss}</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={startGame}
                className="flex-1 py-2.5 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#3ea6ff]/90 transition flex items-center justify-center gap-2"
              >
                <RotateCcw size={14} /> 再来一次
              </button>
              <button
                onClick={() => setPhase("title")}
                className="flex-1 py-2.5 rounded-xl border border-[#333] text-[#ccc] font-bold text-sm hover:bg-[#1a1a1a] transition flex items-center justify-center gap-2"
              >
                <Music size={14} /> 选曲
              </button>
            </div>
          </div>

          {/* Save/Load + Leaderboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
            <GameLeaderboard gameId={GAME_ID} />
          </div>
        </main>
      </div>
    );
  }

  // Playing screen
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setPhase("title")}
            className="text-sm text-[#8a8a8a] hover:text-white transition flex items-center gap-1"
          >
            <ChevronLeft size={14} /> 退出
          </button>
          <button onClick={toggleMute} className="p-1.5 rounded-lg hover:bg-[#1a1a1a] transition">
            {muted ? <VolumeX size={16} className="text-[#666]" /> : <Volume2 size={16} className="text-[#3ea6ff]" />}
          </button>
        </div>
        <div ref={wrapRef} className="w-full">
          <canvas
            ref={canvasRef}
            className="w-full rounded-xl border border-white/10 touch-none"
          />
        </div>
      </main>
    </div>
  );
}
