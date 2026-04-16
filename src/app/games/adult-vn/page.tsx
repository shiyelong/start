"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import { ChevronLeft, RotateCcw, BookOpen, Lock } from "lucide-react";
import { ageGate } from "@/lib/age-gate";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics, Text as PixiText } from "pixi.js";

const W = 400, H = 500;
type Phase = "title" | "playing" | "choice" | "ending";
interface Scene { id: number; text: string; speaker: string; bg: string; choices?: { text: string; next: number }[]; ending?: string; }

const SCENES: Scene[] = [
  { id: 0, text: "你在一个暴风雨之夜来到了一座神秘的宅邸...", speaker: "旁白", bg: "#1a0a2e" },
  { id: 1, text: "一位美丽的女人打开了门。'欢迎，我一直在等你。'", speaker: "???", bg: "#2a1a3e", choices: [{ text: "进入宅邸", next: 2 }, { text: "询问她是谁", next: 3 }] },
  { id: 2, text: "室内装饰奢华。烛光在昏暗中摇曳。", speaker: "旁白", bg: "#1a1a0a", choices: [{ text: "探索书房", next: 4 }, { text: "跟她上楼", next: 5 }] },
  { id: 3, text: "'我是绯红夫人。这座宅邸藏着许多...秘密。'", speaker: "绯红夫人", bg: "#2a0a1a", choices: [{ text: "进入宅邸", next: 2 }, { text: "离开", next: 7 }] },
  { id: 4, text: "书房里有古老的典籍。其中一本微微发光...", speaker: "旁白", bg: "#0a1a2a", choices: [{ text: "阅读发光的书", next: 6 }, { text: "返回", next: 2 }] },
  { id: 5, text: "她带你来到一间私密的房间。'请随意...'", speaker: "绯红夫人", bg: "#2a0a2a", ending: "浪漫结局 - 你在宅邸度过了一夜。" },
  { id: 6, text: "书中揭示了宅邸的黑暗历史和一笔隐藏的宝藏！", speaker: "旁白", bg: "#1a2a0a", ending: "悬疑结局 - 你发现了宅邸的秘密宝藏。" },
  { id: 7, text: "你走进暴风雨中。有些谜团最好不要去解开。", speaker: "旁白", bg: "#0a0a1a", ending: "逃离结局 - 你选择了安全而非冒险。" },
];

const PRIMARY = "#a55eea";

function hexToNum(hex: string): number {
  if (hex.startsWith("#")) return parseInt(hex.slice(1, 7), 16);
  return 0xffffff;
}

