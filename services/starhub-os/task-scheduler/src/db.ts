// db.ts — SQLite 数据访问层
// 封装 better-sqlite3，提供 tasks/task_steps/gpu_lock/content_registry 的 CRUD 操作

import Database, { type Database as DatabaseType } from 'better-sqlite3';
import type {
  Task,
  TaskStep,
  GpuLock,
  ContentRegistryEntry,
  ListTasksFilter,
} from './types.js';

// ── 数据库连接 ─────────────────────────────────────────

const DB_PATH = process.env.DB_PATH || '/data/pipeline.db';

const database: DatabaseType = new Database(DB_PATH);

// 启用 WAL 模式，提升并发读性能
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');

// ── 预编译语句 ─────────────────────────────────────────

// -- tasks --
const stmtInsertTask = database.prepare(`
  INSERT INTO tasks (id, type, status, priority, source, source_url, file_path,
    content_id, content_type, mpaa_rating, current_step, total_steps,
    error_message, retry_count, created_at, started_at, completed_at, metadata)
  VALUES (@id, @type, @status, @priority, @source, @source_url, @file_path,
    @content_id, @content_type, @mpaa_rating, @current_step, @total_steps,
    @error_message, @retry_count, @created_at, @started_at, @completed_at, @metadata)
`);

const stmtGetTask = database.prepare(`
  SELECT * FROM tasks WHERE id = ?
`);

const stmtUpdateTaskStatus = database.prepare(`
  UPDATE tasks SET status = @status, error_message = @error_message,
    started_at = CASE WHEN @status = 'processing' AND started_at IS NULL THEN datetime('now') ELSE started_at END,
    completed_at = CASE WHEN @status IN ('completed', 'failed', 'cancelled') THEN datetime('now') ELSE completed_at END
  WHERE id = @id
`);

const stmtUpdateTaskStep = database.prepare(`
  UPDATE tasks SET current_step = @current_step WHERE id = @id
`);

const stmtDeleteTask = database.prepare(`
  DELETE FROM tasks WHERE id = ?
`);

// -- task_steps --
const stmtInsertStep = database.prepare(`
  INSERT INTO task_steps (id, task_id, step_number, step_name, status,
    error_message, retry_count, started_at, completed_at, duration_ms, output_path, metadata)
  VALUES (@id, @task_id, @step_number, @step_name, @status,
    @error_message, @retry_count, @started_at, @completed_at, @duration_ms, @output_path, @metadata)
`);

const stmtGetStepsByTask = database.prepare(`
  SELECT * FROM task_steps WHERE task_id = ? ORDER BY step_number ASC
`);

const stmtUpdateStepStatus = database.prepare(`
  UPDATE task_steps SET status = @status, error_message = @error_message,
    started_at = CASE WHEN @status = 'processing' AND started_at IS NULL THEN datetime('now') ELSE started_at END,
    completed_at = CASE WHEN @status IN ('completed', 'failed', 'skipped') THEN datetime('now') ELSE completed_at END,
    duration_ms = @duration_ms
  WHERE id = @id
`);

// -- gpu_lock --
const stmtGetLock = database.prepare(`
  SELECT * FROM gpu_lock WHERE id = 1
`);

// 原子获取锁：仅当 locked_by 为空时才写入
const stmtAcquireLock = database.prepare(`
  UPDATE gpu_lock
  SET locked_by = @locked_by, service = @service,
      locked_at = datetime('now'), expires_at = @expires_at
  WHERE id = 1 AND locked_by IS NULL
`);

const stmtReleaseLock = database.prepare(`
  UPDATE gpu_lock
  SET locked_by = NULL, service = NULL, locked_at = NULL, expires_at = NULL
  WHERE id = 1
`);

// -- content_registry --
const stmtInsertContent = database.prepare(`
  INSERT INTO content_registry (id, type, title, mpaa_rating, status,
    duration_sec, resolution, audio_tracks, subtitle_tracks, page_count,
    versions, word_count, chapter_count, modes, artist, formats,
    file_path, thumbnail_path, source, source_url, metadata, created_at, updated_at)
  VALUES (@id, @type, @title, @mpaa_rating, @status,
    @duration_sec, @resolution, @audio_tracks, @subtitle_tracks, @page_count,
    @versions, @word_count, @chapter_count, @modes, @artist, @formats,
    @file_path, @thumbnail_path, @source, @source_url, @metadata,
    datetime('now'), datetime('now'))
`);

const stmtGetContent = database.prepare(`
  SELECT * FROM content_registry WHERE id = ?
`);

