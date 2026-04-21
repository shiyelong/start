// retry.property.test.ts — 重试退避与崩溃恢复属性测试
// Property 16: 重试退避时间计算 — 第0次=60s, 第1次=300s, 第2次=1800s, n>=3放弃
// Property 15: 崩溃恢复断点续传 — 从最后完成步骤的下一步继续
//
// **Validates: Requirements 58.1, 58.2, 58.6**

import { describe, it, expect, afterAll } from 'vitest';
import fc from 'fast-check';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';

// ── 临时数据库初始化 ──────────────────────────────────

const TEST_DB_PATH = join(tmpdir(), `test-retry-prop-${Date.now()}.db`);
process.env.DB_PATH = TEST_DB_PATH;

function initTestSchema(): void {
  const testDb = new Database(TEST_DB_PATH);
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      priority INTEGER NOT NULL DEFAULT 100, source TEXT, source_url TEXT,
      file_path TEXT NOT NULL, content_id TEXT, content_type TEXT,
      mpaa_rating TEXT DEFAULT 'PG', current_step INTEGER DEFAULT 0,
      total_steps INTEGER, error_message TEXT, retry_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), started_at TEXT,
      completed_at TEXT, metadata TEXT
    );
    CREATE TABLE IF NOT EXISTS task_steps (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      step_number INTEGER NOT NULL, step_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', error_message TEXT,
      retry_count INTEGER DEFAULT 0, started_at TEXT, completed_at TEXT,
      duration_ms INTEGER, output_path TEXT, metadata TEXT
    );
    CREATE TABLE IF NOT EXISTS gpu_lock (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      locked_by TEXT, service TEXT, locked_at TEXT, expires_at TEXT
    );
    INSERT OR IGNORE INTO gpu_lock (id) VALUES (1);
    CREATE TABLE IF NOT EXISTS content_registry (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT,
      mpaa_rating TEXT DEFAULT 'PG', status TEXT DEFAULT 'active',
      duration_sec REAL, resolution TEXT, audio_tracks TEXT,
      subtitle_tracks TEXT, page_count INTEGER, versions TEXT,
      word_count INTEGER, chapter_count INTEGER, modes TEXT,
      artist TEXT, formats TEXT, file_path TEXT NOT NULL,
      thumbnail_path TEXT, source TEXT, source_url TEXT, metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  testDb.close();
}

initTestSchema();

// 动态导入，确保 DB_PATH 已设置
const dbModule = await import('./db.js');
const queueModule = await import('./queue.js');
const retryModule = await import('./retry.js');

// ── 测试生命周期 ──────────────────────────────────────

afterAll(() => {
  dbModule.db.close();
  try { unlinkSync(TEST_DB_PATH); } catch { /* 忽略 */ }
  try { unlinkSync(TEST_DB_PATH + '-wal'); } catch { /* 忽略 */ }
  try { unlinkSync(TEST_DB_PATH + '-shm'); } catch { /* 忽略 */ }
});

// ── 生成器 ────────────────────────────────────────────

// 所有流水线类型
const PIPELINE_TYPES = ['video_pipeline', 'comic_pipeline', 'novel_pipeline', 'audio_pipeline'] as const;

// 生成随机流水线类型
const arbPipelineType = fc.constantFrom(...PIPELINE_TYPES);

// 生成随机文件路径
const arbFilePath = fc.stringMatching(/^\/incoming\/[a-z0-9]{1,12}\.(mp4|zip|txt|flac)$/);

// 生成随机重试次数（覆盖有效范围和超出范围）
const arbRetryCount = fc.integer({ min: 0, max: 100 });

// 生成有效重试次数（0-2，应返回具体延迟）
const arbValidRetryCount = fc.integer({ min: 0, max: 2 });

// 生成超出范围的重试次数（>= 3，应放弃）
const arbExceededRetryCount = fc.integer({ min: 3, max: 100 });

// ── Property 16: 重试退避时间计算 ─────────────────────

