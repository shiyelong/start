// gpu-scheduler.test.ts — GPU 互斥锁调度器单元测试
// 使用临时 SQLite 数据库，测试锁获取/释放、优先级队列、过期检查

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';

// 为测试创建独立的临时数据库
const TEST_DB_PATH = join(tmpdir(), `test-gpu-scheduler-${Date.now()}.db`);
process.env.DB_PATH = TEST_DB_PATH;

// 初始化测试数据库 schema
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
const { GpuScheduler, GpuPriority, SERVICE_TIMEOUTS, DEFAULT_TIMEOUT_MINUTES } =
  await import('./gpu-scheduler.js');
const dbModule = await import('./db.js');

// 每个测试前重置锁状态
beforeEach(() => {
  dbModule.releaseLock();
});

afterAll(() => {
  dbModule.db.close();
  try { unlinkSync(TEST_DB_PATH); } catch { /* 忽略 */ }
  try { unlinkSync(TEST_DB_PATH + '-wal'); } catch { /* 忽略 */ }
  try { unlinkSync(TEST_DB_PATH + '-shm'); } catch { /* 忽略 */ }
});

// ── 辅助函数 ──────────────────────────────────────────

function createScheduler(): InstanceType<typeof GpuScheduler> {
  const scheduler = new GpuScheduler();
  return scheduler;
}

// ── 服务超时配置 ──────────────────────────────────────

describe('SERVICE_TIMEOUTS', () => {
  it('包含所有 7 个 GPU 服务', () => {
    const expectedServices = [
      'whisper-api', 'xtts-api', 'sd-api-inpaint',
      'sd-api-txt2img', 'manga-translator', 'ollama', 'tdarr',
    ];
    for (const service of expectedServices) {
      expect(SERVICE_TIMEOUTS).toHaveProperty(service);
      expect(typeof SERVICE_TIMEOUTS[service]).toBe('number');
      expect(SERVICE_TIMEOUTS[service]).toBeGreaterThan(0);
    }
  });

  it('超时值与设计文档一致', () => {
    expect(SERVICE_TIMEOUTS['whisper-api']).toBe(60);
    expect(SERVICE_TIMEOUTS['xtts-api']).toBe(120);
    expect(SERVICE_TIMEOUTS['sd-api-inpaint']).toBe(180);
    expect(SERVICE_TIMEOUTS['sd-api-txt2img']).toBe(30);
    expect(SERVICE_TIMEOUTS['manga-translator']).toBe(60);
    expect(SERVICE_TIMEOUTS['ollama']).toBe(30);
    expect(SERVICE_TIMEOUTS['tdarr']).toBe(240);
  });

  it('默认超时为 60 分钟', () => {
    expect(DEFAULT_TIMEOUT_MINUTES).toBe(60);
  });
});

// ── GpuPriority 枚举 ─────────────────────────────────

describe('GpuPriority', () => {
  it('优先级值正确', () => {
    expect(GpuPriority.Urgent).toBe(0);
    expect(GpuPriority.High).toBe(11);
    expect(GpuPriority.Medium).toBe(51);
    expect(GpuPriority.Low).toBe(101);
    expect(GpuPriority.Background).toBe(201);
  });

  it('优先级严格递增', () => {
    expect(GpuPriority.Urgent).toBeLessThan(GpuPriority.High);
    expect(GpuPriority.High).toBeLessThan(GpuPriority.Medium);
    expect(GpuPriority.Medium).toBeLessThan(GpuPriority.Low);
    expect(GpuPriority.Low).toBeLessThan(GpuPriority.Background);
  });
});

// ── requestGpu ────────────────────────────────────────

