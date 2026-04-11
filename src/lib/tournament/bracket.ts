// =============================================================================
// Tournament Bracket Generation — Single Elimination
// Requirements: 27.1-27.8
// =============================================================================

import type { TournamentMatch } from '@/lib/types';

export type BracketSize = 4 | 8 | 16 | 32;

export interface BracketRound {
  round: number;
  matches: TournamentMatch[];
}

/**
 * Generate a single-elimination bracket for the given participants.
 * Participants are randomly seeded. Returns rounds with matches.
 */
export function generateBracket(
  tournamentId: string,
  participantIds: string[],
  maxParticipants: BracketSize,
): BracketRound[] {
  // Shuffle participants for random seeding
  const seeded = [...participantIds];
  for (let i = seeded.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [seeded[i], seeded[j]] = [seeded[j], seeded[i]];
  }

  // Pad with byes if fewer participants than max
  while (seeded.length < maxParticipants) {
    seeded.push(''); // empty = bye
  }

  const totalRounds = Math.log2(maxParticipants);
  const rounds: BracketRound[] = [];

  // Round 1: pair up seeded participants
  const round1Matches: TournamentMatch[] = [];
  for (let i = 0; i < seeded.length; i += 2) {
    const p1 = seeded[i] || undefined;
    const p2 = seeded[i + 1] || undefined;

    // If one player is a bye, the other auto-advances
    let winnerId: string | undefined;
    let status: TournamentMatch['status'] = 'pending';
    if (p1 && !p2) {
      winnerId = p1;
      status = 'completed';
    } else if (!p1 && p2) {
      winnerId = p2;
      status = 'completed';
    } else if (!p1 && !p2) {
      status = 'completed';
    }

    round1Matches.push({
      id: crypto.randomUUID(),
      tournamentId,
      round: 1,
      matchIndex: i / 2,
      player1Id: p1,
      player2Id: p2,
      winnerId,
      status,
    });
  }
  rounds.push({ round: 1, matches: round1Matches });

  // Subsequent rounds: create empty match slots
  let prevMatchCount = round1Matches.length;
  for (let r = 2; r <= totalRounds; r++) {
    const matchCount = prevMatchCount / 2;
    const matches: TournamentMatch[] = [];
    for (let m = 0; m < matchCount; m++) {
      matches.push({
        id: crypto.randomUUID(),
        tournamentId,
        round: r,
        matchIndex: m,
        status: 'pending',
      });
    }
    rounds.push({ round: r, matches });
    prevMatchCount = matchCount;
  }

  // Auto-advance byes into round 2
  if (rounds.length > 1) {
    advanceByes(rounds);
  }

  return rounds;
}

/**
 * Advance winners from bye matches into the next round.
 */
function advanceByes(rounds: BracketRound[]): void {
  const r1 = rounds[0];
  const r2 = rounds[1];
  if (!r1 || !r2) return;

  for (let i = 0; i < r1.matches.length; i += 2) {
    const m1 = r1.matches[i];
    const m2 = r1.matches[i + 1];
    const targetMatch = r2.matches[Math.floor(i / 2)];
    if (!targetMatch) continue;

    if (m1?.winnerId) targetMatch.player1Id = m1.winnerId;
    if (m2?.winnerId) targetMatch.player2Id = m2.winnerId;

    // If both slots filled via byes and one is empty, auto-advance
    if (targetMatch.player1Id && !targetMatch.player2Id) {
      targetMatch.winnerId = targetMatch.player1Id;
      targetMatch.status = 'completed';
    } else if (!targetMatch.player1Id && targetMatch.player2Id) {
      targetMatch.winnerId = targetMatch.player2Id;
      targetMatch.status = 'completed';
    }
  }
}

/**
 * Record a match result and advance the winner to the next round.
 * Returns the updated rounds.
 */
export function recordMatchResult(
  rounds: BracketRound[],
  matchId: string,
  winnerId: string,
): BracketRound[] {
  for (let r = 0; r < rounds.length; r++) {
    const round = rounds[r];
    const matchIdx = round.matches.findIndex((m) => m.id === matchId);
    if (matchIdx === -1) continue;

    const match = round.matches[matchIdx];
    match.winnerId = winnerId;
    match.status = 'completed';
    match.completedAt = new Date().toISOString();

    // Advance winner to next round
    const nextRound = rounds[r + 1];
    if (nextRound) {
      const nextMatchIdx = Math.floor(matchIdx / 2);
      const nextMatch = nextRound.matches[nextMatchIdx];
      if (nextMatch) {
        if (matchIdx % 2 === 0) {
          nextMatch.player1Id = winnerId;
        } else {
          nextMatch.player2Id = winnerId;
        }
      }
    }

    break;
  }

  return rounds;
}

/**
 * Get the total number of rounds for a bracket size.
 */
export function getTotalRounds(size: BracketSize): number {
  return Math.log2(size);
}
