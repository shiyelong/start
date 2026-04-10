"use client";
import { useState, useCallback } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

interface Shop { id: string; name: string; emoji: string; level: number; income: number; cost: number; upgradeCost: number; staff: number; reputation: number; unlocked: boolean; }
interface Investment { id: string; name: string; emoji: string; cost: number; returnRate: number; duration: number; progress: number; active: boolean; }
interface Event { msg: string; effect: (state: GameState) => Partial<GameState>; }

interface GameState { cash: number; totalAssets: number; reputation: number; day: number; }

const INIT_SHOPS: Shop[] = [
  { id: "lemonade", name: "柠檬水摊", emoji: "🍋", level: 1, income: 5, cost: 0, upgradeCost: 50, staff: 0, reputation: 10, unlocked: true },
  { id: "cafe", name: "咖啡店", emoji: "☕", level: 0, income: 15, cost: 200, upgradeCost: 150, staff: 0, reputation: 0, unlocked: false },
  { id: "restaurant", name: "餐厅", emoji: "🍽️", level: 0, income: 40, cost: 800, upgradeCost: 400, staff: 0, reputation: 0, unlocked: false },
  { id: "hotel", name: "酒店", emoji: "🏨", level: 0, income: 100, cost: 3000, upgradeCost: 1500, staff: 0, reputation: 0, unlocked: false },
  { id: "mall", name: "商场", emoji: "🏬", level: 0, income: 250, cost: 10000, upgradeCost: 5000, staff: 0, reputation: 0, unlocked: false },
  { id: "tech", name: "科技公司", emoji: "💻", level: 0, income: 500, cost: 30000, upgradeCost: 15000, staff: 0, reputation: 0, unlocked: false },
  { id: "bank", name: "银行", emoji: "🏦", level: 0, income: 1000, cost: 100000, upgradeCost: 50000, staff: 0, reputation: 0, unlocked: false },
  { id: "spaceport", name: "太空港", emoji: "🚀", level: 0, income: 5000, cost: 500000, upgradeCost: 200000, staff: 0, reputation: 0, unlocked: false },
];

const INVESTMENTS: Investment[] = [
  { id: "stock", name: "股票基金", emoji: "📈", cost: 500, returnRate: 1.3, duration: 10, progress: 0, active: false },
  { id: "realestate", name: "房地产", emoji: "🏠", cost: 2000, returnRate: 1.5, duration: 20, progress: 0, active: false },
  { id: "crypto", name: "加密货币", emoji: "₿", cost: 1000, returnRate: 2.0, duration: 15, progress: 0, active: false },
  { id: "startup", name: "天使投资", emoji: "🦄", cost: 5000, returnRate: 3.0, duration: 30, progress: 0, active: false },
];

const EVENTS: Event[] = [
  { msg: "📰 你的店铺被媒体报道！声望+20", effect: () => ({ reputation: 20 }) },
  { msg: "🌧️ 暴风雨来袭，今日收入减半", effect: (s) => ({ cash: -Math.floor(s.cash * 0.1) }) },
  { msg: "🎉 节日促销！今日收入翻倍", effect: () => ({}) },
  { msg: "💰 发现一笔意外之财！+500", effect: () => ({ cash: 500 }) },
  { msg: "🔧 设备故障，维修费-200", effect: () => ({ cash: -200 }) },
  { msg: "⭐ 获得最佳商家奖！声望+30", effect: () => ({ reputation: 30 }) },
  { msg: "📉 经济下行，所有收入-20%本回合", effect: () => ({}) },
  { msg: "🎓 员工培训完成，效率提升！", effect: () => ({}) },
];

function fmtMoney(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(Math.floor(n));
}

