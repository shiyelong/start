"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import clsx from "clsx";

const GRID = 20;
type Pos = { x: number; y: number };

const DIFFS = [
  { label: "简单", speed: 220, color: "text-[#2ba640]" },
  { label: "普通", speed: 150, color: "text-[#f0b90b]" },
  { label: "困难", speed: 100, color: "text-[#ff4444]" },
  { label: "地狱", speed: 60, color: "text-[#a855f7]" },
];

export default function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [diffIdx, setDiffIdx] = useState(0);
  const [best, setBest] = useState<number[]>([0, 0, 0, 0]);
  const gameRef = useRef({ snake: [{x:10,y:10}] as Pos[], dir:{x:1,y:0}, food:{x:15,y:10} as Pos, running:false, speed: DIFFS[0].speed });

  const randomFood = (snake: Pos[]): Pos => {
    let p: Pos;
    do { p = { x: Math.floor(Math.random()*GRID), y: Math.floor(Math.random()*GRID) }; }
    while(snake.some(s=>s.x===p.x&&s.y===p.y));
    return p;
  };

  const draw = useCallback(()=>{
    const ctx = canvasRef.current?.getContext('2d');
    if(!ctx) return;
    const g = gameRef.current;
    const s = canvasRef.current!.width / GRID;
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0,0,GRID*s,GRID*s);
    ctx.strokeStyle = '#222'; ctx.lineWidth = 0.5;
    for(let i=0;i<=GRID;i++){ ctx.beginPath(); ctx.moveTo(i*s,0); ctx.lineTo(i*s,GRID*s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,i*s); ctx.lineTo(GRID*s,i*s); ctx.stroke(); }
    // Food with glow
    ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#ff4444'; ctx.beginPath(); ctx.arc(g.food.x*s+s/2, g.food.y*s+s/2, s/2.5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    // Snake
    g.snake.forEach((p,i)=>{
      const ratio = 1 - i / g.snake.length * 0.4;
      ctx.fillStyle = i===0 ? '#3ea6ff' : `rgba(43,166,64,${ratio})`;
      const pad = i === 0 ? 0.5 : 1;
      ctx.fillRect(p.x*s+pad, p.y*s+pad, s-pad*2, s-pad*2);
      if (i === 0) {
        // Eyes
        ctx.fillStyle = '#fff';
        const ex = g.dir.x === 0 ? 3 : (g.dir.x > 0 ? s * 0.6 : s * 0.2);
        const ey = g.dir.y === 0 ? 3 : (g.dir.y > 0 ? s * 0.6 : s * 0.2);
        ctx.fillRect(p.x*s + ex, p.y*s + ey, 3, 3);
        ctx.fillRect(p.x*s + ex + (g.dir.x === 0 ? s * 0.4 : 0), p.y*s + ey + (g.dir.y === 0 ? s * 0.4 : 0), 3, 3);
      }
    });
  },[]);

  const start = useCallback(()=>{
    const g = gameRef.current;
    g.snake = [{x:10,y:10}]; g.dir = {x:1,y:0}; g.food = randomFood(g.snake); g.running = true;
    g.speed = DIFFS[diffIdx].speed;
    setScore(0); setOver(false); setStarted(true);
  },[diffIdx]);

  useEffect(()=>{
    const canvas = canvasRef.current;
    if(!canvas) return;
    const size = Math.min(window.innerWidth - 32, 400);
    canvas.width = size; canvas.height = size;
    draw();
  },[draw]);

  useEffect(()=>{
    if(!started) return;
    const g = gameRef.current;
    const iv = setInterval(()=>{
      if(!g.running) return;
      const head = { x: g.snake[0].x+g.dir.x, y: g.snake[0].y+g.dir.y };
      if(head.x<0||head.x>=GRID||head.y<0||head.y>=GRID||g.snake.some(s=>s.x===head.x&&s.y===head.y)){
        g.running = false; setOver(true);
        setScore(s => {
          setBest(prev => { const nb = [...prev]; nb[diffIdx] = Math.max(nb[diffIdx], s); return nb; });
          return s;
        });
        return;
      }
      g.snake.unshift(head);
      if(head.x===g.food.x&&head.y===g.food.y){ setScore(s=>s+10); g.food = randomFood(g.snake); }
      else g.snake.pop();
      draw();
    }, g.speed);
    return ()=>clearInterval(iv);
  },[started, draw, diffIdx]);

  useEffect(()=>{
    const h = (e: KeyboardEvent)=>{
      const g = gameRef.current;
      const map: Record<string,Pos> = { ArrowUp:{x:0,y:-1}, ArrowDown:{x:0,y:1}, ArrowLeft:{x:-1,y:0}, ArrowRight:{x:1,y:0}, w:{x:0,y:-1}, s:{x:0,y:1}, a:{x:-1,y:0}, d:{x:1,y:0} };
      const d = map[e.key];
      if(d && !(d.x===-g.dir.x&&d.y===-g.dir.y)){ g.dir = d; e.preventDefault(); }
    };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  },[]);

  const handleDir = (dx:number,dy:number)=>{
    const g = gameRef.current;
    if(!(dx===-g.dir.x&&dy===-g.dir.y)) g.dir = {x:dx,y:dy};
  };

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-6 pb-20 md:pb-8 text-center">
        <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-white mb-4 inline-block float-left">← 返回</Link>
        <div className="clear-both" />
        <h1 className="text-2xl font-bold mb-2"><i className="fas fa-worm mr-2 text-[#2ba640]" />贪吃蛇</h1>

        {/* 难度选择 */}
        <div className="flex justify-center gap-2 mb-3">
          {DIFFS.map((d, i) => (
            <button key={i} onClick={() => { if (!started || over) setDiffIdx(i); }}
              className={clsx(
                "px-3 py-1 rounded-full text-[12px] border transition",
                diffIdx === i ? `bg-[#212121] ${d.color} border-current font-bold` : "text-[#666] border-[#333]",
                started && !over && "opacity-50 cursor-not-allowed"
              )}>{d.label}</button>
          ))}
        </div>

        <div className="flex justify-center gap-4 text-sm mb-3">
          <span className="text-[#3ea6ff] font-bold">得分：{score}</span>
          <span className="text-[#8a8a8a]">最高：{best[diffIdx]}</span>
        </div>

        <canvas ref={canvasRef} className="mx-auto rounded-xl border border-[#333] touch-none" />

        {!started && (
          <button onClick={start} className="mt-4 px-8 py-2.5 rounded-xl bg-[#2ba640] text-white font-bold text-sm hover:bg-[#2ba640]/80 transition active:scale-95">
            <i className="fas fa-play mr-1.5" />开始游戏
          </button>
        )}
        {over && (
          <div className="mt-4">
            <p className="text-[#ff4444] font-bold mb-2">游戏结束！得分：{score}</p>
            <button onClick={start} className="px-6 py-2 rounded-xl bg-[#2ba640] text-white font-bold text-sm hover:bg-[#2ba640]/80 transition active:scale-95">
              <i className="fas fa-redo mr-1" />再来一局
            </button>
          </div>
        )}

        {/* 手机方向键 */}
        <div className="mt-4 md:hidden">
          <div className="flex justify-center mb-1">
            <button onClick={()=>handleDir(0,-1)} className="w-14 h-14 rounded-xl bg-[#212121] border border-[#333] text-xl active:bg-[#3ea6ff]/20 transition">↑</button>
          </div>
          <div className="flex justify-center gap-1">
            <button onClick={()=>handleDir(-1,0)} className="w-14 h-14 rounded-xl bg-[#212121] border border-[#333] text-xl active:bg-[#3ea6ff]/20 transition">←</button>
            <button onClick={()=>handleDir(0,1)} className="w-14 h-14 rounded-xl bg-[#212121] border border-[#333] text-xl active:bg-[#3ea6ff]/20 transition">↓</button>
            <button onClick={()=>handleDir(1,0)} className="w-14 h-14 rounded-xl bg-[#212121] border border-[#333] text-xl active:bg-[#3ea6ff]/20 transition">→</button>
          </div>
        </div>
        <p className="text-[11px] text-[#666] mt-3">方向键/WASD控制 · 吃到红点得分 · 别撞墙和自己</p>
      </main>
    </>
  );
}
