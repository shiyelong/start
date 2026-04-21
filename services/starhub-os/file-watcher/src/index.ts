/**
 * StarHub OS file-watcher 文件监控服务
 *
 * 功能：
 * - 使用 chokidar 监控 4 个 incoming 目录（videos/comics/novels/music）
 * - 文件写入完成检测：文件大小 5 秒内无变化视为写入完成
 * - 压缩包自动解压：支持 .zip / .rar / .7z 格式
 * - 检测到新文件后 POST 到 task-scheduler webhook
 * - 根据所在目录推断流水线类型
 * - 幂等处理：正在处理的文件不会重复触发
 * - 优雅关闭：SIGTERM/SIGINT 信号处理
 */

import chokidar, { type FSWatcher } from 'chokidar';
import { stat, readdir } from 'node:fs/promises';
import { resolve, extname, dirname, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import extractZip from 'extract-zip';

const execFileAsync = promisify(execFile);

// ============================================================
// 配置
// ============================================================

// 监控的 incoming 目录及其对应的流水线类型
const WATCH_DIRS: Record<string, string> = {
  '/mnt/storage/media/videos/incoming': 'video_pipeline',
  '/mnt/storage/media/comics/incoming': 'comic_pipeline',
  '/mnt/storage/media/novels/incoming': 'novel_pipeline',
  '/mnt/storage/media/music/incoming': 'audio_pipeline',
};

// task-scheduler webhook 地址
const WEBHOOK_URL =
  process.env.WEBHOOK_URL ?? 'http://127.0.0.1:8000/webhook/file-detected';

// 文件写入完成检测参数
const STABLE_CHECK_INTERVAL_MS = 1000; // 每秒检查一次文件大小
const STABLE_THRESHOLD_MS = 5000;      // 文件大小 5 秒无变化视为写入完成

// 压缩包扩展名
const ARCHIVE_EXTENSIONS = new Set(['.zip', '.rar', '.7z']);

// ============================================================
// 状态管理
// ============================================================

// 正在处理中的文件集合，防止重复处理
const processingFiles = new Set<string>();

// ============================================================
// 工具函数
// ============================================================

/** 获取当前时间戳字符串，用于日志输出 */
function timestamp(): string {
  return new Date().toISOString();
}

/** 日志输出 */
function log(message: string): void {
  console.log(`[${timestamp()}] ${message}`);
}

/** 错误日志输出 */
function logError(message: string, error?: unknown): void {
  const errMsg = error instanceof Error ? error.message : String(error ?? '');
  console.error(`[${timestamp()}] [错误] ${message}${errMsg ? ': ' + errMsg : ''}`);
}

/**
 * 根据文件路径推断流水线类型
 * 遍历所有监控目录，找到匹配的前缀
 */
export function inferPipelineType(filePath: string): string | null {
  for (const [dir, pipelineType] of Object.entries(WATCH_DIRS)) {
    if (filePath.startsWith(dir)) {
      return pipelineType;
    }
  }
  return null;
}

/**
 * 等待文件写入完成
 * 每秒检查文件大小，连续 5 秒无变化则认为写入完成
 */
export async function waitForWriteComplete(filePath: string): Promise<boolean> {
  let lastSize = -1;
  let stableStartTime: number | null = null;

  while (true) {
    try {
      const fileStat = await stat(filePath);
      const currentSize = fileStat.size;

      if (currentSize === lastSize) {
        // 文件大小未变化
        if (stableStartTime === null) {
          stableStartTime = Date.now();
        } else if (Date.now() - stableStartTime >= STABLE_THRESHOLD_MS) {
          // 已稳定超过阈值，写入完成
          return true;
        }
      } else {
        // 文件大小发生变化，重置稳定计时
        lastSize = currentSize;
        stableStartTime = null;
      }
    } catch {
      // 文件可能被删除或不可访问
      logError(`文件不可访问: ${filePath}`);
      return false;
    }

    await sleep(STABLE_CHECK_INTERVAL_MS);
  }
}

/** 延迟指定毫秒 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 判断文件是否为压缩包
 */
export function isArchive(filePath: string): boolean {
  return ARCHIVE_EXTENSIONS.has(extname(filePath).toLowerCase());
}

/**
 * 解压压缩包到同目录
 * 支持 .zip / .rar / .7z 三种格式
 * 返回解压后的文件路径列表
 */
export async function extractArchive(filePath: string): Promise<string[]> {
  const ext = extname(filePath).toLowerCase();
  const targetDir = dirname(filePath);

  // 记录解压前的文件列表，用于计算新增文件
  const beforeFiles = new Set(await readdir(targetDir));

  if (ext === '.zip') {
    await extractZip(filePath, { dir: targetDir });
  } else if (ext === '.rar') {
    // 使用 node-unrar-js 解压 RAR 文件
    const { createExtractorFromFile } = await import('node-unrar-js');
    const extractor = await createExtractorFromFile({ filepath: filePath, targetPath: targetDir });
    const extracted = extractor.extract();
    // 消费迭代器以完成解压
    const files = [...extracted.files];
    if (files.length === 0) {
      log(`RAR 文件为空或解压无结果: ${filePath}`);
    }
  } else if (ext === '.7z') {
    // 使用系统 7z 命令解压
    await execFileAsync('7z', ['x', '-y', `-o${targetDir}`, filePath]);
  } else {
    logError(`不支持的压缩格式: ${ext}`);
    return [];
  }

  // 计算新增文件
  const afterFiles = await readdir(targetDir);
  const newFiles = afterFiles
    .filter((f) => !beforeFiles.has(f) && f !== basename(filePath))
    .map((f) => resolve(targetDir, f));

  log(`解压完成: ${filePath} -> ${newFiles.length} 个新文件`);
  return newFiles;
}

/**
 * 向 task-scheduler 发送 webhook 通知
 */
async function notifyTaskScheduler(filePath: string, pipelineType: string): Promise<void> {
  const payload = {
    filePath,
    type: pipelineType,
    source: 'file-watcher',
  };

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logError(`webhook 响应异常: ${response.status} ${response.statusText}`);
    } else {
      log(`webhook 通知成功: ${filePath} -> ${pipelineType}`);
    }
  } catch (error) {
    logError(`webhook 通知失败: ${filePath}`, error);
  }
}

