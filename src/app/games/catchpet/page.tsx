"use client";
import { useState } from "react";
import Header from "@/components/Header";
import Link from "next/link";

interface Pet {
  id: number; name: string; icon: string; rarity: "普通"|"稀有"|"史诗"|"传说";
  rarityColor: string; catchRate: number; desc: string;
}

const WILD_PETS: Pet[] = [
  { id:1, name:"小橘猫", icon:"fa-cat", rarity:"普通", rarityColor:"text-gray-300", catchRate:80, desc:"爱睡觉的小橘猫" },
  { id:2, name:"柴犬", icon:"fa-dog", rarity:"普通", rarityColor:"text-gray-300", catchRate:75, desc:"微笑柴犬" },
  { id:3, name:"小兔子", icon:"R", rarity:"普通", rarityColor:"text-gray-300", catchRate:70, desc:"蹦蹦跳跳" },
  { id:4, name:"小仓鼠", icon:"H", rarity:"普通", rarityColor:"text-gray-300", catchRate:72, desc:"塞满腮帮子" },
  { id:5, name:"火狐狸", icon:"F", rarity:"稀有", rarityColor:"text-blue-400", catchRate:45, desc:"聪明的小狐狸" },
  { id:6, name:"小熊猫", icon:"P", rarity:"稀有", rarityColor:"text-blue-400", catchRate:40, desc:"国宝级可爱" },
  { id:7, name:"独角兽", icon:"U", rarity:"史诗", rarityColor:"text-purple-400", catchRate:20, desc:"梦幻独角兽" },
  { id:8, name:"小龙", icon:"fa-dragon", rarity:"史诗", rarityColor:"text-purple-400", catchRate:15, desc:"喷火小龙" },
  { id:9, name:"凤凰", icon:"fa-fire", rarity:"传说", rarityColor:"text-yellow-400", catchRate:5, desc:"浴火重生" },
  { id:10, name:"九尾狐", icon:"fa-star", rarity:"传说", rarityColor:"text-yellow-400", catchRate:3, desc:"传说中的九尾" },
];

const BALLS = [
  { name:"普通球", color:"bg-gray-400", bonus:0, cost:0 },
  { name:"高级球", color:"bg-blue-500", bonus:15, cost:10 },
  { name:"大师球", color:"bg-purple-500", bonus:40, cost:30 },
];

const RARITY_BG: Record<string,string> = {
  "普通":"bg-gray-500/10 border-gray-500/30",
  "稀有":"bg-blue-500/10 border-blue-500/30",
  "史诗":"bg-purple-500/10 border-purple-500/30",
  "传说":"bg-yellow-500/10 border-yellow-500/30 animate-pulse",
};

function weightedRandom(): Pet {
  const r = Math.random() * 100;
  if (r < 2) return WILD_PETS.filter(p=>p.rarity==="传说")[Math.floor(Math.random()*2)];
  if (r < 10) return WILD_PETS.filter(p=>p.rarity==="史诗")[Math.floor(Math.random()*2)];
  if (r < 30) return WILD_PETS.filter(p=>p.rarity==="稀有")[Math.floor(Math.random()*2)];
  const common = WILD_PETS.filter(p=>p.rarity==="普通");
  return common[Math.floor(Math.random()*common.length)];
}

