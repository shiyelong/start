// queue.test.ts — BullMQ 任务队列核心单元测试
// 测试任务创建、状态管理、取消、重试、崩溃恢复等核心逻辑
// 注意：BullMQ 队列操作（入队/出队）为异步且依赖 Redis，此处仅测试 SQLite 持久化逻辑

import { describe, it, expect, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';

// 为测试创建独立的临时数据库
const TEST_DB_PATH = join(tmpdir(), `test-queue-${Date.now()}.db`);
process.env.DB_PATH = TEST_DB_PATH;

// 初始化测试数据库 schema
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

// 先建表，再导入模块
initTestSchema();

// 动态导入，确保 DB_PATH 环境变量已设置
const dbModule = await import('./db.js');
const queueModule = await import('./queue.js');

afterAll(() => {
  dbModule.db.close();
  try { unlinkSync(TEST_DB_PATH); } catch { /* 忽略 */ }
  try { unlinkSync(TEST_DB_PATH + '-wal'); } catch { /* 忽略 */ }
  try { unlinkSync(TEST_DB_PATH + '-shm'); } catch { /* 忽略 */ }
});

// ── 流水线步骤定义测试 ─────────────────────────────────

describe('流水线步骤定义', () => {
  it('视频流水线包含 12 个步骤', () => {
    expect(queueModule.VIDEO_PIPELINE_STEPS).toHaveLength(12);
    expect(queueModule.VIDEO_PIPELINE_STEPS[0]).toBe('dedup');
    expect(queueModule.VIDEO_PIPELINE_STEPS[1]).toBe('tagger');
    expect(queueModule.VIDEO_PIPELINE_STEPS[11]).toBe('register');
  });

  it('漫画流水线包含 9 个步骤', () => {
    expect(queueModule.COMIC_PIPELINE_STEPS).toHaveLength(9);
    expect(queueModule.COMIC_PIPELINE_STEPS[0]).toBe('dedup');
    expect(queueModule.COMIC_PIPELINE_STEPS[8]).toBe('cleanup');
  });

  it('小说流水线包含 10 个步骤', () => {
    expect(queueModule.NOVEL_PIPELINE_STEPS).toHaveLength(10);
    expect(queueModule.NOVEL_PIPELINE_STEPS[0]).toBe('dedup');
    expect(queueModule.NOVEL_PIPELINE_STEPS[9]).toBe('register');
  });

  it('音频流水线包含 6 个步骤', () => {
    expect(queueModule.AUDIO_PIPELINE_STEPS).toHaveLength(6);
    expect(queueModule.AUDIO_PIPELINE_STEPS[0]).toBe('dedup');
    expect(queueModule.AUDIO_PIPELINE_STEPS[5]).toBe('register');
  });

  it('PIPELINE_STEPS_MAP 包含 4 种流水线类型', () => {
    expect(Object.keys(queueModule.PIPELINE_STEPS_MAP)).toHaveLength(4);
    expect(queueModule.PIPELINE_STEPS_MAP['video_pipeline']).toBe(queueModule.VIDEO_PIPELINE_STEPS);
    expect(queueModule.PIPELINE_STEPS_MAP['comic_pipeline']).toBe(queueModule.COMIC_PIPELINE_STEPS);
    expect(queueModule.PIPELINE_STEPS_MAP['novel_pipeline']).toBe(queueModule.NOVEL_PIPELINE_STEPS);
    expect(queueModule.PIPELINE_STEPS_MAP['audio_pipeline']).toBe(queueModule.AUDIO_PIPELINE_STEPS);
  });

  it('getPipelineSteps 返回正确的步骤列表', () => {
    expect(queueModule.getPipelineSteps('video_pipeline')).toBe(queueModule.VIDEO_PIPELINE_STEPS);
    expect(queueModule.getPipelineSteps('unknown_type')).toBeUndefined();
  });

  it('每条流水线的第一步都是 dedup', () => {
    for (const steps of Object.values(queueModule.PIPELINE_STEPS_MAP)) {
      expect(steps[0]).toBe('dedup');
    }
  });

  it('每条流水线的第二步都是 tagger', () => {
    for (const steps of Object.values(queueModule.PIPELINE_STEPS_MAP)) {
      expect(steps[1]).toBe('tagger');
    }
  });
});

// ── 任务创建测试 ────────────────────────────────────────

describe('createPipelineTask', () => {
  it('创建视频流水线任务并生成正确的步骤记录', () => {
    const taskId = queueModule.createPipelineTask('video_pipeline', '/incoming/test.mp4');

    const task = dbModule.getTask(taskId);
    expect(task).toBeDefined();
    expect(task!.type).toBe('video_pipeline');
    expect(task!.status).toBe('pending');
    expect(task!.priority).toBe(100);
    expect(task!.file_path).toBe('/incoming/test.mp4');
    expect(task!.total_steps).toBe(12);
    expect(task!.current_step).toBe(0);
    expect(task!.mpaa_rating).toBe('PG');

    const steps = dbModule.getStepsByTask(taskId);
    expect(steps).toHaveLength(12);
    for (let i = 0; i < steps.length; i++) {
      expect(steps[i].step_number).toBe(i + 1);
      expect(steps[i].step_name).toBe(queueModule.VIDEO_PIPELINE_STEPS[i]);
      expect(steps[i].status).toBe('pending');
    }
  });

  it('创建漫画流水线任务', () => {
    const taskId = queueModule.createPipelineTask('comic_pipeline', '/incoming/manga.zip');
    const task = dbModule.getTask(taskId);
    expect(task!.type).toBe('comic_pipeline');
    expect(task!.total_steps).toBe(9);
    expect(dbModule.getStepsByTask(taskId)).toHaveLength(9);
  });

  it('创建小说流水线任务', () => {
    const taskId = queueModule.createPipelineTask('novel_pipeline', '/incoming/novel.txt');
    const task = dbModule.getTask(taskId);
    expect(task!.type).toBe('novel_pipeline');
    expect(task!.total_steps).toBe(10);
  });

  it('创建音频流水线任务', () => {
    const taskId = queueModule.createPipelineTask('audio_pipeline', '/incoming/song.flac');
    const task = dbModule.getTask(taskId);
    expect(task!.type).toBe('audio_pipeline');
    expect(task!.total_steps).toBe(6);
  });

  it('支持自定义优先级', () => {
    const taskId = queueModule.createPipelineTask('video_pipeline', '/test.mp4', {
      priority: 5,
    });
    expect(dbModule.getTask(taskId)!.priority).toBe(5);
  });

  it('支持自定义来源和元数据', () => {
    const taskId = queueModule.createPipelineTask('video_pipeline', '/test.mp4', {
      source: 'sonarr',
      sourceUrl: 'https://example.com/video',
      contentId: 'content-123',
      contentType: 'anime',
      mpaaRating: 'NC-17',
      metadata: { episode: 1, season: 2 },
    });
    const task = dbModule.getTask(taskId)!;
    expect(task.source).toBe('sonarr');
    expect(task.source_url).toBe('https://example.com/video');
    expect(task.content_id).toBe('content-123');
    expect(task.content_type).toBe('anime');
    expect(task.mpaa_rating).toBe('NC-17');
    expect(JSON.parse(task.metadata!)).toEqual({ episode: 1, season: 2 });
  });

  it('未知流水线类型抛出错误', () => {
    expect(() => queueModule.createPipelineTask('unknown_type', '/test.mp4')).toThrow(
      '未知的流水线类型',
    );
  });

  it('每次创建的任务 ID 唯一', () => {
    const id1 = queueModule.createPipelineTask('audio_pipeline', '/a.flac');
    const id2 = queueModule.createPipelineTask('audio_pipeline', '/b.flac');
    expect(id1).not.toBe(id2);
  });
});

// ── 任务进度更新测试 ────────────────────────────────────

describe('updateTaskProgress', () => {
  it('更新步骤状态为 processing 时任务自动变为 processing', () => {
    const taskId = queueModule.createPipelineTask('audio_pipeline', '/test.flac');

    queueModule.updateTaskProgress(taskId, 1, 'processing');

    const steps = dbModule.getStepsByTask(taskId);
    expect(steps[0].status).toBe('processing');

    const task = dbModule.getTask(taskId);
    expect(task!.status).toBe('processing');
    expect(task!.current_step).toBe(1);
  });

  it('更新步骤状态为 completed', () => {
    const taskId = queueModule.createPipelineTask('audio_pipeline', '/test.flac');

    queueModule.updateTaskProgress(taskId, 1, 'processing');
    queueModule.updateTaskProgress(taskId, 1, 'completed', null, 1500);

    const steps = dbModule.getStepsByTask(taskId);
    expect(steps[0].status).toBe('completed');
  });

  it('所有步骤完成后任务自动标记为 completed', () => {
    const taskId = queueModule.createPipelineTask('audio_pipeline', '/test.flac');

    for (let i = 1; i <= 6; i++) {
      queueModule.updateTaskProgress(taskId, i, 'processing');
      queueModule.updateTaskProgress(taskId, i, 'completed');
    }

    const task = dbModule.getTask(taskId);
    expect(task!.status).toBe('completed');
  });

  it('有失败步骤但其余完成时标记为降级完成', () => {
    const taskId = queueModule.createPipelineTask('audio_pipeline', '/test.flac');

    queueModule.updateTaskProgress(taskId, 1, 'completed');
    queueModule.updateTaskProgress(taskId, 2, 'failed', '标签服务不可用');
    for (let i = 3; i <= 6; i++) {
      queueModule.updateTaskProgress(taskId, i, 'completed');
    }

    const task = dbModule.getTask(taskId);
    expect(task!.status).toBe('completed');
    expect(task!.error_message).toContain('降级完成');
  });

  it('不存在的任务 ID 不会崩溃', () => {
    expect(() =>
      queueModule.updateTaskProgress('nonexistent-id', 1, 'completed'),
    ).not.toThrow();
  });

  it('不存在的步骤编号不会崩溃', () => {
    const taskId = queueModule.createPipelineTask('audio_pipeline', '/test.flac');
    expect(() =>
      queueModule.updateTaskProgress(taskId, 999, 'completed'),
    ).not.toThrow();
  });
});

// ── 取消任务测试 ────────────────────────────────────────

describe('cancelTask', () => {
  it('取消 pending 状态的任务', () => {
    const taskId = queueModule.createPipelineTask('audio_pipeline', '/test.flac');

    const result = queueModule.cancelTask(taskId);
    expect(result).toBe(true);

    const task = dbModule.getTask(taskId);
    expect(task!.status).toBe('cancelled');

    const steps = dbModule.getStepsByTask(taskId);
    for (const step of steps) {
      expect(step.status).toBe('skipped');
    }
  });

  it('不能取消 processing 状态的任务', () => {
    const taskId = queueModule.createPipelineTask('audio_pipeline', '/test.flac');
    queueModule.updateTaskProgress(taskId, 1, 'processing');

    const result = queueModule.cancelTask(taskId);
    expect(result).toBe(false);

    expect(dbModule.getTask(taskId)!.status).toBe('processing');
  });

  it('不存在的任务返回 false', () => {
    expect(queueModule.cancelTask('nonexistent-id')).toBe(false);
  });
});

// ── 重试任务测试 ────────────────────────────────────────

describe('retryTask', () => {
  it('重试失败的任务', () => {
    const taskId = queueModule.createPipelineTask('audio_pipeline', '/test.flac');

    queueModule.updateTaskProgress(taskId, 1, 'completed');
    queueModule.updateTaskProgress(taskId, 2, 'failed', '处理错误');
    dbModule.updateTaskStatus(taskId, 'failed', '步骤 2 失败');

    const result = queueModule.retryTask(taskId);
    expect(result).toBe(true);

    const task = dbModule.getTask(taskId);
    expect(task!.status).toBe('pending');

    const steps = dbModule.getStepsByTask(taskId);
    expect(steps[0].status).toBe('completed');
    expect(steps[1].status).toBe('pending');
  });

  it('不能重试非 failed 状态的任务', () => {
    const taskId = queueModule.createPipelineTask('audio_pipeline', '/test.flac');
    expect(queueModule.retryTask(taskId)).toBe(false);
  });

  it('不存在的任务返回 false', () => {
    expect(queueModule.retryTask('nonexistent-id')).toBe(false);
  });
});

// ── 重试步骤测试 ────────────────────────────────────────

describe('retryStep', () => {
  it('重试特定失败步骤', () => {
    const taskId = queueModule.createPipelineTask('audio_pipeline', '/test.flac');

    for (let i = 1; i <= 3; i++) {
      queueModule.updateTaskProgress(taskId, i, 'completed');
    }
    queueModule.updateTaskProgress(taskId, 4, 'failed', '指纹计算失败');
    dbModule.updateTaskStatus(taskId, 'failed');

    const result = queueModule.retryStep(taskId, 4);
    expect(result).toBe(true);

    const steps = dbModule.getStepsByTask(taskId);
    expect(steps[3].status).toBe('pending');

    const task = dbModule.getTask(taskId);
    expect(task!.status).toBe('processing');
  });

  it('不能重试非 failed 状态的步骤', () => {
    const taskId = queueModule.createPipelineTask('audio_pipeline', '/test.flac');
    expect(queueModule.retryStep(taskId, 1)).toBe(false);
  });

  it('不存在的步骤编号返回 false', () => {
    const taskId = queueModule.createPipelineTask('audio_pipeline', '/test.flac');
    expect(queueModule.retryStep(taskId, 999)).toBe(false);
  });
});

// ── 优先级调整测试 ──────────────────────────────────────

describe('adjustPriority', () => {
  it('调整任务优先级', () => {
    const taskId = queueModule.createPipelineTask('audio_pipeline', '/test.flac', {
      priority: 100,
    });

    const result = queueModule.adjustPriority(taskId, 5);
    expect(result).toBe(true);

    const task = dbModule.getTask(taskId);
    expect(task!.priority).toBe(5);
  });

  it('优先级超出范围返回 false', () => {
    const taskId = queueModule.createPipelineTask('audio_pipeline', '/test.flac');
    expect(queueModule.adjustPriority(taskId, -1)).toBe(false);
    expect(queueModule.adjustPriority(taskId, 1000)).toBe(false);
  });

  it('不存在的任务返回 false', () => {
    expect(queueModule.adjustPriority('nonexistent-id', 50)).toBe(false);
  });
});

// ── 崩溃恢复测试 ────────────────────────────────────────

describe('recoverProcessingTasks', () => {
  it('无处理中任务时返回 0', () => {
    // 先确保没有 processing 状态的任务（之前测试可能留下的）
    const tasks = dbModule.listTasks({ status: 'processing' });
    for (const t of tasks) {
      dbModule.updateTaskStatus(t.id, 'completed');
    }

    const count = queueModule.recoverProcessingTasks();
    expect(count).toBe(0);
  });

  it('恢复处理中的任务', () => {
    // 先清理之前的 processing 任务
    const oldTasks = dbModule.listTasks({ status: 'processing' });
    for (const t of oldTasks) {
      dbModule.updateTaskStatus(t.id, 'completed');
    }

    const taskId = queueModule.createPipelineTask('audio_pipeline', '/test.flac');

    // 模拟步骤 1-3 完成，步骤 4 正在处理时崩溃
    queueModule.updateTaskProgress(taskId, 1, 'completed');
    queueModule.updateTaskProgress(taskId, 2, 'completed');
    queueModule.updateTaskProgress(taskId, 3, 'completed');
    queueModule.updateTaskProgress(taskId, 4, 'processing');

    expect(dbModule.getTask(taskId)!.status).toBe('processing');

    const count = queueModule.recoverProcessingTasks();
    expect(count).toBe(1);

    // 步骤 4 应被重置为 pending
    const steps = dbModule.getStepsByTask(taskId);
    expect(steps[0].status).toBe('completed');
    expect(steps[1].status).toBe('completed');
    expect(steps[2].status).toBe('completed');
    expect(steps[3].status).toBe('pending');
  });

  it('所有步骤已完成的任务标记为 completed', () => {
    // 先清理之前的 processing 任务
    const oldTasks = dbModule.listTasks({ status: 'processing' });
    for (const t of oldTasks) {
      dbModule.updateTaskStatus(t.id, 'completed');
    }

    const taskId = queueModule.createPipelineTask('audio_pipeline', '/test.flac');

    for (let i = 1; i <= 6; i++) {
      queueModule.updateTaskProgress(taskId, i, 'completed');
    }
    // 手动将任务状态设回 processing 模拟异常
    dbModule.updateTaskStatus(taskId, 'processing');

    const count = queueModule.recoverProcessingTasks();
    expect(count).toBe(1);

    expect(dbModule.getTask(taskId)!.status).toBe('completed');
  });
});