/**
 * 处理单个检测到的文件
 * 包含：幂等检查 -> 等待写入完成 -> 压缩包解压 -> webhook 通知
 */
async function handleDetectedFile(filePath: string): Promise<void> {
  // 幂等检查：跳过正在处理的文件
  if (processingFiles.has(filePath)) {
    return;
  }

  processingFiles.add(filePath);
  log(`检测到新文件: ${filePath}`);

  try {
    // 等待文件写入完成
    const writeComplete = await waitForWriteComplete(filePath);
    if (!writeComplete) {
      logError(`文件写入未完成或不可访问，跳过: ${filePath}`);
      return;
    }

    log(`文件写入完成: ${filePath}`);

    // 推断流水线类型
    const pipelineType = inferPipelineType(filePath);
    if (!pipelineType) {
      logError(`无法推断流水线类型，跳过: ${filePath}`);
      return;
    }

    // 压缩包自动解压
    if (isArchive(filePath)) {
      log(`检测到压缩包，开始解压: ${filePath}`);
      try {
        const extractedFiles = await extractArchive(filePath);
        // 对解压出的每个文件发送 webhook 通知
        for (const extractedFile of extractedFiles) {
          // 跳过子目录，只处理文件
          try {
            const fileStat = await stat(extractedFile);
            if (fileStat.isFile() && !isArchive(extractedFile)) {
              await notifyTaskScheduler(extractedFile, pipelineType);
            } else if (fileStat.isFile() && isArchive(extractedFile)) {
              // 嵌套压缩包：递归处理
              await handleDetectedFile(extractedFile);
            }
          } catch {
            logError(`无法访问解压文件: ${extractedFile}`);
          }
        }
      } catch (error) {
        logError(`解压失败: ${filePath}`, error);
        // 解压失败仍然通知 task-scheduler，让其决定如何处理
        await notifyTaskScheduler(filePath, pipelineType);
      }
    } else {
      // 普通文件直接通知
      await notifyTaskScheduler(filePath, pipelineType);
    }
  } catch (error) {
    logError(`处理文件时发生错误: ${filePath}`, error);
  } finally {
    processingFiles.delete(filePath);
  }
}

// ============================================================
// 主入口
// ============================================================

/** 启动文件监控 */
function startWatcher(): FSWatcher {
  const watchPaths = Object.keys(WATCH_DIRS);

  log('启动文件监控服务');
  log(`监控目录: ${watchPaths.join(', ')}`);
  log(`webhook 地址: ${WEBHOOK_URL}`);

  const watcher = chokidar.watch(watchPaths, {
    // 忽略隐藏文件和临时文件
    ignored: /(^|[/\\])\.|\.tmp$|\.part$/,
    persistent: true,
    // 忽略启动时已存在的文件，只监控新增文件
    ignoreInitial: true,
    // 等待文件稳定后再触发事件（基础防抖）
    awaitWriteFinish: false,
    // 使用轮询作为后备（Docker 挂载卷可能不支持 inotify）
    usePolling: false,
  });

  // 监听新文件添加事件
  watcher.on('add', (filePath: string) => {
    // 异步处理，不阻塞 watcher
    handleDetectedFile(filePath).catch((error) => {
      logError(`处理文件异常: ${filePath}`, error);
    });
  });

  watcher.on('error', (error: unknown) => {
    logError('文件监控错误', error);
  });

  watcher.on('ready', () => {
    log('文件监控就绪，等待新文件...');
  });

  return watcher;
}

/** 优雅关闭 */
async function gracefulShutdown(watcher: FSWatcher): Promise<void> {
  log('收到关闭信号，正在优雅关闭...');

  // 关闭文件监控
  await watcher.close();
  log('文件监控已关闭');

  // 等待正在处理的文件完成（最多等待 30 秒）
  const maxWait = 30_000;
  const startTime = Date.now();
  while (processingFiles.size > 0 && Date.now() - startTime < maxWait) {
    log(`等待 ${processingFiles.size} 个文件处理完成...`);
    await sleep(1000);
  }

  if (processingFiles.size > 0) {
    logError(`超时退出，${processingFiles.size} 个文件未处理完成`);
  }

  log('文件监控服务已停止');
  process.exit(0);
}

// 主函数
function main(): void {
  const watcher = startWatcher();

  // 注册信号处理
  process.on('SIGTERM', () => {
    gracefulShutdown(watcher).catch((error) => {
      logError('关闭过程出错', error);
      process.exit(1);
    });
  });

  process.on('SIGINT', () => {
    gracefulShutdown(watcher).catch((error) => {
      logError('关闭过程出错', error);
      process.exit(1);
    });
  });

  // 未捕获异常处理
  process.on('uncaughtException', (error) => {
    logError('未捕获异常', error);
  });

  process.on('unhandledRejection', (reason) => {
    logError('未处理的 Promise 拒绝', reason);
  });
}

main();
