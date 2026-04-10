"use client";
import { useState, useCallback } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

interface Item { id: string; name: string; emoji: string; count: number; }
interface Recipe { name: string; emoji: string; ingredients: { id: string; count: number }[]; result: string; resultEmoji: string; }
interface Building { id: string; name: string; emoji: string; effect: string; built: boolean; cost: { id: string; count: number }[]; }

const RECIPES: Recipe[] = [
  { name: "石斧", emoji: "🪓", ingredients: [{ id: "wood", count: 3 }, { id: "stone", count: 2 }], result: "axe", resultEmoji: "🪓" },
  { name: "钓竿", emoji: "🎣", ingredients: [{ id: "wood", count: 2 }, { id: "vine", count: 3 }], result: "rod", resultEmoji: "🎣" },
  { name: "火把", emoji: "🔥", ingredients: [{ id: "wood", count: 2 }, { id: "leaf", count: 2 }], result: "torch", resultEmoji: "🔥" },
  { name: "绳索", emoji: "🪢", ingredients: [{ id: "vine", count: 5 }], result: "rope", resultEmoji: "🪢" },
  { name: "矛", emoji: "🔱", ingredients: [{ id: "wood", count: 3 }, { id: "stone", count: 3 }, { id: "rope", count: 1 }], result: "spear", resultEmoji: "🔱" },
  { name: "烤鱼", emoji: "🍖", ingredients: [{ id: "fish", count: 1 }, { id: "torch", count: 1 }], result: "cookedfish", resultEmoji: "🍖" },
  { name: "草药", emoji: "💊", ingredients: [{ id: "herb", count: 3 }], result: "medicine", resultEmoji: "💊" },
  { name: "皮甲", emoji: "🛡️", ingredients: [{ id: "hide", count: 3 }, { id: "rope", count: 2 }], result: "armor", resultEmoji: "🛡️" },
];

const INIT_BUILDINGS: Building[] = [
  { id: "shelter", name: "庇护所", emoji: "🏠", effect: "每晚恢复+5体力", built: false, cost: [{ id: "wood", count: 10 }, { id: "leaf", count: 8 }] },
  { id: "campfire", name: "篝火", emoji: "🔥", effect: "可以烹饪，夜间安全", built: false, cost: [{ id: "wood", count: 5 }, { id: "stone", count: 5 }] },
  { id: "well", name: "水井", emoji: "🪣", effect: "每天+20水分", built: false, cost: [{ id: "stone", count: 15 }, { id: "rope", count: 2 }] },
  { id: "farm", name: "农田", emoji: "🌱", effect: "每天+10食物", built: false, cost: [{ id: "wood", count: 8 }, { id: "vine", count: 5 }, { id: "herb", count: 3 }] },
  { id: "raft", name: "木筏", emoji: "⛵", effect: "🎉 逃离荒岛！", built: false, cost: [{ id: "wood", count: 30 }, { id: "rope", count: 5 }, { id: "leaf", count: 10 }] },
];