export default function TycoonPage() {
  const [cash, setCash] = useState(100);
  const [day, setDay] = useState(1);
  const [reputation, setReputation] = useState(10);
  const [shops, setShops] = useState<Shop[]>(INIT_SHOPS.map(s => ({ ...s })));
  const [investments, setInvestments] = useState<Investment[]>(INVESTMENTS.map(i => ({ ...i })));
  const [log, setLog] = useState<string[]>(["🏪 你从一个柠檬水摊开始了商业帝国之路..."]);
  const [tab, setTab] = useState<"shops" | "invest" | "stats">("shops");
  const [milestone, setMilestone] = useState("");

  const addLog = useCallback((msg: string) => setLog(prev => [...prev.slice(-20), msg]), []);

  const totalIncome = shops.filter(s => s.unlocked && s.level > 0).reduce((sum, s) => sum + s.income * s.level * (1 + s.staff * 0.1), 0);
  const totalAssets = cash + shops.filter(s => s.unlocked).reduce((sum, s) => sum + s.cost * s.level, 0);

  const nextDay = useCallback(() => {
    // Income
    let income = totalIncome;
    const repBonus = 1 + reputation / 500;
    income = Math.floor(income * repBonus);
    setCash(c => c + income);

    // Investments
    setInvestments(prev => prev.map(inv => {
      if (!inv.active) return inv;
      const newProgress = inv.progress + 1;
      if (newProgress >= inv.duration) {
        const payout = Math.floor(inv.cost * inv.returnRate);
        setCash(c => c + payout);
        addLog(`📈 ${inv.name}到期！回收 $${fmtMoney(payout)}`);
        return { ...inv, active: false, progress: 0 };
      }
      return { ...inv, progress: newProgress };
    }));

    // Random event
    if (Math.random() < 0.25) {
      const event = EVENTS[Math.floor(Math.random() * EVENTS.length)];
      const effect = event.effect({ cash, totalAssets, reputation, day });
      if (effect.cash) setCash(c => Math.max(0, c + effect.cash!));
      if (effect.reputation) setReputation(r => r + effect.reputation!);
      addLog(event.msg);
    }

    // Milestones
    const newAssets = totalAssets + income;
    if (newAssets >= 1000000 && !milestone.includes("百万")) { setMilestone("百万富翁"); addLog("🏆 里程碑：百万富翁！"); }
    if (newAssets >= 10000000 && !milestone.includes("千万")) { setMilestone("千万大亨"); addLog("🏆 里程碑：千万大亨！"); }
    if (newAssets >= 100000000 && !milestone.includes("亿")) { setMilestone("亿万富豪"); addLog("🏆 里程碑：亿万富豪！"); }

    setDay(d => d + 1);
    if (income > 0) addLog(`💵 日收入 $${fmtMoney(income)}（声望加成 x${repBonus.toFixed(1)}）`);
  }, [totalIncome, reputation, cash, totalAssets, day, milestone, addLog]);

  const buyShop = (shop: Shop) => {
    if (cash < shop.cost) return;
    setCash(c => c - shop.cost);
    setShops(prev => prev.map(s => s.id === shop.id ? { ...s, unlocked: true, level: 1 } : s));
    addLog(`🏪 开了一家 ${shop.emoji}${shop.name}！`);
  };

  const upgradeShop = (shop: Shop) => {
    const cost = shop.upgradeCost * shop.level;
    if (cash < cost) return;
    setCash(c => c - cost);
    setShops(prev => prev.map(s => s.id === shop.id ? { ...s, level: s.level + 1 } : s));
    addLog(`⬆️ ${shop.name} 升级到 Lv.${shop.level + 1}！`);
  };

  const hireStaff = (shop: Shop) => {
    const cost = 100 * (shop.staff + 1);
    if (cash < cost || shop.staff >= 5) return;
    setCash(c => c - cost);
    setShops(prev => prev.map(s => s.id === shop.id ? { ...s, staff: s.staff + 1 } : s));
    addLog(`👤 ${shop.name} 雇佣了员工（+10%效率）`);
  };

  const invest = (inv: Investment) => {
    if (cash < inv.cost || inv.active) return;
    setCash(c => c - inv.cost);
    setInvestments(prev => prev.map(i => i.id === inv.id ? { ...i, active: true, progress: 0 } : i));
    addLog(`💼 投资了 ${inv.emoji}${inv.name}（${inv.duration}天后回收 x${inv.returnRate}）`);
  };

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8">
        <h1 className="text-xl font-bold mb-2 text-center"><i className="fas fa-city mr-2 text-[#3ea6ff]" />商业帝国</h1>

        {/* 资产面板 */}
        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
          <div className="p-3 rounded-xl bg-[#1a1a1a] border border-[#333]">
            <div className="text-lg font-black text-[#f0b90b]">${fmtMoney(cash)}</div>
            <div className="text-[10px] text-[#8a8a8a]">现金</div>
          </div>
          <div className="p-3 rounded-xl bg-[#1a1a1a] border border-[#333]">
            <div className="text-lg font-black text-[#2ba640]">${fmtMoney(totalIncome)}</div>
            <div className="text-[10px] text-[#8a8a8a]">日收入</div>
          </div>
          <div className="p-3 rounded-xl bg-[#1a1a1a] border border-[#333]">
            <div className="text-lg font-black text-[#3ea6ff]">${fmtMoney(totalAssets)}</div>
            <div className="text-[10px] text-[#8a8a8a]">总资产</div>
          </div>
        </div>

        <div className="flex justify-center gap-3 text-[11px] mb-3">
          <span>📅 第{day}天</span>
          <span>⭐ 声望{reputation}</span>
          {milestone && <span className="text-[#f0b90b] font-bold">🏆 {milestone}</span>}
        </div>

        {/* Tab */}
        <div className="flex gap-1.5 mb-3 justify-center">
          {(["shops", "invest", "stats"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={clsx(
              "px-3 py-1.5 rounded-lg text-xs border transition",
              tab === t ? "bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/30 font-bold" : "text-[#aaa] border-[#333]"
            )}>{t === "shops" ? "🏪 店铺" : t === "invest" ? "📈 投资" : "📊 统计"}</button>
          ))}
        </div>

        {tab === "shops" && (
          <div className="space-y-2">
            {shops.map(shop => (
              <div key={shop.id} className={clsx("p-3 rounded-xl border transition",
                shop.unlocked && shop.level > 0 ? "bg-[#1a1a1a] border-[#333]" : "bg-[#111] border-[#222]"
              )}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{shop.emoji}</span>
                    <div>
                      <span className="text-sm font-bold">{shop.name}</span>
                      {shop.level > 0 && <span className="text-[10px] text-[#3ea6ff] ml-1">Lv.{shop.level}</span>}
                      {shop.staff > 0 && <span className="text-[10px] text-[#a855f7] ml-1">👤x{shop.staff}</span>}
                    </div>
                  </div>
                  {shop.unlocked && shop.level > 0 && (
                    <span className="text-[11px] text-[#2ba640]">+${fmtMoney(Math.floor(shop.income * shop.level * (1 + shop.staff * 0.1)))}/天</span>
                  )}
                </div>
                <div className="flex gap-1.5 mt-2">
                  {!shop.unlocked ? (
                    <button onClick={() => buyShop(shop)} disabled={cash < shop.cost}
                      className={clsx("flex-1 py-1.5 rounded-lg text-[11px] font-bold transition",
                        cash >= shop.cost ? "bg-[#f0b90b] text-[#0f0f0f]" : "bg-[#333] text-[#666]"
                      )}>开店 ${fmtMoney(shop.cost)}</button>
                  ) : shop.level > 0 ? (
                    <>
                      <button onClick={() => upgradeShop(shop)} disabled={cash < shop.upgradeCost * shop.level}
                        className={clsx("flex-1 py-1.5 rounded-lg text-[11px] border transition",
                          cash >= shop.upgradeCost * shop.level ? "border-[#3ea6ff]/30 text-[#3ea6ff]" : "border-[#333] text-[#666]"
                        )}>升级 ${fmtMoney(shop.upgradeCost * shop.level)}</button>
                      <button onClick={() => hireStaff(shop)} disabled={cash < 100 * (shop.staff + 1) || shop.staff >= 5}
                        className={clsx("py-1.5 px-3 rounded-lg text-[11px] border transition",
                          cash >= 100 * (shop.staff + 1) && shop.staff < 5 ? "border-[#a855f7]/30 text-[#a855f7]" : "border-[#333] text-[#666]"
                        )}>雇人</button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "invest" && (
          <div className="space-y-2">
            {investments.map(inv => (
              <div key={inv.id} className={clsx("p-3 rounded-xl border", inv.active ? "bg-[#f0b90b]/5 border-[#f0b90b]/20" : "bg-[#1a1a1a] border-[#333]")}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold">{inv.emoji} {inv.name}</span>
                  <span className="text-[11px] text-[#8a8a8a]">回报率 x{inv.returnRate} · {inv.duration}天</span>
                </div>
                {inv.active ? (
                  <div>
                    <div className="h-1.5 bg-[#333] rounded-full overflow-hidden">
                      <div className="h-full bg-[#f0b90b] rounded-full transition-all" style={{ width: `${(inv.progress / inv.duration) * 100}%` }} />
                    </div>
                    <p className="text-[10px] text-[#8a8a8a] mt-1">{inv.progress}/{inv.duration}天 · 预计回收 ${fmtMoney(Math.floor(inv.cost * inv.returnRate))}</p>
                  </div>
                ) : (
                  <button onClick={() => invest(inv)} disabled={cash < inv.cost}
                    className={clsx("w-full py-1.5 rounded-lg text-[11px] font-bold mt-1 transition",
                      cash >= inv.cost ? "bg-[#f0b90b] text-[#0f0f0f]" : "bg-[#333] text-[#666]"
                    )}>投资 ${fmtMoney(inv.cost)}</button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "stats" && (
          <div className="space-y-2 text-[12px]">
            <div className="p-3 rounded-xl bg-[#1a1a1a] border border-[#333]">
              <h3 className="font-bold mb-2">📊 经营数据</h3>
              <div className="space-y-1 text-[#aaa]">
                <p>经营天数：{day}天</p>
                <p>店铺数量：{shops.filter(s => s.level > 0).length}/{shops.length}</p>
                <p>总员工数：{shops.reduce((s, sh) => s + sh.staff, 0)}人</p>
                <p>日收入：${fmtMoney(totalIncome)}</p>
                <p>总资产：${fmtMoney(totalAssets)}</p>
                <p>声望值：{reputation}</p>
                <p>活跃投资：{investments.filter(i => i.active).length}项</p>
              </div>
            </div>
          </div>
        )}

        {/* 下一天 */}
        <button onClick={nextDay} className="w-full mt-4 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition active:scale-95">
          <i className="fas fa-sun mr-1.5" />下一天
        </button>

        {/* 日志 */}
        <div className="mt-3 h-24 overflow-y-auto rounded-xl bg-[#0a0a0a] border border-[#333] p-3 text-[11px] text-[#8a8a8a] space-y-0.5">
          {log.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      </main>
    </>
  );
}
