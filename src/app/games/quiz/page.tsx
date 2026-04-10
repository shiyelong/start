"use client";
import { useState } from "react";
import Header from "@/components/Header";
import Link from "next/link";

const questions = [
  { q:'周末你更喜欢？', opts:['宅家看剧打游戏','出门社交聚会','独自去咖啡馆','户外运动冒险'], scores:[0,2,1,3] },
  { q:'朋友形容你最多的词是？', opts:['有趣搞笑','靠谱稳重','有创意','热情开朗'], scores:[1,0,3,2] },
  { q:'选一个超能力？', opts:['读心术','时间暂停','隐身','飞行'], scores:[2,0,1,3] },
  { q:'你的理想工作环境？', opts:['安静的独立空间','热闹的开放办公','自由的远程办公','经常出差的工作'], scores:[0,2,1,3] },
  { q:'压力大的时候你会？', opts:['打游戏/看视频','找朋友倾诉','独自散步思考','运动发泄'], scores:[1,2,0,3] },
  { q:'选一种动物代表你？', opts:['猫咪','金毛犬','猫头鹰','海豚'], scores:[0,2,1,3] },
];

const results = [
  { type:'冷静分析型', desc:'你是一个理性冷静的人，善于独立思考。你喜欢安静的环境，享受独处的时光。在朋友眼中你是最靠谱的存在。', color:'from-blue-500 to-cyan-500' },
  { type:'创意艺术型', desc:'你充满创造力和想象力，总能看到别人看不到的角度。你的内心世界丰富多彩，是天生的艺术家。', color:'from-purple-500 to-pink-500' },
  { type:'社交达人型', desc:'你热情开朗，天生的社交高手。你喜欢热闹的氛围，总能成为人群中的焦点。朋友们都爱和你在一起。', color:'from-orange-500 to-red-500' },
  { type:'冒险探索型', desc:'你充满好奇心和冒险精神，喜欢尝试新事物。你不满足于现状，总是在寻找下一个挑战。', color:'from-green-500 to-teal-500' },
];

export default function QuizGame() {
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState([0,0,0,0]);
  const [result, setResult] = useState<number|null>(null);

  const answer = (optIdx: number)=>{
    const ns = [...scores];
    ns[questions[step].scores[optIdx]]++;
    setScores(ns);
    if(step+1 >= questions.length){
      setResult(ns.indexOf(Math.max(...ns)));
    } else {
      setStep(step+1);
    }
  };

  const restart = ()=>{ setStep(0); setScores([0,0,0,0]); setResult(null); };

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-6 pb-20 md:pb-8">
        <Link href="/games" className="text-sm text-muted hover:text-white mb-4 inline-block">← 返回</Link>
        <h1 className="text-2xl font-bold mb-6 text-center"><i className="fas fa-hat-wizard mr-2" />性格测试</h1>

        {result === null ? (
          <div className="animate-fade-in">
            <div className="flex justify-between text-xs text-muted mb-4">
              <span>问题 {step+1}/{questions.length}</span>
              <div className="flex-1 mx-3 h-1.5 bg-bg-card rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all" style={{width:`${(step+1)/questions.length*100}%`}} />
              </div>
            </div>
            <div className="p-6 rounded-xl bg-bg-card border border-border mb-4">
              <h2 className="text-lg font-bold mb-6 text-center">{questions[step].q}</h2>
              <div className="space-y-3">
                {questions[step].opts.map((opt, i)=>(
                  <button key={i} onClick={()=>answer(i)} className="w-full p-4 rounded-xl bg-bg border border-border text-left text-sm hover:border-accent/50 hover:bg-accent/5 active:scale-[0.98] transition">
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-slide-up text-center">
            <div className={`p-8 rounded-2xl bg-gradient-to-br ${results[result].color} mb-6`}>
              <div className="text-4xl mb-3">{results[result].type.charAt(0)}</div>
              <h2 className="text-xl font-bold text-white mb-3">{results[result].type}</h2>
              <p className="text-white/90 text-sm leading-relaxed">{results[result].desc}</p>
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={restart} className="px-6 py-2 rounded-lg bg-accent text-bg font-semibold text-sm hover:bg-accent-hover transition">重新测试</button>
              <button onClick={()=>alert('分享功能开发中')} className="px-6 py-2 rounded-lg bg-bg-card border border-border text-sm hover:bg-bg-hover transition">分享结果</button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
