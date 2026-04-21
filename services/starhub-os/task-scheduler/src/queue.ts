// queue.ts — BullMQ 任务队列核心
// 管理 4 条处理流水线队列（视频/漫画/小说/音频），提供任务创建、状态管理、崩溃恢复等功能
// 基于 BullMQ + ioredis 实现，任务元数据持久化到 SQLite（db.ts）

import { Queue, type ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  createTask,
  createStep,
  getTask,
  getStepsByTask,
  updateTaskStatus,
  updateTaskStep,
  updateStepStatus,
  listTasks,
  withTransaction,
  db,
} from './db.js';
import { TaskStatus, StepStatus } from './types.js';
import type { Task, TaskStep } from './types.js';

// ── 流水线步骤定义 ─────────────────────────────────────

/** 视频处理流水线 — 12 步 */
export const VIDEO_PIPELINE_STEPS: readonly string[] = [
  'dedup',
  'tagger',
  'collection_detect',
  'ad_detect',
  'ad_remove',
  'watermark_detect',
  'watermark_remove',
  'subtitle_generate',
  'subtitle_translate',
  'dubbing',
  'mux',
  'register',
] as const;

/** 漫画处理流水线 — 9 步 */
export const COMIC_PIPELINE_STEPS: readonly string[] = [
  'dedup',
  'tagger',
  'ocr',
  'translate',
  'render_text',
  'colorize',
  'package_versions',
  'register',
  'cleanup',
] as const;

/** 小说处理流水线 — 10 步 */
export const NOVEL_PIPELINE_STEPS: readonly string[] = [
  'dedup',
  'tagger',
  'preprocess',
  'translate',
  'vn_script',
  'vn_characters',
  'vn_backgrounds',
  'vn_voice',
  'vn_package',
  'register',
] as const;

/** 音频处理流水线 — 6 步 */
export const AUDIO_PIPELINE_STEPS: readonly string[] = [
  'dedup',
  'tagger',
  'normalize',
  'fingerprint',
  'format_convert',
  'register',
] as const;

/** 流水线类型 → 步骤定义映射 */
export const PIPELINE_STEPS_MAP: Record<string, readonly string[]> = {
  video_pipeline: VIDEO_PIPELINE_STEPS,
  comic_pipeline: COMIC_PIPELINE_STEPS,
  novel_pipeline: NOVEL_PIPELINE_STEPS,
  audio_pipeline: AUDIO_PIPELINE_STEPS,
};

// ── Redis 连接 ─────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

/**
 * 创建 ioredis 连接实例
 * 连接失败时仅打印警告，不终止进程
 */
function createRedisConnection(): Redis {
  const connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // BullMQ 要求此设置
    enableReadyCheck: false,
    retryStrategy(times: number): number | null {
      if (times > 10) {
        console.warn(`[队列] Redis 重连失败超过 10 次，停止重试`);
        return null;
      }
      // 指数退避，最大 30 秒
      const delay = Math.min(times * 1000, 30_000);
      console.warn(`[队列] Redis 连接断开，${delay}ms 后第 ${times} 次重试`);
      return delay;
    },
  });

  connection.on('error', (err: Error) => {
    console.warn(`[队列] Redis 连接错误: ${err.message}`);
  });

  connection.on('connect', () => {
    console.log(`[队列] Redis 已连接: ${REDIS_URL}`);
  });

  return connection;
}

/** 共享 Redis 连接实例 */
const redisConnection = createRedisConnection();

// ── BullMQ 队列实例 ───────────────────────────────────

