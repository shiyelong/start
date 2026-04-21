// dependency.property.test.ts — 任务依赖触发正确性属性测试
// Property 14: 任务依赖触发正确性 — 仅触发所有前置依赖已完成的后续任务
//
// **Validates: Requirements 31.7**

import { describe, it, expect, afterAll } from 'vitest';
import fc from 'fast-check';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';

// ── 临时数据库初始化 ──────────────────────────────────

const TEST_DB_PATH = join(tmpdir(), `test-dep-prop-${Date.now()}.db`);
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
const { shouldTriggerDependentTask } = await import('./queue.js');
const dbModule = await import('./db.js');

// ── 测试生命周期 ──────────────────────────────────────

afterAll(() => {
  dbModule.db.close();
  try { unlinkSync(TEST_DB_PATH); } catch { /* 忽略 */ }
  try { unlinkSync(TEST_DB_PATH + '-wal'); } catch { /* 忽略 */ }
  try { unlinkSync(TEST_DB_PATH + '-shm'); } catch { /* 忽略 */ }
});

// ── 生成器 ────────────────────────────────────────────

// 所有可能的任务状态
const ALL_STATUSES = ['pending', 'processing', 'completed', 'failed', 'cancelled'] as const;

// 生成随机任务状态
const arbStatus = fc.constantFrom(...ALL_STATUSES);

// 生成前置任务状态数组
const arbPrerequisites = fc.array(arbStatus, { minLength: 0, maxLength: 20 });

// 生成全部为 completed 的前置任务状态数组
const arbAllCompleted = fc.array(fc.constant('completed' as const), { minLength: 1, maxLength: 20 });

// 生成至少包含一个非 completed 状态的前置任务数组
function arbWithNonCompleted(): fc.Arbitrary<string[]> {
  return fc.tuple(
    // 至少一个非 completed 状态
    fc.constantFrom('pending', 'processing', 'failed', 'cancelled'),
    // 其余可以是任意状态
    fc.array(arbStatus, { minLength: 0, maxLength: 19 }),
  ).map(([nonCompleted, rest]) => {
    // 随机插入非 completed 状态
    const arr = [...rest];
    const insertAt = Math.floor(Math.random() * (arr.length + 1));
    arr.splice(insertAt, 0, nonCompleted);
    return arr;
  });
}

// ── Property 14: 任务依赖触发正确性 ──────────────────

describe('Property 14: 任务依赖触发正确性', () => {
  // 属性 14.1: 所有前置任务 completed 时触发
  it('所有前置任务 completed 时返回 true', () => {
    fc.assert(
      fc.property(arbAllCompleted, (prerequisites) => {
        expect(shouldTriggerDependentTask(prerequisites)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  // 属性 14.2: 存在非 completed 的前置任务时不触发
  it('存在非 completed 的前置任务时返回 false', () => {
    fc.assert(
      fc.property(arbWithNonCompleted(), (prerequisites) => {
        expect(shouldTriggerDependentTask(prerequisites)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  // 属性 14.3: 空前置依赖列表时直接触发
  it('空前置依赖列表时返回 true', () => {
    expect(shouldTriggerDependentTask([])).toBe(true);
  });

  // 属性 14.4: 单个 completed 前置任务时触发
  it('单个 completed 前置任务时返回 true', () => {
    expect(shouldTriggerDependentTask(['completed'])).toBe(true);
  });

  // 属性 14.5: 单个非 completed 前置任务时不触发
  it('单个非 completed 前置任务时返回 false', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('pending', 'processing', 'failed', 'cancelled'),
        (status) => {
          expect(shouldTriggerDependentTask([status])).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  // 属性 14.6: 结果与 every(s => s === 'completed') 等价
  it('结果与 every(s => s === "completed") 等价', () => {
    fc.assert(
      fc.property(arbPrerequisites, (prerequisites) => {
        const expected = prerequisites.length === 0 || prerequisites.every((s) => s === 'completed');
        expect(shouldTriggerDependentTask(prerequisites)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  // 属性 14.7: 添加一个非 completed 状态到全 completed 列表后不再触发
  it('添加非 completed 状态到全 completed 列表后不再触发', () => {
    fc.assert(
      fc.property(
        arbAllCompleted,
        fc.constantFrom('pending', 'processing', 'failed', 'cancelled'),
        (completedList, nonCompleted) => {
          // 全 completed 时应触发
          expect(shouldTriggerDependentTask(completedList)).toBe(true);

          // 添加一个非 completed 后不应触发
          const withNonCompleted = [...completedList, nonCompleted];
          expect(shouldTriggerDependentTask(withNonCompleted)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
