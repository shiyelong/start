"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/Header";
import Link from "next/link";

export default function PlusMinusGame() {
  const [num, setNum] = useState(0);
  const [target, setTarget] = useState(10);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [timeLeft, setTimeLeft] = useState(5.0);
  const [over, setOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [combo, setCombo] = useState(0);
  const timerRef = useRef<NodeJS.Timeout>();

  const newRound = useCallback((lvl: number) => {
    const range = Math.min(5 + lvl * 2, 30);
    const t = Math.floor(Math.random() * range) - Math.floor(range / 3);
    setTarget(t);
    setNum(0);
    setTimeLeft(Math.max(2, 6 - lvl * 0.3));
  }, []);

  const start = () => {
    setScore(0); setLevel(1); setOver(false); setStarted(true); setCombo(0);
    newRound(1);
  };

  useEffect(() => {
    if (!started || over) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 0.1) { setOver(true); setStarted(false); return 0; }
        return Math.round((t - 0.1) * 10) / 10;
      });
    }, 100);
    return () => clearInterval(timerRef.current);
  }, [started, over]);

  const check = useCallback((newNum: number) => {
    if (newNum === target) {
      const newCombo = combo + 1;
      const pts = 10 * level + (newCombo > 1 ? newCombo * 5 : 0);
      setScore(s => s + pts);
      setCombo(newCombo);
      setFlash("success");
      const newLvl = level + 1;
      setLevel(newLvl);
      setTimeout(() => { setFlash(null); newRound(newLvl); }, 300);
    }
  }, [target, combo, level, newRound]);

  const tap = (dir: "left" | "right") => {
    if (!started || over) return;
    const newNum = dir === "left" ? num - 1 : num + 1;
    setNum(newNum);
    check(newNum);
  };

  // Keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") tap("left");
      if (e.key === "ArrowRight") tap("right");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const pct = started ? (timeLeft / Math.max(2, 6 - level * 0.3)) * 100 : 100;

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-6 pb-20 md:pb-8 text-center">
        <Link href="/games" className="text-sm text-muted hover:text-white mb-4 inline-block float-left">← 返回</Link>
        <div className="clear-both" />
        <h1 className="text-2xl font-bold mb-1"><i className="fas fa-plus-minus mr-2" />加减消除</h1>
        <p className="text-xs text-muted mb-4">← 减1 | → 加1 | 让数字等于目标！</p>

        <div className="flex justify-center gap-4 mb-4 text-sm">
          <span>得分：<span className="text-accent font-bold">{score}</span></span>
          <span>关卡：<span className="text-warn font-bold">{level}</span></span>
          {combo > 1 && <span className="text-pink-400 font-bold animate-bounce"><i className="fas fa-fire text-pink-400" /> x{combo}</span>}
        </div>

        {/* Timer bar */}
        <div className="h-2 bg-bg-card rounded-full overflow-hidden mb-6 border border-border">
          <div className={`h-full rounded-full transition-all duration-100 ${pct > 30 ? "bg-accent" : pct > 15 ? "bg-warn" : "bg-danger"}`} style={{ width: `${pct}%` }} />
        </div>

        {!started && !over && (
          <button onClick={start} className="mb-6 px-8 py-3 rounded-xl bg-accent text-bg font-bold text-lg hover:bg-accent-hover transition">
            开始游戏
          </button>
        )}

        {over && (
          <div className="mb-6 animate-slide-up">
            <p className="text-xl font-bold mb-1">游戏结束！</p>
            <p className="text-accent text-3xl font-black mb-1">{score} 分</p>
            <p className="text-muted text-sm mb-3">到达第 {level} 关 | 最高连击 x{combo}</p>
            <button onClick={start} className="px-8 py-3 rounded-xl bg-accent text-bg font-bold hover:bg-accent-hover transition">再来一局</button>
          </div>
        )}

        {started && (
          <div className={`transition-colors rounded-2xl p-6 mb-6 ${flash === "success" ? "bg-success/20" : "bg-bg-card"} border border-border`}>
            <p className="text-muted text-sm mb-2">目标</p>
            <p className="text-4xl font-black text-warn mb-4">{target}</p>
            <p className="text-muted text-sm mb-2">当前</p>
            <p className={`text-6xl font-black transition-colors ${num === target ? "text-success" : "text-white"}`}>{num}</p>
          </div>
        )}

        {started && (
          <div className="flex gap-4 justify-center">
            <button onClick={() => tap("left")} className="w-28 h-20 rounded-2xl bg-danger/20 border-2 border-danger text-danger text-3xl font-black active:scale-90 active:bg-danger active:text-white transition select-none">
              −1
            </button>
            <button onClick={() => tap("right")} className="w-28 h-20 rounded-2xl bg-success/20 border-2 border-success text-success text-3xl font-black active:scale-90 active:bg-success active:text-white transition select-none">
              +1
            </button>
          </div>
        )}
      </main>
    </>
  );
}
