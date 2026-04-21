// gpu-scheduler.property.test.ts — GPU 互斥锁属性测试
// Property 7: GPU 互斥锁不变性 — 任意时刻最多一个任务持有 GPU 锁
// 使用 fast-check 生成随机锁操作序列，验证互斥不变量始终成立
//
// **Validates: Requirements 7.4, 56.3**

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fc from 'fast-check';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';

// ── 临时数据库初始化 ──────────────────────────────────

const TEST_DB_PATH = join(tmpdir(), `test-gpu-prop-${Date.now()}.db`);
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
const { GpuScheduler } = await import('./gpu-scheduler.js');
const dbModule = await import('./db.js');

// ── 测试生命周期 ──────────────────────────────────────

beforeEach(() => {
  dbModule.releaseLock();
});

afterAll(() => {
  dbModule.db.close();
  try { unlinkSync(TEST_DB_PATH); } catch { /* 忽略 */ }
  try { unlinkSync(TEST_DB_PATH + '-wal'); } catch { /* 忽略 */ }
  try { unlinkSync(TEST_DB_PATH + '-shm'); } catch { /* 忽略 */ }
});

// ── 生成器 ────────────────────────────────────────────

// GPU 服务名称池
const GPU_SERVICES = [
  'whisper-api', 'xtts-api', 'sd-api-inpaint',
  'sd-api-txt2img', 'manga-translator', 'ollama', 'tdarr',
];

// 生成合法的任务 ID
const arbTaskId = fc.stringMatching(/^task-[a-z0-9]{1,8}$/);

// 生成 GPU 服务名称
const arbService = fc.constantFrom(...GPU_SERVICES);

// 生成优先级值（0-999，覆盖所有优先级等级）
const arbPriority = fc.integer({ min: 0, max: 999 });

// ── 操作类型定义 ──────────────────────────────────────

interface AcquireOp {
  type: 'acquire';
  taskId: string;
  service: string;
  priority: number;
}

interface ReleaseOp {
  type: 'release';
  taskId: string;
}

type LockOp = AcquireOp | ReleaseOp;

// 生成获取锁操作
const arbAcquireOp: fc.Arbitrary<AcquireOp> = fc.record({
  type: fc.constant('acquire' as const),
  taskId: arbTaskId,
  service: arbService,
  priority: arbPriority,
});

// 生成释放锁操作
const arbReleaseOp: fc.Arbitrary<ReleaseOp> = fc.record({
  type: fc.constant('release' as const),
  taskId: arbTaskId,
});

// 生成混合操作序列
const arbOpSequence: fc.Arbitrary<LockOp[]> = fc.array(
  fc.oneof(arbAcquireOp, arbReleaseOp),
  { minLength: 1, maxLength: 50 },
);

// ── 属性测试 ──────────────────────────────────────────