describe('requestGpu', () => {
  it('无锁时立即获取成功', async () => {
    const scheduler = createScheduler();
    const result = await scheduler.requestGpu('task-1', 'whisper-api', GpuPriority.Medium);
    expect(result).toBe(true);

    const status = scheduler.getStatus();
    expect(status.locked).toBe(true);
    expect(status.lockedBy).toBe('task-1');
    expect(status.service).toBe('whisper-api');

    scheduler.releaseGpu('task-1');
    scheduler.stopExpiryChecker();
  });

  it('已锁定时进入等待队列', async () => {
    const scheduler = createScheduler();
    await scheduler.requestGpu('task-1', 'whisper-api', GpuPriority.Medium);

    // 第二个请求应进入等待队列
    const promise = scheduler.requestGpu('task-2', 'xtts-api', GpuPriority.High);

    const status = scheduler.getStatus();
    expect(status.queueLength).toBe(1);
    expect(status.queueItems[0].taskId).toBe('task-2');

    // 释放锁后，等待中的任务应获得锁
    scheduler.releaseGpu('task-1');
    const result = await promise;
    expect(result).toBe(true);

    const newStatus = scheduler.getStatus();
    expect(newStatus.lockedBy).toBe('task-2');

    scheduler.releaseGpu('task-2');
    scheduler.stopExpiryChecker();
  });

  it('设置正确的过期时间', async () => {
    const scheduler = createScheduler();
    const before = Date.now();
    await scheduler.requestGpu('task-1', 'tdarr', GpuPriority.Low);

    const status = scheduler.getStatus();
    expect(status.expiresAt).not.toBeNull();

    const expiresAt = new Date(status.expiresAt!).getTime();
    // tdarr 超时 240 分钟
    const expectedMin = before + 240 * 60 * 1000 - 5000; // 5秒容差
    const expectedMax = before + 240 * 60 * 1000 + 5000;
    expect(expiresAt).toBeGreaterThanOrEqual(expectedMin);
    expect(expiresAt).toBeLessThanOrEqual(expectedMax);

    scheduler.releaseGpu('task-1');
    scheduler.stopExpiryChecker();
  });

  it('未知服务使用默认超时', async () => {
    const scheduler = createScheduler();
    const before = Date.now();
    await scheduler.requestGpu('task-1', 'unknown-service', GpuPriority.Medium);

    const status = scheduler.getStatus();
    const expiresAt = new Date(status.expiresAt!).getTime();
    const expectedMin = before + DEFAULT_TIMEOUT_MINUTES * 60 * 1000 - 5000;
    const expectedMax = before + DEFAULT_TIMEOUT_MINUTES * 60 * 1000 + 5000;
    expect(expiresAt).toBeGreaterThanOrEqual(expectedMin);
    expect(expiresAt).toBeLessThanOrEqual(expectedMax);

    scheduler.releaseGpu('task-1');
    scheduler.stopExpiryChecker();
  });
});

// ── releaseGpu ────────────────────────────────────────

describe('releaseGpu', () => {
  it('锁持有者可以释放锁', async () => {
    const scheduler = createScheduler();
    await scheduler.requestGpu('task-1', 'whisper-api', GpuPriority.Medium);
    scheduler.releaseGpu('task-1');

    const status = scheduler.getStatus();
    expect(status.locked).toBe(false);
    expect(status.lockedBy).toBeNull();
    scheduler.stopExpiryChecker();
  });

  it('非持有者释放锁无效', async () => {
    const scheduler = createScheduler();
    await scheduler.requestGpu('task-1', 'whisper-api', GpuPriority.Medium);
    scheduler.releaseGpu('task-wrong');

    // 锁应仍被 task-1 持有
    const status = scheduler.getStatus();
    expect(status.locked).toBe(true);
    expect(status.lockedBy).toBe('task-1');

    scheduler.releaseGpu('task-1');
    scheduler.stopExpiryChecker();
  });

  it('释放后自动将锁分配给队列中最高优先级任务', async () => {
    const scheduler = createScheduler();
    await scheduler.requestGpu('task-1', 'whisper-api', GpuPriority.Medium);

    // 加入多个等待任务
    const p2 = scheduler.requestGpu('task-2', 'xtts-api', GpuPriority.Low);
    const p3 = scheduler.requestGpu('task-3', 'ollama', GpuPriority.Urgent);

    // task-3 优先级更高，应先获得锁
    scheduler.releaseGpu('task-1');
    await p3;

    const status = scheduler.getStatus();
    expect(status.lockedBy).toBe('task-3');
    expect(status.queueLength).toBe(1);

    // 释放后 task-2 获得锁
    scheduler.releaseGpu('task-3');
    await p2;

    const status2 = scheduler.getStatus();
    expect(status2.lockedBy).toBe('task-2');

    scheduler.releaseGpu('task-2');
    scheduler.stopExpiryChecker();
  });
});

// ── 优先级队列排序 ───────────────────────────────────

