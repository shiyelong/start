"use client";
import { useState, useCallback } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

interface City { name: string; pop: number; food: number; prod: number; gold: number; science: number; buildings: string[]; units: string[]; x: number; y: number; }
interface Tech { id: string; name: string; cost: number; unlocks: string; icon: string; }
interface MapTile { type: "plains" | "forest" | "mountain" | "water" | "desert" | "city"; owner: number; unit?: string; }

const TECHS: Tech[] = [
  { id: "agriculture", name: "农业", cost: 20, unlocks: "粮仓（+3食物）", icon: "🌾" },
  { id: "mining", name: "采矿", cost: 25, unlocks: "矿场（+3产能）", icon: "⛏️" },
  { id: "writing", name: "文字", cost: 30, unlocks: "图书馆（+3科研）", icon: "📜" },
  { id: "currency", name: "货币", cost: 40, unlocks: "市场（+5金币）", icon: "💰" },
  { id: "construction", name: "建筑学", cost: 50, unlocks: "城墙（+10防御）", icon: "🏗️" },
  { id: "military", name: "军事学", cost: 60, unlocks: "兵营（可训练精锐）", icon: "⚔️" },
  { id: "navigation", name: "航海术", cost: 70, unlocks: "港口（+5金币+3食物）", icon: "⛵" },
  { id: "engineering", name: "工程学", cost: 80, unlocks: "工厂（+8产能）", icon: "🏭" },
  { id: "philosophy", name: "哲学", cost: 90, unlocks: "大学（+8科研）", icon: "🎓" },
  { id: "gunpowder", name: "火药", cost: 120, unlocks: "火枪兵（攻击力x2）", icon: "💥" },
  { id: "industrialization", name: "工业化", cost: 150, unlocks: "铁路（全城+50%产能）", icon: "🚂" },
  { id: "spaceflight", name: "航天", cost: 300, unlocks: "🚀 科技胜利！", icon: "🚀" },
];

const MAP_SIZE = 12;
const TILE_EMOJI: Record<string, string> = { plains: "🟩", forest: "🌲", mountain: "⛰️", water: "🌊", desert: "🏜️", city: "🏙️" };
const TILE_YIELD: Record<string, { food: number; prod: number; gold: number }> = {
  plains: { food: 2, prod: 1, gold: 1 }, forest: { food: 1, prod: 2, gold: 0 },
  mountain: { food: 0, prod: 3, gold: 1 }, water: { food: 1, prod: 0, gold: 2 },
  desert: { food: 0, prod: 0, gold: 3 }, city: { food: 0, prod: 0, gold: 0 },
};

function generateMap(): MapTile[][] {
  const map: MapTile[][] = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    const row: MapTile[] = [];
    for (let x = 0; x < MAP_SIZE; x++) {
      const r = Math.random();
      const type = r < 0.35 ? "plains" : r < 0.55 ? "forest" : r < 0.7 ? "mountain" : r < 0.85 ? "water" : "desert";
      row.push({ type, owner: 0 });
    }
    map.push(row);
  }
  // Player city
  map[6][6] = { type: "city", owner: 1 };
  // AI city
  map[2][3] = { type: "city", owner: 2 };
  return map;
}

