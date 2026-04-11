'use client';

import Header from '@/components/Header';
import PlayerProfilePage from '@/components/classic/PlayerProfile';
import { useAuth } from '@/lib/auth';
import { User } from 'lucide-react';
import Link from 'next/link';

export default function ProfilePage() {
  const { user, isLoggedIn } = useAuth();

  if (!isLoggedIn || !user) {
    return (
      <>
        <Header />
        <main className="max-w-[800px] mx-auto px-4 py-16 text-center">
          <User size={48} className="mx-auto mb-4 text-muted/40" />
          <h2 className="text-lg font-bold mb-2">请先登录</h2>
          <p className="text-muted text-sm mb-6">登录后可查看你的游戏资料和成就</p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-[#0f0f0f] text-sm font-semibold hover:bg-accent-hover transition"
          >
            去登录
          </Link>
        </main>
      </>
    );
  }

  const userId = String(user.id || user.username || '');

  return (
    <>
      <Header />
      <main className="max-w-[1000px] mx-auto px-4 py-6 pb-20 md:pb-8">
        <PlayerProfilePage userId={userId} />
      </main>
    </>
  );
}
