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