const stmtUpdateContent = database.prepare(`
  UPDATE content_registry
  SET title = @title, mpaa_rating = @mpaa_rating, status = @status,
      duration_sec = @duration_sec, resolution = @resolution,
      audio_tracks = @audio_tracks, subtitle_tracks = @subtitle_tracks,
      page_count = @page_count, versions = @versions,
      word_count = @word_count, chapter_count = @chapter_count,
      modes = @modes, artist = @artist, formats = @formats,
      file_path = @file_path, thumbnail_path = @thumbnail_path,
      source = @source, source_url = @source_url, metadata = @metadata,
      updated_at = datetime('now')
  WHERE id = @id
`);

// ── tasks CRUD ─────────────────────────────────────────

/** 创建任务 */
export function createTask(task: Task): void {
  stmtInsertTask.run(task);
}

/** 按 ID 获取任务 */
export function getTask(id: string): Task | undefined {
  return stmtGetTask.get(id) as Task | undefined;
}

/**
 * 查询任务列表，支持 status/type 过滤和分页
 * 默认按 priority ASC, created_at ASC 排序（优先级数字越小越优先）
 */
export function listTasks(filter: ListTasksFilter = {}): Task[] {
  const { status, type, limit = 50, offset = 0 } = filter;

  // 动态拼接 WHERE 条件
  const conditions: string[] = [];
  const params: Record<string, unknown> = { limit, offset };

  if (status) {
    conditions.push('status = @status');
    params.status = status;
  }
  if (type) {
    conditions.push('type = @type');
    params.type = type;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM tasks ${where} ORDER BY priority ASC, created_at ASC LIMIT @limit OFFSET @offset`;

  return database.prepare(sql).all(params) as Task[];
}

/** 更新任务状态（同时自动设置 started_at / completed_at） */
export function updateTaskStatus(
  id: string,
  status: string,
  errorMessage: string | null = null,
): void {
  stmtUpdateTaskStatus.run({ id, status, error_message: errorMessage });
}

/** 更新任务当前步骤编号 */
export function updateTaskStep(id: string, currentStep: number): void {
  stmtUpdateTaskStep.run({ id, current_step: currentStep });
}

/** 删除任务（级联删除关联的 task_steps） */
export function deleteTask(id: string): void {
  stmtDeleteTask.run(id);
}

// ── task_steps CRUD ────────────────────────────────────

/** 创建步骤 */
export function createStep(step: TaskStep): void {
  stmtInsertStep.run(step);
}

/** 获取某任务的所有步骤（按 step_number 升序） */
export function getStepsByTask(taskId: string): TaskStep[] {
  return stmtGetStepsByTask.all(taskId) as TaskStep[];
}

/** 更新步骤状态（同时自动设置 started_at / completed_at） */
export function updateStepStatus(
  id: string,
  status: string,
  errorMessage: string | null = null,
  durationMs: number | null = null,
): void {
  stmtUpdateStepStatus.run({
    id,
    status,
    error_message: errorMessage,
    duration_ms: durationMs,
  });
}

// ── gpu_lock ───────────────────────────────────────────

/**
 * 尝试获取 GPU 锁（原子操作）
 * 使用 UPDATE ... WHERE locked_by IS NULL 保证互斥
 * @returns true 表示获取成功
 */
export function acquireLock(
  lockedBy: string,
  service: string,
  expiresAt: string,
): boolean {
  const result = stmtAcquireLock.run({
    locked_by: lockedBy,
    service,
    expires_at: expiresAt,
  });
  return result.changes > 0;
}

/** 释放 GPU 锁 */
export function releaseLock(): void {
  stmtReleaseLock.run();
}

/** 获取当前锁状态 */
export function getLockStatus(): GpuLock {
  return stmtGetLock.get() as GpuLock;
}

/** 检查 GPU 是否被锁定 */
export function isLocked(): boolean {
  const lock = getLockStatus();
  return lock.locked_by !== null;
}

// ── content_registry ───────────────────────────────────

/** 注册处理完成的内容 */
export function registerContent(entry: Omit<ContentRegistryEntry, 'created_at' | 'updated_at'>): void {
  stmtInsertContent.run(entry);
}

/** 按 ID 获取内容 */
export function getContent(id: string): ContentRegistryEntry | undefined {
  return stmtGetContent.get(id) as ContentRegistryEntry | undefined;
}

/** 更新内容信息 */
export function updateContent(entry: Omit<ContentRegistryEntry, 'created_at' | 'updated_at'>): void {
  stmtUpdateContent.run(entry);
}

// ── 事务辅助 ───────────────────────────────────────────

/**
 * 在事务中执行回调函数
 * 自动 BEGIN / COMMIT，异常时 ROLLBACK
 */
export function withTransaction<T>(fn: () => T): T {
  const transaction = database.transaction(fn);
  return transaction();
}

// ── 导出单例 ───────────────────────────────────────────

/** 底层 better-sqlite3 实例（供高级用法或测试使用） */
export { database as db };
