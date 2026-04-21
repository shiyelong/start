// pipeline.property.test.ts — 流水线步骤属性测试
// Property 5: 流水线步骤顺序不变性 — task_steps 严格按定义顺序排列
// Property 6: 步骤失败降级继续 — 前置步骤失败不终止整个流水线
//
// **Validates: Requirements 7.1, 7.3, 10.1, 15.1, 52, 53, 54, 55, 58.3**

import { describe, it, expect, afterAll } from 'vitest';
import fc from 'fast-check';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';

// ── 临时数据库初始化 ──────────────────────────────────

const TEST_DB_PATH = join(tmpdir(), `test-pipeline-prop-${Date.now()}.db`);
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

// 生成随机步骤失败模式（布尔数组，true 表示该步骤失败）
function arbFailurePattern(maxLen: number): fc.Arbitrary<boolean[]> {
  return fc.array(fc.boolean(), { minLength: maxLen, maxLength: maxLen });
}

// ── Property 5: 流水线步骤顺序不变性 ──────────────────

describe('Property 5: 流水线步骤顺序不变性', () => {
  // 属性 5.1: 创建任务后，步骤编号严格单调递增（1, 2, 3, ..., N）
  it('创建任务后，step_number 严格单调递增', () => {
    fc.assert(
      fc.property(arbPipelineType, arbFilePath, (pipelineType, filePath) => {
        const taskId = queueModule.createPipelineTask(pipelineType, filePath);
        const steps = dbModule.getStepsByTask(taskId);

        // 步骤数量与定义一致
        const expectedSteps = queueModule.PIPELINE_STEPS_MAP[pipelineType];
        expect(steps).toHaveLength(expectedSteps.length);

        // step_number 严格单调递增：1, 2, 3, ..., N
        for (let i = 0; i < steps.length; i++) {
          expect(steps[i].step_number).toBe(i + 1);
        }
      }),
      { numRuns: 200 },
    );
  });

  // 属性 5.2: 步骤名称序列与规范定义完全匹配
  it('步骤名称序列与流水线定义完全匹配', () => {
    fc.assert(
      fc.property(arbPipelineType, arbFilePath, (pipelineType, filePath) => {
        const taskId = queueModule.createPipelineTask(pipelineType, filePath);
        const steps = dbModule.getStepsByTask(taskId);
        const expectedSteps = queueModule.PIPELINE_STEPS_MAP[pipelineType];

        // 每个步骤名称与定义完全匹配
        for (let i = 0; i < steps.length; i++) {
          expect(steps[i].step_name).toBe(expectedSteps[i]);
        }
      }),
      { numRuns: 200 },
    );
  });

  // 属性 5.3: 所有步骤初始状态均为 pending
  it('所有步骤初始状态均为 pending', () => {
    fc.assert(
      fc.property(arbPipelineType, arbFilePath, (pipelineType, filePath) => {
        const taskId = queueModule.createPipelineTask(pipelineType, filePath);
        const steps = dbModule.getStepsByTask(taskId);

        for (const step of steps) {
          expect(step.status).toBe('pending');
        }
      }),
      { numRuns: 200 },
    );
  });

  // 属性 5.4: total_steps 与实际步骤数一致
  it('任务的 total_steps 与实际创建的步骤数一致', () => {
    fc.assert(
      fc.property(arbPipelineType, arbFilePath, (pipelineType, filePath) => {
        const taskId = queueModule.createPipelineTask(pipelineType, filePath);
        const task = dbModule.getTask(taskId);
        const steps = dbModule.getStepsByTask(taskId);

        expect(task!.total_steps).toBe(steps.length);
      }),
      { numRuns: 200 },
    );
  });
});

// ── Property 6: 步骤失败降级继续 ──────────────────────