type Area = "beach" | "forest" | "cave" | "river" | "mountain";
const AREAS: { id: Area; name: string; emoji: string; loot: { id: string; name: string; emoji: string; chance: number }[]; danger: number }[] = [
  { id: "beach", name: "海滩", emoji: "🏖️", danger: 5, loot: [
    { id: "wood", name: "木头", emoji: "🪵", chance: 60 }, { id: "stone", name: "石头", emoji: "🪨", chance: 40 },
    { id: "shell", name: "贝壳", emoji: "🐚", chance: 20 }, { id: "vine", name: "藤蔓", emoji: "🌿", chance: 30 },
  ]},
  { id: "forest", name: "森林", emoji: "🌲", danger: 15, loot: [
    { id: "wood", name: "木头", emoji: "🪵", chance: 70 }, { id: "leaf", name: "树叶", emoji: "🍃", chance: 50 },
    { id: "vine", name: "藤蔓", emoji: "🌿", chance: 40 }, { id: "herb", name: "草药", emoji: "🌿", chance: 25 },
    { id: "hide", name: "兽皮", emoji: "🦌", chance: 10 },
  ]},
  { id: "cave", name: "洞穴", emoji: "🕳️", danger: 30, loot: [
    { id: "stone", name: "石头", emoji: "🪨", chance: 70 }, { id: "ore", name: "矿石", emoji: "⛏️", chance: 20 },
    { id: "gem", name: "宝石", emoji: "💎", chance: 5 },
  ]},
  { id: "river", name: "河流", emoji: "🏞️", danger: 10, loot: [
    { id: "fish", name: "鱼", emoji: "🐟", chance: 50 }, { id: "herb", name: "草药", emoji: "🌿", chance: 30 },
    { id: "stone", name: "石头", emoji: "🪨", chance: 30 },
  ]},
  { id: "mountain", name: "山地", emoji: "⛰️", danger: 25, loot: [
    { id: "stone", name: "石头", emoji: "🪨", chance: 60 }, { id: "ore", name: "矿石", emoji: "⛏️", chance: 30 },
    { id: "hide", name: "兽皮", emoji: "🦌", chance: 20 }, { id: "herb", name: "草药", emoji: "🌿", chance: 15 },
  ]},
];

