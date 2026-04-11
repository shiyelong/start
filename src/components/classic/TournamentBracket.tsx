'use client';

import { useState, useEffect } from 'react';
import { Trophy, Users, Clock, Swords } from 'lucide-react';
import clsx from 'clsx';
import type { Tournament, TournamentMatch } from '@/lib/types';

interface BracketRound {
  round: number;
  matches: TournamentMatch[];
}

interface TournamentBracketProps {
  tournamentId: string;
}

export default function TournamentBracket({ tournamentId }: TournamentBracketProps) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [rounds, setRounds] = useState<BracketRound[]>([]);
  const [participants, setParticipants] = useState<{ userId: string; seed?: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTournament();
  }, [tournamentId]);

  const fetchTournament = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/classic/tournament/${tournamentId}`);
      if (!res.ok) throw new Error('加载失败');
      const data = (await res.json()) as {
        tournament?: Tournament;
        rounds?: BracketRound[];
        participants?: { userId: string; seed?: number }[];
      };
      setTournament(data.tournament ?? null);
      setRounds(data.rounds ?? []);
      setParticipants(data.participants ?? []);
    } catch {
      setError('无法加载锦标赛信息');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Clock className="mr-2 h-5 w-5 animate-spin" />
        加载中...
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="py-12 text-center text-red-400">{error || '锦标赛不存在'}</div>
    );
  }

  const statusLabel: Record<string, string> = {
    registration: '报名中',
    active: '进行中',
    completed: '已结束',
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6 text-yellow-400" />
          <h1 className="text-xl font-bold text-white">{tournament.name}</h1>
          <span
            className={clsx(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              tournament.status === 'registration' && 'bg-blue-600/30 text-blue-300',
              tournament.status === 'active' && 'bg-green-600/30 text-green-300',
              tournament.status === 'completed' && 'bg-gray-600/30 text-gray-300',
            )}
          >
            {statusLabel[tournament.status] ?? tournament.status}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {participants.length}/{tournament.maxParticipants} 参赛者
          </span>
          <span>{tournament.platform}</span>
          <span>{tournament.matchFormat === 'bo3' ? 'BO3' : 'BO1'}</span>
        </div>
      </div>

      {/* Bracket visualization */}
      <div className="overflow-x-auto">
        <div className="flex gap-8 pb-4" style={{ minWidth: rounds.length * 220 }}>
          {rounds.map((round) => (
            <div key={round.round} className="flex flex-col gap-4" style={{ minWidth: 200 }}>
              <h3 className="text-center text-sm font-semibold text-gray-300">
                {round.round === rounds.length ? '决赛' : `第 ${round.round} 轮`}
              </h3>
              <div
                className="flex flex-col justify-around gap-4"
                style={{ minHeight: round.matches.length * 80 }}
              >
                {round.matches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="rounded-lg bg-gray-800 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-200">
          <Swords className="h-4 w-4" />
          排行榜
        </h3>
        <div className="flex flex-col gap-1 text-sm">
          {participants.map((p, i) => (
            <div key={p.userId} className="flex items-center justify-between rounded px-2 py-1 text-gray-300 odd:bg-gray-700/30">
              <span>#{i + 1} {p.userId.slice(0, 8)}...</span>
              {p.seed != null && <span className="text-xs text-gray-500">种子 {p.seed}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MatchCard
// ---------------------------------------------------------------------------

function MatchCard({ match }: { match: TournamentMatch }) {
  const statusColors: Record<string, string> = {
    pending: 'border-gray-600',
    active: 'border-yellow-500',
    completed: 'border-green-600',
    forfeit: 'border-red-600',
  };

  return (
    <div
      className={clsx(
        'rounded-lg border bg-gray-800/80 p-2 text-xs',
        statusColors[match.status] ?? 'border-gray-600',
      )}
    >
      <div
        className={clsx(
          'flex items-center justify-between rounded px-2 py-1',
          match.winnerId === match.player1Id && 'bg-green-900/30',
        )}
      >
        <span className="truncate text-gray-200">
          {match.player1Id ? match.player1Id.slice(0, 8) + '...' : '待定'}
        </span>
        {match.winnerId === match.player1Id && <Trophy className="h-3 w-3 text-yellow-400" />}
      </div>
      <div className="my-0.5 border-t border-gray-700" />
      <div
        className={clsx(
          'flex items-center justify-between rounded px-2 py-1',
          match.winnerId === match.player2Id && 'bg-green-900/30',
        )}
      >
        <span className="truncate text-gray-200">
          {match.player2Id ? match.player2Id.slice(0, 8) + '...' : '待定'}
        </span>
        {match.winnerId === match.player2Id && <Trophy className="h-3 w-3 text-yellow-400" />}
      </div>
    </div>
  );
}