export default function CatchPetGame() {
  const [coins, setCoins] = useState(100);
  const [collection, setCollection] = useState<Pet[]>([]);
  const [wild, setWild] = useState<Pet|null>(null);
  const [ballIdx, setBallIdx] = useState(0);
  const [phase, setPhase] = useState<"explore"|"encounter"|"throwing"|"caught"|"escaped">("explore");
  const [shakeClass, setShakeClass] = useState("");

  const explore = () => {
    const pet = weightedRandom();
    setWild(pet);
    setPhase("encounter");
    setBallIdx(0);
  };

  const throwBall = () => {
    if (!wild) return;
    const ball = BALLS[ballIdx];
    if (coins < ball.cost) return;
    setCoins(c => c - ball.cost);
    setPhase("throwing");
    setShakeClass("animate-bounce");

    setTimeout(() => {
      setShakeClass("animate-[wiggle_0.3s_ease-in-out_3]");
      setTimeout(() => {
        const rate = Math.min(95, wild.catchRate + ball.bonus);
        const success = Math.random() * 100 < rate;
        if (success) {
          setCollection(prev => [...prev, wild]);
          setCoins(c => c + (wild.rarity === "传说" ? 50 : wild.rarity === "史诗" ? 20 : wild.rarity === "稀有" ? 10 : 3));
          setPhase("caught");
        } else {
          setPhase("escaped");
        }
        setShakeClass("");
      }, 1200);
    }, 600);
  };

  const rarityCount = (r: string) => collection.filter(p=>p.rarity===r).length;

  return (
    <>
      <Header />
      <style>{`@keyframes wiggle { 0%,100%{transform:rotate(0)} 25%{transform:rotate(-15deg)} 75%{transform:rotate(15deg)} }`}</style>
      <main className="max-w-md mx-auto px-4 py-6 pb-20 md:pb-8">
        <Link href="/games" className="text-sm text-muted hover:text-white mb-4 inline-block">← 返回</Link>
        <h1 className="text-2xl font-bold mb-1 text-center"><i className="fas fa-paw mr-2" />抓宠物</h1>
        <p className="text-xs text-muted text-center mb-4">探索野外，扔球抓宠物，收集全图鉴！</p>

        {/* Stats */}
        <div className="flex justify-center gap-3 mb-5 text-sm">
          <span className="px-3 py-1 rounded-full bg-warn/15 text-warn font-bold"><i className="fas fa-coins mr-1" />{coins}</span>
          <span className="px-3 py-1 rounded-full bg-accent/15 text-accent font-bold"><i className="fas fa-box mr-1" />{collection.length}</span>
          <span className="px-3 py-1 rounded-full bg-purple-500/15 text-purple-400 font-bold"><i className="fas fa-star mr-1" />{rarityCount("史诗")+rarityCount("传说")}</span>
        </div>

        {/* Main area */}
        {phase === "explore" && (
          <div className="text-center animate-fade-in">
            <div className="p-8 rounded-2xl bg-bg-card border border-border mb-4">
              <div className="text-6xl mb-4"><i className="fas fa-leaf text-green-400" /></div>
              <p className="text-subtle mb-2">野外探索中...</p>
              <p className="text-xs text-muted mb-6">点击下方按钮寻找野生宠物</p>
              <button onClick={explore} className="px-8 py-3 rounded-xl bg-accent text-bg font-bold text-lg hover:bg-accent-hover active:scale-95 transition">
                <i className="fas fa-search mr-1" /> 探索
              </button>
            </div>
          </div>
        )}

        {phase === "encounter" && wild && (
          <div className="text-center animate-slide-up">
            <div className={`p-6 rounded-2xl border-2 mb-4 ${RARITY_BG[wild.rarity]}`}>
              <p className="text-xs text-muted mb-2">野生宠物出现了！</p>
              <div className="text-7xl mb-3">{wild.icon.startsWith("fa-") ? <i className={`fas ${wild.icon}`} /> : <span className="inline-flex w-20 h-20 rounded-full bg-accent/20 items-center justify-center font-bold">{wild.icon}</span>}</div>
              <h2 className="text-xl font-bold mb-1">{wild.name}</h2>
              <span className={`text-sm font-bold ${wild.rarityColor}`}>【{wild.rarity}】</span>
              <p className="text-xs text-muted mt-2">{wild.desc}</p>
              <p className="text-xs text-muted mt-1">捕获率：{wild.catchRate}%</p>
            </div>

            {/* Ball selection */}
            <div className="flex justify-center gap-2 mb-4">
              {BALLS.map((b,i) => (
                <button key={b.name} onClick={()=>setBallIdx(i)} className={`px-3 py-2 rounded-xl text-center transition border ${
                  ballIdx===i ? "border-accent bg-accent/10" : "border-border bg-bg-card"
                } ${coins<b.cost ? "opacity-30" : ""}`}>
                  <div className="text-2xl"><div className={`w-8 h-8 rounded-full ${b.color} mx-auto`} /></div>
                  <div className="text-[10px]">{b.name}</div>
                  <div className="text-[10px] text-warn">{b.cost ? b.cost+"币" : "免费"}</div>
                  <div className="text-[10px] text-success">+{b.bonus}%</div>
                </button>
              ))}
            </div>

            <div className="flex gap-3 justify-center">
              <button onClick={throwBall} disabled={coins<BALLS[ballIdx].cost} className="px-8 py-3 rounded-xl bg-accent text-bg font-bold hover:bg-accent-hover active:scale-95 transition disabled:opacity-30">
                扔球！
              </button>
              <button onClick={()=>setPhase("explore")} className="px-6 py-3 rounded-xl bg-bg-card border border-border text-sm hover:bg-bg-hover transition">
                逃跑
              </button>
            </div>
          </div>
        )}

        {phase === "throwing" && wild && (
          <div className="text-center py-8">
            <div className={`text-7xl mb-4 ${shakeClass}`}><div className={`w-16 h-16 rounded-full ${BALLS[ballIdx].color} mx-auto`} /></div>
            <p className="text-subtle animate-pulse">捕获中...</p>
          </div>
        )}

        {phase === "caught" && wild && (
          <div className="text-center animate-slide-up">
            <div className="p-8 rounded-2xl bg-success/10 border-2 border-success/30 mb-4">
              <div className="text-6xl mb-3"><i className="fas fa-trophy text-yellow-400" /></div>
              <h2 className="text-xl font-bold mb-1">捕获成功！</h2>
              <div className="text-5xl my-3">{wild.icon.startsWith("fa-") ? <i className={`fas ${wild.icon}`} /> : <span className="inline-flex w-16 h-16 rounded-full bg-accent/20 items-center justify-center font-bold">{wild.icon}</span>}</div>
              <p className="font-bold">{wild.name} <span className={wild.rarityColor}>【{wild.rarity}】</span></p>
              <p className="text-xs text-muted mt-2">已加入你的收藏</p>
            </div>
            <button onClick={explore} className="px-8 py-3 rounded-xl bg-accent text-bg font-bold hover:bg-accent-hover active:scale-95 transition">
              继续探索
            </button>
          </div>
        )}

        {phase === "escaped" && wild && (
          <div className="text-center animate-slide-up">
            <div className="p-8 rounded-2xl bg-danger/10 border-2 border-danger/30 mb-4">
              <div className="text-6xl mb-3"><i className="fas fa-wind" /></div>
              <h2 className="text-xl font-bold mb-1">跑掉了！</h2>
              <p className="text-muted">{wild.name} 逃走了...</p>
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={explore} className="px-8 py-3 rounded-xl bg-accent text-bg font-bold hover:bg-accent-hover active:scale-95 transition">
                继续探索
              </button>
            </div>
          </div>
        )}

        {/* Collection */}
        {collection.length > 0 && (
          <div className="mt-6">
            <h3 className="font-bold text-sm mb-3"><i className="fas fa-box mr-1" /> 我的收藏 ({collection.length})</h3>
            <div className="grid grid-cols-5 gap-2">
              {collection.map((p, i) => (
                <div key={i} className={`p-2 rounded-xl text-center border ${RARITY_BG[p.rarity]}`}>
                  <div className="text-2xl">{p.icon.startsWith("fa-") ? <i className={`fas ${p.icon}`} /> : p.icon}</div>
                  <div className="text-[9px] text-muted truncate">{p.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pokedex progress */}
        <div className="mt-6 p-4 rounded-xl bg-bg-card border border-border">
          <h3 className="font-bold text-sm mb-2"><i className="fas fa-book mr-1" /> 图鉴进度</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between"><span className="text-gray-300">普通</span><span>{new Set(collection.filter(p=>p.rarity==="普通").map(p=>p.id)).size}/4</span></div>
            <div className="flex justify-between"><span className="text-blue-400">稀有</span><span>{new Set(collection.filter(p=>p.rarity==="稀有").map(p=>p.id)).size}/2</span></div>
            <div className="flex justify-between"><span className="text-purple-400">史诗</span><span>{new Set(collection.filter(p=>p.rarity==="史诗").map(p=>p.id)).size}/2</span></div>
            <div className="flex justify-between"><span className="text-yellow-400">传说</span><span>{new Set(collection.filter(p=>p.rarity==="传说").map(p=>p.id)).size}/2</span></div>
          </div>
          <div className="mt-2 h-2 bg-bg rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-accent to-purple-500 rounded-full transition-all" style={{width:`${new Set(collection.map(p=>p.id)).size/10*100}%`}} />
          </div>
          <p className="text-[10px] text-muted mt-1 text-right">{new Set(collection.map(p=>p.id)).size}/10 种</p>
        </div>
      </main>
    </>
  );
}
