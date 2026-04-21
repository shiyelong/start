// routes.ts — Express REST API 路由
// 提供任务管理、GPU 状态、队列统计、系统健康、Webhook 接收、
// Telegram 频道管理、带宽调度、去重管理、AI 标签管理、刮削源管理等 API

import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  getTask,
  getStepsByTask,
  listTasks,
  getLockStatus,
  db,
} from './db.js';
import {
  createPipelineTask,
  cancelTask,
  retryTask,
  retryStep,
  adjustPriority,
  getQueueStats,
  PIPELINE_STEPS_MAP,
} from './queue.js';
import { gpuScheduler } from './gpu-scheduler.js';
import { TaskType } from './types.js';

// ── 辅助函数 ──────────────────────────────────────────

/** 从 req.params 中安全提取字符串参数 */
function param(req: Request, key: string): string {
  const val = req.params[key];
  return Array.isArray(val) ? val[0] : (val ?? '');
}

/** 合法的任务类型集合 */
const VALID_TASK_TYPES = new Set(Object.values(TaskType));

/** 合法的 MPAA 分级集合 */
const VALID_MPAA_RATINGS = new Set(['G', 'PG', 'PG-13', 'R', 'NC-17']);

// ══════════════════════════════════════════════════════
// 任务管理路由
// ══════════════════════════════════════════════════════

const taskRouter = Router();

/**
 * POST /api/tasks — 创建流水线任务
 * body: { type, filePath, priority?, source?, mpaaRating?, metadata? }
 */
taskRouter.post('/', (req: Request, res: Response) => {
  try {
    const { type, filePath, priority, source, sourceUrl, mpaaRating, metadata } = req.body;

    // 参数校验
    if (!type || typeof type !== 'string') {
      res.status(400).json({ error: '缺少必填字段: type' });
      return;
    }
    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ error: '缺少必填字段: filePath' });
      return;
    }
    if (!PIPELINE_STEPS_MAP[type]) {
      res.status(400).json({ error: `不支持的任务类型: ${type}，支持: ${Object.keys(PIPELINE_STEPS_MAP).join(', ')}` });
      return;
    }
    if (priority !== undefined && (typeof priority !== 'number' || priority < 0 || priority > 999)) {
      res.status(400).json({ error: '优先级必须为 0-999 之间的数字' });
      return;
    }
    if (mpaaRating !== undefined && !VALID_MPAA_RATINGS.has(mpaaRating)) {
      res.status(400).json({ error: `不支持的 MPAA 分级: ${mpaaRating}` });
      return;
    }

    const taskId = createPipelineTask(type, filePath, {
      priority,
      source,
      sourceUrl,
      mpaaRating,
      metadata,
    });

    res.status(201).json({ id: taskId, message: '任务创建成功' });
  } catch (err) {
    console.error('[路由] 创建任务失败:', (err as Error).message);
    res.status(500).json({ error: '创建任务失败', detail: (err as Error).message });
  }
});

/**
 * GET /api/tasks — 查询任务列表（分页+过滤）
 * query: status, type, limit, offset
 */
taskRouter.get('/', (req: Request, res: Response) => {
  try {
    const { status, type, limit, offset } = req.query;

    const filter: Record<string, unknown> = {};
    if (status && typeof status === 'string') filter.status = status;
    if (type && typeof type === 'string') filter.type = type;
    if (limit) filter.limit = Math.min(Number(limit) || 50, 200);
    if (offset) filter.offset = Number(offset) || 0;

    const tasks = listTasks(filter);
    res.json({ tasks, count: tasks.length });
  } catch (err) {
    console.error('[路由] 查询任务列表失败:', (err as Error).message);
    res.status(500).json({ error: '查询任务列表失败' });
  }
});

/**
 * GET /api/tasks/:id — 任务详情（含步骤）
 */
taskRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const task = getTask(param(req, 'id'));
    if (!task) {
      res.status(404).json({ error: '任务不存在' });
      return;
    }

    const steps = getStepsByTask(param(req, 'id'));
    res.json({ task, steps });
  } catch (err) {
    console.error('[路由] 查询任务详情失败:', (err as Error).message);
    res.status(500).json({ error: '查询任务详情失败' });
  }
});

