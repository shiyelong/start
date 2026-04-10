"use client";
import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Link from "next/link";

const EMOJIS = ['fa-gamepad','fa-music','fa-fire','fa-star','fa-palette','fa-worm','fa-gem','fa-rocket'];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

export default function MemoryGame() {
  const [cards, setCards] = useState<string[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [won, setWon] = useState(false);

  const init = ()=>{
    setCards(shuffle([...EMOJIS,...EMOJIS]));
    setFlipped([]); setMatched([]); setMoves(0); setWon(false);
  };

  useEffect(()=>{ init(); },[]);

  const flip = (i: number)=>{
    if(flipped.length===2||flipped.includes(i)||matched.includes(i)) return;
    const nf = [...flipped, i];
    setFlipped(nf);
    if(nf.length===2){
      setMoves(m=>m+1);
      if(cards[nf[0]]===cards[nf[1]]){
        const nm = [...matched, nf[0], nf[1]];
        setMatched(nm);
        setFlipped([]);
        if(nm.length===cards.length) setWon(true);
      } else {
        setTimeout(()=>setFlipped([]), 800);
      }
    }
  };

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-6 pb-20 md:pb-8 text-center">
        <Link href="/games" className="text-sm text-muted hover:text-white mb-4 inline-block float-left">← 返回</Link>
        <div className="clear-both" />
        <h1 className="text-2xl font-bold mb-2"><i className="fas fa-clone mr-2" />记忆翻牌</h1>
        <p className="text-muted text-sm mb-4">步数：<span className="text-accent font-bold">{moves}</span></p>
        <div className="grid grid-cols-4 gap-2 max-w-xs mx-auto">
          {cards.map((emoji, i)=>{
            const show = flipped.includes(i)||matched.includes(i);
            return (
              <button key={i} onClick={()=>flip(i)} className={`aspect-square rounded-xl text-2xl flex items-center justify-center transition-all duration-300 ${
                matched.includes(i) ? 'bg-success/20 border border-success/40 scale-95' :
                show ? 'bg-accent/20 border border-accent/40' : 'bg-bg-card border border-border hover:border-accent/30 active:scale-95'
              }`}>
                {show ? <i className={`fas ${emoji}`} /> : '?'}
              </button>
            );
          })}
        </div>
        {won && (
          <div className="mt-4">
            <p className="text-success font-bold mb-2">恭喜通关！用了 {moves} 步</p>
            <button onClick={init} className="px-6 py-2 rounded-lg bg-accent text-bg font-semibold text-sm hover:bg-accent-hover transition">再来一局</button>
          </div>
        )}
      </main>
    </>
  );
}