describe('Property 7: GPU 互斥锁不变性', () => {
  // 属性 7.1: 任意操作序列后，数据库中最多一个任务持有锁
  it('任意操作序列后，最多一个任务持有 GPU 锁', () => {
    fc.assert(
      fc.property(arbOpSequence, (ops) => {
        // 重置锁状态
        dbModule.releaseLock();
        const scheduler = new GpuScheduler();

        // 跟踪当前锁持有者（模型状态）
        let currentHolder: string | null = null;

        for (const op of ops) {
          if (op.type === 'acquire') {
            const acquired = dbModule.acquireLock(
              op.taskId,
              op.service,
              new Date(Date.now() + 3600_000).toISOString(),
            );

            if (currentHolder === null) {
              // 锁空闲时应获取成功
              expect(acquired).toBe(true);
              currentHolder = op.taskId;
            } else {
              // 锁已被占用时应获取失败
              expect(acquired).toBe(false);
            }
          } else {
            // release 操作：仅当释放者是当前持有者时才生效
            if (currentHolder === op.taskId) {
              dbModule.releaseLock();
              currentHolder = null;
            }
            // 非持有者释放不做任何操作（与 GpuScheduler.releaseGpu 行为一致）
          }

          // 不变量检查：数据库锁状态与模型一致
          const lock = dbModule.getLockStatus();
          if (currentHolder === null) {
            expect(lock.locked_by).toBeNull();
          } else {
            expect(lock.locked_by).toBe(currentHolder);
          }
        }

        scheduler.stopExpiryChecker();
      }),
      { numRuns: 200 },
    );
  });

  // 属性 7.2: 锁被持有时，其他任务无法获取
  it('锁被持有时，任何其他任务的获取请求返回失败', () => {
    fc.assert(
      fc.property(
        arbTaskId,
        arbService,
        arbPriority,
        fc.array(
          fc.record({ taskId: arbTaskId, service: arbService, priority: arbPriority }),
          { minLength: 1, maxLength: 20 },
        ),
        (holderId, holderService, holderPriority, challengers) => {
          dbModule.releaseLock();

          // 第一个任务获取锁
          const expiresAt = new Date(Date.now() + 3600_000).toISOString();
          const acquired = dbModule.acquireLock(holderId, holderService, expiresAt);
          expect(acquired).toBe(true);

          // 所有后续获取请求都应失败
          for (const challenger of challengers) {
            const challengerExpires = new Date(Date.now() + 3600_000).toISOString();
            const result = dbModule.acquireLock(
              challenger.taskId,
              challenger.service,
              challengerExpires,
            );
            expect(result).toBe(false);

            // 锁持有者不变
            const lock = dbModule.getLockStatus();
            expect(lock.locked_by).toBe(holderId);
          }

          dbModule.releaseLock();
        },
      ),
      { numRuns: 200 },
    );
  });

  // 属性 7.3: 锁持有者始终是最近一次成功获取锁的任务
  it('锁持有者始终是最近一次成功获取锁的任务', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            taskId: arbTaskId,
            service: arbService,
            priority: arbPriority,
            thenRelease: fc.boolean(),
          }),
          { minLength: 2, maxLength: 30 },
        ),
        (actions) => {
          dbModule.releaseLock();

          // 记录最后一次成功获取锁的任务 ID
          let lastSuccessfulAcquirer: string | null = null;

          for (const action of actions) {
            const expiresAt = new Date(Date.now() + 3600_000).toISOString();
            const acquired = dbModule.acquireLock(action.taskId, action.service, expiresAt);

            if (acquired) {
              lastSuccessfulAcquirer = action.taskId;
            }

            // 不变量：如果锁被持有，持有者必须是最后成功获取的任务
            const lock = dbModule.getLockStatus();
            if (lock.locked_by !== null) {
              expect(lock.locked_by).toBe(lastSuccessfulAcquirer);
            }

            // 随机释放（仅当前持有者可以释放）
            if (action.thenRelease && lastSuccessfulAcquirer === action.taskId) {
              dbModule.releaseLock();
              lastSuccessfulAcquirer = null;
            }
          }

          dbModule.releaseLock();
        },
      ),
      { numRuns: 200 },
    );
  });

  // 属性 7.4: 等待队列按优先级排序
  it('等待队列始终按优先级 ASC 排序', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            taskId: arbTaskId,
            service: arbService,
            priority: arbPriority,
          }),
          { minLength: 2, maxLength: 20 },
        ),
        async (requests) => {
          dbModule.releaseLock();
          const scheduler = new GpuScheduler();

          // 确保任务 ID 唯一（去重）
          const seen = new Set<string>();
          const uniqueRequests = requests.filter((r) => {
            if (seen.has(r.taskId)) return false;
            seen.add(r.taskId);
            return true;
          });

          if (uniqueRequests.length < 2) {
            scheduler.stopExpiryChecker();
            return; // 需要至少 2 个不同任务
          }

          // 第一个任务获取锁，其余进入等待队列
          const [holder, ...waiters] = uniqueRequests;
          await scheduler.requestGpu(holder.taskId, holder.service, holder.priority);

          // 其余任务进入等待队列（不 await，因为它们会阻塞）
          for (const waiter of waiters) {
            scheduler.requestGpu(waiter.taskId, waiter.service, waiter.priority);
          }

          // 验证等待队列按优先级排序
          const status = scheduler.getStatus();
          const queueItems = status.queueItems;

          for (let i = 1; i < queueItems.length; i++) {
            const prev = queueItems[i - 1];
            const curr = queueItems[i];
            // 优先级数值越小越优先，相同优先级按入队时间排序
            expect(prev.priority).toBeLessThanOrEqual(curr.priority);
          }

          // 清理：移除所有等待者，释放锁
          for (const waiter of waiters) {
            scheduler.removeFromQueue(waiter.taskId);
          }
          scheduler.releaseGpu(holder.taskId);
          scheduler.stopExpiryChecker();
        },
      ),
      { numRuns: 100 },
    );
  });
});