/**
 * PUT /api/tasks/:id/priority — 调整优先级
 * body: { priority }
 */
taskRouter.put('/:id/priority', (req: Request, res: Response) => {
  try {
    const { priority } = req.body;

    if (priority === undefined || typeof priority !== 'number') {
      res.status(400).json({ error: '缺少必填字段: priority (number)' });
      return;
    }
    if (priority < 0 || priority > 999) {
      res.status(400).json({ error: '优先级必须为 0-999 之间的数字' });
      return;
    }

    const task = getTask(param(req, 'id'));
    if (!task) {
      res.status(404).json({ error: '任务不存在' });
      return;
    }

    const success = adjustPriority(param(req, 'id'), priority);
    if (success) {
      res.json({ message: '优先级调整成功', priority });
    } else {
      res.status(400).json({ error: '优先级调整失败' });
    }
  } catch (err) {
    console.error('[路由] 调整优先级失败:', (err as Error).message);
    res.status(500).json({ error: '调整优先级失败' });
  }
});

/**
 * PUT /api/tasks/:id/retry — 重试失败任务
 */
taskRouter.put('/:id/retry', (req: Request, res: Response) => {
  try {
    const task = getTask(param(req, 'id'));
    if (!task) {
      res.status(404).json({ error: '任务不存在' });
      return;
    }

    const success = retryTask(param(req, 'id'));
    if (success) {
      res.json({ message: '任务已重新入队' });
    } else {
      res.status(400).json({ error: '重试失败，仅允许重试 failed 状态的任务' });
    }
  } catch (err) {
    console.error('[路由] 重试任务失败:', (err as Error).message);
    res.status(500).json({ error: '重试任务失败' });
  }
});

/**
 * PUT /api/tasks/:id/retry-step — 重试特定步骤
 * body: { stepNumber }
 */
taskRouter.put('/:id/retry-step', (req: Request, res: Response) => {
  try {
    const { stepNumber } = req.body;

    if (stepNumber === undefined || typeof stepNumber !== 'number') {
      res.status(400).json({ error: '缺少必填字段: stepNumber (number)' });
      return;
    }

    const task = getTask(param(req, 'id'));
    if (!task) {
      res.status(404).json({ error: '任务不存在' });
      return;
    }

    const success = retryStep(param(req, 'id'), stepNumber);
    if (success) {
      res.json({ message: `步骤 ${stepNumber} 已重新入队` });
    } else {
      res.status(400).json({ error: '步骤重试失败，仅允许重试 failed 状态的步骤' });
    }
  } catch (err) {
    console.error('[路由] 重试步骤失败:', (err as Error).message);
    res.status(500).json({ error: '重试步骤失败' });
  }
});

/**
 * DELETE /api/tasks/:id — 取消任务
 */
taskRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const task = getTask(param(req, 'id'));
    if (!task) {
      res.status(404).json({ error: '任务不存在' });
      return;
    }

    const success = cancelTask(param(req, 'id'));
    if (success) {
      res.json({ message: '任务已取消' });
    } else {
      res.status(400).json({ error: '取消失败，仅允许取消 pending 状态的任务' });
    }
  } catch (err) {
    console.error('[路由] 取消任务失败:', (err as Error).message);
    res.status(500).json({ error: '取消任务失败' });
  }
});

// ══════════════════════════════════════════════════════
// GPU 状态路由
// ══════════════════════════════════════════════════════

const gpuRouter = Router();

/**
 * GET /api/gpu/status — GPU 调度器状态（锁持有者、等待队列）
 */
gpuRouter.get('/status', (_req: Request, res: Response) => {
  try {
    const status = gpuScheduler.getStatus();
    res.json(status);
  } catch (err) {
    console.error('[路由] 获取 GPU 状态失败:', (err as Error).message);
    res.status(500).json({ error: '获取 GPU 状态失败' });
  }
});

/**
 * GET /api/gpu/lock — 当前锁信息
 */
