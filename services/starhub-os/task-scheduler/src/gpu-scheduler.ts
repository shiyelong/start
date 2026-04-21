// gpu-scheduler.ts — GPU 互斥锁调度器
// 确保同一时间仅一个 GPU 密集型任务运行（RTX 3090 24GB 显存有限）
// 基于 SQLite gpu_lock 单行表实现互斥，内存优先级队列管理等待任务

import { EventEmitter } from 'node:events';
import { acquireLock, releaseLock, getLockStatus } from './db.js';

// ── 服务超时配置（分钟） ──────────────────────────────

/** 各 GPU 服务的最大执行时间（分钟） */
const SERVICE_TIMEOUTS: Record<string, number> = {
  'whisper-api': 60,       // 60 分钟 — 长视频语音识别
  'xtts-api': 120,         // 120 分钟 — 全片配音生成
  'sd-api-inpaint': 180,   // 180 分钟 — 全片水印移除
  'sd-api-txt2img': 30,    // 30 分钟 — CG/立绘生成
  'manga-translator': 60,  // 60 分钟 — 整章 OCR+渲染
  'ollama': 30,            // 30 分钟 — LLM 推理
  'tdarr': 240,            // 240 分钟 — H.265 转码
};

/** 未知服务的默认超时（分钟） */
const DEFAULT_TIMEOUT_MINUTES = 60;

// ── 优先级枚举 ────────────────────────────────────────

/** GPU 任务优先级等级 */
export enum GpuPriority {
  Urgent = 0,       // 0-10: 紧急（服务者照片验证 5分钟 SLA）
  High = 11,        // 11-50: 高（用户手动触发）
  Medium = 51,      // 51-100: 中（新入库自动处理）
  Low = 101,        // 101-200: 低（批量历史处理）
  Background = 201, // 201-999: 后台（全库扫描）
}

// ── 类型定义 ──────────────────────────────────────────

/** 等待队列中的条目 */
export interface QueueEntry {
  taskId: string;
  service: string;
  priority: number;
  enqueuedAt: number; // Date.now() 时间戳
  resolve: (acquired: boolean) => void;
}

/** GPU 调度器状态 */
export interface GpuSchedulerStatus {
  locked: boolean;
  lockedBy: string | null;
  service: string | null;
  lockedAt: string | null;
  expiresAt: string | null;
  queueLength: number;
  queueItems: Array<{
    taskId: string;
    service: string;
    priority: number;
    enqueuedAt: number;
  }>;
}

// ── GPU 调度器 ────────────────────────────────────────

export class GpuScheduler extends EventEmitter {
  /** 内存优先级等待队列 */
  private waitQueue: QueueEntry[] = [];

  /** 过期检查定时器 */
  private expiryTimer: ReturnType<typeof setInterval> | null = null;

  /** 过期检查间隔（毫秒） */
  private readonly EXPIRY_CHECK_INTERVAL_MS = 30_000;

  constructor() {
    super();
  }

  // ── 公开方法 ──────────────────────────────────────

  /**
   * 请求获取 GPU 锁
   * 如果当前无锁，立即获取并返回 true
   * 如果已被占用，加入等待队列，返回 Promise（获得锁时 resolve true）
   * @param taskId 任务 ID
   * @param service GPU 服务名称（如 whisper-api、xtts-api）
   * @param priority 优先级数值（越小越优先）
   * @returns true 表示立即获取成功，false 表示进入等待队列后获取
   */
  requestGpu(taskId: string, service: string, priority: number): Promise<boolean> {
    // 先检查并清理过期锁
    this.checkExpiredLock();

    // 计算锁过期时间
    const expiresAt = this.calculateExpiresAt(service);

    // 尝试原子获取锁
    const acquired = acquireLock(taskId, service, expiresAt);

    if (acquired) {
      this.emit('lock-acquired', { taskId, service, priority });
      return Promise.resolve(true);
    }

    // 锁被占用，加入等待队列
    return new Promise<boolean>((resolve) => {
      const entry: QueueEntry = {
        taskId,
        service,
        priority,
        enqueuedAt: Date.now(),
        resolve,
      };

      this.enqueue(entry);
    });
  }

  /**
   * 释放 GPU 锁并处理等待队列中的下一个任务
   * @param taskId 当前持有锁的任务 ID
   */
  releaseGpu(taskId: string): void {
    const lockStatus = getLockStatus();

    // 仅允许锁持有者释放锁
    if (lockStatus.locked_by !== taskId) {
      console.warn(
        `[GPU调度] 任务 ${taskId} 尝试释放锁，但当前锁持有者为 ${lockStatus.locked_by ?? '无'}`,
      );
      return;
    }

    releaseLock();
    this.emit('lock-released', { taskId });

    // 处理等待队列中的下一个任务
    this.processNextInQueue();
  }

