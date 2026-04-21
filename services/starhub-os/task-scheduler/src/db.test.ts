// db.test.ts — SQLite 数据访问层单元测试
// 使用临时文件数据库，测试完成后自动清理

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';

// 为测试创建独立的临时数据库，避免依赖 /data/pipeline.db
const TEST_DB_PATH = join(tmpdir(), `test-pipeline-${Date.now()}.db`);

// 在导入 db 模块之前设置环境变量
process.env.DB_PATH = TEST_DB_PATH;

// 初始化测试数据库 schema（模拟 deploy.sh 创建的表结构）
function initTestSchema(): void {
  const testDb = new Database(TEST_DB_PATH);
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id              TEXT PRIMARY KEY,
      type            TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      priority        INTEGER NOT NULL DEFAULT 100,
      source          TEXT,
      source_url      TEXT,
      file_path       TEXT NOT NULL,
      content_id      TEXT,
      content_type    TEXT,
      mpaa_rating     TEXT DEFAULT 'PG',
      current_step    INTEGER DEFAULT 0,
      total_steps     INTEGER,
      error_message   TEXT,
      retry_count     INTEGER DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      started_at      TEXT,
      completed_at    TEXT,
      metadata        TEXT
    );

    CREATE TABLE IF NOT EXISTS task_steps (
      id              TEXT PRIMARY KEY,
      task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      step_number     INTEGER NOT NULL,
      step_name       TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      error_message   TEXT,
      retry_count     INTEGER DEFAULT 0,
      started_at      TEXT,
      completed_at    TEXT,
      duration_ms     INTEGER,
      output_path     TEXT,
      metadata        TEXT
    );

    CREATE TABLE IF NOT EXISTS gpu_lock (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      locked_by       TEXT,
      service         TEXT,
      locked_at       TEXT,
      expires_at      TEXT
    );
    INSERT OR IGNORE INTO gpu_lock (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS content_registry (
      id              TEXT PRIMARY KEY,
      type            TEXT NOT NULL,
      title           TEXT,
      mpaa_rating     TEXT DEFAULT 'PG',
      status          TEXT DEFAULT 'active',
      duration_sec    REAL,
      resolution      TEXT,
      audio_tracks    TEXT,
      subtitle_tracks TEXT,
      page_count      INTEGER,
      versions        TEXT,
      word_count      INTEGER,
      chapter_count   INTEGER,
      modes           TEXT,
      artist          TEXT,
      formats         TEXT,
      file_path       TEXT NOT NULL,
      thumbnail_path  TEXT,
      source          TEXT,
      source_url      TEXT,
      metadata        TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  testDb.close();
}

// 先建表，再导入 db 模块
initTestSchema();

// 动态导入，确保 DB_PATH 环境变量已设置
const dbModule = await import('./db.js');

afterAll(() => {
  dbModule.db.close();
  try { unlinkSync(TEST_DB_PATH); } catch { /* 忽略 */ }
  try { unlinkSync(TEST_DB_PATH + '-wal'); } catch { /* 忽略 */ }
  try { unlinkSync(TEST_DB_PATH + '-shm'); } catch { /* 忽略 */ }
});

// ── 辅助函数 ──────────────────────────────────────────

function makeTask(overrides: Partial<import('./types.js').Task> = {}): import('./types.js').Task {
  return {
    id: randomUUID(),
    type: 'video_pipeline',
    status: 'pending',
    priority: 100,
    source: null,
    source_url: null,
    file_path: '/data/media/videos/incoming/test.mp4',
    content_id: null,
    content_type: null,
    mpaa_rating: 'PG',
    current_step: 0,
    total_steps: 7,
    error_message: null,
    retry_count: 0,
    created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    started_at: null,
    completed_at: null,
    metadata: null,
    ...overrides,
  };
}

function makeStep(taskId: string, num: number, name: string): import('./types.js').TaskStep {
  return {
    id: randomUUID(),
    task_id: taskId,
    step_number: num,
    step_name: name,
    status: 'pending',
    error_message: null,
    retry_count: 0,
    started_at: null,
    completed_at: null,
    duration_ms: null,
    output_path: null,
    metadata: null,
  };
}

// ── tasks CRUD ────────────────────────────────────────

describe('tasks CRUD', () => {
  it('createTask + getTask 往返一致', () => {
    const task = makeTask();
    dbModule.createTask(task);
    const fetched = dbModule.getTask(task.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(task.id);
    expect(fetched!.type).toBe('video_pipeline');
    expect(fetched!.status).toBe('pending');
    expect(fetched!.priority).toBe(100);
  });

  it('getTask 不存在的 ID 返回 undefined', () => {
    expect(dbModule.getTask('nonexistent')).toBeUndefined();
  });

  it('listTasks 返回所有任务', () => {
    const t1 = makeTask({ priority: 10 });
    const t2 = makeTask({ priority: 200 });
    dbModule.createTask(t1);
    dbModule.createTask(t2);
    const all = dbModule.listTasks();
    expect(all.length).toBeGreaterThanOrEqual(2);
    // 按 priority ASC 排序，t1 应在 t2 前面
    const idx1 = all.findIndex(t => t.id === t1.id);
    const idx2 = all.findIndex(t => t.id === t2.id);
    expect(idx1).toBeLessThan(idx2);
  });

  it('listTasks 按 status 过滤', () => {
    const t = makeTask({ status: 'failed' });
    dbModule.createTask(t);
    const failed = dbModule.listTasks({ status: 'failed' });
    expect(failed.some(x => x.id === t.id)).toBe(true);
    expect(failed.every(x => x.status === 'failed')).toBe(true);
  });

  it('listTasks 按 type 过滤', () => {
    const t = makeTask({ type: 'comic_pipeline' });
    dbModule.createTask(t);
    const comics = dbModule.listTasks({ type: 'comic_pipeline' });
    expect(comics.some(x => x.id === t.id)).toBe(true);
    expect(comics.every(x => x.type === 'comic_pipeline')).toBe(true);
  });

  it('listTasks 分页', () => {
    const page = dbModule.listTasks({ limit: 2, offset: 0 });
    expect(page.length).toBeLessThanOrEqual(2);
  });

  it('updateTaskStatus 更新状态', () => {
    const t = makeTask();
    dbModule.createTask(t);
    dbModule.updateTaskStatus(t.id, 'processing');
    const updated = dbModule.getTask(t.id)!;
    expect(updated.status).toBe('processing');
    expect(updated.started_at).not.toBeNull();
  });

  it('updateTaskStatus 完成时设置 completed_at', () => {
    const t = makeTask();
    dbModule.createTask(t);
    dbModule.updateTaskStatus(t.id, 'completed');
    const updated = dbModule.getTask(t.id)!;
    expect(updated.status).toBe('completed');
    expect(updated.completed_at).not.toBeNull();
  });

  it('updateTaskStatus 附带错误信息', () => {
    const t = makeTask();
    dbModule.createTask(t);
    dbModule.updateTaskStatus(t.id, 'failed', 'GPU out of memory');
    const updated = dbModule.getTask(t.id)!;
    expect(updated.status).toBe('failed');
    expect(updated.error_message).toBe('GPU out of memory');
  });

  it('updateTaskStep 更新当前步骤', () => {
    const t = makeTask();
    dbModule.createTask(t);
    dbModule.updateTaskStep(t.id, 3);
    expect(dbModule.getTask(t.id)!.current_step).toBe(3);
  });

  it('deleteTask 删除任务', () => {
    const t = makeTask();
    dbModule.createTask(t);
    dbModule.deleteTask(t.id);
    expect(dbModule.getTask(t.id)).toBeUndefined();
  });

  it('deleteTask 级联删除关联步骤', () => {
    const t = makeTask();
    dbModule.createTask(t);
    dbModule.createStep(makeStep(t.id, 1, 'dedup'));
    dbModule.deleteTask(t.id);
    expect(dbModule.getStepsByTask(t.id)).toHaveLength(0);
  });
});

// ── task_steps CRUD ───────────────────────────────────

describe('task_steps CRUD', () => {
  it('createStep + getStepsByTask 往返一致', () => {
    const t = makeTask();
    dbModule.createTask(t);
    const s1 = makeStep(t.id, 1, 'dedup');
    const s2 = makeStep(t.id, 2, 'ad_detect');
    dbModule.createStep(s1);
    dbModule.createStep(s2);
    const steps = dbModule.getStepsByTask(t.id);
    expect(steps).toHaveLength(2);
    expect(steps[0].step_number).toBe(1);
    expect(steps[1].step_number).toBe(2);
  });

  it('updateStepStatus 更新步骤状态', () => {
    const t = makeTask();
    dbModule.createTask(t);
    const s = makeStep(t.id, 1, 'dedup');
    dbModule.createStep(s);
    dbModule.updateStepStatus(s.id, 'processing');
    const steps = dbModule.getStepsByTask(t.id);
    expect(steps[0].status).toBe('processing');
    expect(steps[0].started_at).not.toBeNull();
  });

  it('updateStepStatus 完成时记录 duration_ms', () => {
    const t = makeTask();
    dbModule.createTask(t);
    const s = makeStep(t.id, 1, 'dedup');
    dbModule.createStep(s);
    dbModule.updateStepStatus(s.id, 'completed', null, 12345);
    const steps = dbModule.getStepsByTask(t.id);
    expect(steps[0].status).toBe('completed');
    expect(steps[0].duration_ms).toBe(12345);
    expect(steps[0].completed_at).not.toBeNull();
  });
});

// ── gpu_lock ──────────────────────────────────────────

describe('gpu_lock', () => {
  it('初始状态未锁定', () => {
    expect(dbModule.isLocked()).toBe(false);
    const lock = dbModule.getLockStatus();
    expect(lock.locked_by).toBeNull();
  });

  it('acquireLock 成功获取锁', () => {
    const ok = dbModule.acquireLock('task-123', 'whisper-api', '2099-01-01 00:00:00');
    expect(ok).toBe(true);
    expect(dbModule.isLocked()).toBe(true);
    const lock = dbModule.getLockStatus();
    expect(lock.locked_by).toBe('task-123');
    expect(lock.service).toBe('whisper-api');
  });

  it('acquireLock 已锁定时获取失败', () => {
    // 锁已被上面的测试持有
    const ok = dbModule.acquireLock('task-456', 'sd-api', '2099-01-01 00:00:00');
    expect(ok).toBe(false);
  });

  it('releaseLock 释放锁', () => {
    dbModule.releaseLock();
    expect(dbModule.isLocked()).toBe(false);
    const lock = dbModule.getLockStatus();
    expect(lock.locked_by).toBeNull();
  });

  it('释放后可重新获取', () => {
    const ok = dbModule.acquireLock('task-789', 'xtts-api', '2099-01-01 00:00:00');
    expect(ok).toBe(true);
    dbModule.releaseLock();
  });
});

// ── content_registry ──────────────────────────────────

describe('content_registry', () => {
  it('registerContent + getContent 往返一致', () => {
    const entry = {
      id: randomUUID(),
      type: 'video',
      title: '测试视频',
      mpaa_rating: 'PG',
      status: 'active',
      duration_sec: 3600,
      resolution: '1920x1080',
      audio_tracks: 'zh,en,ja',
      subtitle_tracks: 'zh,en,ja',
      page_count: null,
      versions: null,
      word_count: null,
      chapter_count: null,
      modes: null,
      artist: null,
      formats: null,
      file_path: '/data/media/videos/ready/test.mkv',
      thumbnail_path: '/data/media/videos/ready/test.jpg',
      source: 'sonarr',
      source_url: null,
      metadata: JSON.stringify({ tags: ['action'] }),
    };
    dbModule.registerContent(entry);
    const fetched = dbModule.getContent(entry.id);
    expect(fetched).toBeDefined();
    expect(fetched!.title).toBe('测试视频');
    expect(fetched!.type).toBe('video');
    expect(fetched!.created_at).toBeDefined();
    expect(fetched!.updated_at).toBeDefined();
  });

  it('getContent 不存在返回 undefined', () => {
    expect(dbModule.getContent('nonexistent')).toBeUndefined();
  });

  it('updateContent 更新内容', () => {
    const entry = {
      id: randomUUID(),
      type: 'comic',
      title: '原始标题',
      mpaa_rating: 'PG',
      status: 'active',
      duration_sec: null,
      resolution: null,
      audio_tracks: null,
      subtitle_tracks: null,
      page_count: 200,
      versions: null,
      word_count: null,
      chapter_count: null,
      modes: null,
      artist: '作者A',
      formats: null,
      file_path: '/data/media/comics/ready/test',
      thumbnail_path: null,
      source: 'telegram',
      source_url: null,
      metadata: null,
    };
    dbModule.registerContent(entry);
    dbModule.updateContent({ ...entry, title: '更新后标题', page_count: 250 });
    const updated = dbModule.getContent(entry.id)!;
    expect(updated.title).toBe('更新后标题');
    expect(updated.page_count).toBe(250);
  });
});

// ── withTransaction ───────────────────────────────────

describe('withTransaction', () => {
  it('事务内操作全部提交', () => {
    const t = makeTask();
    const s = makeStep(t.id, 1, 'dedup');
    dbModule.withTransaction(() => {
      dbModule.createTask(t);
      dbModule.createStep(s);
    });
    expect(dbModule.getTask(t.id)).toBeDefined();
    expect(dbModule.getStepsByTask(t.id)).toHaveLength(1);
  });

  it('事务内异常自动回滚', () => {
    const t = makeTask();
    try {
      dbModule.withTransaction(() => {
        dbModule.createTask(t);
        throw new Error('模拟错误');
      });
    } catch {
      // 预期抛出
    }
    // 任务不应被写入
    expect(dbModule.getTask(t.id)).toBeUndefined();
  });
});