gpuRouter.get('/lock', (_req: Request, res: Response) => {
  try {
    const lock = getLockStatus();
    res.json(lock);
  } catch (err) {
    console.error('[路由] 获取 GPU 锁信息失败:', (err as Error).message);
    res.status(500).json({ error: '获取 GPU 锁信息失败' });
  }
});

// ══════════════════════════════════════════════════════
// 队列统计路由
// ══════════════════════════════════════════════════════

const queueRouter = Router();

/**
 * GET /api/queue/stats — 队列计数（按流水线类型）
 */
queueRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (err) {
    console.error('[路由] 获取队列统计失败:', (err as Error).message);
    res.status(500).json({ error: '获取队列统计失败' });
  }
});

// ══════════════════════════════════════════════════════
// 系统健康路由
// ══════════════════════════════════════════════════════

const systemRouter = Router();

/**
 * GET /api/system/health — 服务健康检查
 */
systemRouter.get('/health', (_req: Request, res: Response) => {
  try {
    // 检查 SQLite 连接
    let dbStatus = 'ok';
    try {
      db.prepare('SELECT 1').get();
    } catch {
      dbStatus = 'error';
    }

    // 检查 Redis 连接（通过队列统计间接判断）
    const redisStatus = 'unknown'; // 异步检查在下方

    res.json({
      status: 'ok',
      service: 'task-scheduler',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      db: dbStatus,
      redis: redisStatus,
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    });
  } catch (err) {
    console.error('[路由] 健康检查失败:', (err as Error).message);
    res.status(500).json({ status: 'error', error: (err as Error).message });
  }
});

// ══════════════════════════════════════════════════════
// Webhook 接收路由
// ══════════════════════════════════════════════════════

const webhookRouter = Router();


/**
 * POST /webhook/download-complete — qBittorrent 下载完成回调
 * body: { name, savePath, hash?, category?, size? }
 */
webhookRouter.post('/download-complete', (req: Request, res: Response) => {
  try {
    const { name, savePath, hash, category, size } = req.body;

    if (!savePath || typeof savePath !== 'string') {
      res.status(400).json({ error: '缺少必填字段: savePath' });
      return;
    }

    // 根据文件路径或分类推断流水线类型
    const type = inferPipelineType(savePath, category);
    if (!type) {
      console.warn(`[Webhook] 无法推断流水线类型: ${savePath}`);
      res.status(200).json({ message: '已接收，但无法推断流水线类型，跳过处理' });
      return;
    }

    const taskId = createPipelineTask(type, savePath, {
      source: 'qbittorrent',
      metadata: { name, hash, category, size },
    });

    console.log(`[Webhook] qBittorrent 下载完成 — 文件: ${name}, 任务: ${taskId}`);
    res.status(201).json({ taskId, message: '已创建处理任务' });
  } catch (err) {
    console.error('[Webhook] download-complete 处理失败:', (err as Error).message);
    res.status(500).json({ error: '处理失败' });
  }
});

/**
 * POST /webhook/import-complete — Sonarr/Radarr 导入完成回调
 * body: { eventType, series/movie, episodeFile/movieFile }
 */
webhookRouter.post('/import-complete', (req: Request, res: Response) => {
  try {
    const { eventType } = req.body;

    // 从 Sonarr/Radarr webhook 中提取文件路径
    let filePath: string | undefined;
    let source = 'sonarr';

    if (req.body.episodeFile?.path) {
      filePath = req.body.episodeFile.path;
      source = 'sonarr';
    } else if (req.body.movieFile?.path) {
      filePath = req.body.movieFile.path;
      source = 'radarr';
    } else if (req.body.filePath) {
      filePath = req.body.filePath;
    }

    if (!filePath) {
      res.status(200).json({ message: '已接收，但未找到文件路径，跳过处理' });
      return;
    }

    const taskId = createPipelineTask('video_pipeline', filePath, {
      source,
      metadata: { eventType, ...req.body },
    });

    console.log(`[Webhook] ${source} 导入完成 — 文件: ${filePath}, 任务: ${taskId}`);
    res.status(201).json({ taskId, message: '已创建处理任务' });
  } catch (err) {
    console.error('[Webhook] import-complete 处理失败:', (err as Error).message);
    res.status(500).json({ error: '处理失败' });
  }
});

