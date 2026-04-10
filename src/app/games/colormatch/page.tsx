"use client";
import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";

const COLORS = [
  { name:'红色', hex:'#ef4444' }, { name:'蓝色', hex:'#3b82f6' }, { name:'绿色', hex:'#22c55e' },
  { name:'黄色', hex:'#eab308' }, { name:'紫色', hex:'#a855f7' }, { name:'橙色', hex:'#f97316' },
  { name:'粉色', hex:'#ec4899' }, { name:'青色', hex:'#06b6d4' },
];

export default function ColorMatch() {
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [textColor, setTextColor] = useState(COLORS[0]);
  const [displayText, setDisplayText] = useState(COLORS[0]);
  const [options, setOptions] = useState<typeof COLORS[0][]>([]);
  const [flash, setFlash] = useState<string|null>(null);

  const nextRound = useCallback(()=>{
    const tc = COLORS[Math.floor(Math.random()*COLORS.length)];
    const dt = COLORS[Math.floor(Math.random()*COLORS.length)];
    setTextColor(tc); setDisplayText(dt);
    const opts = [tc];
    while(opts.length<4){
      const r = COLORS[Math.floor(Math.random()*COLORS.length)];
      if(!opts.includes(r)) opts.push(r);
    }
    setOptions(opts.sort(()=>Math.random()-0.5));
  },[]);

  useEffect(()=>{ nextRound(); },[nextRound]);

  const answer = (c: typeof COLORS[0])=>{
    if(c.hex===textColor.hex){
      setScore(s=>s+1); setFlash('success');
    } else {
      setLives(l=>l-1); setFlash('error');
    }
    setTimeout(()=>{ setFlash(null); nextRound(); },300);
  };

  if(lives<=0) return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-6 pb-20 md:pb-8 text-center">
        <Link href="/games" className="text-sm text-muted hover:text-white mb-4 inline-block float-left">← 返回</Link>
        <div className="clear-both" />
        <h1 className="text-2xl font-bold mb-2"><i className="fas fa-palette mr-2" />颜色挑战</h1>
        <p className="text-xl font-bold mb-2">游戏结束！</p>
        <p className="text-accent text-3xl font-bold mb-4">{score} 分</p>
        <button onClick={()=>{setScore(0);setLives(3);nextRound();}} className="px-6 py-2 rounded-lg bg-accent text-bg font-semibold text-sm hover:bg-accent-hover transition">再来一局</button>
      </main>
    </>
  );

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-6 pb-20 md:pb-8 text-center">
        <Link href="/games" className="text-sm text-muted hover:text-white mb-4 inline-block float-left">← 返回</Link>
        <div className="clear-both" />
        <h1 className="text-2xl font-bold mb-2"><i className="fas fa-palette mr-2" />颜色挑战</h1>
        <p className="text-xs text-muted mb-4">文字显示的颜色名和实际颜色不同，选出文字的<span className="text-accent font-bold">实际颜色</span>！</p>
        <div className="flex justify-center gap-4 mb-6">
          <span className="text-accent font-bold">得分：{score}</span>
          <span className="text-danger font-bold"><i className="fas fa-heart" /> x {lives}</span>
        </div>
        <div className={`p-8 rounded-2xl mb-6 transition-colors ${flash==='success'?'bg-success/20':flash==='error'?'bg-danger/20':'bg-bg-card'} border border-border`}>
          <span className="text-5xl font-black" style={{color:textColor.hex}}>{displayText.name}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {options.map(c=>(
            <button key={c.hex} onClick={()=>answer(c)} className="p-4 rounded-xl border border-border hover:border-accent/50 active:scale-95 transition flex items-center justify-center gap-2">
              <div className="w-6 h-6 rounded-full" style={{background:c.hex}} />
              <span className="text-sm font-medium">{c.name}</span>
            </button>
          ))}
        </div>
      </main>
    </>
  );
}
