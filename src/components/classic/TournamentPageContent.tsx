'use client';

import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import TournamentBracket from '@/components/classic/TournamentBracket';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export default function TournamentPage() {
  const params = useParams();
  const tournamentId = params?.['tournament-id'] as string;

  if (!tournamentId) {
    return (
      <>
        <Header />
        <div className="py-12 text-center text-gray-400">无效的锦标赛 ID</div>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-20 md:pb-8">
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

        <TournamentBracket tournamentId={tournamentId} />
      </main>
    </>
  );
}