export default function AdultVN() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("title");
  const [sceneIdx, setSceneIdx] = useState(0);
  const [textProgress, setTextProgress] = useState(0);
  const [endings, setEndings] = useState<string[]>([]);
  const [blocked, setBlocked] = useState(false);

  const pixiAppRef = useRef<Application | null>(null);
  const pixiGfxRef = useRef<PixiGraphics | null>(null);
  const pixiTextsRef = useRef<Map<string, PixiText>>(new Map());
  const pixiInitRef = useRef(false);
  const frameRef = useRef(0);

  const stateRef = useRef({ phase, sceneIdx, textProgress, endings });
  useEffect(() => { stateRef.current = { phase, sceneIdx, textProgress, endings }; });

  useEffect(() => { if (!ageGate.canAccess("NC-17")) setBlocked(true); }, []);

  const startGame = useCallback(() => { setSceneIdx(0); setTextProgress(0); setPhase("playing"); }, []);

  const advance = useCallback(() => {
    const s = stateRef.current;
    const scene = SCENES[s.sceneIdx];
    if (!scene) return;
    const fullLen = scene.text.length;
    if (s.textProgress < fullLen) { setTextProgress(fullLen); return; }
    if (scene.ending) {
      if (!s.endings.includes(scene.ending)) setEndings(e => [...e, scene.ending!]);
      setPhase("ending"); return;
    }
    if (scene.choices) { setPhase("choice"); return; }
    if (s.sceneIdx + 1 < SCENES.length) { setSceneIdx(s.sceneIdx + 1); setTextProgress(0); setPhase("playing"); }
  }, []);

  const choose = useCallback((next: number) => {
    setSceneIdx(next); setTextProgress(0); setPhase("playing");
  }, []);

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
      const app = await createPixiApp({ canvas: canvas!, width: W, height: H, backgroundColor: 0x0f0f0f, antialias: true });
      if (destroyed) { app.destroy(true); return; }
      pixiAppRef.current = app;

      const g = new pixi.Graphics();
      app.stage.addChild(g);
      pixiGfxRef.current = g;

      const textContainer = new pixi.Container();
      app.stage.addChild(textContainer);
      const texts = pixiTextsRef.current;
      texts.clear();

      const makeText = (key: string, opts: { fontSize?: number; fill?: string | number; fontWeight?: string }) => {
        const t = new pixi.Text({ text: "", style: new pixi.TextStyle({
          fontSize: opts.fontSize ?? 12,
          fill: opts.fill ?? "#ffffff",
          fontWeight: (opts.fontWeight ?? "normal") as "normal" | "bold",
          fontFamily: "monospace",
        })});
        t.visible = false;
        textContainer.addChild(t);
        texts.set(key, t);
      };

      // Pre-create text pool (60 objects)
      for (let i = 0; i < 60; i++) makeText(`t${i}`, { fontSize: 12 });

      let textIdx = 0;
      const showText = (text: string, x: number, y: number, opts?: { fill?: string; fontSize?: number; fontWeight?: string; ax?: number; ay?: number; alpha?: number }) => {
        if (textIdx >= 60) return;
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

      app.ticker.add(() => {
        if (destroyed) return;
        frameRef.current++;
        g.clear();
        texts.forEach(tx => { tx.visible = false; });
        textIdx = 0;

        const s = stateRef.current;
        const scene = SCENES[s.sceneIdx];

        // Text typewriter effect
        if (s.phase === "playing" && scene) {
          const newProg = Math.min(s.textProgress + 0.5, scene.text.length);
          if (newProg !== s.textProgress) {
            setTextProgress(newProg);
          }
        }

        if (s.phase === "title") {
          // ─── Title Screen ────────────────────────────────────────────
          g.rect(0, 0, W, H).fill({ color: 0x0f0f0f });

          const t = frameRef.current * 0.02;
          // Background pattern
          for (let i = 0; i < 8; i++) {
            const bx = W / 2 + Math.cos(t + i * 0.8) * 100;
            const by = H / 2 - 60 + Math.sin(t + i * 0.6) * 40;
            const alpha = 0.04 + 0.03 * Math.sin(t + i);
            g.circle(bx, by, 40 + i * 5).fill({ color: cn(PRIMARY), alpha });
          }

          showText("视觉小说", W / 2, H / 2 - 50, { fill: PRIMARY, fontSize: 28, fontWeight: "bold", ax: 0.5, ay: 0.5 });
          showText("分支剧情冒险", W / 2, H / 2 - 20, { fill: "#aaaaaa", fontSize: 14, ax: 0.5, ay: 0.5 });

          const glow = 0.5 + 0.5 * Math.sin(frameRef.current * 0.06);
          showText("点击开始", W / 2, H / 2 + 10, { fill: "#aaaaaa", fontSize: 14, ax: 0.5, ay: 0.5, alpha: glow });

          showText(`已发现结局: ${s.endings.length}/3`, W / 2, H / 2 + 40, { fill: "#666666", fontSize: 12, ax: 0.5, ay: 0.5 });

        } else if (scene) {
          // ─── Scene Rendering ─────────────────────────────────────────
          // Background
          g.rect(0, 0, W, H).fill({ color: cn(scene.bg) });

          // Character area
          g.rect(0, 0, W, H - 160).fill({ color: 0x000000, alpha: 0.3 });

          // Speaker silhouette
          g.circle(W / 2, H / 2 - 60, 80).fill({ color: 0xffffff, alpha: 0.05 });

          // Speaker name (center)
          showText(scene.speaker, W / 2, H / 2 - 50, { fill: "#ffffff", fontSize: 20, fontWeight: "bold", ax: 0.5, ay: 0.5 });

          // Text box background
          g.roundRect(10, H - 160, W - 20, 150, 8).fill({ color: 0x000000, alpha: 0.8 });
          g.roundRect(10, H - 160, W - 20, 150, 8).stroke({ color: cn(PRIMARY), width: 1 });

          // Speaker name in text box
          showText(scene.speaker, 24, H - 138, { fill: PRIMARY, fontSize: 14, fontWeight: "bold" });

          // Text with word wrap
          const displayText = scene.text.substring(0, Math.floor(s.textProgress));
          const maxLineW = W - 50;
          let line = "";
          let ly = H - 114;
          // Simple character-based wrapping for CJK text
          for (let ci = 0; ci < displayText.length; ci++) {
            const ch = displayText[ci];
            line += ch;
            // Approximate: ~14px font, each CJK char ~14px, latin ~7px
            const approxW = line.length * 10;
            if (approxW > maxLineW || ch === "\n") {
              showText(line, 24, ly, { fill: "#dddddd", fontSize: 14 });
              ly += 20;
              line = "";
            }
          }
          if (line) {
            showText(line, 24, ly, { fill: "#dddddd", fontSize: 14 });
          }

          if (s.phase === "choice" && scene.choices) {
            // ─── Choice Buttons ──────────────────────────────────────
            for (let i = 0; i < scene.choices.length; i++) {
              const cy = H - 80 + i * 36;
              g.roundRect(30, cy, W - 60, 30, 6).fill({ color: 0x2a1a3e });
              g.roundRect(30, cy, W - 60, 30, 6).stroke({ color: cn(PRIMARY), width: 1 });
              showText(scene.choices[i].text, W / 2, cy + 15, { fill: "#ffffff", fontSize: 14, ax: 0.5, ay: 0.5 });
            }
          }

          if (s.phase === "ending") {
            // ─── Ending Overlay ──────────────────────────────────────
            g.rect(0, 0, W, H - 160).fill({ color: 0x000000, alpha: 0.6 });
            showText("结局达成", W / 2, H / 2 - 80, { fill: "#ffd700", fontSize: 20, fontWeight: "bold", ax: 0.5, ay: 0.5 });
            showText(scene.ending || "", W / 2, H / 2 - 50, { fill: "#ffffff", fontSize: 14, ax: 0.5, ay: 0.5 });

            const glow = 0.5 + 0.5 * Math.sin(frameRef.current * 0.06);
            showText("点击重新开始", W / 2, H / 2 - 20, { fill: "#aaaaaa", fontSize: 12, ax: 0.5, ay: 0.5, alpha: glow });
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

  // ─── Click Handler ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPos = (e: MouseEvent | Touch) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (W / rect.width),
        y: (e.clientY - rect.top) * (H / rect.height),
      };
    };

    const handleClick = (mx: number, my: number) => {
      const s = stateRef.current;

      if (s.phase === "title" || s.phase === "ending") {
        startGame();
        return;
      }

      if (s.phase === "choice") {
        const scene = SCENES[s.sceneIdx];
        if (scene?.choices) {
          for (let i = 0; i < scene.choices.length; i++) {
            const cy = H - 80 + i * 36;
            if (my >= cy && my <= cy + 30 && mx >= 30 && mx <= W - 30) {
              choose(scene.choices[i].next);
              return;
            }
          }
        }
        return;
      }

      advance();
    };

    const onClick = (e: MouseEvent) => {
      const { x, y } = getPos(e);
      handleClick(x, y);
    };

    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      const { x, y } = getPos(e.changedTouches[0]);
      handleClick(x, y);
    };

    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchend", onTouch, { passive: false });
    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchend", onTouch);
    };
  }, [startGame, advance, choose]);

  if (blocked) return (
    <div className="min-h-screen bg-[#0f0f0f] text-white"><Header />
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <Lock size={48} className="mx-auto text-gray-600 mb-4" />
        <h1 className="text-xl font-bold mb-2">访问受限</h1>
        <p className="text-gray-400">需要 NC-17 模式才能访问此内容。</p>
        <Link href="/games" className="mt-4 inline-block text-[#3ea6ff]">返回</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="max-w-lg mx-auto px-4 py-6">
        <Link href="/zone/games" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-[#3ea6ff] mb-4"><ChevronLeft size={16} /> 返回</Link>
        <div className="flex items-center gap-2 mb-4"><BookOpen size={24} className="text-[#a55eea]" /><h1 className="text-xl font-bold">视觉小说</h1></div>
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10 cursor-pointer" />
        <button onClick={startGame} className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#a55eea] rounded-lg text-sm font-medium hover:bg-[#a55eea]/80"><RotateCcw size={14} /> 重新开始</button>
      </div>
    </div>
  );
}