describe('优先级队列排序', () => {
  it('按优先级 ASC 排序', async () => {
    const scheduler = createScheduler();
    await scheduler.requestGpu('holder', 'whisper-api', GpuPriority.Medium);

    // 按乱序加入不同优先级的任务
    scheduler.requestGpu('bg', 'tdarr', GpuPriority.Background);
    scheduler.requestGpu('urgent', 'ollama', GpuPriority.Urgent);
    scheduler.requestGpu('high', 'xtts-api', GpuPriority.High);

    const status = scheduler.getStatus();
    expect(status.queueLength).toBe(3);
    expect(status.queueItems[0].taskId).toBe('urgent');
    expect(status.queueItems[1].taskId).toBe('high');
    expect(status.queueItems[2].taskId).toBe('bg');

    // 清理
    scheduler.removeFromQueue('bg');
    scheduler.removeFromQueue('urgent');
    scheduler.removeFromQueue('high');
    scheduler.releaseGpu('holder');
    scheduler.stopExpiryChecker();
  });

  it('相同优先级按入队时间 ASC 排序（先到先得）', async () => {
    const scheduler = createScheduler();
    await scheduler.requestGpu('holder', 'whisper-api', GpuPriority.Medium);

    scheduler.requestGpu('first', 'ollama', 50);
    // 确保时间戳不同
    await new Promise((r) => setTimeout(r, 5));
    scheduler.requestGpu('second', 'xtts-api', 50);

    const status = scheduler.getStatus();
    expect(status.queueItems[0].taskId).toBe('first');
    expect(status.queueItems[1].taskId).toBe('second');

    // 清理
    scheduler.removeFromQueue('first');
    scheduler.removeFromQueue('second');
    scheduler.releaseGpu('holder');
    scheduler.stopExpiryChecker();
  });
});

// ── getStatus ─────────────────────────────────────────

describe('getStatus', () => {
  it('无锁时返回正确状态', () => {
    const scheduler = createScheduler();
    const status = scheduler.getStatus();
    expect(status.locked).toBe(false);
    expect(status.lockedBy).toBeNull();
    expect(status.service).toBeNull();
    expect(status.queueLength).toBe(0);
    expect(status.queueItems).toEqual([]);
    scheduler.stopExpiryChecker();
  });

  it('有锁时返回完整信息', async () => {
    const scheduler = createScheduler();
    await scheduler.requestGpu('task-1', 'sd-api-inpaint', GpuPriority.High);

    const status = scheduler.getStatus();
    expect(status.locked).toBe(true);
    expect(status.lockedBy).toBe('task-1');
    expect(status.service).toBe('sd-api-inpaint');
    expect(status.lockedAt).not.toBeNull();
    expect(status.expiresAt).not.toBeNull();

    scheduler.releaseGpu('task-1');
    scheduler.stopExpiryChecker();
  });
});

// ── checkExpiredLock ──────────────────────────────────

describe('checkExpiredLock', () => {
  it('未过期的锁不被释放', async () => {
    const scheduler = createScheduler();
    await scheduler.requestGpu('task-1', 'whisper-api', GpuPriority.Medium);

    scheduler.checkExpiredLock();

    const status = scheduler.getStatus();
    expect(status.locked).toBe(true);
    expect(status.lockedBy).toBe('task-1');

    scheduler.releaseGpu('task-1');
    scheduler.stopExpiryChecker();
  });

  it('过期的锁被自动释放', () => {
    const scheduler = createScheduler();

    // 直接在数据库中写入一个已过期的锁
    const pastTime = new Date(Date.now() - 60_000).toISOString();
    dbModule.acquireLock('expired-task', 'whisper-api', pastTime);

    let expiredEvent = false;
    scheduler.on('lock-expired', () => { expiredEvent = true; });

    scheduler.checkExpiredLock();

    const status = scheduler.getStatus();
    expect(status.locked).toBe(false);
    expect(expiredEvent).toBe(true);

    scheduler.stopExpiryChecker();
  });

  it('过期释放后处理等待队列', () => {
    const scheduler = createScheduler();

    // 写入已过期的锁
    const pastTime = new Date(Date.now() - 60_000).toISOString();
    dbModule.acquireLock('expired-task', 'whisper-api', pastTime);

    // 加入等待任务
    const promise = scheduler.requestGpu('waiting-task', 'ollama', GpuPriority.Medium);

    // 检查过期 — 应释放旧锁并分配给等待任务
    scheduler.checkExpiredLock();

    // 等待任务应获得锁
    return promise.then((result) => {
      expect(result).toBe(true);
      const status = scheduler.getStatus();
      expect(status.lockedBy).toBe('waiting-task');

      scheduler.releaseGpu('waiting-task');
      scheduler.stopExpiryChecker();
    });
  });
});

// ── getQueuePosition ─────────────────────────────────