describe('Property 6: 步骤失败降级继续', () => {
  // 属性 6.1: 任意步骤失败后，后续步骤仍可被标记为 completed
  it('任意步骤失败后，后续步骤仍可被标记为 completed', () => {
    fc.assert(
      fc.property(arbPipelineType, arbFilePath, (pipelineType, filePath) => {
        const taskId = queueModule.createPipelineTask(pipelineType, filePath);
        const expectedSteps = queueModule.PIPELINE_STEPS_MAP[pipelineType];
        const totalSteps = expectedSteps.length;

        // 随机选择一个步骤作为失败步骤（不选最后一步，确保有后续步骤）
        if (totalSteps < 2) return; // 至少需要 2 步
        const failStepNumber = Math.floor(Math.random() * (totalSteps - 1)) + 1;

        // 执行到失败步骤之前的所有步骤
        for (let i = 1; i < failStepNumber; i++) {
          queueModule.updateTaskProgress(taskId, i, 'processing');
          queueModule.updateTaskProgress(taskId, i, 'completed');
        }

        // 标记失败步骤
        queueModule.updateTaskProgress(taskId, failStepNumber, 'processing');
        queueModule.updateTaskProgress(taskId, failStepNumber, 'failed', '测试失败');

        // 继续执行后续步骤（降级处理）
        for (let i = failStepNumber + 1; i <= totalSteps; i++) {
          queueModule.updateTaskProgress(taskId, i, 'processing');
          queueModule.updateTaskProgress(taskId, i, 'completed');
        }

        // 验证：后续步骤全部 completed
        const steps = dbModule.getStepsByTask(taskId);
        for (let i = failStepNumber; i < totalSteps; i++) {
          expect(steps[i].status).toBe('completed');
        }

        // 验证：失败步骤仍为 failed
        expect(steps[failStepNumber - 1].status).toBe('failed');

        // 验证：任务最终标记为 completed（降级完成）
        const task = dbModule.getTask(taskId);
        expect(task!.status).toBe('completed');
        expect(task!.error_message).toContain('降级完成');
      }),
      { numRuns: 100 },
    );
  });

  // 属性 6.2: 多个步骤失败时，流水线仍然继续到最后
  // 注意：updateTaskProgress 的 "allDone" 检查仅在 completed/skipped 转换时触发，
  // 因此确保最后一个被更新的步骤是 completed（至少有一个成功步骤在最后触发检查）
  it('多个步骤失败时，流水线仍然继续到最后', () => {
    fc.assert(
      fc.property(
        arbPipelineType,
        arbFilePath,
        fc.integer({ min: 0, max: 0xFFFFFFFF }),
        (pipelineType, filePath, seed) => {
          const taskId = queueModule.createPipelineTask(pipelineType, filePath);
          const expectedSteps = queueModule.PIPELINE_STEPS_MAP[pipelineType];
          const totalSteps = expectedSteps.length;

          // 使用 seed 生成确定性的失败模式
          const failurePattern: boolean[] = [];
          let hasFailure = false;
          for (let i = 0; i < totalSteps; i++) {
            const shouldFail = ((seed >> (i % 32)) & 1) === 1;
            failurePattern.push(shouldFail);
            if (shouldFail) hasFailure = true;
          }

          // 确保至少有一个失败步骤，且最后一步为成功（触发 allDone 检查）
          if (!hasFailure) return;
          failurePattern[totalSteps - 1] = false; // 最后一步成功，确保触发完成检查

          // 按顺序执行所有步骤
          for (let i = 1; i <= totalSteps; i++) {
            queueModule.updateTaskProgress(taskId, i, 'processing');
            if (failurePattern[i - 1]) {
              queueModule.updateTaskProgress(taskId, i, 'failed', `步骤 ${i} 失败`);
            } else {
              queueModule.updateTaskProgress(taskId, i, 'completed');
            }
          }

          // 验证：所有步骤都有最终状态（completed 或 failed），没有 pending
          const steps = dbModule.getStepsByTask(taskId);
          for (let i = 0; i < totalSteps; i++) {
            if (failurePattern[i]) {
              expect(steps[i].status).toBe('failed');
            } else {
              expect(steps[i].status).toBe('completed');
            }
          }

          // 验证：任务最终标记为 completed（降级完成）
          const task = dbModule.getTask(taskId);
          expect(task!.status).toBe('completed');
          expect(task!.error_message).toContain('降级完成');
        },
      ),
      { numRuns: 100 },
    );
  });

  // 属性 6.3: 全部步骤成功时，任务正常完成（无降级标记）
  it('全部步骤成功时，任务正常完成无降级标记', () => {
    fc.assert(
      fc.property(arbPipelineType, arbFilePath, (pipelineType, filePath) => {
        const taskId = queueModule.createPipelineTask(pipelineType, filePath);
        const expectedSteps = queueModule.PIPELINE_STEPS_MAP[pipelineType];

        // 所有步骤成功完成
        for (let i = 1; i <= expectedSteps.length; i++) {
          queueModule.updateTaskProgress(taskId, i, 'processing');
          queueModule.updateTaskProgress(taskId, i, 'completed');
        }

        const task = dbModule.getTask(taskId);
        expect(task!.status).toBe('completed');
        expect(task!.error_message).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
