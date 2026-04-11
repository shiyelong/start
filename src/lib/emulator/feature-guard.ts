// =============================================================================
// Feature Guard — blocks single-player-only features in multiplayer/race modes
// Requirements: 14.5, 20.8, 24.7
// =============================================================================

export type SessionMode = 'single' | 'multiplayer' | 'race';
export type Feature = 'saveState' | 'loadState' | 'cheats' | 'speedControl' | 'rewind';

export interface FeatureGuardResult {
  allowed: boolean;
  message?: string;
}

const BLOCKED_MESSAGES: Record<Feature, string> = {
  saveState: '多人模式下无法保存存档',
  loadState: '多人模式下无法读取存档',
  cheats: '多人模式下无法使用作弊码',
  speedControl: '多人模式下无法调整速度',
  rewind: '多人模式下无法使用回退功能',
};

const BLOCKED_MODES: ReadonlySet<SessionMode> = new Set<SessionMode>(['multiplayer', 'race']);

/**
 * Check whether a feature is allowed in the given session mode.
 * In 'single' mode all features are allowed.
 * In 'multiplayer' or 'race' mode, save states, cheats, speed control,
 * and rewind are blocked with a Chinese-language message.
 */
export function checkFeature(mode: SessionMode, feature: Feature): FeatureGuardResult {
  if (BLOCKED_MODES.has(mode)) {
    return { allowed: false, message: BLOCKED_MESSAGES[feature] };
  }
  return { allowed: true };
}

/**
 * Convenience boolean check — returns `true` when the feature is blocked.
 */
export function isFeatureBlocked(mode: SessionMode, feature: Feature): boolean {
  return !checkFeature(mode, feature).allowed;
}
