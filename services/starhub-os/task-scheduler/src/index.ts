// index.ts — task-scheduler 入口
// Express HTTP 服务器 + 路由挂载 + 崩溃恢复 + 优雅关闭

import express, { type Express } from 'express';
import { registerRoutes } from './routes.js';
import { recoverProcessingTasks, closeQueues } from './queue.js';
import { gpuScheduler } from './gpu-scheduler.js';

const PORT = Number(process.env.PORT) || 8000;

const app: Express = express();

// 解析 JSON 请求体
app.use(express.json());

// 注册所有 API 路由
registerRoutes(app);

// ── 启动服务 ──────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[task-scheduler] 服务启动 — 端口: ${PORT}`);

  // 启动时执行崩溃恢复：恢复 processing 状态的任务
  try {
    const recovered = recoverProcessingTasks();
    if (recovered > 0) {
      console.log(`[task-scheduler] 崩溃恢复完成 — 恢复 ${recovered} 个任务`);
    }
  } catch (err) {
    console.error('[task-scheduler] 崩溃恢复失败:', (err as Error).message);
  }
});

// ── 优雅关闭 ──────────────────────────────────────────

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[task-scheduler] 收到 ${signal} 信号，开始优雅关闭...`);

  try {
    // 停止 GPU 过期检查定时器
    gpuScheduler.stopExpiryChecker();

    // 关闭所有 BullMQ 队列和 Redis 连接
    await closeQueues();

    console.log('[task-scheduler] 优雅关闭完成');
    process.exit(0);
  } catch (err) {
    console.error('[task-scheduler] 优雅关闭出错:', (err as Error).message);
    process.exit(1);
  }
}

process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
process.on('SIGINT', () => { void gracefulShutdown('SIGINT'); });

export { app };