  /**
   * 获取当前 GPU 调度器状态
   * @returns 锁状态和等待队列信息
   */
  getStatus(): GpuSchedulerStatus {
    const lock = getLockStatus();

    return {
      locked: lock.locked_by !== null,
      lockedBy: lock.locked_by,
      service: lock.service,
      lockedAt: lock.locked_at,
      expiresAt: lock.expires_at,
      queueLength: this.waitQueue.length,
      queueItems: this.waitQueue.map((entry) => ({
        taskId: entry.taskId,
        service: entry.service,
        priority: entry.priority,
        enqueuedAt: entry.enqueuedAt,
      })),
    };
  }

  /**
   * 检查当前锁是否已过期，过期则自动释放
   * 由定时器每 30 秒调用一次
   */
  checkExpiredLock(): void {
    const lock = getLockStatus();

    if (lock.locked_by === null || lock.expires_at === null) {
      return;
    }

    const expiresAt = new Date(lock.expires_at).getTime();
    const now = Date.now();

    if (now > expiresAt) {
      console.warn(
        `[GPU调度] 锁已过期 — 任务: ${lock.locked_by}, 服务: ${lock.service}, ` +
        `过期时间: ${lock.expires_at}, 当前时间: ${new Date(now).toISOString()}`,
      );

      releaseLock();
      this.emit('lock-expired', {
        taskId: lock.locked_by,
        service: lock.service,
        expiresAt: lock.expires_at,
      });

      // 过期释放后处理等待队列
      this.processNextInQueue();
    }
  }

  /**
   * 获取任务在等待队列中的位置
   * @param taskId 任务 ID
   * @returns 队列位置（0-based），不在队列中返回 -1
   */
  getQueuePosition(taskId: string): number {
    return this.waitQueue.findIndex((entry) => entry.taskId === taskId);
  }

  /**
   * 启动过期检查定时器
   * 每 30 秒检查一次锁是否过期
   */
  startExpiryChecker(): void {
    if (this.expiryTimer !== null) {
      return;
    }

    this.expiryTimer = setInterval(() => {
      this.checkExpiredLock();
    }, this.EXPIRY_CHECK_INTERVAL_MS);

    // 允许进程在定时器运行时正常退出
    if (this.expiryTimer.unref) {
      this.expiryTimer.unref();
    }
  }

  /**
   * 停止过期检查定时器
   */
  stopExpiryChecker(): void {
    if (this.expiryTimer !== null) {
      clearInterval(this.expiryTimer);
      this.expiryTimer = null;
    }
  }

  /**
   * 从等待队列中移除指定任务
   * @param taskId 任务 ID
   * @returns true 表示成功移除
   */
  removeFromQueue(taskId: string): boolean {
    const index = this.waitQueue.findIndex((entry) => entry.taskId === taskId);
    if (index === -1) {
      return false;
    }

    const [removed] = this.waitQueue.splice(index, 1);
    // 通知等待者已被取消
    removed.resolve(false);
    return true;
  }

  // ── 内部方法 ──────────────────────────────────────

  /**
   * 将任务插入等待队列（按优先级 ASC、入队时间 ASC 排序）
   */
  private enqueue(entry: QueueEntry): void {
    // 二分查找插入位置，保持队列有序
    let low = 0;
    let high = this.waitQueue.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      const existing = this.waitQueue[mid];

      // 优先级数值越小越优先；相同优先级按入队时间升序
      if (
        existing.priority < entry.priority ||
        (existing.priority === entry.priority && existing.enqueuedAt <= entry.enqueuedAt)
      ) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    this.waitQueue.splice(low, 0, entry);
  }

  /**
   * 从等待队列中取出最高优先级任务并尝试获取锁
   */
  private processNextInQueue(): void {
    if (this.waitQueue.length === 0) {
      return;
    }

    // 取出队首（最高优先级）
    const next = this.waitQueue.shift()!;
    const expiresAt = this.calculateExpiresAt(next.service);

    const acquired = acquireLock(next.taskId, next.service, expiresAt);

    if (acquired) {
      this.emit('lock-acquired', {
        taskId: next.taskId,
        service: next.service,
        priority: next.priority,
      });
      next.resolve(true);
    } else {
      // 极端情况：释放后又被其他路径抢占，重新入队
      this.waitQueue.unshift(next);
    }
  }

  /**
   * 根据服务名称计算锁过期时间
   * @param service GPU 服务名称
   * @returns ISO 8601 格式的过期时间字符串
   */
  private calculateExpiresAt(service: string): string {
    const timeoutMinutes = SERVICE_TIMEOUTS[service] ?? DEFAULT_TIMEOUT_MINUTES;
    const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);
    return expiresAt.toISOString();
  }
}

// ── 导出单例 ──────────────────────────────────────────

/** GPU 调度器单例实例 */
export const gpuScheduler = new GpuScheduler();

// 启动过期检查定时器
gpuScheduler.startExpiryChecker();

// ── 导出常量供测试使用 ────────────────────────────────

export { SERVICE_TIMEOUTS, DEFAULT_TIMEOUT_MINUTES };
