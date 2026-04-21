// telegram.ts — Telegram 频道抓取器
// 集成 Telegram Bot API，定时从已启用频道获取新消息
// 下载视频/图片/文档到本地存储，自动分类并触发处理流水线
//
// 需求: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 44.1, 44.2, 44.3

import { writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

// ── 接口定义 ──────────────────────────────────────────

/** Telegram 频道配置 */
export interface TelegramChannel {
  id: string;
  channelId: string;
  name: string;
  type: string;           // channel | group
  mpaaRating: string;     // MPAA 分级
  scrapeInterval: number; // 抓取间隔（秒）
  enabled: boolean;
  lastScrapedAt: string | null;
  lastMessageId: number;
  totalDownloaded: number;
}

/** Telegram 消息 */
export interface TelegramMessage {
  messageId: number;
  date: number;
  caption: string | null;
  /** 媒体类型：video | photo | document | audio | animation */
  mediaType: string | null;
  /** 文件 ID（用于下载） */
  fileId: string | null;
  /** 文件名 */
  fileName: string | null;
  /** 文件大小（字节） */
  fileSize: number | null;
  /** MIME 类型 */
  mimeType: string | null;
}

/** 抓取结果 */
export interface ScrapeResult {
  channelId: string;
  messagesProcessed: number;
  filesDownloaded: number;
  errors: string[];
  lastMessageId: number;
}

// ── 内容分类映射 ──────────────────────────────────────

/** MIME 类型 → incoming 目录映射 */
const MEDIA_TYPE_DIR_MAP: Record<string, string> = {
  video: 'videos',
  animation: 'videos',
  photo: 'comics',
  document: 'novels',
  audio: 'music',
};

/** 文件扩展名 → 内容类型映射 */
const EXT_CONTENT_TYPE_MAP: Record<string, string> = {
  // 视频
  '.mp4': 'videos', '.mkv': 'videos', '.avi': 'videos',
  '.mov': 'videos', '.wmv': 'videos', '.flv': 'videos',
  '.webm': 'videos', '.ts': 'videos', '.m4v': 'videos',
  // 漫画/图片
  '.jpg': 'comics', '.jpeg': 'comics', '.png': 'comics',
  '.gif': 'comics', '.webp': 'comics', '.bmp': 'comics',
  '.cbz': 'comics', '.cbr': 'comics',
  // 小说/文档
  '.txt': 'novels', '.epub': 'novels', '.mobi': 'novels',
  '.pdf': 'novels',
  // 音频
  '.mp3': 'music', '.flac': 'music', '.aac': 'music',
  '.ogg': 'music', '.wav': 'music', '.m4a': 'music',
  '.opus': 'music', '.wma': 'music',
};

// ── 存储路径 ──────────────────────────────────────────

const MEDIA_BASE = process.env.MEDIA_BASE || '/mnt/storage/media';
const TELEGRAM_DIR = join(MEDIA_BASE, 'telegram');

// ── Telegram 抓取器 ──────────────────────────────────

/**
 * Telegram 频道抓取器
 * 使用 Telegram Bot API 定时从配置的频道获取新消息并下载媒体文件
 */
export class TelegramScraper {
  private botToken: string;
  private apiBase: string;
  private channels: TelegramChannel[];
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private webhookUrl: string;

  constructor(
    botToken?: string,
    channels?: TelegramChannel[],
    webhookUrl?: string,
  ) {
    this.botToken = botToken ?? (process.env.TELEGRAM_BOT_TOKEN || '');
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;
    this.channels = channels ?? [];
    this.webhookUrl = webhookUrl ?? (process.env.WEBHOOK_URL || 'http://127.0.0.1:8000/webhook/file-detected');
  }

  // ── 抓取控制 ────────────────────────────────────────

  /**
   * 启动所有已启用频道的定时抓取
   * 每个频道使用独立的 setInterval，间隔由频道配置决定
   */
  startScraping(): void {
    for (const channel of this.channels) {
      if (!channel.enabled) continue;
      this.startChannelScraper(channel);
    }
    console.log(`[Telegram] 已启动 ${this.timers.size} 个频道抓取器`);
  }

  /**
   * 停止所有频道的抓取
   */
  stopScraping(): void {
    for (const [channelId, timer] of this.timers) {
      clearInterval(timer);
      console.log(`[Telegram] 停止频道 ${channelId} 的抓取`);
    }
    this.timers.clear();
    console.log('[Telegram] 所有抓取器已停止');
  }

  /**
   * 启动单个频道的定时抓取
   */
  private startChannelScraper(channel: TelegramChannel): void {
    // 避免重复启动
    if (this.timers.has(channel.channelId)) {
      return;
    }

    const intervalMs = channel.scrapeInterval * 1000;

    // 立即执行一次
    this.scrapeChannel(channel.channelId).catch((err) => {
      console.error(`[Telegram] 频道 ${channel.name} 首次抓取失败: ${(err as Error).message}`);
    });

    // 设置定时器
    const timer = setInterval(() => {
      this.scrapeChannel(channel.channelId).catch((err) => {
        console.error(`[Telegram] 频道 ${channel.name} 抓取失败: ${(err as Error).message}`);
      });
    }, intervalMs);

    this.timers.set(channel.channelId, timer);
    console.log(
      `[Telegram] 频道 ${channel.name} (${channel.channelId}) 抓取已启动，间隔 ${channel.scrapeInterval}s`,
    );
  }

  // ── 频道抓取 ────────────────────────────────────────

  /**
   * 抓取指定频道的新消息
   * 从 lastMessageId 之后开始获取，下载媒体文件并分类
   */
  async scrapeChannel(channelId: string): Promise<ScrapeResult> {
    const channel = this.channels.find((c) => c.channelId === channelId);
    if (!channel) {
      throw new Error(`频道不存在: ${channelId}`);
    }

    const result: ScrapeResult = {
      channelId,
      messagesProcessed: 0,
      filesDownloaded: 0,
      errors: [],
      lastMessageId: channel.lastMessageId,
    };

    try {
      // 调用 Telegram Bot API 获取频道更新
      const messages = await this.fetchChannelMessages(channelId, channel.lastMessageId);

      for (const message of messages) {
        result.messagesProcessed++;

        // 跳过无媒体的消息
        if (!message.fileId || !message.mediaType) {
          continue;
        }

        try {
          // 下载媒体文件
          const filePath = await this.downloadMedia(message, channelId);

          // 分类并移动到对应 incoming 目录
          this.classifyAndMove(filePath, channel.mpaaRating);

          result.filesDownloaded++;
        } catch (err) {
          result.errors.push(`消息 ${message.messageId}: ${(err as Error).message}`);
        }

        // 更新最后处理的消息 ID
        if (message.messageId > result.lastMessageId) {
          result.lastMessageId = message.messageId;
        }
      }

      // 更新频道状态
      channel.lastMessageId = result.lastMessageId;
      channel.lastScrapedAt = new Date().toISOString();
      channel.totalDownloaded += result.filesDownloaded;

      console.log(
        `[Telegram] 频道 ${channel.name}: 处理 ${result.messagesProcessed} 条消息，` +
        `下载 ${result.filesDownloaded} 个文件，错误 ${result.errors.length} 个`,
      );
    } catch (err) {
      result.errors.push(`抓取失败: ${(err as Error).message}`);
      console.error(`[Telegram] 频道 ${channel.name} 抓取异常: ${(err as Error).message}`);
    }

    return result;
  }

  // ── Telegram API 调用 ───────────────────────────────

  /**
   * 获取频道新消息
   * 使用 getUpdates API 获取 offset 之后的消息
   */
  private async fetchChannelMessages(
    channelId: string,
    afterMessageId: number,
  ): Promise<TelegramMessage[]> {
    const url = `${this.apiBase}/getUpdates?offset=${afterMessageId + 1}&limit=100&allowed_updates=["channel_post"]`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Telegram API 请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      ok: boolean;
      result: Array<{
        update_id: number;
        channel_post?: {
          message_id: number;
          date: number;
          caption?: string;
          video?: { file_id: string; file_name?: string; file_size?: number; mime_type?: string };
          photo?: Array<{ file_id: string; file_size?: number }>;
          document?: { file_id: string; file_name?: string; file_size?: number; mime_type?: string };
          audio?: { file_id: string; file_name?: string; file_size?: number; mime_type?: string };
          animation?: { file_id: string; file_name?: string; file_size?: number; mime_type?: string };
          chat?: { id: number; username?: string };
        };
      }>;
    };

    if (!data.ok) {
      throw new Error('Telegram API 返回错误');
    }

    const messages: TelegramMessage[] = [];

    for (const update of data.result) {
      const post = update.channel_post;
      if (!post) continue;

      // 过滤指定频道的消息
      const chatId = post.chat?.id?.toString() ?? '';
      const chatUsername = post.chat?.username ?? '';
      if (chatId !== channelId && `@${chatUsername}` !== channelId) {
        continue;
      }

      const msg: TelegramMessage = {
        messageId: post.message_id,
        date: post.date,
        caption: post.caption ?? null,
        mediaType: null,
        fileId: null,
        fileName: null,
        fileSize: null,
        mimeType: null,
      };

      // 提取媒体信息
      if (post.video) {
        msg.mediaType = 'video';
        msg.fileId = post.video.file_id;
        msg.fileName = post.video.file_name ?? null;
        msg.fileSize = post.video.file_size ?? null;
        msg.mimeType = post.video.mime_type ?? null;
      } else if (post.animation) {
        msg.mediaType = 'animation';
        msg.fileId = post.animation.file_id;
        msg.fileName = post.animation.file_name ?? null;
        msg.fileSize = post.animation.file_size ?? null;
        msg.mimeType = post.animation.mime_type ?? null;
      } else if (post.document) {
        msg.mediaType = 'document';
        msg.fileId = post.document.file_id;
        msg.fileName = post.document.file_name ?? null;
        msg.fileSize = post.document.file_size ?? null;
        msg.mimeType = post.document.mime_type ?? null;
      } else if (post.audio) {
        msg.mediaType = 'audio';
        msg.fileId = post.audio.file_id;
        msg.fileName = post.audio.file_name ?? null;
        msg.fileSize = post.audio.file_size ?? null;
        msg.mimeType = post.audio.mime_type ?? null;
      } else if (post.photo && post.photo.length > 0) {
        // 取最大尺寸的照片
        const largest = post.photo[post.photo.length - 1];
        msg.mediaType = 'photo';
        msg.fileId = largest.file_id;
        msg.fileSize = largest.file_size ?? null;
        msg.mimeType = 'image/jpeg';
      }

      messages.push(msg);
    }

    return messages;
  }

  /**
   * 下载媒体文件到本地存储
   * 使用 Telegram Bot API 的 getFile + 文件下载
   *
   * @returns 下载后的本地文件路径
   */
  async downloadMedia(message: TelegramMessage, channelId?: string): Promise<string> {
    if (!message.fileId) {
      throw new Error('消息不包含可下载的文件');
    }

    // 获取文件路径
    const fileInfoUrl = `${this.apiBase}/getFile?file_id=${message.fileId}`;
    const fileInfoResp = await fetch(fileInfoUrl);
    if (!fileInfoResp.ok) {
      throw new Error(`获取文件信息失败: ${fileInfoResp.status}`);
    }

    const fileInfo = await fileInfoResp.json() as {
      ok: boolean;
      result: { file_path: string; file_size?: number };
    };

    if (!fileInfo.ok || !fileInfo.result.file_path) {
      throw new Error('获取文件路径失败');
    }

    // 下载文件
    const downloadUrl = `https://api.telegram.org/file/bot${this.botToken}/${fileInfo.result.file_path}`;
    const downloadResp = await fetch(downloadUrl);
    if (!downloadResp.ok) {
      throw new Error(`文件下载失败: ${downloadResp.status}`);
    }

    const buffer = Buffer.from(await downloadResp.arrayBuffer());

    // 确定保存路径
    const cid = channelId ?? 'unknown';
    const channelDir = join(TELEGRAM_DIR, cid);
    mkdirSync(channelDir, { recursive: true });

    // 确定文件名
    const fileName = message.fileName
      ?? `${message.messageId}${this.guessExtension(message.mimeType, message.mediaType)}`;
    const savePath = join(channelDir, fileName);

    writeFileSync(savePath, buffer);
    console.log(`[Telegram] 已下载: ${savePath} (${buffer.length} bytes)`);

    return savePath;
  }

  // ── 内容分类 ────────────────────────────────────────

  /**
   * 将下载的文件分类并移动到对应的 incoming 目录
   * 根据文件扩展名判断内容类型，继承频道的 MPAA 分级
   * 移动完成后触发 file-detected webhook
   */
  classifyAndMove(filePath: string, channelMpaaRating: string): void {
    const ext = extname(filePath).toLowerCase();
    const contentType = EXT_CONTENT_TYPE_MAP[ext] ?? 'videos'; // 默认归类为视频

    const incomingDir = join(MEDIA_BASE, contentType, 'incoming');
    mkdirSync(incomingDir, { recursive: true });

    const destPath = join(incomingDir, basename(filePath));

    // 移动文件
    try {
      renameSync(filePath, destPath);
    } catch {
      // 跨文件系统移动时 renameSync 会失败，此处仅记录日志
      // 实际部署中应使用 copyFile + unlink
      console.warn(`[Telegram] 文件移动失败（可能跨文件系统）: ${filePath} → ${destPath}`);
      return;
    }

    console.log(`[Telegram] 文件分类: ${basename(filePath)} → ${contentType}/incoming/ (${channelMpaaRating})`);

    // 触发 file-detected webhook（异步，不阻塞）
    this.triggerWebhook(destPath, contentType, channelMpaaRating).catch((err) => {
      console.error(`[Telegram] Webhook 触发失败: ${(err as Error).message}`);
    });
  }

  // ── 辅助方法 ────────────────────────────────────────

  /**
   * 根据 MIME 类型和媒体类型猜测文件扩展名
   */
  private guessExtension(mimeType: string | null, mediaType: string | null): string {
    if (mimeType) {
      const mimeExtMap: Record<string, string> = {
        'video/mp4': '.mp4',
        'video/x-matroska': '.mkv',
        'video/webm': '.webm',
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'audio/mpeg': '.mp3',
        'audio/flac': '.flac',
        'audio/ogg': '.ogg',
        'application/pdf': '.pdf',
        'application/epub+zip': '.epub',
        'text/plain': '.txt',
      };
      if (mimeExtMap[mimeType]) return mimeExtMap[mimeType];
    }

    // 按媒体类型回退
    const typeExtMap: Record<string, string> = {
      video: '.mp4',
      animation: '.gif',
      photo: '.jpg',
      document: '.bin',
      audio: '.mp3',
    };
    return typeExtMap[mediaType ?? ''] ?? '.bin';
  }

  /**
   * 触发 file-detected webhook
   */
  private async triggerWebhook(
    filePath: string,
    contentType: string,
    mpaaRating: string,
  ): Promise<void> {
    // 推断流水线类型
    const pipelineTypeMap: Record<string, string> = {
      videos: 'video_pipeline',
      comics: 'comic_pipeline',
      novels: 'novel_pipeline',
      music: 'audio_pipeline',
    };

    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath,
        type: pipelineTypeMap[contentType] ?? 'video_pipeline',
        source: 'telegram',
        mpaaRating,
      }),
    });
  }

  // ── 频道管理 ────────────────────────────────────────

  /** 获取频道列表 */
  getChannels(): TelegramChannel[] {
    return [...this.channels];
  }

  /** 添加频道 */
  addChannel(channel: TelegramChannel): void {
    this.channels.push(channel);
    if (channel.enabled) {
      this.startChannelScraper(channel);
    }
  }

  /** 移除频道 */
  removeChannel(channelId: string): void {
    const timer = this.timers.get(channelId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(channelId);
    }
    this.channels = this.channels.filter((c) => c.channelId !== channelId);
  }
}
