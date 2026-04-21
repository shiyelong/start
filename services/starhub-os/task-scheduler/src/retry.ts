// retry.ts — 重试退避机制
// 实现指数退避策略：1分钟 → 5分钟 → 30分钟，3次均失败后放弃（跳过步骤）
// 支持管理员手动重试任意步骤

import { getStepsByTask, updateStepStatus, db } from './db.js';
import type { TaskStep } from './types.js';

// ── 退避时间表（毫秒） ────────────────────────────────

/** 退避延迟映射：重试次数 → 延迟毫秒数 */
const BACKOFF_TABLE: Record<number, number> = {
  0: 60_000,      // 第 0 次重试：1 分钟
  1: 300_000,     // 第 1 次重试：5 分钟
  2: 1_800_000,   // 第 2 次重试：30 分钟
};

/** 最大重试次数（超过此值放弃重试） */
const MAX_RETRIES = 3;

// ── 退避计算 ──────────────────────────────────────────

/**
 * 计算重试退避延迟
 * 根据当前重试次数返回对应的延迟毫秒数
 *
 * @param retryCount 当前重试次数（从 0 开始）
 * @returns 延迟毫秒数，-1 表示放弃重试
 */
export function calculateBackoffDelay(retryCount: number): number {
  // 重试次数 >= 3 时放弃
  if (retryCount >= MAX_RETRIES) {
    return -1;
  }

  // 查表返回对应延迟
  return BACKOFF_TABLE[retryCount] ?? -1;
}

// ── 重试决策 ──────────────────────────────────────────

/** shouldRetryStep 的返回值 */
export interface RetryDecision {
  /** 是否应该重试 */
  shouldRetry: boolean;
  /** 重试延迟毫秒数（仅当 shouldRetry 为 true 时有意义） */
  delay: number;
}

/**
 * 判断某个步骤是否应该重试
 * 根据步骤的 retry_count 决定是否继续重试以及延迟时间
 *
 * @param step 任务步骤对象
 * @returns 重试决策（是否重试 + 延迟时间）
 */
export function shouldRetryStep(step: TaskStep): RetryDecision {
  const delay = calculateBackoffDelay(step.retry_count);

  if (delay === -1) {
    // 重试次数已耗尽，放弃
    return { shouldRetry: false, delay: -1 };
  }

  return { shouldRetry: true, delay };
}

// ── 重试计数递增 ──────────────────────────────────────

/** 预编译的重试计数递增语句 */
const stmtIncrementRetry = db.prepare(`
  UPDATE task_steps SET retry_count = retry_count + 1 WHERE id = ?
`);

/**
 * 递增步骤的重试计数
 * 在数据库中将指定步骤的 retry_count + 1
 *
 * @param stepId 步骤 ID
 */
export function incrementStepRetry(stepId: string): void {
  stmtIncrementRetry.run(stepId);
}

// ── 辅助函数 ──────────────────────────────────────────

/**
 * 获取步骤当前的重试信息
 * 返回步骤的重试次数和下一次重试的延迟
 *
 * @param taskId 任务 ID
 * @param stepNumber 步骤编号（从 1 开始）
 * @returns 重试决策，步骤不存在时返回 null
 */
export function getStepRetryInfo(
  taskId: string,
  stepNumber: number,
): RetryDecision | null {
  const steps = getStepsByTask(taskId);
  const step = steps.find((s) => s.step_number === stepNumber);

  if (!step) {
    return null;
  }

  return shouldRetryStep(step);
}