/**
 * POST /webhook/file-detected — file-watcher 新文件回调
 * body: { filePath, type?, source? }
 */
webhookRouter.post('/file-detected', (req: Request, res: Response) => {
  try {
    const { filePath, type, source } = req.body;

    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ error: '缺少必填字段: filePath' });
      return;
    }

    // 如果未指定类型，根据路径推断
    const pipelineType = type || inferPipelineType(filePath);
    if (!pipelineType || !PIPELINE_STEPS_MAP[pipelineType]) {
      res.status(400).json({ error: `无法确定流水线类型，请指定 type 字段` });
      return;
    }

    const taskId = createPipelineTask(pipelineType, filePath, {
      source: source || 'file-watcher',
    });

    console.log(`[Webhook] 新文件检测 — 文件: ${filePath}, 类型: ${pipelineType}, 任务: ${taskId}`);
    res.status(201).json({ taskId, message: '已创建处理任务' });
  } catch (err) {
    console.error('[Webhook] file-detected 处理失败:', (err as Error).message);
    res.status(500).json({ error: '处理失败' });
  }
});

/**
 * 根据文件路径或分类推断流水线类型
 */
function inferPipelineType(filePath: string, category?: string): string | null {
  const lower = filePath.toLowerCase();
  const cat = category?.toLowerCase() ?? '';

  // 按目录路径推断
  if (lower.includes('/videos/') || lower.includes('/movies/') || lower.includes('/tv/')) {
    return 'video_pipeline';
  }
  if (lower.includes('/comics/') || lower.includes('/manga/')) {
    return 'comic_pipeline';
  }
  if (lower.includes('/novels/') || lower.includes('/books/')) {
    return 'novel_pipeline';
  }
  if (lower.includes('/music/') || lower.includes('/audio/') || lower.includes('/asmr/')) {
    return 'audio_pipeline';
  }

  // 按文件扩展名推断
  if (/\.(mp4|mkv|avi|mov|wmv|flv|webm|ts|m4v)$/i.test(filePath)) {
    return 'video_pipeline';
  }
  if (/\.(cbz|cbr|zip|rar)$/i.test(filePath) || lower.includes('comic') || lower.includes('manga')) {
    return 'comic_pipeline';
  }
  if (/\.(txt|epub|mobi|pdf)$/i.test(filePath)) {
    return 'novel_pipeline';
  }
  if (/\.(mp3|flac|aac|ogg|wav|m4a|wma|opus)$/i.test(filePath)) {
    return 'audio_pipeline';
  }

  // 按 qBittorrent 分类推断
  if (cat.includes('video') || cat.includes('movie') || cat.includes('tv')) {
    return 'video_pipeline';
  }
  if (cat.includes('comic') || cat.includes('manga')) {
    return 'comic_pipeline';
  }
  if (cat.includes('novel') || cat.includes('book')) {
    return 'novel_pipeline';
  }
  if (cat.includes('music') || cat.includes('audio')) {
    return 'audio_pipeline';
  }

  return null;
}

// ══════════════════════════════════════════════════════
// Telegram 频道管理路由
// ══════════════════════════════════════════════════════

const telegramRouter = Router();

/**
 * GET /api/telegram/channels — 频道列表
 */
telegramRouter.get('/channels', (_req: Request, res: Response) => {
  try {
    const channels = db.prepare(
      'SELECT * FROM telegram_channels ORDER BY created_at DESC',
    ).all();
    res.json({ channels });
  } catch (err) {
    console.error('[路由] 查询 Telegram 频道失败:', (err as Error).message);
    res.status(500).json({ error: '查询频道列表失败' });
  }
});

/**
 * POST /api/telegram/channels — 添加频道
 * body: { channelId, name, type?, mpaaRating?, scrapeInterval? }
 */
