"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";

export default function WhackAMole() {
  const [score, setScore] = useState(0);
  const [mole, setMole] = useState(-1);
  const [timeLeft, setTimeLeft] = useState(30);
  const [playing, setPlaying] = useState(false);
  const [hit, setHit] = useState(-1);
  const timerRef = useRef<NodeJS.Timeout>();
  const moleRef = useRef<NodeJS.Timeout>();

  const start = ()=>{ setScore(0); setTimeLeft(30); setPlaying(true); };

  const spawnMole = useCallback(()=>{
    setMole(Math.floor(Math.random()*9));
    moleRef.current = setTimeout(()=>{ setMole(-1); if(playing) setTimeout(spawnMole, 200+Math.random()*400); }, 600+Math.random()*600);
  },[playing]);

  useEffect(()=>{
    if(!playing) return;
    spawnMole();
    timerRef.current = setInterval(()=>{
      setTimeLeft(t=>{
        if(t<=1){ setPlaying(false); setMole(-1); clearInterval(timerRef.current); return 0; }
        return t-1;
      });
    },1000);
    return ()=>{ clearInterval(timerRef.current); clearTimeout(moleRef.current); };
  },[playing, spawnMole]);

  const whack = (i: number)=>{
    if(i===mole){ setScore(s=>s+1); setHit(i); setMole(-1); setTimeout(()=>setHit(-1),200); }
  };

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-6 pb-20 md:pb-8 text-center">
        <Link href="/games" className="text-sm text-muted hover:text-white mb-4 inline-block float-left">← 返回</Link>
        <div className="clear-both" />
        <h1 className="text-2xl font-bold mb-2"><i className="fas fa-hammer mr-2" />打地鼠</h1>
        <div className="flex justify-center gap-4 mb-4">
          <span className="text-accent font-bold">得分：{score}</span>
          <span className="text-warn font-bold"><i className="fas fa-clock mr-1" />{timeLeft}s</span>
        </div>
        {!playing && timeLeft===30 && <button onClick={start} className="mb-4 px-6 py-2 rounded-lg bg-accent text-bg font-semibold text-sm hover:bg-accent-hover transition">开始游戏</button>}
        {!playing && timeLeft===0 && (
          <div className="mb-4">
            <p className="text-lg font-bold mb-2">得分：{score}</p>
            <button onClick={start} className="px-6 py-2 rounded-lg bg-accent text-bg font-semibold text-sm hover:bg-accent-hover transition">再来一局</button>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
          {Array.from({length:9}).map((_,i)=>(
            <button key={i} onClick={()=>whack(i)} className={`aspect-square rounded-2xl text-3xl flex items-center justify-center transition-all active:scale-90 ${
              hit===i ? 'bg-warn/30 border-2 border-warn scale-95' :
              mole===i ? 'bg-danger/20 border-2 border-danger animate-bounce' : 'bg-bg-card border border-border'
            }`}>
              {mole===i ? '\u25CF' : hit===i ? '\u2715' : '\u25CB'}
            </button>
          ))}
        </div>
      </main>
    </>
  );
}