export default function SurvivalPage() {
  const [day, setDay] = useState(1);
  const [hp, setHp] = useState(100);
  const [hunger, setHunger] = useState(80);
  const [thirst, setThirst] = useState(80);
  const [energy, setEnergy] = useState(100);
  const [inventory, setInventory] = useState<Item[]>([
    { id: "wood", name: "木头", emoji: "🪵", count: 2 },
    { id: "stone", name: "石头", emoji: "🪨", count: 1 },
  ]);
  const [buildings, setBuildings] = useState<Building[]>(INIT_BUILDINGS.map(b => ({ ...b })));
  const [log, setLog] = useState<string[]>(["🏝️ 你醒来发现自己在一座荒岛上..."]);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [tab, setTab] = useState<"explore" | "craft" | "build">("explore");

  const addLog = useCallback((msg: string) => setLog(prev => [...prev.slice(-20), msg]), []);

  const getItem = useCallback((id: string): number => inventory.find(i => i.id === id)?.count || 0, [inventory]);

  const addItem = useCallback((id: string, name: string, emoji: string, count: number) => {
    setInventory(prev => {
      const existing = prev.find(i => i.id === id);
      if (existing) return prev.map(i => i.id === id ? { ...i, count: i.count + count } : i);
      return [...prev, { id, name, emoji, count }];
    });
  }, []);

  const removeItem = useCallback((id: string, count: number) => {
    setInventory(prev => prev.map(i => i.id === id ? { ...i, count: i.count - count } : i).filter(i => i.count > 0));
  }, []);

  const explore = useCallback((area: typeof AREAS[0]) => {
    if (energy < 15) { addLog("😫 体力不足，先休息吧"); return; }
    setEnergy(e => e - 15);
    setHunger(h => Math.max(0, h - 8));
    setThirst(t => Math.max(0, t - 10));

    // Danger check
    const hasSpear = getItem("spear") > 0;
    const hasArmor = getItem("armor") > 0;
    const dangerMod = (hasSpear ? 0.5 : 1) * (hasArmor ? 0.7 : 1);
    if (Math.random() * 100 < area.danger * dangerMod) {
      const dmg = 10 + Math.floor(Math.random() * 15);
      setHp(h => { const nh = Math.max(0, h - dmg); if (nh <= 0) setGameOver(true); return nh; });
      addLog(`⚠️ 在${area.name}遭遇危险！受到 ${dmg} 伤害${hasSpear ? "（矛减伤）" : ""}${hasArmor ? "（甲减伤）" : ""}`);
    }

    // Loot
    const found: string[] = [];
    area.loot.forEach(item => {
      if (Math.random() * 100 < item.chance) {
        const count = 1 + Math.floor(Math.random() * 2);
        addItem(item.id, item.name, item.emoji, count);
        found.push(`${item.emoji}${item.name}x${count}`);
      }
    });
    if (found.length > 0) addLog(`🔍 在${area.emoji}${area.name}找到：${found.join(" ")}`);
    else addLog(`🔍 在${area.name}什么都没找到...`);
  }, [energy, addLog, addItem, getItem]);

  const craft = useCallback((recipe: Recipe) => {
    const canCraft = recipe.ingredients.every(ing => getItem(ing.id) >= ing.count);
    if (!canCraft) return;
    recipe.ingredients.forEach(ing => removeItem(ing.id, ing.count));
    addItem(recipe.result, recipe.name, recipe.emoji, 1);
    addLog(`🔨 合成了 ${recipe.emoji}${recipe.name}`);
  }, [getItem, removeItem, addItem, addLog]);

  const build = useCallback((building: Building) => {
    const canBuild = building.cost.every(c => getItem(c.id) >= c.count);
    if (!canBuild) return;
    building.cost.forEach(c => removeItem(c.id, c.count));
    setBuildings(prev => prev.map(b => b.id === building.id ? { ...b, built: true } : b));
    addLog(`🏗️ 建造了 ${building.emoji}${building.name}！${building.effect}`);
    if (building.id === "raft") { setWon(true); addLog("⛵ 你成功建造了木筏，逃离了荒岛！"); }
  }, [getItem, removeItem, addLog]);

  const rest = useCallback(() => {
    const hasShelter = buildings.find(b => b.id === "shelter")?.built;
    const energyGain = hasShelter ? 50 : 30;
    setEnergy(e => Math.min(100, e + energyGain));
    setHunger(h => Math.max(0, h - 15));
    setThirst(t => Math.max(0, t - 15));
    setDay(d => d + 1);

    // Building effects
    if (buildings.find(b => b.id === "well")?.built) setThirst(t => Math.min(100, t + 20));
    if (buildings.find(b => b.id === "farm")?.built) setHunger(h => Math.min(100, h + 10));
    if (hasShelter) setHp(h => Math.min(100, h + 5));

    // Starvation/dehydration
    if (hunger <= 0) { setHp(h => { const nh = Math.max(0, h - 15); if (nh <= 0) setGameOver(true); return nh; }); addLog("🍽️ 饥饿导致体力下降！"); }
    if (thirst <= 0) { setHp(h => { const nh = Math.max(0, h - 20); if (nh <= 0) setGameOver(true); return nh; }); addLog("💧 脱水导致体力下降！"); }

    addLog(`🌙 第${day + 1}天到来${hasShelter ? "（庇护所恢复体力）" : ""}`);
  }, [day, hunger, thirst, buildings, addLog]);

  const eat = useCallback(() => {
    if (getItem("cookedfish") > 0) { removeItem("cookedfish", 1); setHunger(h => Math.min(100, h + 35)); setHp(hp => Math.min(100, hp + 10)); addLog("🍖 吃了烤鱼，恢复饥饿和生命"); }
    else if (getItem("fish") > 0) { removeItem("fish", 1); setHunger(h => Math.min(100, h + 15)); addLog("🐟 生吃了鱼...勉强充饥"); }
    else addLog("😢 没有食物可以吃");
  }, [getItem, removeItem, addLog]);

  const drink = useCallback(() => {
    setThirst(t => Math.min(100, t + 25));
    if (Math.random() < 0.2 && !buildings.find(b => b.id === "well")?.built) {
      setHp(h => Math.max(0, h - 5));
      addLog("💧 喝了河水，但有点不干净（-5HP）");
    } else {
      addLog("💧 补充了水分");
    }
  }, [buildings, addLog]);

  const heal = useCallback(() => {
    if (getItem("medicine") > 0) { removeItem("medicine", 1); setHp(h => Math.min(100, h + 30)); addLog("💊 使用草药恢复了30HP"); }
    else addLog("😢 没有草药");
  }, [getItem, removeItem, addLog]);

  const barW = (v: number) => `${Math.max(0, v)}%`;
  const barColor = (v: number) => v > 60 ? "bg-[#2ba640]" : v > 30 ? "bg-[#f0b90b]" : "bg-[#ff4444]";

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8">
        <h1 className="text-xl font-bold mb-2 text-center"><i className="fas fa-campground mr-2 text-[#2ba640]" />荒岛求生</h1>

        {/* 状态栏 */}
        <div className="grid grid-cols-2 gap-2 mb-3 text-[11px]">
          <div className="p-2 rounded-lg bg-[#1a1a1a] border border-[#333]">
            <div className="flex justify-between mb-1"><span>❤️ 生命</span><span>{hp}/100</span></div>
            <div className="h-1.5 bg-[#333] rounded-full"><div className={`h-full rounded-full transition-all ${barColor(hp)}`} style={{ width: barW(hp) }} /></div>
          </div>
          <div className="p-2 rounded-lg bg-[#1a1a1a] border border-[#333]">
            <div className="flex justify-between mb-1"><span>🍽️ 饥饿</span><span>{hunger}/100</span></div>
            <div className="h-1.5 bg-[#333] rounded-full"><div className={`h-full rounded-full transition-all ${barColor(hunger)}`} style={{ width: barW(hunger) }} /></div>
          </div>
          <div className="p-2 rounded-lg bg-[#1a1a1a] border border-[#333]">
            <div className="flex justify-between mb-1"><span>💧 水分</span><span>{thirst}/100</span></div>
            <div className="h-1.5 bg-[#333] rounded-full"><div className={`h-full rounded-full transition-all ${barColor(thirst)}`} style={{ width: barW(thirst) }} /></div>
          </div>
          <div className="p-2 rounded-lg bg-[#1a1a1a] border border-[#333]">
            <div className="flex justify-between mb-1"><span>⚡ 体力</span><span>{energy}/100</span></div>
            <div className="h-1.5 bg-[#333] rounded-full"><div className={`h-full rounded-full transition-all ${barColor(energy)}`} style={{ width: barW(energy) }} /></div>
          </div>
        </div>

        <div className="flex justify-center gap-3 text-[11px] mb-3">
          <span className="text-[#f0b90b]">📅 第{day}天</span>
          <button onClick={eat} className="text-[#ff4444] hover:underline">🍖吃</button>
          <button onClick={drink} className="text-[#3ea6ff] hover:underline">💧喝</button>
          <button onClick={heal} className="text-[#2ba640] hover:underline">💊治疗</button>
          <button onClick={rest} className="text-[#a855f7] hover:underline">😴休息</button>
        </div>

        {/* 背包 */}
        <div className="flex flex-wrap gap-1.5 mb-3 p-3 rounded-xl bg-[#1a1a1a] border border-[#333] min-h-[40px]">
          {inventory.filter(i => i.count > 0).map(item => (
            <span key={item.id} className="text-[11px] px-2 py-0.5 rounded bg-[#212121] border border-[#333]">
              {item.emoji}{item.name} x{item.count}
            </span>
          ))}
          {inventory.filter(i => i.count > 0).length === 0 && <span className="text-[11px] text-[#666]">背包空空...</span>}
        </div>

        {/* Tab */}
        <div className="flex gap-1.5 mb-3 justify-center">
          {(["explore", "craft", "build"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={clsx(
              "px-3 py-1.5 rounded-lg text-xs border transition",
              tab === t ? "bg-[#2ba640]/15 text-[#2ba640] border-[#2ba640]/30 font-bold" : "text-[#aaa] border-[#333]"
            )}>{t === "explore" ? "🔍 探索" : t === "craft" ? "🔨 合成" : "🏗️ 建造"}</button>
          ))}
        </div>

        {tab === "explore" && !gameOver && !won && (
          <div className="grid grid-cols-2 gap-2">
            {AREAS.map(area => (
              <button key={area.id} onClick={() => explore(area)}
                className="p-3 rounded-xl bg-[#1a1a1a] border border-[#333] hover:border-[#2ba640]/30 transition text-left active:scale-95">
                <div className="text-2xl mb-1">{area.emoji}</div>
                <h3 className="text-xs font-bold">{area.name}</h3>
                <p className="text-[10px] text-[#8a8a8a]">危险度 {area.danger}%</p>
                <p className="text-[10px] text-[#666]">消耗15体力</p>
              </button>
            ))}
          </div>
        )}

        {tab === "craft" && (
          <div className="space-y-1.5">
            {RECIPES.map(recipe => {
              const canCraft = recipe.ingredients.every(ing => getItem(ing.id) >= ing.count);
              return (
                <button key={recipe.name} onClick={() => craft(recipe)} disabled={!canCraft}
                  className={clsx("w-full p-3 rounded-xl border text-left transition",
                    canCraft ? "bg-[#1a1a1a] border-[#333] hover:border-[#f0b90b]/30" : "bg-[#111] border-[#222] opacity-50"
                  )}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{recipe.emoji} {recipe.name}</span>
                    <span className="text-[10px] text-[#8a8a8a]">
                      {recipe.ingredients.map(ing => {
                        const have = getItem(ing.id);
                        return <span key={ing.id} className={have >= ing.count ? "text-[#2ba640]" : "text-[#ff4444]"}> {ing.id}:{have}/{ing.count}</span>;
                      })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {tab === "build" && (
          <div className="space-y-2">
            {buildings.map(b => {
              const canBuild = !b.built && b.cost.every(c => getItem(c.id) >= c.count);
              return (
                <div key={b.id} className={clsx("p-3 rounded-xl border transition",
                  b.built ? "bg-[#2ba640]/10 border-[#2ba640]/20" : "bg-[#1a1a1a] border-[#333]"
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold">{b.emoji} {b.name}</span>
                    {b.built ? <span className="text-[10px] text-[#2ba640]">✅ 已建造</span> :
                      <button onClick={() => build(b)} disabled={!canBuild}
                        className={clsx("text-[10px] px-2 py-0.5 rounded", canBuild ? "bg-[#f0b90b] text-[#0f0f0f] font-bold" : "bg-[#333] text-[#666]")}>
                        建造
                      </button>
                    }
                  </div>
                  <p className="text-[10px] text-[#8a8a8a]">{b.effect}</p>
                  {!b.built && <p className="text-[10px] text-[#666] mt-1">需要：{b.cost.map(c => `${c.id}x${c.count}`).join(" ")}</p>}
                </div>
              );
            })}
          </div>
        )}

        {gameOver && (
          <div className="text-center py-6">
            <p className="text-4xl mb-2">💀</p>
            <p className="text-xl font-bold text-[#ff4444]">你没能活下来...</p>
            <p className="text-[#8a8a8a] text-sm">存活了 {day} 天</p>
            <button onClick={() => window.location.reload()} className="mt-3 px-6 py-2 rounded-xl bg-[#2ba640] text-white font-bold text-sm">重新开始</button>
          </div>
        )}
        {won && (
          <div className="text-center py-6">
            <p className="text-4xl mb-2">⛵</p>
            <p className="text-xl font-bold text-[#2ba640]">成功逃离荒岛！</p>
            <p className="text-[#8a8a8a] text-sm">用了 {day} 天</p>
          </div>
        )}

        {/* 日志 */}
        <div className="mt-3 h-24 overflow-y-auto rounded-xl bg-[#0a0a0a] border border-[#333] p-3 text-[11px] text-[#8a8a8a] space-y-0.5">
          {log.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      </main>
    </>
  );
}