telegramRouter.post('/channels', (req: Request, res: Response) => {
  try {
    const { channelId, name, type, mpaaRating, scrapeInterval } = req.body;

    if (!channelId || typeof channelId !== 'string') {
      res.status(400).json({ error: '缺少必填字段: channelId' });
      return;
    }
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: '缺少必填字段: name' });
      return;
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO telegram_channels (id, channel_id, name, type, mpaa_rating, scrape_interval)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      channelId,
      name,
      type || 'channel',
      mpaaRating || 'PG',
      scrapeInterval || 1800,
    );

    res.status(201).json({ id, message: '频道添加成功' });
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('UNIQUE constraint')) {
      res.status(400).json({ error: '频道 ID 已存在' });
      return;
    }
    console.error('[路由] 添加 Telegram 频道失败:', message);
    res.status(500).json({ error: '添加频道失败' });
  }
});

/**
 * PUT /api/telegram/channels/:id — 更新频道
 * body: { name?, type?, mpaaRating?, scrapeInterval?, enabled? }
 */
telegramRouter.put('/channels/:id', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT id FROM telegram_channels WHERE id = ?').get(param(req, 'id'));
    if (!existing) {
      res.status(404).json({ error: '频道不存在' });
      return;
    }

    const { name, type, mpaaRating, scrapeInterval, enabled } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (type !== undefined) { updates.push('type = ?'); params.push(type); }
    if (mpaaRating !== undefined) { updates.push('mpaa_rating = ?'); params.push(mpaaRating); }
    if (scrapeInterval !== undefined) { updates.push('scrape_interval = ?'); params.push(scrapeInterval); }
    if (enabled !== undefined) { updates.push('enabled = ?'); params.push(enabled ? 1 : 0); }

    if (updates.length === 0) {
      res.status(400).json({ error: '未提供任何更新字段' });
      return;
    }

    params.push(param(req, 'id'));
    db.prepare(`UPDATE telegram_channels SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    res.json({ message: '频道更新成功' });
  } catch (err) {
    console.error('[路由] 更新 Telegram 频道失败:', (err as Error).message);
    res.status(500).json({ error: '更新频道失败' });
  }
});

/**
 * DELETE /api/telegram/channels/:id — 删除频道
 */
telegramRouter.delete('/channels/:id', (req: Request, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM telegram_channels WHERE id = ?').run(param(req, 'id'));
    if (result.changes === 0) {
      res.status(404).json({ error: '频道不存在' });
      return;
    }
    res.json({ message: '频道删除成功' });
  } catch (err) {
    console.error('[路由] 删除 Telegram 频道失败:', (err as Error).message);
    res.status(500).json({ error: '删除频道失败' });
  }
});


// ══════════════════════════════════════════════════════
// 带宽调度路由
// ══════════════════════════════════════════════════════

const bandwidthRouter = Router();

/**
 * GET /api/bandwidth/status — 当前带宽使用情况
 */
bandwidthRouter.get('/status', (_req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // 获取今日使用量
    const usage = db.prepare(
      'SELECT * FROM bandwidth_usage WHERE date = ?',
    ).get(today) as Record<string, unknown> | undefined;

    // 获取当前生效的调度规则
    const currentHour = new Date().getHours();
    const activeRule = db.prepare(
      'SELECT * FROM bandwidth_rules WHERE enabled = 1 AND start_hour <= ? AND end_hour > ? ORDER BY start_hour ASC LIMIT 1',
    ).get(currentHour, currentHour) as Record<string, unknown> | undefined;

    // 获取所有规则
    const rules = db.prepare(
      'SELECT * FROM bandwidth_rules ORDER BY start_hour ASC',
    ).all();

    res.json({
      date: today,
      usage: usage || { date: today, bytes_downloaded: 0, bytes_uploaded: 0, daily_limit: 53687091200 },
      activeRule: activeRule || null,
      rules,
    });
  } catch (err) {
    console.error('[路由] 获取带宽状态失败:', (err as Error).message);
    res.status(500).json({ error: '获取带宽状态失败' });
  }
});

/**
 * PUT /api/bandwidth/rules — 更新调度规则
 * body: { rules: [{ id?, startHour, endHour, downloadLimit, uploadLimit, enabled? }] }
 */
bandwidthRouter.put('/rules', (req: Request, res: Response) => {
  try {
    const { rules } = req.body;

    if (!Array.isArray(rules)) {
      res.status(400).json({ error: '缺少必填字段: rules (array)' });
      return;
    }

    // 在事务中替换所有规则
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO bandwidth_rules (id, start_hour, end_hour, download_limit, upload_limit, enabled)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      // 清空现有规则
      db.prepare('DELETE FROM bandwidth_rules').run();

      // 插入新规则
      for (const rule of rules) {
        if (rule.startHour === undefined || rule.endHour === undefined) {
          throw new Error('每条规则必须包含 startHour 和 endHour');
        }
        insertStmt.run(
          rule.id || uuidv4(),
          rule.startHour,
          rule.endHour,
          rule.downloadLimit ?? null,
          rule.uploadLimit ?? null,
          rule.enabled !== undefined ? (rule.enabled ? 1 : 0) : 1,
        );
      }
    });

    transaction();
    res.json({ message: '带宽规则更新成功', count: rules.length });
  } catch (err) {
    console.error('[路由] 更新带宽规则失败:', (err as Error).message);
    res.status(500).json({ error: '更新带宽规则失败', detail: (err as Error).message });
  }
});

// ══════════════════════════════════════════════════════
// 去重管理路由
// ══════════════════════════════════════════════════════

const dedupRouter = Router();

/**
 * GET /api/dedup/stats — 去重统计
 */
dedupRouter.get('/stats', (_req: Request, res: Response) => {
  try {
    // 按内容类型统计去重记录
    const byType = db.prepare(`
      SELECT content_type, status, COUNT(*) as count
      FROM dedup_records
      GROUP BY content_type, status
    `).all();

    // 总计
    const total = db.prepare('SELECT COUNT(*) as count FROM dedup_records').get() as { count: number };
    const pending = db.prepare(
      "SELECT COUNT(*) as count FROM dedup_records WHERE status = 'pending'",
    ).get() as { count: number };

    // 各哈希表记录数
    const videoHashes = db.prepare('SELECT COUNT(*) as count FROM video_hashes').get() as { count: number };
    const comicHashes = db.prepare('SELECT COUNT(*) as count FROM comic_hashes').get() as { count: number };
    const audioFingerprints = db.prepare('SELECT COUNT(*) as count FROM audio_fingerprints').get() as { count: number };
    const novelFingerprints = db.prepare('SELECT COUNT(*) as count FROM novel_fingerprints').get() as { count: number };

    res.json({
      records: { total: total.count, pending: pending.count, byType },
      hashes: {
        video: videoHashes.count,
        comic: comicHashes.count,
        audio: audioFingerprints.count,
        novel: novelFingerprints.count,
      },
    });
  } catch (err) {
    console.error('[路由] 获取去重统计失败:', (err as Error).message);
    res.status(500).json({ error: '获取去重统计失败' });
  }
});

/**
 * POST /api/dedup/full-scan — 触发全库扫描
 */
dedupRouter.post('/full-scan', (_req: Request, res: Response) => {
  try {
    // 创建一个 dedup_scan 类型的任务
    // 注意: dedup_scan 不在 PIPELINE_STEPS_MAP 中，需要直接写入数据库
    const taskId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO tasks (id, type, status, priority, file_path, current_step, total_steps, created_at)
      VALUES (?, 'dedup_scan', 'pending', 500, '/data/media/', 0, 1, ?)
    `).run(taskId, now);

    console.log(`[路由] 触发全库去重扫描 — 任务: ${taskId}`);
    res.status(201).json({ taskId, message: '全库去重扫描任务已创建' });
  } catch (err) {
    console.error('[路由] 触发全库扫描失败:', (err as Error).message);
    res.status(500).json({ error: '触发全库扫描失败' });
  }
});

