"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

const WORDS = [
  "hello","world","react","javascript","typescript","coding","program","function","variable","array",
  "object","string","number","boolean","class","import","export","return","const","async",
  "await","promise","server","client","browser","mobile","design","style","color","layout",
  "button","input","form","table","image","video","audio","canvas","animation","transform",
  "shadow","border","margin","padding","flex","grid","component","state","effect","hook",
  "router","fetch","data","json","api","http","socket","stream","buffer","cache",
  "debug","error","test","build","deploy","docker","cloud","linux","python","rust",
];

interface FallingWord { id: number; word: string; x: number; y: number; speed: number; }

export default function TypingPage() {
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(5);
  const [started, setStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [input, setInput] = useState("");
  const [words, setWords] = useState<FallingWord[]>([]);
  const [wpm, setWpm] = useState(0);
  const [typed, setTyped] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef(0);
  const startTimeRef = useRef(0);
  const nextIdRef = useRef(0);

  const start = useCallback(() => {
    setScore(0); setLives(5); setGameOver(false); setInput(""); setWords([]); setWpm(0); setTyped(0);
    frameRef.current = 0; startTimeRef.current = Date.now(); nextIdRef.current = 0;
    setStarted(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    if (!started || gameOver) return;
    const interval = setInterval(() => {
      frameRef.current++;
      // Spawn
      if (frameRef.current % 60 === 0) {
        const word = WORDS[Math.floor(Math.random() * WORDS.length)];
        setWords(prev => [...prev, { id: nextIdRef.current++, word, x: 10 + Math.random() * 70, y: 0, speed: 0.3 + Math.random() * 0.3 + score * 0.005 }]);
      }
      // Move
      setWords(prev => {
        const updated = prev.map(w => ({ ...w, y: w.y + w.speed }));
        const alive = updated.filter(w => {
          if (w.y > 100) { setLives(l => { const nl = l - 1; if (nl <= 0) setGameOver(true); return nl; }); return false; }
          return true;
        });
        return alive;
      });
      // WPM
      const elapsed = (Date.now() - startTimeRef.current) / 60000;
      if (elapsed > 0) setWpm(Math.round(typed / Math.max(elapsed, 0.1)));
    }, 50);
    return () => clearInterval(interval);
  }, [started, gameOver, score, typed]);

  const handleInput = (val: string) => {
    setInput(val);
    const match = words.find(w => w.word === val.trim().toLowerCase());
    if (match) {
      setWords(prev => prev.filter(w => w.id !== match.id));
      setScore(prev => prev + match.word.length * 10);
      setTyped(prev => prev + 1);
      setInput("");
    }
  };

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8 text-center">
        <h1 className="text-xl font-bold mb-2"><i className="fas fa-keyboard mr-2 text-[#a855f7]" />打字英雄</h1>
        <div className="flex justify-center gap-4 text-sm mb-3">
          <span className="text-[#f0b90b]"><i className="fas fa-star mr-1" />{score}</span>
          <span className="text-[#ff4444]">{"❤️".repeat(Math.max(0, lives))}</span>
          <span className="text-[#3ea6ff]">{wpm} WPM</span>
        </div>

        {/* 游戏区 */}
        <div className="relative h-80 rounded-xl bg-[#0a0a1a] border border-[#333] mb-3 overflow-hidden">
          {words.map(w => (
            <div key={w.id} className={clsx(
              "absolute text-sm font-mono font-bold px-2 py-0.5 rounded transition-all",
              input && w.word.startsWith(input.toLowerCase()) ? "text-[#2ba640] bg-[#2ba640]/10" : "text-[#ccc]"
            )} style={{ left: `${w.x}%`, top: `${w.y}%` }}>
              {w.word}
            </div>
          ))}
          {/* Danger zone */}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#ff4444]/20 to-transparent" />
          {!started && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <button onClick={start} className="px-8 py-3 rounded-xl bg-[#a855f7] text-white font-bold text-lg hover:bg-[#a855f7]/80 transition active:scale-95">
                <i className="fas fa-play mr-2" />开始打字
              </button>
            </div>
          )}
          {gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
              <p className="text-2xl font-bold text-[#ff4444] mb-2">游戏结束</p>
              <p className="text-[#f0b90b] mb-1">得分：{score}</p>
              <p className="text-[#3ea6ff] mb-4">速度：{wpm} WPM</p>
              <button onClick={start} className="px-6 py-2.5 rounded-xl bg-[#a855f7] text-white font-bold">再来一局</button>
            </div>
          )}
        </div>

        <input ref={inputRef} type="text" value={input} onChange={e => handleInput(e.target.value)}
          placeholder="输入单词按回车..."
          className="w-full h-12 px-4 bg-[#1a1a1a] border border-[#333] rounded-xl text-lg text-white font-mono placeholder-[#666] outline-none focus:border-[#a855f7] transition text-center"
          disabled={!started || gameOver}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
        <p className="text-[11px] text-[#666] mt-3">输入掉落的英文单词 · 打完自动消除 · 别让单词掉到底部</p>
      </main>
    </>
  );
}
