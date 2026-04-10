"use client";
import { useState, useRef } from "react";
import Header from "@/components/Header";
import Link from "next/link";

type State = 'wait' | 'ready' | 'go' | 'result' | 'early';

export default function ReactionTest() {
  const [state, setState] = useState<State>('wait');
  const [time, setTime] = useState(0);
  const [best, setBest] = useState(999);
  const [times, setTimes] = useState<number[]>([]);
  const startRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout>();

  const begin = ()=>{
    setState('ready');
    timerRef.current = setTimeout(()=>{
      startRef.current = Date.now();
      setState('go');
    }, 1000 + Math.random()*4000);
  };

  const click = ()=>{
    if(state==='wait') begin();
    else if(state==='ready'){ clearTimeout(timerRef.current); setState('early'); }
    else if(state==='go'){
      const t = Date.now()-startRef.current;
      setTime(t);
      setTimes(prev=>[...prev,t]);
      if(t<best) setBest(t);
      setState('result');
    }
    else if(state==='result'||state==='early') begin();
  };

  const avg = times.length ? Math.round(times.reduce((a,b)=>a+b,0)/times.length) : 0;
  const colors = { wait:'bg-accent', ready:'bg-danger', go:'bg-success', result:'bg-accent', early:'bg-warn' };
  const texts = { wait:'点击开始', ready:'等待绿色...', go:'点击！', result:`${time}ms`, early:'太早了！' };

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-6 pb-20 md:pb-8 text-center">
        <Link href="/games" className="text-sm text-muted hover:text-white mb-4 inline-block float-left">← 返回</Link>
        <div className="clear-both" />
        <h1 className="text-2xl font-bold mb-4"><i className="fas fa-bolt mr-2" />反应测试</h1>
        <button onClick={click} className={`w-full aspect-[2/1] rounded-2xl ${colors[state]} flex items-center justify-center text-3xl font-bold text-white transition-colors active:scale-[0.98] select-none`}>
          {texts[state]}
        </button>
        <div className="flex justify-center gap-6 mt-4 text-sm">
          <div><span className="text-muted">最快</span> <span className="text-accent font-bold">{best<999?best+'ms':'--'}</span></div>
          <div><span className="text-muted">平均</span> <span className="text-warn font-bold">{avg?avg+'ms':'--'}</span></div>
          <div><span className="text-muted">次数</span> <span className="font-bold">{times.length}</span></div>
        </div>
      </main>
    </>
  );
}