describe('Property 16: 重试退避时间计算', () => {
  // 退避时间表常量
  const EXPECTED_DELAYS: Record<number, number> = {
    0: 60_000,     // 1 分钟
    1: 300_000,    // 5 分钟
    2: 1_800_000,  // 30 分钟
  };

  // 属性 16.1: 有效重试次数返回正确的退避延迟
  it('重试次数 0-2 返回正确的退避延迟', () => {
    fc.assert(
      fc.property(arbValidRetryCount, (retryCount) => {
        const delay = retryModule.calculateBackoffDelay(retryCount);
        expect(delay).toBe(EXPECTED_DELAYS[retryCount]);
        expect(delay).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });

  // 属性 16.2: 重试次数 >= 3 返回放弃信号 (-1)
  it('重试次数 >= 3 返回放弃信号 (-1)', () => {
    fc.assert(
      fc.property(arbExceededRetryCount, (retryCount) => {
        const delay = retryModule.calculateBackoffDelay(retryCount);
        expect(delay).toBe(-1);
      }),
      { numRuns: 200 },
    );
  });

  // 属性 16.3: 退避延迟严格单调递增（0 < 1 < 2）
  it('退避延迟严格单调递增', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1 }),
        (retryCount) => {
          const currentDelay = retryModule.calculateBackoffDelay(retryCount);
          const nextDelay = retryModule.calculateBackoffDelay(retryCount + 1);
          // 当前延迟和下一次延迟都有效时，下一次应更大
          if (currentDelay > 0 && nextDelay > 0) {
            expect(nextDelay).toBeGreaterThan(currentDelay);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // 属性 16.4: shouldRetryStep 与 calculateBackoffDelay 一致
  it('shouldRetryStep 决策与 calculateBackoffDelay 一致', () => {
    fc.assert(
      fc.property(arbRetryCount, (retryCount) => {
        // 构造一个模拟步骤对象
        const mockStep = {
          id: 'test-step',
          task_id: 'test-task',
          step_number: 1,
          step_name: 'test',
          status: 'failed',
          error_message: null,
          retry_count: retryCount,
          started_at: null,
          completed_at: null,
          duration_ms: null,
          output_path: null,
          metadata: null,
        };

        const decision = retryModule.shouldRetryStep(mockStep);
        const expectedDelay = retryModule.calculateBackoffDelay(retryCount);

        if (expectedDelay === -1) {
          // 放弃重试
          expect(decision.shouldRetry).toBe(false);
          expect(decision.delay).toBe(-1);
        } else {
          // 应该重试
          expect(decision.shouldRetry).toBe(true);
          expect(decision.delay).toBe(expectedDelay);
        }
      }),
      { numRuns: 200 },
    );
  });

  // 属性 16.5: 精确值验证 — 第 0 次 = 60000ms, 第 1 次 = 300000ms, 第 2 次 = 1800000ms
  it('精确值验证：60000, 300000, 1800000', () => {
    expect(retryModule.calculateBackoffDelay(0)).toBe(60_000);
    expect(retryModule.calculateBackoffDelay(1)).toBe(300_000);
    expect(retryModule.calculateBackoffDelay(2)).toBe(1_800_000);
    expect(retryModule.calculateBackoffDelay(3)).toBe(-1);
  });
});

// ── Property 15: 崩溃恢复断点续传 ────────────────────

describe('Property 15: 崩溃恢复断点续传', () => {
  // 属性 15.1: 恢复后从最后完成步骤的下一步继续
  it('恢复后从最后完成步骤的下一步继续，不重复已完成步骤', () => {
    fc.assert(
      fc.property(
        arbPipelineType,
        arbFilePath,
        (pipelineType, filePath) => {
          // 先清理之前的 processing 任务
          const oldTasks = dbModule.listTasks({ status: 'processing' });
          for (const t of oldTasks) {
            dbModule.updateTaskStatus(t.id, 'completed');
          }

          const taskId = queueModule.createPipelineTask(pipelineType, filePath);
          const expectedSteps = queueModule.PIPELINE_STEPS_MAP[pipelineType];
          const totalSteps = expectedSteps.length;

          // 随机选择完成的步骤数（0 到 totalSteps-1，确保至少有一步未完成）
          const completedCount = Math.floor(Math.random() * totalSteps);

          // 完成前 completedCount 个步骤
          for (let i = 1; i <= completedCount; i++) {
            queueModule.updateTaskProgress(taskId, i, 'processing');
            queueModule.updateTaskProgress(taskId, i, 'completed');
          }

          // 模拟崩溃：将下一步标记为 processing（正在处理时崩溃）
          if (completedCount < totalSteps) {
            queueModule.updateTaskProgress(taskId, completedCount + 1, 'processing');
          }

          // 确保任务状态为 processing
          const taskBefore = dbModule.getTask(taskId);
          expect(taskBefore!.status).toBe('processing');

          // 执行崩溃恢复
          const recoveredCount = queueModule.recoverProcessingTasks();
          expect(recoveredCount).toBe(1);

          // 验证：已完成的步骤保持 completed 状态
          const stepsAfter = dbModule.getStepsByTask(taskId);
          for (let i = 0; i < completedCount; i++) {
            expect(stepsAfter[i].status).toBe('completed');
          }

          // 验证：崩溃时正在处理的步骤被重置为 pending
          if (completedCount < totalSteps) {
            expect(stepsAfter[completedCount].status).toBe('pending');
          }

          // 验证：后续步骤仍为 pending
          for (let i = completedCount + 1; i < totalSteps; i++) {
            expect(stepsAfter[i].status).toBe('pending');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // 属性 15.2: 含 skipped 步骤的恢复也正确处理
  it('含 skipped 步骤的恢复也正确处理', () => {
    fc.assert(
      fc.property(
        arbPipelineType,
        arbFilePath,
        (pipelineType, filePath) => {
          // 先清理之前的 processing 任务
          const oldTasks = dbModule.listTasks({ status: 'processing' });
          for (const t of oldTasks) {
            dbModule.updateTaskStatus(t.id, 'completed');
          }

          const taskId = queueModule.createPipelineTask(pipelineType, filePath);
          const expectedSteps = queueModule.PIPELINE_STEPS_MAP[pipelineType];
          const totalSteps = expectedSteps.length;

          if (totalSteps < 3) return; // 至少需要 3 步

          // 步骤 1 completed，步骤 2 skipped，步骤 3 processing（崩溃）
          queueModule.updateTaskProgress(taskId, 1, 'processing');
          queueModule.updateTaskProgress(taskId, 1, 'completed');

          // 手动将步骤 2 标记为 skipped
          const steps = dbModule.getStepsByTask(taskId);
          dbModule.updateStepStatus(steps[1].id, 'skipped');

          queueModule.updateTaskProgress(taskId, 3, 'processing');

          // 确保任务状态为 processing
          expect(dbModule.getTask(taskId)!.status).toBe('processing');

          // 执行崩溃恢复
          const recoveredCount = queueModule.recoverProcessingTasks();
          expect(recoveredCount).toBe(1);

          // 验证：步骤 1 仍为 completed
          const stepsAfter = dbModule.getStepsByTask(taskId);
          expect(stepsAfter[0].status).toBe('completed');

          // 验证：步骤 2 仍为 skipped（不被重置）
          expect(stepsAfter[1].status).toBe('skipped');

          // 验证：步骤 3 被重置为 pending（崩溃时正在处理）
          expect(stepsAfter[2].status).toBe('pending');
        },
      ),
      { numRuns: 100 },
    );
  });

  // 属性 15.3: 所有步骤已完成时，恢复直接标记任务为 completed
  it('所有步骤已完成时，恢复直接标记任务为 completed', () => {
    fc.assert(
      fc.property(arbPipelineType, arbFilePath, (pipelineType, filePath) => {
        // 先清理之前的 processing 任务
        const oldTasks = dbModule.listTasks({ status: 'processing' });
        for (const t of oldTasks) {
          dbModule.updateTaskStatus(t.id, 'completed');
        }

        const taskId = queueModule.createPipelineTask(pipelineType, filePath);
        const expectedSteps = queueModule.PIPELINE_STEPS_MAP[pipelineType];

        // 完成所有步骤
        for (let i = 1; i <= expectedSteps.length; i++) {
          queueModule.updateTaskProgress(taskId, i, 'processing');
          queueModule.updateTaskProgress(taskId, i, 'completed');
        }

        // 手动将任务状态设回 processing 模拟异常
        dbModule.updateTaskStatus(taskId, 'processing');

        // 执行崩溃恢复
        const recoveredCount = queueModule.recoverProcessingTasks();
        expect(recoveredCount).toBe(1);

        // 验证：任务被标记为 completed
        const task = dbModule.getTask(taskId);
        expect(task!.status).toBe('completed');
      }),
      { numRuns: 100 },
    );
  });
});
