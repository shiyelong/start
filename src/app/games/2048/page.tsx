"use client";
import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";

type Board = number[][];
const SIZE = 4;

function empty(): Board { return Array.from({length:SIZE},()=>Array(SIZE).fill(0)); }
function clone(b: Board): Board { return b.map(r=>[...r]); }
function addRandom(b: Board) {
  const cells: [number,number][] = [];
  b.forEach((r,i)=>r.forEach((v,j)=>{ if(!v) cells.push([i,j]); }));
  if(!cells.length) return;
  const [r,c] = cells[Math.floor(Math.random()*cells.length)];
  b[r][c] = Math.random()<0.9 ? 2 : 4;
}
function slide(row: number[]): [number[], number] {
  let score = 0;
  const f = row.filter(v=>v);
  const n: number[] = [];
  for(let i=0;i<f.length;i++){
    if(i+1<f.length && f[i]===f[i+1]){ n.push(f[i]*2); score+=f[i]*2; i++; }
    else n.push(f[i]);
  }
  while(n.length<SIZE) n.push(0);
  return [n, score];
}
function move(b: Board, dir: string): [Board, number, boolean] {
  const nb = clone(b); let sc=0; let moved=false;
  for(let i=0;i<SIZE;i++){
    let row: number[];
    if(dir==="left") row=nb[i];
    else if(dir==="right") row=[...nb[i]].reverse();
    else if(dir==="up") row=nb.map(r=>r[i]);
    else row=nb.map(r=>r[i]).reverse();
    const [nr, s] = slide(row);
    sc+=s;
    if(dir==="right"||dir==="down") nr.reverse();
    for(let j=0;j<SIZE;j++){
      const oi = dir==="left"||dir==="right" ? i : j;
      const oj = dir==="left"||dir==="right" ? j : i;
      if(nb[oi][oj]!==nr[j]) moved=true;
      nb[oi][oj]=nr[j];
    }
  }
  return [nb, sc, moved];
}
function canMove(b: Board): boolean {
  for(const d of ["left","right","up","down"]){ const [,, m]=move(b,d); if(m) return true; }
  return false;
}

const COLORS: Record<number,string> = {
  0:'bg-[#2a2a2a]', 2:'bg-[#eee4da] text-[#776e65]', 4:'bg-[#ede0c8] text-[#776e65]',
  8:'bg-[#f2b179] text-white', 16:'bg-[#f59563] text-white', 32:'bg-[#f67c5f] text-white',
  64:'bg-[#f65e3b] text-white', 128:'bg-[#edcf72] text-white', 256:'bg-[#edcc61] text-white',
  512:'bg-[#edc850] text-white', 1024:'bg-[#edc53f] text-white', 2048:'bg-[#edc22e] text-white',
};

export default function Game2048() {
  const [board, setBoard] = useState<Board>(empty);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);

  const init = useCallback(()=>{
    const b = empty(); addRandom(b); addRandom(b);
    setBoard(b); setScore(0); setOver(false);
  },[]);

  useEffect(()=>{ init(); },[init]);

  const handleMove = useCallback((dir: string)=>{
    if(over) return;
    const [nb, sc, moved] = move(board, dir);
    if(!moved) return;
    addRandom(nb);
    const ns = score+sc;
    setBoard(nb); setScore(ns);
    if(ns>best) setBest(ns);
    if(!canMove(nb)) setOver(true);
  },[board, score, best, over]);

  useEffect(()=>{
    const h = (e: KeyboardEvent)=>{
      const map: Record<string,string> = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down' };
      if(map[e.key]){ e.preventDefault(); handleMove(map[e.key]); }
    };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  },[handleMove]);

  // Touch support
  useEffect(()=>{
    let sx=0, sy=0;
    const ts = (e: TouchEvent)=>{ sx=e.touches[0].clientX; sy=e.touches[0].clientY; };
    const te = (e: TouchEvent)=>{
      const dx=e.changedTouches[0].clientX-sx, dy=e.changedTouches[0].clientY-sy;
      if(Math.abs(dx)<30 && Math.abs(dy)<30) return;
      if(Math.abs(dx)>Math.abs(dy)) handleMove(dx>0?'right':'left');
      else handleMove(dy>0?'down':'up');
    };
    document.addEventListener('touchstart',ts,{passive:true});
    document.addEventListener('touchend',te,{passive:true});
    return ()=>{ document.removeEventListener('touchstart',ts); document.removeEventListener('touchend',te); };
  },[handleMove]);

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-6 pb-20 md:pb-8">
        <Link href="/games" className="text-sm text-muted hover:text-white mb-4 inline-block">← 返回游戏中心</Link>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold"><i className="fas fa-hashtag mr-2" />2048</h1>
          <div className="flex gap-2">
            <div className="text-center px-3 py-1 rounded-lg bg-bg-card border border-border">
              <div className="text-xs text-muted">分数</div>
              <div className="font-bold text-accent">{score}</div>
            </div>
            <div className="text-center px-3 py-1 rounded-lg bg-bg-card border border-border">
              <div className="text-xs text-muted">最高</div>
              <div className="font-bold text-warn">{best}</div>
            </div>
          </div>
        </div>
        <div className="bg-[#1a1a1a] rounded-xl p-3 border border-border">
          <div className="grid grid-cols-4 gap-2">
            {board.flat().map((v,i)=>(
              <div key={i} className={`aspect-square rounded-lg flex items-center justify-center font-bold text-lg md:text-xl transition-all ${COLORS[v]||'bg-[#3c3a32] text-white'}`}>
                {v||''}
              </div>
            ))}
          </div>
        </div>
        {over && (
          <div className="text-center mt-4">
            <p className="text-danger font-bold mb-2">游戏结束！得分：{score}</p>
            <button onClick={init} className="px-6 py-2 rounded-lg bg-accent text-bg font-semibold text-sm hover:bg-accent-hover transition">再来一局</button>
          </div>
        )}
        <p className="text-center text-xs text-muted mt-4">滑动或方向键操作</p>
      </main>
    </>
  );
}