// ══════════════════════════════════════════════════════
// AI 标签管理路由
// ══════════════════════════════════════════════════════

const taggerRouter = Router();

/**
 * GET /api/tagger/stats — 标签统计
 */
taggerRouter.get('/stats', (_req: Request, res: Response) => {
  try {
    // 按类型统计内容数量
    const byType = db.prepare(`
      SELECT type, COUNT(*) as count
      FROM content_registry
      GROUP BY type
    `).all();

    // 按 MPAA 分级统计
    const byRating = db.prepare(`
      SELECT mpaa_rating, COUNT(*) as count
      FROM content_registry
      GROUP BY mpaa_rating
    `).all();

    // 总计
    const total = db.prepare('SELECT COUNT(*) as count FROM content_registry').get() as { count: number };

    // 待审核数量（metadata 中包含 review_needed 标记的）
    const pendingReview = db.prepare(
      "SELECT COUNT(*) as count FROM content_registry WHERE metadata LIKE '%review_needed%'",
    ).get() as { count: number };

    res.json({
      total: total.count,
      pendingReview: pendingReview.count,
      byType,
      byRating,
    });
  } catch (err) {
    console.error('[路由] 获取标签统计失败:', (err as Error).message);
    res.status(500).json({ error: '获取标签统计失败' });
  }
});

