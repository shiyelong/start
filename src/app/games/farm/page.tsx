"use client";
import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Link from "next/link";

interface Plot {
  id: number;
  state: "empty" | "planted" | "growing" | "ready";
  crop: string;
  plantedAt: number;
  growTime: number;
}

const CROPS = [
  { name: "白菜", icon: "菜", growTime: 8, sell: 10, cost: 2 },
  { name: "胡萝卜", icon: "萝", growTime: 15, sell: 25, cost: 5 },
  { name: "番茄", icon: "番", growTime: 25, sell: 50, cost: 10 },
  { name: "草莓", icon: "莓", growTime: 40, sell: 100, cost: 20 },
  { name: "西瓜", icon: "瓜", growTime: 60, sell: 200, cost: 40 },
];

export default function FarmGame() {
  const [coins, setCoins] = useState(50);
  const [plots, setPlots] = useState<Plot[]>(
    Array.from({ length: 9 }, (_, i) => ({ id: i, state: "empty" as const, crop: "", plantedAt: 0, growTime: 0 }))
  );
  const [selectedCrop, setSelectedCrop] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [harvested, setHarvested] = useState(0);
  const [showShop, setShowShop] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);

  // Update growth
  useEffect(() => {
    const iv = setInterval(() => {
      setPlots(prev => prev.map(p => {
        if (p.state === "planted" || p.state === "growing") {
          const elapsed = (Date.now() - p.plantedAt) / 1000;
          if (elapsed >= p.growTime) return { ...p, state: "ready" as const };
          if (elapsed >= p.growTime * 0.3) return { ...p, state: "growing" as const };
        }
        return p;
      }));
    }, 500);
    return () => clearInterval(iv);
  }, []);

  const plant = (plotId: number) => {
    const crop = CROPS[selectedCrop];
    if (coins < crop.cost) return;
    if (plots[plotId].state !== "empty") return;
    setCoins(c => c - crop.cost);
    setPlots(prev => prev.map(p =>
      p.id === plotId ? { ...p, state: "planted" as const, crop: crop.icon, plantedAt: Date.now(), growTime: crop.growTime } : p
    ));
  };

  const harvest = (plotId: number) => {
    const plot = plots[plotId];
    if (plot.state !== "ready") return;
    const crop = CROPS.find(c => c.icon === plot.crop);
    const earn = crop?.sell || 10;
    setCoins(c => c + earn);
    setTotalEarned(t => t + earn);
    setHarvested(h => h + 1);
    setFlash(plotId);
    setTimeout(() => setFlash(null), 500);
    setPlots(prev => prev.map(p =>
      p.id === plotId ? { ...p, state: "empty" as const, crop: "", plantedAt: 0, growTime: 0 } : p
    ));
  };

  const tapPlot = (plotId: number) => {
    const plot = plots[plotId];
    if (plot.state === "empty") plant(plotId);
    else if (plot.state === "ready") harvest(plotId);
  };

  const getProgress = (p: Plot) => {
    if (p.state === "empty" || p.state === "ready") return 100;
    const elapsed = (Date.now() - p.plantedAt) / 1000;
    return Math.min(100, (elapsed / p.growTime) * 100);
  };

  const getPlotDisplay = (p: Plot) => {
    if (p.state === "ready") return p.crop;
    if (p.state === "growing") return <i className="fas fa-seedling text-green-400" />;
    if (p.state === "planted") return <span className="text-muted">{'\u00B7'}</span>;
    return "";
  };

  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-6 pb-20 md:pb-8">
        <Link href="/games" className="text-sm text-muted hover:text-white mb-4 inline-block">← 返回</Link>
        <h1 className="text-2xl font-bold mb-1 text-center"><i className="fas fa-seedling mr-2" />开心农场</h1>
        <p className="text-xs text-muted text-center mb-4">种菜 → 等待 → 收获 → 赚金币！</p>

        {/* Stats */}
        <div className="flex justify-center gap-3 mb-4 text-sm">
          <span className="px-3 py-1 rounded-full bg-warn/15 text-warn font-bold"><i className="fas fa-coins mr-1" />{coins}</span>
          <span className="px-3 py-1 rounded-full bg-success/15 text-success font-bold"><i className="fas fa-wheat-awn mr-1" />{harvested}</span>
          <span className="px-3 py-1 rounded-full bg-accent/15 text-accent font-bold"><i className="fas fa-chart-line mr-1" />{totalEarned}</span>
        </div>

        {/* Crop selector */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold">选择种子</span>
            <button onClick={() => setShowShop(!showShop)} className="text-xs text-accent">{showShop ? "收起" : "展开"} ▾</button>
          </div>
          {showShop && (
            <div className="grid grid-cols-5 gap-2 mb-2 animate-slide-up">
              {CROPS.map((c, i) => (
                <button key={c.name} onClick={() => setSelectedCrop(i)} className={`p-2 rounded-xl text-center transition border ${
                  selectedCrop === i ? "border-accent bg-accent/10" : "border-border bg-bg-card hover:border-accent/30"
                } ${coins < c.cost ? "opacity-40" : ""}`}>
                  <div className="text-xl">{c.icon}</div>
                  <div className="text-[10px] text-muted">{c.name}</div>
                  <div className="text-[10px] text-warn font-bold">{c.cost}<i className="fas fa-coins ml-0.5" /></div>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 p-2 rounded-lg bg-bg-card border border-border text-sm">
            <span className="text-xl">{CROPS[selectedCrop].icon}</span>
            <span className="font-medium">{CROPS[selectedCrop].name}</span>
            <span className="text-muted">|</span>
            <span className="text-warn text-xs">成本 {CROPS[selectedCrop].cost}<i className="fas fa-coins ml-0.5" /></span>
            <span className="text-success text-xs">卖 {CROPS[selectedCrop].sell}<i className="fas fa-coins ml-0.5" /></span>
            <span className="text-muted text-xs"><i className="fas fa-clock mr-0.5" />{CROPS[selectedCrop].growTime}s</span>
          </div>
        </div>

        {/* Farm grid */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {plots.map(p => {
            const progress = getProgress(p);
            return (
              <button key={p.id} onClick={() => tapPlot(p.id)} className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center text-3xl transition-all active:scale-95 border-2 ${
                flash === p.id ? "bg-warn/20 border-warn scale-105" :
                p.state === "ready" ? "bg-success/10 border-success animate-pulse" :
                p.state === "empty" ? "bg-bg-card border-border hover:border-accent/40" :
                "bg-bg-card border-border"
              }`}>
                {p.state === "empty" ? (
                  <span className="text-2xl text-muted/30">+</span>
                ) : (
                  <>
                    <span>{getPlotDisplay(p)}</span>
                    {(p.state === "planted" || p.state === "growing") && (
                      <div className="absolute bottom-2 left-2 right-2 h-1.5 bg-bg rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                      </div>
                    )}
                    {p.state === "ready" && <span className="text-[10px] text-success font-bold mt-1">收获!</span>}
                  </>
                )}
              </button>
            );
          })}
        </div>

        <div className="text-center text-xs text-muted">
          点空地种菜 | 点成熟作物收获 | 高级作物利润更高
        </div>
      </main>
    </>
  );
}
