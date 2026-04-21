// bandwidth.ts — 带宽调度器
// 按时段控制 qBittorrent 下载/上传速度，监控每日带宽使用量
// 超过每日限额 90% 时自动暂停下载任务
//
// 需求: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6

import cron from 'node-cron';

// ── 接口定义 ──────────────────────────────────────────

/** 带宽调度规则 */
export interface BandwidthRule {
  id: string;
  startHour: number;   // 开始小时 (0-23)
  endHour: number;     // 结束小时 (1-24)，区间为 [startHour, endHour)
  downloadLimit: number | null;  // 下载限速 (bytes/s)，null 表示不限
  uploadLimit: number | null;    // 上传限速 (bytes/s)，null 表示不限
  enabled: boolean;
}

/** 每日带宽使用量 */
export interface BandwidthUsage {
  date: string;
  bytesDownloaded: number;
  bytesUploaded: number;
  dailyLimit: number;
}

/** 每日限额检查结果 */
export interface DailyLimitCheck {
  exceeded: boolean;
  usagePercent: number;
}

// ── 默认规则 ──────────────────────────────────────────

/** 默认带宽规则：夜间高带宽，白天低带宽 */
export const DEFAULT_RULES: BandwidthRule[] = [
  {
    id: 'night',
    startHour: 0,
    endHour: 6,
    downloadLimit: null,       // 夜间不限速
    uploadLimit: null,
    enabled: true,
  },
  {
    id: 'day',
    startHour: 6,
    endHour: 24,
    downloadLimit: 5_242_880,  // 白天限速 5MB/s
    uploadLimit: 1_048_576,    // 上传限速 1MB/s
    enabled: true,
  },
];

/** 默认每日带宽上限：50GB */
const DEFAULT_DAILY_LIMIT = 53_687_091_200;

// ── 带宽调度器 ────────────────────────────────────────

/**
 * 带宽调度器
 * 根据时段规则自动调整 qBittorrent 下载/上传速度限制
 * 监控每日带宽使用量，超过 90% 时暂停下载
 */
export class BandwidthScheduler {
  private rules: BandwidthRule[];
  private usage: BandwidthUsage;
  private cronTask: cron.ScheduledTask | null = null;
  private qbUrl: string;

  constructor(
    rules?: BandwidthRule[],
    usage?: BandwidthUsage,
    qbUrl?: string,
  ) {
    this.rules = rules ?? [...DEFAULT_RULES];
    this.usage = usage ?? {
      date: new Date().toISOString().slice(0, 10),
      bytesDownloaded: 0,
      bytesUploaded: 0,
      dailyLimit: DEFAULT_DAILY_LIMIT,
    };
    this.qbUrl = qbUrl ?? (process.env.QB_URL || 'http://127.0.0.1:8080');
  }

  // ── 规则查询 ────────────────────────────────────────

  /**
   * 查找覆盖指定小时的带宽规则
   * 规则区间为 [startHour, endHour)，仅匹配已启用的规则
   *
   * @param hour 小时 (0-23)
   * @returns 匹配的规则，无匹配返回 null
   */
  getActiveRule(hour: number): BandwidthRule | null {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (hour >= rule.startHour && hour < rule.endHour) {
        return rule;
      }
    }
    return null;
  }

  // ── 每日限额检查 ────────────────────────────────────

  /**
   * 检查每日带宽使用量是否接近上限
   * 返回是否超过 90% 以及当前使用百分比
   */
  checkDailyLimit(): DailyLimitCheck {
    const limit = this.usage.dailyLimit;
    if (limit <= 0) {
      return { exceeded: false, usagePercent: 0 };
    }
    const usagePercent = (this.usage.bytesDownloaded / limit) * 100;
    return {
      exceeded: usagePercent > 90,
      usagePercent,
    };
  }

  /**
   * 判断是否应暂停下载
   * 当每日使用量超过限额的 90% 时返回 true
   */
  shouldPauseDownloads(): boolean {
    return this.checkDailyLimit().exceeded;
  }

  // ── qBittorrent API 调用 ────────────────────────────

  /**
   * 调用 qBittorrent API 设置速度限制
   * 使用 qBittorrent Web API v2 的 /api/v2/transfer/setSpeedLimitsMode
   * 和 /api/v2/transfer/setDownloadLimit, /api/v2/transfer/setUploadLimit
   */
  async applyBandwidthLimit(rule: BandwidthRule): Promise<void> {
    const downloadLimit = rule.downloadLimit ?? 0; // 0 表示不限速
    const uploadLimit = rule.uploadLimit ?? 0;

    try {
      // 设置下载限速
      await fetch(`${this.qbUrl}/api/v2/transfer/setDownloadLimit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `limit=${downloadLimit}`,
      });

      // 设置上传限速
      await fetch(`${this.qbUrl}/api/v2/transfer/setUploadLimit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `limit=${uploadLimit}`,
      });

      console.log(
        `[带宽] 已应用规则 ${rule.id}: 下载=${downloadLimit === 0 ? '不限' : `${Math.round(downloadLimit / 1024)}KB/s`}, ` +
        `上传=${uploadLimit === 0 ? '不限' : `${Math.round(uploadLimit / 1024)}KB/s`}`,
      );
    } catch (err) {
      console.error(`[带宽] 调用 qBittorrent API 失败: ${(err as Error).message}`);
    }
  }

  // ── 定时调度 ────────────────────────────────────────

  /**
   * 启动带宽调度器
   * 每分钟检查一次当前时段规则并应用
   */
  startScheduler(): void {
    if (this.cronTask) {
      console.warn('[带宽] 调度器已在运行');
      return;
    }

    // 每分钟执行一次
    this.cronTask = cron.schedule('* * * * *', async () => {
      const hour = new Date().getHours();

      // 检查每日限额
      if (this.shouldPauseDownloads()) {
        console.log('[带宽] 每日带宽使用量超过 90%，暂停下载');
        // 设置下载限速为 0（暂停）
        await this.applyBandwidthLimit({
          id: 'pause',
          startHour: 0,
          endHour: 24,
          downloadLimit: 1, // 1 byte/s 相当于暂停
          uploadLimit: 1,
          enabled: true,
        });
        return;
      }

      // 查找当前时段规则
      const rule = this.getActiveRule(hour);
      if (rule) {
        await this.applyBandwidthLimit(rule);
      }
    });

    console.log('[带宽] 调度器已启动，每分钟检查一次');
  }

  /**
   * 停止带宽调度器
   */
  stopScheduler(): void {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
      console.log('[带宽] 调度器已停止');
    }
  }

  // ── 状态更新 ────────────────────────────────────────

  /** 更新规则列表 */
  setRules(rules: BandwidthRule[]): void {
    this.rules = rules;
  }

  /** 获取当前规则列表 */
  getRules(): BandwidthRule[] {
    return [...this.rules];
  }

  /** 更新使用量数据 */
  setUsage(usage: BandwidthUsage): void {
    this.usage = usage;
  }

  /** 获取当前使用量 */
  getUsage(): BandwidthUsage {
    return { ...this.usage };
  }
}