/**
 * GET /api/tagger/review — 待审核标签列表
 */
taggerRouter.get('/review', (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const items = db.prepare(`
      SELECT * FROM content_registry
      WHERE metadata LIKE '%review_needed%'
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    res.json({ items, count: items.length });
  } catch (err) {
    console.error('[路由] 获取待审核列表失败:', (err as Error).message);
    res.status(500).json({ error: '获取待审核列表失败' });
  }
});

/**
 * PUT /api/tagger/:contentId/tags — 修正标签
 * body: { tags: object }
 */
taggerRouter.put('/:contentId/tags', (req: Request, res: Response) => {
  try {
    const { tags } = req.body;
    if (!tags || typeof tags !== 'object') {
      res.status(400).json({ error: '缺少必填字段: tags (object)' });
      return;
    }

    const content = db.prepare('SELECT id, metadata FROM content_registry WHERE id = ?').get(param(req, 'contentId')) as { id: string; metadata: string | null } | undefined;
    if (!content) {
      res.status(404).json({ error: '内容不存在' });
      return;
    }

    // 合并现有 metadata 和新标签
    let existingMeta: Record<string, unknown> = {};
    if (content.metadata) {
      try { existingMeta = JSON.parse(content.metadata); } catch { /* 忽略解析错误 */ }
    }
    existingMeta.tags = tags;
    // 移除待审核标记
    delete existingMeta.review_needed;

    db.prepare(
      'UPDATE content_registry SET metadata = ?, updated_at = datetime(\'now\') WHERE id = ?',
    ).run(JSON.stringify(existingMeta), param(req, 'contentId'));

    res.json({ message: '标签更新成功' });
  } catch (err) {
    console.error('[路由] 更新标签失败:', (err as Error).message);
    res.status(500).json({ error: '更新标签失败' });
  }
});

/**
 * PUT /api/tagger/:contentId/rating — 修正分级
 * body: { rating: string }
 */
taggerRouter.put('/:contentId/rating', (req: Request, res: Response) => {
  try {
    const { rating } = req.body;
    if (!rating || !VALID_MPAA_RATINGS.has(rating)) {
      res.status(400).json({ error: `无效的 MPAA 分级，支持: ${[...VALID_MPAA_RATINGS].join(', ')}` });
      return;
    }

    const content = db.prepare('SELECT id FROM content_registry WHERE id = ?').get(param(req, 'contentId'));
    if (!content) {
      res.status(404).json({ error: '内容不存在' });
      return;
    }

    db.prepare(
      "UPDATE content_registry SET mpaa_rating = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(rating, param(req, 'contentId'));

    res.json({ message: '分级更新成功', rating });
  } catch (err) {
    console.error('[路由] 更新分级失败:', (err as Error).message);
    res.status(500).json({ error: '更新分级失败' });
  }
});


// ══════════════════════════════════════════════════════
// 刮削源管理路由
// ══════════════════════════════════════════════════════

const scraperRouter = Router();

/**
 * GET /api/scrapers — 刮削源列表
 */
scraperRouter.get('/', (_req: Request, res: Response) => {
  try {
    const sources = db.prepare(
      'SELECT * FROM scraper_sources ORDER BY created_at DESC',
    ).all();
    res.json({ sources });
  } catch (err) {
    console.error('[路由] 查询刮削源失败:', (err as Error).message);
    res.status(500).json({ error: '查询刮削源列表失败' });
  }
});

/**
 * PUT /api/scrapers/:id/config — 更新刮削源配置
 * body: { name?, url?, mpaaRating?, scrapeInterval?, maxPerRun?, enabled?, filterTags? }
 */
scraperRouter.put('/:id/config', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT id FROM scraper_sources WHERE id = ?').get(param(req, 'id'));
    if (!existing) {
      res.status(404).json({ error: '刮削源不存在' });
      return;
    }

    const { name, url, mpaaRating, scrapeInterval, maxPerRun, enabled, filterTags } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (url !== undefined) { updates.push('url = ?'); params.push(url); }
    if (mpaaRating !== undefined) { updates.push('mpaa_rating = ?'); params.push(mpaaRating); }
    if (scrapeInterval !== undefined) { updates.push('scrape_interval = ?'); params.push(scrapeInterval); }
    if (maxPerRun !== undefined) { updates.push('max_per_run = ?'); params.push(maxPerRun); }
    if (enabled !== undefined) { updates.push('enabled = ?'); params.push(enabled ? 1 : 0); }
    if (filterTags !== undefined) { updates.push('filter_tags = ?'); params.push(filterTags); }

    if (updates.length === 0) {
      res.status(400).json({ error: '未提供任何更新字段' });
      return;
    }

    params.push(param(req, 'id'));
    db.prepare(`UPDATE scraper_sources SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    res.json({ message: '刮削源配置更新成功' });
  } catch (err) {
    console.error('[路由] 更新刮削源配置失败:', (err as Error).message);
    res.status(500).json({ error: '更新刮削源配置失败' });
  }
});

