'use client';

import Header from '@/components/Header';
import GameBrowser from '@/components/classic/GameBrowser';
import Link from 'next/link';
import { ChevronLeft, Users, Trophy, User } from 'lucide-react';

export default function ClassicGamesPage() {
  return (
    <>
      <Header />
      <main className="max-w-[1000px] mx-auto px-4 py-6 pb-20 md:pb-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-4">
          <Link
            href="/games"
            className="flex items-center gap-1 text-sm text-muted hover:text-accent transition"
          >
            <ChevronLeft size={16} />
            <span>游戏中心</span>
          </Link>
        </div>

        <h1 className="text-2xl font-bold mb-1">🎮 经典游戏</h1>
        <p className="text-muted text-sm mb-6">
          上传ROM，在浏览器中畅玩FC、SFC、GBA、街机等经典主机游戏
        </p>

        {/* Navigation links to lobby, profile */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Link
            href="/games/classic/lobby"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-bg-card/50 border border-border hover:border-accent/30 hover:-translate-y-0.5 transition text-sm"
          >
            <Users size={16} className="text-blue-400" />
            <span>在线大厅</span>
            <span className="text-[10px] text-muted">浏览公开房间</span>
          </Link>
          <Link
            href="/profile"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-bg-card/50 border border-border hover:border-accent/30 hover:-translate-y-0.5 transition text-sm"
          >
            <User size={16} className="text-green-400" />
            <span>我的资料</span>
            <span className="text-[10px] text-muted">统计与成就</span>
          </Link>
        </div>

        <GameBrowser />
      </main>
    </>
  );
}
