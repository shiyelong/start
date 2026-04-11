import Header from "@/components/Header";
import { games } from "@/lib/mock-data";
import Link from "next/link";

export default function GamesPage() {
  return (
    <>
      <Header />
      <main className="max-w-[1000px] mx-auto px-4 py-6 pb-20 md:pb-8">
        <h1 className="text-2xl font-bold mb-2"><i className="fas fa-gamepad mr-2" />游戏中心</h1>
        <p className="text-muted text-sm mb-6">手机电脑都能玩，随时随地开一局</p>

        {/* 经典游戏 Section */}
        <div className="mb-8">
          <h2 className="text-lg font-bold mb-3">🎮 经典游戏</h2>
          <Link
            href="/games/classic"
            className="group flex items-center gap-4 p-5 rounded-xl bg-gradient-to-br from-purple-600/20 to-blue-600/20 border border-purple-500/20 hover:border-accent/40 hover:-translate-y-0.5 transition overflow-hidden"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-2xl shrink-0 group-hover:scale-110 transition-transform shadow-lg">
              🕹️
            </div>
            <div>
              <h3 className="font-semibold text-sm">经典主机模拟器</h3>
              <p className="text-xs text-muted mt-1">
                FC / SFC / GBA / 街机等11种经典主机，上传ROM在线畅玩，支持联机对战
              </p>
            </div>
          </Link>
        </div>

        <h2 className="text-lg font-bold mb-3">🎯 休闲游戏</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {games.map(g => (
            <Link key={g.id} href={`/games/${g.id}`} className="group relative p-5 rounded-xl bg-bg-card/50 border border-border hover:border-accent/30 hover:-translate-y-1 transition text-center overflow-hidden">
              {g.hot && <span className="absolute top-2 right-2 text-[10px] bg-danger text-white px-1.5 py-0.5 rounded font-bold">HOT</span>}
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${g.color} flex items-center justify-center text-2xl mx-auto mb-3 group-hover:scale-110 transition-transform shadow-lg`}>
                <i className={`fas ${g.icon}`} />
              </div>
              <h3 className="font-semibold text-sm">{g.name}</h3>
              <p className="text-xs text-muted mt-1">{g.desc}</p>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