describe('getQueuePosition', () => {
  it('不在队列中返回 -1', () => {
    const scheduler = createScheduler();
    expect(scheduler.getQueuePosition('nonexistent')).toBe(-1);
    scheduler.stopExpiryChecker();
  });

  it('返回正确的队列位置', async () => {
    const scheduler = createScheduler();
    await scheduler.requestGpu('holder', 'whisper-api', GpuPriority.Medium);

    scheduler.requestGpu('task-a', 'ollama', GpuPriority.Urgent);
    scheduler.requestGpu('task-b', 'xtts-api', GpuPriority.High);
    scheduler.requestGpu('task-c', 'tdarr', GpuPriority.Background);

    expect(scheduler.getQueuePosition('task-a')).toBe(0);
    expect(scheduler.getQueuePosition('task-b')).toBe(1);
    expect(scheduler.getQueuePosition('task-c')).toBe(2);
    expect(scheduler.getQueuePosition('holder')).toBe(-1); // 持有者不在队列中

    // 清理
    scheduler.removeFromQueue('task-a');
    scheduler.removeFromQueue('task-b');
    scheduler.removeFromQueue('task-c');
    scheduler.releaseGpu('holder');
    scheduler.stopExpiryChecker();
  });
});

// ── removeFromQueue ──────────────────────────────────

describe('removeFromQueue', () => {
  it('成功移除队列中的任务', async () => {
    const scheduler = createScheduler();
    await scheduler.requestGpu('holder', 'whisper-api', GpuPriority.Medium);

    const promise = scheduler.requestGpu('to-remove', 'ollama', GpuPriority.High);
    expect(scheduler.getQueuePosition('to-remove')).toBe(0);

    const removed = scheduler.removeFromQueue('to-remove');
    expect(removed).toBe(true);
    expect(scheduler.getQueuePosition('to-remove')).toBe(-1);

    // 被移除的任务 resolve(false)
    const result = await promise;
    expect(result).toBe(false);

    scheduler.releaseGpu('holder');
    scheduler.stopExpiryChecker();
  });

  it('移除不存在的任务返回 false', () => {
    const scheduler = createScheduler();
    expect(scheduler.removeFromQueue('nonexistent')).toBe(false);
    scheduler.stopExpiryChecker();
  });
});

// ── EventEmitter 事件 ────────────────────────────────

describe('事件发射', () => {
  it('获取锁时发射 lock-acquired 事件', async () => {
    const scheduler = createScheduler();
    let eventData: unknown = null;
    scheduler.on('lock-acquired', (data) => { eventData = data; });

    await scheduler.requestGpu('task-1', 'whisper-api', GpuPriority.Medium);

    expect(eventData).toEqual({
      taskId: 'task-1',
      service: 'whisper-api',
      priority: GpuPriority.Medium,
    });

    scheduler.releaseGpu('task-1');
    scheduler.stopExpiryChecker();
  });

  it('释放锁时发射 lock-released 事件', async () => {
    const scheduler = createScheduler();
    let eventData: unknown = null;
    scheduler.on('lock-released', (data) => { eventData = data; });

    await scheduler.requestGpu('task-1', 'whisper-api', GpuPriority.Medium);
    scheduler.releaseGpu('task-1');

    expect(eventData).toEqual({ taskId: 'task-1' });
    scheduler.stopExpiryChecker();
  });

  it('锁过期时发射 lock-expired 事件', () => {
    const scheduler = createScheduler();
    let eventData: unknown = null;
    scheduler.on('lock-expired', (data) => { eventData = data; });

    const pastTime = new Date(Date.now() - 60_000).toISOString();
    dbModule.acquireLock('expired-task', 'whisper-api', pastTime);

    scheduler.checkExpiredLock();

    expect(eventData).toEqual({
      taskId: 'expired-task',
      service: 'whisper-api',
      expiresAt: pastTime,
    });

    scheduler.stopExpiryChecker();
  });
});

// ── 定时器管理 ────────────────────────────────────────

describe('过期检查定时器', () => {
  it('startExpiryChecker 和 stopExpiryChecker 不抛异常', () => {
    const scheduler = createScheduler();
    expect(() => scheduler.startExpiryChecker()).not.toThrow();
    expect(() => scheduler.stopExpiryChecker()).not.toThrow();
  });

  it('重复调用 startExpiryChecker 不创建多个定时器', () => {
    const scheduler = createScheduler();
    scheduler.startExpiryChecker();
    scheduler.startExpiryChecker(); // 第二次调用应被忽略
    scheduler.stopExpiryChecker();
  });

  it('stopExpiryChecker 后可重新启动', () => {
    const scheduler = createScheduler();
    scheduler.startExpiryChecker();
    scheduler.stopExpiryChecker();
    scheduler.startExpiryChecker();
    scheduler.stopExpiryChecker();
  });
});
