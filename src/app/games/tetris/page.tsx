"use client";
import Header from "@/components/Header";
import Link from "next/link";

export default function TetrisPage() {
  return (
    <>
      <Header />
      <main className="max-w-md mx-auto px-4 py-6 pb-20 md:pb-8 text-center">
        <Link href="/games" className="text-sm text-muted hover:text-white mb-4 inline-block float-left">← 返回</Link>
        <div className="clear-both" />
        <h1 className="text-2xl font-bold mb-4"><i className="fas fa-cubes mr-2" />俄罗斯方块</h1>
        <div className="p-8 rounded-2xl bg-bg-card border border-border">
          <i className="fas fa-cubes text-6xl mb-4 text-purple-400" />
          <p className="text-subtle mb-4">经典俄罗斯方块</p>
          <p className="text-muted text-sm mb-6">即将上线，敬请期待！</p>
          <Link href="/games" className="px-6 py-2 rounded-lg bg-accent text-bg font-semibold text-sm hover:bg-accent-hover transition">玩其他游戏</Link>
        </div>
      </main>
    </>
  );
}