export default function CivilizationPage() {
  const [turn, setTurn] = useState(1);
  const [map] = useState(() => generateMap());
  const [cities, setCities] = useState<City[]>([
    { name: "首都", pop: 1, food: 10, prod: 5, gold: 20, science: 0, buildings: [], units: ["战士"], x: 6, y: 6 },
  ]);
  const [aiCities] = useState<City[]>([
    { name: "蛮族营地", pop: 2, food: 0, prod: 0, gold: 0, science: 0, buildings: [], units: ["战士", "战士"], x: 3, y: 2 },
  ]);
  const [gold, setGold] = useState(20);
  const [science, setScience] = useState(0);
  const [researchedTechs, setResearchedTechs] = useState<string[]>([]);
  const [currentResearch, setCurrentResearch] = useState<string | null>(null);
  const [researchProgress, setResearchProgress] = useState(0);
  const [selectedCity] = useState(0);
  const [tab, setTab] = useState<"map" | "city" | "tech" | "military">("map");
  const [log, setLog] = useState<string[]>(["🏛️ 文明崛起！你的首都已建立。"]);
  const [won, setWon] = useState(false);
  const [militaryPower, setMilitaryPower] = useState(10);

  const addLog = useCallback((msg: string) => setLog(prev => [...prev.slice(-15), msg]), []);

  const nextTurn = useCallback(() => {
    const newCities = cities.map(c => {
      // Gather yields from surrounding tiles
      let foodGain = 2, prodGain = 1, goldGain = 2, sciGain = 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ty = c.y + dy, tx = c.x + dx;
        if (ty >= 0 && ty < MAP_SIZE && tx >= 0 && tx < MAP_SIZE) {
          const tile = map[ty][tx];
          if (tile.type !== "city") {
            const y = TILE_YIELD[tile.type];
            foodGain += y.food; prodGain += y.prod; goldGain += y.gold;
          }
        }
      }
      // Building bonuses
      if (c.buildings.includes("粮仓")) foodGain += 3;
      if (c.buildings.includes("矿场")) prodGain += 3;
      if (c.buildings.includes("图书馆")) sciGain += 3;
      if (c.buildings.includes("市场")) goldGain += 5;
      if (c.buildings.includes("港口")) { goldGain += 5; foodGain += 3; }
      if (c.buildings.includes("工厂")) prodGain += 8;
      if (c.buildings.includes("大学")) sciGain += 8;
      if (c.buildings.includes("铁路")) prodGain = Math.floor(prodGain * 1.5);

      const newFood = c.food + foodGain;
      let newPop = c.pop;
      // Population growth
      if (newFood >= c.pop * 15) { newPop++; addLog(`🎉 ${c.name} 人口增长到 ${newPop}！`); }

      return { ...c, food: newFood % (c.pop * 15), prod: c.prod + prodGain, gold: goldGain, science: sciGain, pop: newPop };
    });

    // Gold & science
    const totalGold = newCities.reduce((s, c) => s + c.gold, 0);
    const totalScience = newCities.reduce((s, c) => s + c.science, 0);
    setGold(prev => prev + totalGold);
    setScience(prev => prev + totalScience);

    // Research
    if (currentResearch) {
      const newProgress = researchProgress + totalScience;
      const tech = TECHS.find(t => t.id === currentResearch);
      if (tech && newProgress >= tech.cost) {
        setResearchedTechs(prev => [...prev, currentResearch!]);
        setResearchProgress(0);
        setCurrentResearch(null);
        addLog(`🔬 研究完成：${tech.name}！解锁 ${tech.unlocks}`);
        if (tech.id === "spaceflight") { setWon(true); addLog("🚀 科技胜利！你的文明率先进入太空时代！"); }
      } else {
        setResearchProgress(newProgress);
      }
    }

    // Military power
    const mp = newCities.reduce((s, c) => s + c.units.length * (researchedTechs.includes("gunpowder") ? 20 : 10) + (c.buildings.includes("城墙") ? 10 : 0), 0);
    setMilitaryPower(mp);

    // Random events
    if (Math.random() < 0.15 && turn > 5) {
      const events = [
        { msg: "🌾 丰收之年！所有城市+10食物", effect: () => newCities.forEach(c => { c.food += 10; }) },
        { msg: "💰 发现金矿！+30金币", effect: () => setGold(g => g + 30) },
        { msg: "🦠 瘟疫爆发！首都人口-1", effect: () => { if (newCities[0].pop > 1) newCities[0].pop--; } },
        { msg: "⚔️ 蛮族入侵！消耗10金币防御", effect: () => setGold(g => Math.max(0, g - 10)) },
      ];
      const event = events[Math.floor(Math.random() * events.length)];
      event.effect();
      addLog(event.msg);
    }

    setCities(newCities);
    setTurn(t => t + 1);
    addLog(`📅 第 ${turn + 1} 回合`);
  }, [cities, map, turn, currentResearch, researchProgress, researchedTechs, addLog]);

  const buildBuilding = (cityIdx: number, building: string, cost: number) => {
    if (gold < cost) return;
    setGold(g => g - cost);
    const nc = cities.map((c, i) => i === cityIdx ? { ...c, buildings: [...c.buildings, building] } : c);
    setCities(nc);
    addLog(`🏗️ ${cities[cityIdx].name} 建造了 ${building}`);
  };

  const trainUnit = (cityIdx: number, unit: string, cost: number) => {
    if (gold < cost) return;
    setGold(g => g - cost);
    const nc = cities.map((c, i) => i === cityIdx ? { ...c, units: [...c.units, unit] } : c);
    setCities(nc);
    addLog(`⚔️ ${cities[cityIdx].name} 训练了 ${unit}`);
  };

  const city = cities[selectedCity];

  const availableBuildings = [
    { name: "粮仓", cost: 30, req: "agriculture" },
    { name: "矿场", cost: 35, req: "mining" },
    { name: "图书馆", cost: 40, req: "writing" },
    { name: "市场", cost: 50, req: "currency" },
    { name: "城墙", cost: 60, req: "construction" },
    { name: "兵营", cost: 50, req: "military" },
    { name: "港口", cost: 70, req: "navigation" },
    { name: "工厂", cost: 80, req: "engineering" },
    { name: "大学", cost: 90, req: "philosophy" },
    { name: "铁路", cost: 120, req: "industrialization" },
  ].filter(b => researchedTechs.includes(b.req) && !city.buildings.includes(b.name));

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-4 pb-20 md:pb-8">
        <h1 className="text-xl font-bold mb-1 text-center"><i className="fas fa-landmark mr-2 text-[#f0b90b]" />文明崛起</h1>

        {/* 顶部资源栏 */}
        <div className="flex justify-center gap-3 text-[12px] mb-3 flex-wrap">
          <span className="px-2 py-1 rounded bg-[#212121] border border-[#333]">📅 第{turn}回合</span>
          <span className="px-2 py-1 rounded bg-[#212121] border border-[#333] text-[#f0b90b]">💰 {gold}</span>
          <span className="px-2 py-1 rounded bg-[#212121] border border-[#333] text-[#3ea6ff]">🔬 {science}</span>
          <span className="px-2 py-1 rounded bg-[#212121] border border-[#333] text-[#ff4444]">⚔️ {militaryPower}</span>
          <span className="px-2 py-1 rounded bg-[#212121] border border-[#333] text-[#2ba640]">👥 {cities.reduce((s, c) => s + c.pop, 0)}</span>
          <span className="px-2 py-1 rounded bg-[#212121] border border-[#333] text-[#a855f7]">🏙️ {cities.length}城</span>
        </div>

        {/* Tab */}
        <div className="flex gap-1.5 mb-3 justify-center">
          {(["map", "city", "tech", "military"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={clsx(
              "px-3 py-1.5 rounded-lg text-xs border transition",
              tab === t ? "bg-[#f0b90b]/15 text-[#f0b90b] border-[#f0b90b]/30 font-bold" : "text-[#aaa] border-[#333]"
            )}>
              {t === "map" ? "🗺️ 地图" : t === "city" ? "🏙️ 城市" : t === "tech" ? "🔬 科技" : "⚔️ 军事"}
            </button>
          ))}
        </div>

        {/* 地图 */}
        {tab === "map" && (
          <div className="overflow-x-auto mb-3">
            <div className="inline-grid gap-0 mx-auto" style={{ gridTemplateColumns: `repeat(${MAP_SIZE}, 32px)` }}>
              {map.map((row, y) => row.map((tile, x) => {
                const isPlayerCity = cities.some(c => c.x === x && c.y === y);
                const isAiCity = aiCities.some(c => c.x === x && c.y === y);
                return (
                  <div key={`${x}-${y}`} className={clsx(
                    "w-8 h-8 flex items-center justify-center text-sm select-none border border-[#1a1a1a]",
                    isPlayerCity && "ring-2 ring-[#3ea6ff]",
                    isAiCity && "ring-2 ring-[#ff4444]",
                  )} title={`${tile.type} (${x},${y})`}>
                    {isPlayerCity ? "🏙️" : isAiCity ? "🏴" : TILE_EMOJI[tile.type]}
                  </div>
                );
              }))}
            </div>
          </div>
        )}

        {/* 城市管理 */}
        {tab === "city" && city && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-[#1a1a1a] border border-[#333]">
              <h3 className="font-bold text-sm mb-2">🏙️ {city.name} <span className="text-[#8a8a8a] font-normal">（人口 {city.pop}）</span></h3>
              <div className="grid grid-cols-2 gap-2 text-[12px] mb-3">
                <div className="p-2 rounded bg-[#212121]">🌾 食物：{city.food}/{city.pop * 15}</div>
                <div className="p-2 rounded bg-[#212121]">🔨 产能：{city.prod}</div>
                <div className="p-2 rounded bg-[#212121]">💰 金币：+{city.gold}/回合</div>
                <div className="p-2 rounded bg-[#212121]">🔬 科研：+{city.science}/回合</div>
              </div>
              {city.buildings.length > 0 && (
                <div className="mb-2">
                  <p className="text-[11px] text-[#8a8a8a] mb-1">已建造：</p>
                  <div className="flex flex-wrap gap-1">{city.buildings.map((b, i) => <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-[#2ba640]/15 text-[#2ba640] border border-[#2ba640]/20">{b}</span>)}</div>
                </div>
              )}
            </div>
            {availableBuildings.length > 0 && (
              <div className="p-4 rounded-xl bg-[#1a1a1a] border border-[#333]">
                <h3 className="font-bold text-sm mb-2">🏗️ 可建造</h3>
                <div className="space-y-1.5">
                  {availableBuildings.map(b => (
                    <button key={b.name} onClick={() => buildBuilding(selectedCity, b.name, b.cost)} disabled={gold < b.cost}
                      className={clsx("w-full p-2 rounded-lg border text-left text-[12px] flex justify-between transition",
                        gold >= b.cost ? "border-[#333] hover:border-[#f0b90b]/30 text-[#ccc]" : "border-[#222] text-[#666] opacity-50"
                      )}>
                      <span>{b.name}</span><span className="text-[#f0b90b]">💰{b.cost}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 科技树 */}
        {tab === "tech" && (
          <div className="space-y-2">
            {currentResearch && (
              <div className="p-3 rounded-xl bg-[#3ea6ff]/10 border border-[#3ea6ff]/20 mb-2">
                <p className="text-xs text-[#3ea6ff]">正在研究：{TECHS.find(t => t.id === currentResearch)?.name}</p>
                <div className="h-2 bg-[#333] rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-[#3ea6ff] rounded-full transition-all" style={{ width: `${(researchProgress / (TECHS.find(t => t.id === currentResearch)?.cost || 1)) * 100}%` }} />
                </div>
                <p className="text-[10px] text-[#8a8a8a] mt-1">{researchProgress}/{TECHS.find(t => t.id === currentResearch)?.cost}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {TECHS.map(tech => {
                const done = researchedTechs.includes(tech.id);
                const active = currentResearch === tech.id;
                return (
                  <button key={tech.id} onClick={() => { if (!done && !currentResearch) { setCurrentResearch(tech.id); setResearchProgress(0); addLog(`🔬 开始研究：${tech.name}`); } }}
                    disabled={done || !!currentResearch}
                    className={clsx("p-3 rounded-xl border text-left transition",
                      done ? "bg-[#2ba640]/10 border-[#2ba640]/20" :
                      active ? "bg-[#3ea6ff]/10 border-[#3ea6ff]/30" :
                      "bg-[#1a1a1a] border-[#333] hover:border-[#f0b90b]/30"
                    )}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{tech.icon}</span>
                      <span className={clsx("text-xs font-bold", done ? "text-[#2ba640]" : "text-[#ccc]")}>{tech.name}</span>
                      {done && <i className="fas fa-check text-[#2ba640] text-[10px]" />}
                    </div>
                    <p className="text-[10px] text-[#8a8a8a]">{tech.unlocks}</p>
                    {!done && <p className="text-[10px] text-[#f0b90b] mt-1">需要 {tech.cost} 科研点</p>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 军事 */}
        {tab === "military" && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-[#1a1a1a] border border-[#333]">
              <h3 className="font-bold text-sm mb-2">⚔️ 军事力量：{militaryPower}</h3>
              <div className="flex flex-wrap gap-1 mb-3">
                {cities.flatMap(c => c.units).map((u, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-[#ff4444]/10 text-[#ff4444] border border-[#ff4444]/20">{u}</span>
                ))}
              </div>
              <div className="space-y-1.5">
                <button onClick={() => trainUnit(selectedCity, "战士", 20)} disabled={gold < 20}
                  className={clsx("w-full p-2 rounded-lg border text-[12px] flex justify-between", gold >= 20 ? "border-[#333] text-[#ccc]" : "border-[#222] text-[#666] opacity-50")}>
                  <span>🗡️ 训练战士（攻击10）</span><span className="text-[#f0b90b]">💰20</span>
                </button>
                {researchedTechs.includes("military") && (
                  <button onClick={() => trainUnit(selectedCity, "精锐战士", 40)} disabled={gold < 40}
                    className={clsx("w-full p-2 rounded-lg border text-[12px] flex justify-between", gold >= 40 ? "border-[#333] text-[#ccc]" : "border-[#222] text-[#666] opacity-50")}>
                    <span>⚔️ 训练精锐（攻击20）</span><span className="text-[#f0b90b]">💰40</span>
                  </button>
                )}
                {researchedTechs.includes("gunpowder") && (
                  <button onClick={() => trainUnit(selectedCity, "火枪兵", 60)} disabled={gold < 60}
                    className={clsx("w-full p-2 rounded-lg border text-[12px] flex justify-between", gold >= 60 ? "border-[#333] text-[#ccc]" : "border-[#222] text-[#666] opacity-50")}>
                    <span>🔫 训练火枪兵（攻击40）</span><span className="text-[#f0b90b]">💰60</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 回合按钮 */}
        {!won && (
          <button onClick={nextTurn} className="w-full mt-4 py-3 rounded-xl bg-[#f0b90b] text-[#0f0f0f] font-bold text-sm hover:bg-[#f0b90b]/80 transition active:scale-95">
            <i className="fas fa-forward mr-1.5" />下一回合
          </button>
        )}

        {won && (
          <div className="text-center py-6">
            <p className="text-4xl mb-2">🚀</p>
            <p className="text-xl font-bold text-[#f0b90b]">科技胜利！</p>
            <p className="text-[#8a8a8a] text-sm">用了 {turn} 回合征服星辰大海</p>
          </div>
        )}

        {/* 日志 */}
        <div className="mt-3 h-28 overflow-y-auto rounded-xl bg-[#0a0a0a] border border-[#333] p-3 text-[11px] text-[#8a8a8a] space-y-0.5">
          {log.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      </main>
    </>
  );
}