/** 视频流水线队列 */
export const videoQueue = new Queue('video_pipeline', {
  connection: redisConnection as ConnectionOptions,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

/** 漫画流水线队列 */
export const comicQueue = new Queue('comic_pipeline', {
  connection: redisConnection as ConnectionOptions,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

/** 小说流水线队列 */
export const novelQueue = new Queue('novel_pipeline', {
  connection: redisConnection as ConnectionOptions,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

/** 音频流水线队列 */
export const audioQueue = new Queue('audio_pipeline', {
  connection: redisConnection as ConnectionOptions,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

/** 队列类型 → BullMQ Queue 实例映射 */
export const QUEUE_MAP: Record<string, Queue> = {
  video_pipeline: videoQueue,
  comic_pipeline: comicQueue,
  novel_pipeline: novelQueue,
  audio_pipeline: audioQueue,
};

// ── 任务创建选项 ───────────────────────────────────────

/** createPipelineTask 的可选参数 */
export interface CreateTaskOptions {
  /** 任务优先级，数值越小越优先，默认 100 */
  priority?: number;
  /** 来源标识（sonarr/radarr/telegram/manual/scraper/agent） */
  source?: string;
  /** 来源 URL */
  sourceUrl?: string;
  /** 内容 ID（已知时传入） */
  contentId?: string;
  /** 内容类型 */
  contentType?: string;
  /** MPAA 分级，默认 PG */
  mpaaRating?: string;
  /** 附加元数据 JSON */
  metadata?: Record<string, unknown>;
}

// ── 任务创建 ───────────────────────────────────────────

/**
 * 创建流水线处理任务
 * 1. 生成 UUID 作为任务 ID
 * 2. 在 SQLite 中创建任务记录和所有步骤记录（事务）
 * 3. 将任务添加到对应的 BullMQ 队列
 *
 * @param type 流水线类型（video_pipeline/comic_pipeline/novel_pipeline/audio_pipeline）
 * @param filePath 待处理文件路径
 * @param options 可选参数
 * @returns 任务 ID
 */
export function createPipelineTask(
  type: string,
  filePath: string,
  options: CreateTaskOptions = {},
): string {
  const steps = PIPELINE_STEPS_MAP[type];
  if (!steps) {
    throw new Error(`[队列] 未知的流水线类型: ${type}`);
  }

  const taskId = uuidv4();
  const now = new Date().toISOString();
  const priority = options.priority ?? 100;

  // 在事务中同时创建任务和所有步骤记录
  withTransaction(() => {
    // 创建任务记录
    const task: Task = {
      id: taskId,
      type,
      status: TaskStatus.Pending,
      priority,
      source: options.source ?? null,
      source_url: options.sourceUrl ?? null,
      file_path: filePath,
      content_id: options.contentId ?? null,
      content_type: options.contentType ?? null,
      mpaa_rating: options.mpaaRating ?? 'PG',
      current_step: 0,
      total_steps: steps.length,
      error_message: null,
      retry_count: 0,
      created_at: now,
      started_at: null,
      completed_at: null,
      metadata: options.metadata ? JSON.stringify(options.metadata) : null,
    };
    createTask(task);

    // 创建所有步骤记录
    for (let i = 0; i < steps.length; i++) {
      const step: TaskStep = {
        id: uuidv4(),
        task_id: taskId,
        step_number: i + 1,
        step_name: steps[i],
        status: StepStatus.Pending,
        error_message: null,
        retry_count: 0,
        started_at: null,
        completed_at: null,
        duration_ms: null,
        output_path: null,
        metadata: null,
      };
      createStep(step);
    }
  });

  // 添加到 BullMQ 队列（异步操作，不阻塞返回）
  const queue = QUEUE_MAP[type];
  if (queue) {
    queue
      .add(
        type,
        {
          taskId,
          type,
          filePath,
          totalSteps: steps.length,
          steps: [...steps],
        },
        {
          jobId: taskId,
          priority,
        },
      )
      .catch((err: Error) => {
        console.warn(`[队列] 任务 ${taskId} 入队失败: ${err.message}`);
        // 入队失败时更新 SQLite 中的任务状态
        updateTaskStatus(taskId, TaskStatus.Failed, `入队失败: ${err.message}`);
      });
  }

  console.log(
    `[队列] 创建任务 ${taskId} — 类型: ${type}, 文件: ${filePath}, 优先级: ${priority}, 步骤数: ${steps.length}`,
  );

  return taskId;
}

// ── 任务状态管理 ───────────────────────────────────────

/**
 * 更新任务进度 — 标记某个步骤的状态
 * 同时更新任务的 current_step 字段
 *
 * @param taskId 任务 ID
 * @param stepNumber 步骤编号（从 1 开始）
 * @param status 步骤状态
 * @param errorMessage 错误信息（失败时）
 * @param durationMs 步骤耗时（毫秒）
 */
export function updateTaskProgress(
  taskId: string,
  stepNumber: number,
  status: string,
  errorMessage: string | null = null,
  durationMs: number | null = null,
): void {
  const task = getTask(taskId);
  if (!task) {
    console.warn(`[队列] 更新进度失败 — 任务不存在: ${taskId}`);
    return;
  }

  const steps = getStepsByTask(taskId);
  const targetStep = steps.find((s) => s.step_number === stepNumber);
  if (!targetStep) {
    console.warn(
      `[队列] 更新进度失败 — 任务 ${taskId} 不存在步骤 ${stepNumber}`,
    );
    return;
  }

  withTransaction(() => {
    // 更新步骤状态
    updateStepStatus(targetStep.id, status, errorMessage, durationMs);

    // 更新任务当前步骤
    updateTaskStep(taskId, stepNumber);

    // 如果步骤开始处理，确保任务状态也是 processing
    if (status === StepStatus.Processing && task.status === TaskStatus.Pending) {
      updateTaskStatus(taskId, TaskStatus.Processing);
    }

    // 检查是否所有步骤都已完成或跳过
    if (status === StepStatus.Completed || status === StepStatus.Skipped) {
      const updatedSteps = getStepsByTask(taskId);
      const allDone = updatedSteps.every(
        (s) =>
          s.status === StepStatus.Completed ||
          s.status === StepStatus.Skipped ||
          s.status === StepStatus.Failed,
      );

      if (allDone) {
        // 检查是否有失败步骤
        const hasFailed = updatedSteps.some(
          (s) => s.status === StepStatus.Failed,
        );
        if (hasFailed) {
          // 有失败步骤但流水线继续完成（降级处理）
          updateTaskStatus(
            taskId,
            TaskStatus.Completed,
            '部分步骤失败，已降级完成',
          );
        } else {
          updateTaskStatus(taskId, TaskStatus.Completed);
        }
      }
    }
  });

  console.log(
    `[队列] 任务 ${taskId} 步骤 ${stepNumber} 状态更新: ${status}`,
  );
}

/**
 * 取消任务
 * 仅允许取消 pending 状态的任务
 *
 * @param taskId 任务 ID
 * @returns true 表示取消成功
 */
export function cancelTask(taskId: string): boolean {
  const task = getTask(taskId);
  if (!task) {
    console.warn(`[队列] 取消失败 — 任务不存在: ${taskId}`);
    return false;
  }

  if (task.status !== TaskStatus.Pending) {
    console.warn(
      `[队列] 取消失败 — 任务 ${taskId} 状态为 ${task.status}，仅允许取消 pending 状态的任务`,
    );
    return false;
  }

  withTransaction(() => {
    updateTaskStatus(taskId, TaskStatus.Cancelled);

    // 将所有 pending 步骤标记为 skipped
    const steps = getStepsByTask(taskId);
    for (const step of steps) {
      if (step.status === StepStatus.Pending) {
        updateStepStatus(step.id, StepStatus.Skipped);
      }
    }
  });

  // 从 BullMQ 队列中移除任务
  const queue = QUEUE_MAP[task.type];
  if (queue) {
    queue.remove(taskId).catch((err: Error) => {
      console.warn(`[队列] 从 BullMQ 移除任务 ${taskId} 失败: ${err.message}`);
    });
  }

  console.log(`[队列] 任务 ${taskId} 已取消`);
  return true;
}

/**
 * 重试失败的任务
 * 从最后一个失败步骤重新开始执行
 *
 * @param taskId 任务 ID
 * @returns true 表示重试成功入队
 */
export function retryTask(taskId: string): boolean {
  const task = getTask(taskId);
  if (!task) {
    console.warn(`[队列] 重试失败 — 任务不存在: ${taskId}`);
    return false;
  }

  if (task.status !== TaskStatus.Failed) {
    console.warn(
      `[队列] 重试失败 — 任务 ${taskId} 状态为 ${task.status}，仅允许重试 failed 状态的任务`,
    );
    return false;
  }

  const steps = getStepsByTask(taskId);
  // 找到第一个失败的步骤
  const failedStep = steps.find((s) => s.status === StepStatus.Failed);
  if (!failedStep) {
    console.warn(`[队列] 重试失败 — 任务 ${taskId} 未找到失败步骤`);
    return false;
  }

  const pipelineSteps = PIPELINE_STEPS_MAP[task.type];
  if (!pipelineSteps) {
    console.warn(`[队列] 重试失败 — 未知的流水线类型: ${task.type}`);
    return false;
  }

  withTransaction(() => {
    // 重置任务状态为 pending
    updateTaskStatus(taskId, TaskStatus.Pending);

    // 重置失败步骤及其后续步骤为 pending
    for (const step of steps) {
      if (step.step_number >= failedStep.step_number) {
        if (step.status === StepStatus.Failed || step.status === StepStatus.Skipped) {
          updateStepStatus(step.id, StepStatus.Pending);
        }
      }
    }
  });

  // 重新入队，从失败步骤开始
  const queue = QUEUE_MAP[task.type];
  if (queue) {
    queue
      .add(
        task.type,
        {
          taskId,
          type: task.type,
          filePath: task.file_path,
          totalSteps: pipelineSteps.length,
          steps: [...pipelineSteps],
          resumeFromStep: failedStep.step_number,
        },
        {
          jobId: `${taskId}-retry-${Date.now()}`,
          priority: task.priority,
        },
      )
      .catch((err: Error) => {
        console.warn(`[队列] 任务 ${taskId} 重试入队失败: ${err.message}`);
        updateTaskStatus(taskId, TaskStatus.Failed, `重试入队失败: ${err.message}`);
      });
  }

  console.log(
    `[队列] 任务 ${taskId} 重试 — 从步骤 ${failedStep.step_number}(${failedStep.step_name}) 开始`,
  );
  return true;
}

/**
 * 重试任务的某个特定失败步骤
 * 仅重置该步骤状态并重新入队
 *
 * @param taskId 任务 ID
 * @param stepNumber 步骤编号（从 1 开始）
 * @returns true 表示重试成功入队
 */
export function retryStep(taskId: string, stepNumber: number): boolean {
  const task = getTask(taskId);
  if (!task) {
    console.warn(`[队列] 步骤重试失败 — 任务不存在: ${taskId}`);
    return false;
  }

  const steps = getStepsByTask(taskId);
  const targetStep = steps.find((s) => s.step_number === stepNumber);
  if (!targetStep) {
    console.warn(
      `[队列] 步骤重试失败 — 任务 ${taskId} 不存在步骤 ${stepNumber}`,
    );
    return false;
  }

  if (targetStep.status !== StepStatus.Failed) {
    console.warn(
      `[队列] 步骤重试失败 — 步骤 ${stepNumber} 状态为 ${targetStep.status}，仅允许重试 failed 状态的步骤`,
    );
    return false;
  }

  const pipelineSteps = PIPELINE_STEPS_MAP[task.type];
  if (!pipelineSteps) {
    console.warn(`[队列] 步骤重试失败 — 未知的流水线类型: ${task.type}`);
    return false;
  }

  withTransaction(() => {
    // 重置该步骤状态为 pending
    updateStepStatus(targetStep.id, StepStatus.Pending);

    // 如果任务已完成或失败，重置为 processing
    if (
      task.status === TaskStatus.Failed ||
      task.status === TaskStatus.Completed
    ) {
      updateTaskStatus(taskId, TaskStatus.Processing);
    }
  });

  // 入队，指定仅执行该步骤
  const queue = QUEUE_MAP[task.type];
  if (queue) {
    queue
      .add(
        task.type,
        {
          taskId,
          type: task.type,
          filePath: task.file_path,
          totalSteps: pipelineSteps.length,
          steps: [...pipelineSteps],
          retryStepNumber: stepNumber,
        },
        {
          jobId: `${taskId}-step-${stepNumber}-retry-${Date.now()}`,
          priority: task.priority,
        },
      )
      .catch((err: Error) => {
        console.warn(
          `[队列] 任务 ${taskId} 步骤 ${stepNumber} 重试入队失败: ${err.message}`,
        );
      });
  }

  console.log(
    `[队列] 任务 ${taskId} 步骤 ${stepNumber}(${targetStep.step_name}) 重试`,
  );
  return true;
}

/**
 * 调整任务优先级
 * 更新 SQLite 中的优先级记录
 * 注意：BullMQ 不支持动态修改已入队任务的优先级，
 * 需要移除后重新添加（仅对 pending 状态有效）
 *
 * @param taskId 任务 ID
 * @param newPriority 新优先级值（越小越优先）
 * @returns true 表示调整成功
 */
export function adjustPriority(taskId: string, newPriority: number): boolean {
  const task = getTask(taskId);
  if (!task) {
    console.warn(`[队列] 优先级调整失败 — 任务不存在: ${taskId}`);
    return false;
  }

  if (newPriority < 0 || newPriority > 999) {
    console.warn(
      `[队列] 优先级调整失败 — 优先级值 ${newPriority} 超出范围 [0, 999]`,
    );
    return false;
  }

  const oldPriority = task.priority;

  // 更新 SQLite 中的优先级
  // db.ts 没有专门的 updatePriority 方法，使用底层 database 实例
  withTransaction(() => {
    db.prepare('UPDATE tasks SET priority = ? WHERE id = ?').run(
      newPriority,
      taskId,
    );
  });

  // 如果任务还在排队中，尝试在 BullMQ 中更新优先级
  if (task.status === TaskStatus.Pending) {
    const queue = QUEUE_MAP[task.type];
    if (queue) {
      // BullMQ 支持通过 Job.changePriority 修改优先级
      queue
        .getJob(taskId)
        .then((job) => {
          if (job) {
            return job.changePriority({ priority: newPriority });
          }
        })
        .catch((err: Error) => {
          console.warn(
            `[队列] BullMQ 优先级更新失败（不影响 SQLite 记录）: ${err.message}`,
          );
        });
    }
  }

  console.log(
    `[队列] 任务 ${taskId} 优先级调整: ${oldPriority} → ${newPriority}`,
  );
  return true;
}

// ── 崩溃恢复 ───────────────────────────────────────────

/**
 * 恢复处理中的任务
 * 在服务启动时调用，查找所有 status='processing' 的任务，
 * 找到最后完成的步骤，从下一步重新入队
 *
 * @returns 恢复的任务数量
 */
export function recoverProcessingTasks(): number {
  const processingTasks = listTasks({ status: TaskStatus.Processing });

  if (processingTasks.length === 0) {
    console.log('[队列] 崩溃恢复 — 无需恢复的任务');
    return 0;
  }

  console.log(
    `[队列] 崩溃恢复 — 发现 ${processingTasks.length} 个处理中的任务`,
  );

  let recoveredCount = 0;

  for (const task of processingTasks) {
    const pipelineSteps = PIPELINE_STEPS_MAP[task.type];
    if (!pipelineSteps) {
      console.warn(
        `[队列] 崩溃恢复 — 跳过未知类型任务 ${task.id}: ${task.type}`,
      );
      continue;
    }

    const steps = getStepsByTask(task.id);

    // 找到最后一个已完成的步骤
    let lastCompletedStepNumber = 0;
    for (const step of steps) {
      if (
        step.status === StepStatus.Completed ||
        step.status === StepStatus.Skipped
      ) {
        lastCompletedStepNumber = step.step_number;
      }
    }

    const resumeFromStep = lastCompletedStepNumber + 1;

    // 如果所有步骤都已完成，标记任务为完成
    if (resumeFromStep > pipelineSteps.length) {
      updateTaskStatus(task.id, TaskStatus.Completed);
      console.log(
        `[队列] 崩溃恢复 — 任务 ${task.id} 所有步骤已完成，标记为 completed`,
      );
      recoveredCount++;
      continue;
    }

    // 重置当前正在处理的步骤为 pending
    withTransaction(() => {
      for (const step of steps) {
        if (step.step_number >= resumeFromStep && step.status === StepStatus.Processing) {
          updateStepStatus(step.id, StepStatus.Pending);
        }
      }
    });

    // 重新入队
    const queue = QUEUE_MAP[task.type];
    if (queue) {
      queue
        .add(
          task.type,
          {
            taskId: task.id,
            type: task.type,
            filePath: task.file_path,
            totalSteps: pipelineSteps.length,
            steps: [...pipelineSteps],
            resumeFromStep,
          },
          {
            jobId: `${task.id}-recover-${Date.now()}`,
            priority: task.priority,
          },
        )
        .catch((err: Error) => {
          console.warn(
            `[队列] 崩溃恢复 — 任务 ${task.id} 重新入队失败: ${err.message}`,
          );
        });
    }

    console.log(
      `[队列] 崩溃恢复 — 任务 ${task.id} 从步骤 ${resumeFromStep}(${pipelineSteps[resumeFromStep - 1]}) 恢复`,
    );
    recoveredCount++;
  }

  console.log(`[队列] 崩溃恢复完成 — 共恢复 ${recoveredCount} 个任务`);
  return recoveredCount;
}

// ── 队列统计 ───────────────────────────────────────────

/** 单个队列的统计信息 */
export interface QueueStatsEntry {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

/** 所有队列的统计信息 */
export interface AllQueueStats {
  queues: QueueStatsEntry[];
  total: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
}

/**
 * 获取所有队列的统计信息
 * 返回每个队列的 waiting/active/completed/failed/delayed 计数
 *
 * @returns 队列统计信息
 */
export async function getQueueStats(): Promise<AllQueueStats> {
  const queueEntries = Object.entries(QUEUE_MAP);
  const queues: QueueStatsEntry[] = [];

  const total = {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
  };

  for (const [name, queue] of queueEntries) {
    try {
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      );

      const entry: QueueStatsEntry = {
        name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      };

      queues.push(entry);

      total.waiting += entry.waiting;
      total.active += entry.active;
      total.completed += entry.completed;
      total.failed += entry.failed;
      total.delayed += entry.delayed;
    } catch (err) {
      // Redis 不可用时返回零值
      console.warn(`[队列] 获取 ${name} 统计失败: ${(err as Error).message}`);
      queues.push({
        name,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      });
    }
  }

  return { queues, total };
}

// ── 辅助函数 ───────────────────────────────────────────

/**
 * 获取流水线类型对应的步骤列表
 *
 * @param type 流水线类型
 * @returns 步骤名称数组，未知类型返回 undefined
 */
export function getPipelineSteps(type: string): readonly string[] | undefined {
  return PIPELINE_STEPS_MAP[type];
}

/**
 * 关闭所有队列连接
 * 在服务关闭时调用，确保资源释放
 */
export async function closeQueues(): Promise<void> {
  const queues = Object.values(QUEUE_MAP);
  await Promise.all(queues.map((q) => q.close()));
  redisConnection.disconnect();
  console.log('[队列] 所有队列连接已关闭');
}

// ── 任务依赖触发判断 ──────────────────────────────────

/**
 * 判断是否应触发依赖任务
 * 仅当所有前置任务都已完成时才返回 true
 * 这是一个纯函数，不依赖数据库状态
 *
 * @param prerequisites 前置任务的状态数组
 * @returns true 表示所有前置任务已完成，可以触发后续任务
 */
export function shouldTriggerDependentTask(prerequisites: string[]): boolean {
  // 无前置依赖时直接触发
  if (prerequisites.length === 0) {
    return true;
  }

  // 所有前置任务必须为 completed 状态
  return prerequisites.every((status) => status === TaskStatus.Completed);
}

// ── 导出 Redis 连接供外部使用 ──────────────────────────

export { redisConnection };
