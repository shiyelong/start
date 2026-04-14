// =============================================================================
// AutoPlayEngine — 自动播放引擎
// =============================================================================

import type { AggregatedItem } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Reason why a candidate was selected for autoplay */
export type AutoPlayReason = 'next-episode' | 'same-channel' | 'recommended';

/** Priority values for each reason (higher = plays first) */
export const REASON_PRIORITY: Record<AutoPlayReason, number> = {
  'next-episode': 3,
  'same-channel': 2,
  recommended: 1,
} as const;

/** A candidate item for autoplay with its selection reason and priority */
export interface AutoPlayCandidate {
  item: AggregatedItem;
  reason: AutoPlayReason;
  priority: number;
}

/** Configuration for the autoplay engine */
export interface AutoPlayConfig {
  enabled: boolean;
  countdownSeconds: number;
}

/** The core autoplay engine interface */
export interface IAutoPlayEngine {
  getNextCandidates(currentItem: AggregatedItem): AutoPlayCandidate[];
  getTopCandidate(candidates: AutoPlayCandidate[]): AutoPlayCandidate | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether `candidate` is a next-episode relative to `current`.
 *
 * Heuristic: same source, same type, metadata contains an `episode` field
 * whose numeric value is exactly one greater than the current item's episode.
 */
function isNextEpisode(
  current: AggregatedItem,
  candidate: AggregatedItem,
): boolean {
  if (candidate.source !== current.source) return false;
  if (candidate.type !== current.type) return false;

  const currentEp = Number(current.metadata?.episode);
  const candidateEp = Number(candidate.metadata?.episode);

  if (!Number.isFinite(currentEp) || !Number.isFinite(candidateEp)) {
    return false;
  }

  // Also check they belong to the same series (if seriesId is present)
  const currentSeries = current.metadata?.seriesId;
  const candidateSeries = candidate.metadata?.seriesId;
  if (currentSeries && candidateSeries && currentSeries !== candidateSeries) {
    return false;
  }

  return candidateEp === currentEp + 1;
}

/**
 * Checks whether `candidate` is from the same channel / uploader as `current`.
 */
function isSameChannel(
  current: AggregatedItem,
  candidate: AggregatedItem,
): boolean {
  if (candidate.source !== current.source) return false;

  const currentChannel = current.metadata?.channelId ?? current.metadata?.uploader;
  const candidateChannel =
    candidate.metadata?.channelId ?? candidate.metadata?.uploader;

  if (!currentChannel || !candidateChannel) return false;

  return currentChannel === candidateChannel;
}

// ---------------------------------------------------------------------------
// AutoPlayEngine
// ---------------------------------------------------------------------------

export class AutoPlayEngine implements IAutoPlayEngine {
  private pool: AggregatedItem[];

  /**
   * @param pool - The pool of available items to pick candidates from.
   *               In production this would come from an API; here we accept
   *               it as a constructor parameter for testability.
   */
  constructor(pool: AggregatedItem[] = []) {
    this.pool = pool;
  }

  /** Replace the candidate pool (e.g. after fetching fresh recommendations) */
  setPool(pool: AggregatedItem[]): void {
    this.pool = pool;
  }

  /**
   * Given the currently playing item, return a sorted list of autoplay
   * candidates drawn from the pool.
   *
   * Priority order (descending):
   *   1. next-episode  (priority 3)
   *   2. same-channel  (priority 2)
   *   3. recommended   (priority 1)
   *
   * Items that are the same as `currentItem` are excluded.
   * Each item appears at most once, with the highest applicable reason.
   */
  getNextCandidates(currentItem: AggregatedItem): AutoPlayCandidate[] {
    const candidates: AutoPlayCandidate[] = [];

    for (const item of this.pool) {
      // Skip the currently playing item
      if (item.id === currentItem.id) continue;

      let reason: AutoPlayReason;

      if (isNextEpisode(currentItem, item)) {
        reason = 'next-episode';
      } else if (isSameChannel(currentItem, item)) {
        reason = 'same-channel';
      } else {
        reason = 'recommended';
      }

      candidates.push({
        item,
        reason,
        priority: REASON_PRIORITY[reason],
      });
    }

    // Sort by priority descending; ties broken by pool order (stable sort)
    return candidates.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Return the highest-priority candidate from a list, or null if empty.
   */
  getTopCandidate(candidates: AutoPlayCandidate[]): AutoPlayCandidate | null {
    if (candidates.length === 0) return null;

    let top = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      if (candidates[i].priority > top.priority) {
        top = candidates[i];
      }
    }
    return top;
  }
}