/**
 * POST /api/scrapers/:id/trigger — 手动触发刮削
 */
scraperRouter.post('/:id/trigger', (req: Request, res: Response) => {
  try {
    const source = db.prepare('SELECT * FROM scraper_sources WHERE id = ?').get(param(req, 'id')) as Record<string, unknown> | undefined;
    if (!source) {
      res.status(404).json({ error: '刮削源不存在' });
      return;
    }

    // 更新最后刮削时间
    db.prepare(
      "UPDATE scraper_sources SET last_scraped_at = datetime('now') WHERE id = ?",
    ).run(param(req, 'id'));

    // 实际刮削逻辑由 scraper 适配器处理，这里仅标记触发
    console.log(`[路由] 手动触发刮削源: ${source.name} (${source.id})`);
    res.json({ message: `刮削源 ${source.name} 已触发`, sourceId: param(req, 'id') });
  } catch (err) {
    console.error('[路由] 触发刮削失败:', (err as Error).message);
    res.status(500).json({ error: '触发刮削失败' });
  }
});

// ══════════════════════════════════════════════════════
// 路由注册
// ══════════════════════════════════════════════════════

/**
 * 将所有路由挂载到 Express 应用
 */
export function registerRoutes(app: import('express').Express): void {
  // 任务管理
  app.use('/api/tasks', taskRouter);

  // GPU 状态
  app.use('/api/gpu', gpuRouter);

  // 队列统计
  app.use('/api/queue', queueRouter);

  // 系统健康
  app.use('/api/system', systemRouter);

  // Webhook 接收
  app.use('/webhook', webhookRouter);

  // Telegram 频道管理
  app.use('/api/telegram', telegramRouter);

  // 带宽调度
  app.use('/api/bandwidth', bandwidthRouter);

  // 去重管理
  app.use('/api/dedup', dedupRouter);

  // AI 标签管理
  app.use('/api/tagger', taggerRouter);

  // 刮削源管理
  app.use('/api/scrapers', scraperRouter);

  console.log('[路由] 所有 API 路由已注册');
}