'use client';

import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import LobbyBrowser from '@/components/classic/LobbyBrowser';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export default function LobbyPage() {
  const router = useRouter();

  const handleJoinRoom = (roomCode: string) => {
    // Navigate to the game session page with room code as query param
    router.push(`/games/classic/lobby?join=${roomCode}`);
  };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-4">
          <Link
            href="/games/classic"
            className="flex items-center gap-1 text-sm text-muted hover:text-accent transition"
          >
            <ChevronLeft size={16} />
            <span>经典游戏</span>
          </Link>
        </div>

        <LobbyBrowser onJoinRoom={handleJoinRoom} />
      </main>
    </>
  );
}
