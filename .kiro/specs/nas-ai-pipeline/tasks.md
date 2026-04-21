# 实施计划：NAS AI 处理流水线与自动化部署

## 概述

本实施计划将星聚平台 NAS 端 AI 处理流水线与自动化部署系统拆分为可执行的编码任务。系统包含 18 个 Docker 容器、SQLite 数据库（pipeline.db，16 张表）、GPU 互斥调度、BullMQ+Redis 任务队列、4 条处理流水线（视频 12 步、漫画 9 步、小说 10 步、音频 6 步）、WebRTC 多人街机、一键部署脚本。

**技术栈：**
- NAS 端调度/媒体服务：TypeScript + Node.js（`nas-service/`）
- 视频处理引擎：Python + ffmpeg（`nas-service/video-processor/`）
- 龙虾 AI 助手：Python（`nas-service/lobster-ai/`）
- 部署脚本：Bash（`nas-service/deploy/`）
- 前端管理后台：Next.js 14 + Tailwind CSS（`src/`）
- 后端 API 代理：Cloudflare Pages Functions（`functions/api/`）

## 任务

---

- [ ] 1. 基础设施：SQLite 数据库 Schema 与项目结构初始化
  - [ ] 1.1 创建 `nas-service/` 项目结构与依赖配置
    - 初始化 `nas-service/package.json`，添加依赖：`better-sqlite3`、`bullmq`、`ioredis`、`chokidar`、`uuid`、`express`
    - 创建目录结构：`nas-service/src/scheduler/`、`nas-service/src/media-server/`、`nas-service/src/file-watcher/`、`nas-service/src/shared/`
    - 配置 TypeScript `tsconfig.json`
    - _需求: 56.1, 57_

  - [ ] 1.2 实现 `pipeline.db` SQLite Schema 初始化模块
    - 创建 `nas-service/src/shared/db.ts`，封装 `better-sqlite3` 连接
    - 创建 `nas-service/src/shared/schema.sql`，包含全部 16 张表的 CREATE TABLE 语句（tasks、task_steps、video_hashes、comic_hashes、audio_fingerprints、novel_fingerprints、face_features、dedup_records、ad_segments、content_registry、telegram_channels、scraper_sources、bandwidth_rules、bandwidth_usage、gpu_lock、lobster_actions、mirror_sources、vn_saves）
    - 实现 `initDatabase()` 函数，幂等执行 schema 初始化
    - _需求: 52.5, 53.4, 54.4, 55.3, 56.1, 57.3_

  - [ ]* 1.3 编写 Schema 初始化单元测试
    - 测试 `initDatabase()` 幂等性（多次执行不报错）
    - 测试所有 16 张表创建成功
    - _需求: 57.3_

- [ ] 2. GPU 互斥调度器与任务队列核心
  - [ ] 2.1 实现 BullMQ 任务队列基础设施
    - 创建 `nas-service/src/scheduler/queue.ts`，封装 BullMQ Queue 和 Worker
    - 定义队列名称常量：`video_pipeline`、`comic_pipeline`、`novel_pipeline`、`audio_pipeline`、`dedup_scan`、`face_verify`
    - 实现任务创建、状态更新、优先级调整的数据库操作
    - _需求: 7.1, 7.2, 31.1, 31.7_

  - [ ] 2.2 实现 GPU 互斥锁模块
    - 创建 `nas-service/src/scheduler/gpu-lock.ts`
    - 实现 `acquireGpuLock(taskId, service, timeoutMinutes)` — 基于 SQLite 原子 UPDATE 获取锁
    - 实现 `releaseGpuLock(taskId)` — 释放锁并立即触发下一轮调度
    - 实现超时自动释放逻辑（检查 `expires_at`）
    - 配置各服务超时：whisper 60min、xtts 120min、sd-inpaint 180min、sd-txt2img 30min、manga-translator 60min、tdarr 240min
    - _需求: 7.4, 56.3_

  - [ ]* 2.3 编写 GPU 互斥锁属性测试
    - **Property 7: GPU 互斥锁不变性** — 对任意 GPU 任务获取/释放事件序列，任意时刻最多一个任务持有锁
    - **验证: 需求 7.4, 56.3**

  - [ ] 2.4 实现任务优先级调度算法
    - 创建 `nas-service/src/scheduler/priority.ts`
    - 实现优先级规则：紧急(0-10) > 高(11-50) > 中(51-100) > 低(101-200) > 后台(201-999)
    - 实现 `getNextGpuTask()` — 按优先级+创建时间排序获取下一个待执行 GPU 任务
    - 实现 `scheduleGpuTask()` — 轮询调度主循环（每 5 秒检查）
    - _需求: 31.4, 56.4_

  - [ ] 2.5 实现任务依赖管理
    - 在 `nas-service/src/scheduler/dependencies.ts` 中实现任务依赖 DAG
    - 当前置任务完成时自动触发后续任务
    - _需求: 31.7_

  - [ ]* 2.6 编写任务依赖触发属性测试
    - **Property 14: 任务依赖触发正确性** — 对任意任务依赖 DAG，完成某任务时仅触发所有前置依赖均已完成的后续任务
    - **验证: 需求 31.7**

- [ ] 3. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有疑问请询问用户。

- [ ] 4. 错误恢复与重试机制
  - [ ] 4.1 实现步骤级状态持久化
    - 创建 `nas-service/src/scheduler/step-executor.ts`
    - 实现 `executeStep(taskId, stepNumber, stepFn)` — 执行前标记 running，成功标记 completed，失败标记 failed 并记录 error_message
    - 每步完成后立即写入 `task_steps` 表
    - _需求: 58.1, 58.4_

  - [ ] 4.2 实现指数退避重试策略
    - 创建 `nas-service/src/scheduler/retry.ts`
    - 实现重试延迟计算：第 0 次=60s、第 1 次=300s、第 2 次=1800s、第 3 次=放弃
    - 实现 `shouldRetry(retryCount)` 和 `getRetryDelay(retryCount)`
    - 3 次失败后跳过该步骤继续后续步骤（降级处理）
    - _需求: 58.2, 58.3_

  - [ ]* 4.3 编写重试退避属性测试
    - **Property 16: 重试退避时间计算** — 对任意重试次数 n(0-2)，延迟严格匹配退避表；n>=3 返回放弃信号
    - **验证: 需求 58.2**

  - [ ] 4.4 实现崩溃恢复模块
    - 创建 `nas-service/src/scheduler/recovery.ts`
    - 实现 `recoverOnStartup()` — 恢复所有 processing 状态任务，从最后完成步骤的下一步继续
    - 释放过期 GPU 锁
    - 清理超过 7 天的 processing 临时目录
    - _需求: 58.6, 58.7_

  - [ ]* 4.5 编写崩溃恢复属性测试
    - **Property 15: 崩溃恢复断点续传** — 对任意任务状态（部分步骤已完成），恢复后从正确断点继续，不重复已完成步骤
    - **验证: 需求 58.1, 58.6**

  - [ ]* 4.6 编写步骤失败降级属性测试
    - **Property 6: 步骤失败降级继续** — 对任意流水线任务和任意失败步骤，后续步骤仍被执行
    - **验证: 需求 7.3, 58.3**

- [ ] 5. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有疑问请询问用户。


- [ ] 6. 文件监控与 Webhook 集成
  - [ ] 6.1 实现 file-watcher 文件监控服务
    - 创建 `nas-service/src/file-watcher/watcher.ts`
    - 使用 `chokidar` 监控 4 个 incoming 目录：`/data/media/videos/incoming/`、`/data/media/comics/incoming/`、`/data/media/novels/incoming/`、`/data/media/music/incoming/`
    - 实现文件写入完成检测算法：每 5 秒检查文件大小，连续 2 次无变化（10 秒稳定期）判定完成
    - 写入完成后发送 HTTP POST 到 `http://127.0.0.1:8000/webhook/file-detected`
    - _需求: 52.1, 52.2, 53.1, 53.2, 54.1, 54.2, 55.1, 56.5, 56.6_

  - [ ] 6.2 实现 Webhook 接收端点
    - 在 `nas-service/src/scheduler/webhooks.ts` 中实现：
    - `POST /webhook/file-detected` — 接收 file-watcher 事件，创建对应类型的流水线任务
    - `POST /webhook/download-complete` — 接收 qBittorrent 下载完成回调，根据 category 移动文件到对应 incoming 目录
    - `POST /webhook/import-complete` — 接收 Sonarr/Radarr 导入完成回调
    - _需求: 56.7, 56.8, 56.9_

  - [ ]* 6.3 编写 file-watcher 单元测试
    - 测试文件写入完成检测算法（模拟文件大小变化）
    - 测试 webhook 请求体格式正确性
    - _需求: 56.5, 56.6_

- [ ] 7. 统一去重引擎
  - [ ] 7.1 实现视频感知哈希与去重
    - 创建 `nas-service/src/scheduler/dedup/video-hasher.ts`
    - 调用 video-processor API `POST /process/hash` 计算 pHash 和场景指纹
    - 实现汉明距离比对（阈值 < 10 视为重复）
    - 实现版本质量比较（分辨率 > 文件大小 > 编码质量）
    - 将哈希写入 `video_hashes` 表
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.6, 33.3_

  - [ ]* 7.2 编写汉明距离去重属性测试
    - **Property 1: 汉明距离去重决策正确性** — 对任意两个 64-bit 哈希值，距离<10 返回 duplicate，>=10 返回 not_duplicate
    - **验证: 需求 1.2, 36.2**

  - [ ]* 7.3 编写质量优选属性测试
    - **Property 2: 质量优选版本保留** — 对任意两个元数据对，始终保留质量更高版本
    - **验证: 需求 1.4, 36.3, 46.3**

  - [ ] 7.4 实现漫画感知哈希与去重
    - 创建 `nas-service/src/scheduler/dedup/comic-hasher.ts`
    - 对封面和前 5 页计算感知哈希
    - 汉明距离 < 8 视为重复
    - 识别同一漫画的不同语言版本（关联而非标记重复）
    - 将哈希写入 `comic_hashes` 表
    - _需求: 36.1, 36.2, 36.3, 36.4_

  - [ ] 7.5 实现音频指纹与去重
    - 创建 `nas-service/src/scheduler/dedup/audio-hasher.ts`
    - 调用 `fpcalc`（Chromaprint）计算音频指纹
    - 相似度 > 90% 视为重复
    - 识别不同编码格式版本（MP3 vs FLAC），保留音质最高版本
    - 识别翻唱/remix 版本，关联为同一作品变体
    - 将指纹写入 `audio_fingerprints` 表
    - _需求: 46.1, 46.2, 46.3, 46.4_

  - [ ] 7.6 实现小说指纹与去重
    - 创建 `nas-service/src/scheduler/dedup/novel-hasher.ts`
    - 提取前 1000 字计算 SimHash
    - 标题+作者匹配 + SimHash 相似度 > 90% 视为重复
    - 将指纹写入 `novel_fingerprints` 表
    - _需求: 42.2, 50.2, 54.5, 54.6_

  - [ ] 7.7 实现人脸特征去重（服务者验证）
    - 创建 `nas-service/src/scheduler/dedup/face-hasher.ts`
    - 调用 video-processor API `POST /process/face-compare` 计算人脸特征向量
    - 余弦相似度 > 0.85 视为疑似重复/盗图
    - 视频验证：人脸比对分数 > 0.8 视为通过
    - 将特征写入 `face_features` 表
    - _需求: 38.1, 38.2, 38.3, 38.4, 38.5_

  - [ ] 7.8 实现统一去重 API 与管理接口
    - 创建 `nas-service/src/scheduler/dedup/api.ts`
    - 实现 `GET /api/dedup/stats` — 各类型去重统计
    - 实现 `GET /api/dedup/queue` — 待清理队列
    - 实现 `PUT /api/dedup/:id/confirm` 和 `PUT /api/dedup/:id/reject` — 确认/驳回去重建议
    - 实现 `POST /api/dedup/full-scan` — 触发全库扫描（默认每周一次）
    - _需求: 47.1, 47.2, 47.3, 47.4, 47.5_

- [ ] 8. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有疑问请询问用户。

- [ ] 9. 视频处理引擎（Python）
  - [ ] 9.1 创建 video-processor Python 项目结构
    - 创建 `nas-service/video-processor/` 目录
    - 创建 `requirements.txt`：`flask`、`ffmpeg-python`、`scenedetect`、`imagehash`、`numpy`、`opencv-python`、`face_recognition`
    - 创建 `Dockerfile`，基于 Python 3.11 + ffmpeg
    - 创建 `nas-service/video-processor/app.py` — Flask HTTP 服务，绑定 `127.0.0.1:8100`
    - _需求: 56.1_

  - [ ] 9.2 实现视频元数据提取 API
    - 实现 `POST /process/probe` — 调用 ffprobe 提取视频元数据（时长、分辨率、编码、音轨数、字幕轨数）
    - 返回 JSON 格式元数据
    - _需求: 52.3, 52.4_

  - [ ] 9.3 实现感知哈希计算 API
    - 实现 `POST /process/hash` — 支持视频（关键帧 pHash + 场景指纹）、图片（pHash）、音频（调用 fpcalc）
    - 视频：每 10 秒提取一帧关键帧，计算 64-bit pHash
    - _需求: 1.1, 1.6, 36.1, 46.1_

  - [ ] 9.4 实现广告检测与移除 API
    - 实现 `POST /process/ad-detect` — 使用 scenedetect 分析场景切换点、黑屏帧、音频静音段
    - 支持三种广告类型：片头、片尾、插播
    - 置信度低于 70% 标记为"待人工审核"
    - 实现 `POST /process/ad-remove` — 调用 ffmpeg 裁剪移除广告片段并重新拼接
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 33.4_

  - [ ] 9.5 实现水印检测与移除 API
    - 实现 `POST /process/watermark-detect` — 对视频前 30 秒采样检测水印位置
    - 实现 `POST /process/watermark-remove` — 调用 SD_API inpainting 移除水印，ffmpeg 重编码
    - 支持文字水印、Logo 水印、半透明水印
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 33.5_

  - [ ] 9.6 实现合集检测与拆分 API
    - 实现 `POST /process/split-detect` — 分析时长 > 60min 且 >= 3 个黑屏分隔段的视频
    - 实现 `POST /process/split` — 按黑屏分隔点拆分为独立集数
    - 为每集生成标题和封面截图
    - 置信度低于 60% 标记为"待人工拆分"
    - _需求: 34.1, 34.2, 34.3, 34.4, 34.5, 34.6_

  - [ ] 9.7 实现多轨封装 API
    - 实现 `POST /process/package` — 调用 ffmpeg 将视频轨 + 多音轨 + 多字幕轨封装为 MKV
    - 支持标记各音轨/字幕轨的语言标签
    - _需求: 6.4, 33.8, 52.29, 52.30_

  - [ ] 9.8 实现人脸比对 API
    - 实现 `POST /process/face-compare` — 使用 face_recognition 库计算人脸特征向量
    - 支持照片间比对和视频-照片比对
    - _需求: 38.1, 38.4_

  - [ ]* 9.9 编写 video-processor 单元测试
    - 测试 ffprobe 元数据提取
    - 测试 pHash 计算和汉明距离
    - 测试广告检测场景切换分析
    - _需求: 1, 2, 3, 34_


- [ ] 10. 视频处理流水线编排（12 步）
  - [ ] 10.1 实现视频流水线步骤定义与创建
    - 创建 `nas-service/src/scheduler/pipelines/video-pipeline.ts`
    - 定义 12 步流水线：入库触发 → 文件预检 → 感知哈希去重 → 合集检测拆分 → 广告检测移除 → 水印检测移除 → 语音识别 → 字幕翻译 → 多语言配音 → 多轨封装 → 元数据注册 → 文件归档清理
    - 创建任务时自动生成 `task_steps` 记录
    - _需求: 7.1, 7.2, 52_

  - [ ]* 10.2 编写流水线步骤顺序属性测试
    - **Property 5: 流水线步骤顺序不变性** — 对任意内容类型，task_steps 严格按定义顺序排列
    - **验证: 需求 7.1, 10.1, 15.1, 52, 53, 54, 55**

  - [ ] 10.3 实现视频流水线各步骤执行逻辑
    - S1 文件预检：调用 video-processor `/process/probe`，失败则移动到 failed 目录
    - S2 感知哈希去重：调用去重引擎，重复则移动到 duplicates 目录
    - S3 合集检测拆分：调用 `/process/split-detect` 和 `/process/split`
    - S4 广告检测移除：调用 `/process/ad-detect` 和 `/process/ad-remove`
    - S5 水印检测移除：获取 GPU 锁(sd-api)，调用 `/process/watermark-remove`
    - S6 语音识别：获取 GPU 锁(whisper)，调用 whisper-api `/asr`
    - S7 字幕翻译：调用 ollama `/api/generate`，回退到云端 DeepL API
    - S8 多语言配音：获取 GPU 锁(xtts)，调用 xtts-api `/tts_to_audio`
    - S9 多轨封装：调用 video-processor `/process/package`
    - S10 元数据注册：写入 `content_registry` 表 + 调用平台 API
    - S11 文件归档：移动到 ready 目录
    - S12 清理：删除 processing 临时目录，更新任务状态
    - _需求: 7.1, 7.3, 7.5, 7.6, 33.1, 52_

  - [ ] 10.4 实现字幕生成与翻译模块
    - 创建 `nas-service/src/scheduler/pipelines/subtitle.ts`
    - 调用 Whisper API 生成 SRT/ASS 格式字幕
    - 实现多语言翻译（中文/日文/英文），保持时间戳不变
    - 源语言已是目标语言之一时跳过该语言翻译
    - 翻译失败时标记"翻译待重试"，30 分钟后重新入队
    - _需求: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 10.5 编写字幕翻译时间戳属性测试
    - **Property 3: 字幕翻译时间戳不变性** — 对任意 SRT 字幕文件，翻译后时间戳与原始完全一致
    - **验证: 需求 5.2**

  - [ ]* 10.6 编写翻译语言跳过属性测试
    - **Property 4: 翻译语言跳过逻辑** — 源语言在目标列表中时跳过，不在时全部翻译
    - **验证: 需求 5.5**

  - [ ] 10.7 实现多语言配音模块
    - 创建 `nas-service/src/scheduler/pipelines/dubbing.ts`
    - 读取翻译字幕，逐句调用 XTTS API 生成配音
    - 支持声音克隆（从原始音频提取说话人音色样本）
    - 口型同步误差不超过 200ms
    - XTTS 不可用时标记"配音待重试"，30 分钟后重新入队
    - _需求: 6.1, 6.2, 6.3, 6.5, 6.6, 33.7_

  - [ ] 10.8 实现成人视频处理特殊逻辑
    - NC-17 级成人视频执行完整处理流水线
    - 成人视频源（Pornhub/XVideos/JavBus 等）自动触发处理
    - 识别成人视频特有广告模式（网站 Logo 动画、订阅提示）
    - 识别成人视频网站水印
    - _需求: 33.1, 33.2, 33.3, 33.4, 33.5, 33.6, 33.7, 33.8_

- [ ] 11. 漫画处理流水线编排（9 步）
  - [ ] 11.1 实现漫画流水线步骤定义与执行
    - 创建 `nas-service/src/scheduler/pipelines/comic-pipeline.ts`
    - 定义 9 步流水线：入库触发 → 预检元数据 → 漫画去重 → OCR 识别 → 文字翻译 → 文字渲染 → 黑白上色 → 版本打包 → 注册归档
    - S0 入库：解压 zip/rar/7z，整理图片到 processing 目录
    - S1 预检：扫描页数、分辨率、黑白检测、语言检测
    - S2 去重：调用漫画去重引擎
    - S3 OCR：获取 GPU 锁(manga-translator)，调用 `/ocr`
    - S4 翻译：调用 ollama 翻译为中文
    - S5 渲染：获取 GPU 锁(manga-translator)，调用 `/render` 擦除原文+渲染译文
    - S6 上色：获取 GPU 锁(sd-api)，调用 SD img2img 上色
    - S7 打包：生成三版本（original/translated/colorized）
    - S8 注册：写入 content_registry + 清理
    - _需求: 8, 9, 10, 35, 53_

  - [ ] 11.2 实现漫画上色模块
    - 创建 `nas-service/src/scheduler/pipelines/colorizer.ts`
    - 调用 SD API img2img 使用漫画上色专用模型
    - 使用第一页上色结果作为后续页面风格参考，确保颜色一致性
    - 保持上色后分辨率与原始一致
    - 失败页面跳过，使用原始黑白版本替代
    - 支持批量处理（按章节为单位）
    - _需求: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 35.3_

  - [ ] 11.3 实现漫画 OCR 与翻译渲染模块
    - 创建 `nas-service/src/scheduler/pipelines/manga-translate.ts`
    - 调用 manga-translator 容器 OCR API 识别日文/韩文/英文
    - 翻译为中文（优先本地 LLM，回退云端）
    - 调用渲染 API 擦除原文 + 渲染中文译文
    - 匹配原始字体风格和气泡大小
    - OCR 置信度低于 60% 标记"待人工校对"
    - 中文漫画跳过 OCR 和翻译步骤
    - _需求: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 10.3, 35.4, 35.5_

- [ ] 12. 小说处理流水线编排（10 步）
  - [ ] 12.1 实现小说流水线步骤定义与执行
    - 创建 `nas-service/src/scheduler/pipelines/novel-pipeline.ts`
    - 定义 10 步流水线：入库触发 → 文本预处理 → 小说去重 → 文本翻译 → VN 脚本生成 → 角色立绘 → 背景 CG → 角色配音 → 资源打包 → 注册归档
    - S0 入库：格式转换（TXT/EPUB/PDF → 纯文本）
    - S1 预处理：字数统计、语言检测、章节分割、MPAA 分级
    - S2 去重：SimHash 比对
    - S3 翻译：非中文小说翻译为中文
    - S4 VN 脚本：获取 GPU 锁(ollama)，LLM 分析生成 JSON 脚本
    - S5 角色立绘：获取 GPU 锁(sd-api)，固定 seed 生成 5 种表情
    - S6 背景 CG：获取 GPU 锁(sd-api)，根据场景描述生成
    - S7 配音：获取 GPU 锁(xtts)，为每个角色分配独特声音
    - S8 打包：生成 vn_package.json 索引 + 资源目录
    - S9 注册：写入 content_registry + 清理
    - _需求: 11, 12, 13, 15, 37, 54_

  - [ ] 12.2 实现视觉小说脚本生成模块
    - 创建 `nas-service/src/scheduler/pipelines/novel-vn.ts`
    - 调用 ollama LLM 分析章节内容
    - 提取场景描述、角色列表、表情/动作、对话、旁白
    - 输出 JSON 格式脚本：scenes[{background, characters, dialogues}]
    - 为每个角色生成一致的外貌描述
    - NC-17 级保留成人场景描述
    - _需求: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 37.1_

  - [ ] 12.3 实现视觉小说素材生成模块
    - 创建 `nas-service/src/scheduler/pipelines/vn-assets.ts`
    - 角色立绘：固定 seed + 5 种表情变体（neutral/happy/sad/angry/surprised）
    - 背景 CG：根据场景描述生成
    - NC-17 级使用 NSFW 模型/LoRA
    - SD API 不可用时标记"待重试"，30 分钟后重新入队
    - _需求: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 37.2, 37.3_

  - [ ] 12.4 实现视觉小说配音生成模块
    - 创建 `nas-service/src/scheduler/pipelines/vn-voice.ts`
    - 为每个角色分配独特声音特征
    - 根据表情/情绪标注调整语调和语速
    - 音频文件与脚本对话节点关联
    - _需求: 13.1, 13.2, 13.3, 13.4, 13.5, 37.4_

- [ ] 13. 音频处理流水线编排（6 步）
  - [ ] 13.1 实现音频流水线步骤定义与执行
    - 创建 `nas-service/src/scheduler/pipelines/audio-pipeline.ts`
    - 定义 6 步流水线：入库触发 → 元数据提取 → 音频指纹去重 → 格式标准化 → 分级标记 → 注册归档
    - S0 入库：检测文件格式（MP3/FLAC/WAV/AAC/OGG）
    - S1 元数据：ffprobe + ID3 标签提取
    - S2 去重：Chromaprint 指纹比对
    - S3 标准化：转码为 FLAC（高品质）+ AAC 256kbps（流媒体）
    - S4 分级：根据来源标记 MPAA 等级
    - S5 注册：写入 content_registry + 清理
    - _需求: 46, 55, 43_

- [ ] 14. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有疑问请询问用户。


- [ ] 15. task-scheduler HTTP API 服务
  - [ ] 15.1 实现 task-scheduler Express 服务主入口
    - 创建 `nas-service/src/scheduler/server.ts`
    - Express 服务绑定 `127.0.0.1:8000`
    - 注册所有路由：任务管理、GPU 状态、队列统计、Webhook、Telegram、带宽、去重、刮削
    - 启动时执行崩溃恢复 `recoverOnStartup()`
    - 启动 GPU 调度轮询（每 5 秒）
    - _需求: 56.1, 56.2_

  - [ ] 15.2 实现任务管理 API
    - `POST /api/tasks` — 创建任务
    - `GET /api/tasks` — 查询任务列表（分页、按状态/类型过滤）
    - `GET /api/tasks/:id` — 获取任务详情（含所有步骤状态）
    - `PUT /api/tasks/:id/priority` — 调整优先级
    - `PUT /api/tasks/:id/retry` — 重试失败任务
    - `PUT /api/tasks/:id/retry-step` — 重试某个失败步骤
    - `DELETE /api/tasks/:id` — 取消排队中的任务
    - _需求: 31.1, 31.2, 31.3, 31.4, 31.5_

  - [ ] 15.3 实现 GPU 与系统状态 API
    - `GET /api/gpu/status` — GPU 使用率、显存、当前运行模型
    - `GET /api/gpu/lock` — 当前 GPU 锁持有者
    - `GET /api/queue/stats` — 队列统计（pending/processing/completed/failed）
    - `GET /api/system/health` — 所有容器健康状态检查
    - _需求: 7.7, 31.6_

- [ ] 16. Telegram 自动抓取服务
  - [ ] 16.1 实现 Telegram 抓取核心逻辑
    - 创建 `nas-service/src/scheduler/telegram/scraper.ts`
    - 使用 `telegram` npm 包（MTProto 协议）连接 Telegram API
    - 按频道配置的间隔定时执行抓取
    - 支持下载视频、图片、文档类型媒体文件
    - 下载到 `/data/media/telegram/{channel_id}/`，完成后移动到对应 incoming 目录
    - 记录 `last_message_id` 避免重复抓取
    - API 请求失败时记录错误，下一周期重试
    - _需求: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 56.10, 56.11_

  - [ ] 16.2 实现 Telegram 内容自动分类
    - 创建 `nas-service/src/scheduler/telegram/classifier.ts`
    - 根据文件类型和来源频道配置自动分类
    - 继承频道预设 MPAA 分级
    - 视频内容自动加入视频 AI 处理流水线
    - 图片内容自动加入漫画处理流水线（如适用）
    - 无法分类的标记为"待人工分类"
    - 成人频道内容自动标记 NC-17
    - _需求: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 44.1, 44.2, 44.3, 44.5_

  - [ ]* 16.3 编写内容分类属性测试
    - **Property 11: 内容分类与分级继承** — 对任意文件类型和频道配置，分类正确且继承频道 MPAA 分级
    - **验证: 需求 27.1, 27.2**

  - [ ] 16.4 实现 Telegram 频道管理 API
    - `GET /api/telegram/channels` — 获取频道列表
    - `POST /api/telegram/channels` — 添加频道（验证频道 ID 有效性）
    - `PUT /api/telegram/channels/:id` — 编辑频道配置
    - `DELETE /api/telegram/channels/:id` — 删除频道
    - `POST /api/telegram/channels/:id/toggle` — 启用/禁用频道
    - `GET /api/telegram/logs` — 抓取日志
    - 每个频道展示：名称、类型、MPAA 分级、抓取间隔、最后抓取时间、已下载消息数
    - _需求: 28.1, 28.2, 28.3, 28.4, 28.5_

- [ ] 17. 内容自动刮削与下载管理
  - [ ] 17.1 实现刮削源管理框架
    - 创建 `nas-service/src/scheduler/scrapers/manager.ts`
    - 实现刮削源配置 CRUD（`scraper_sources` 表）
    - 实现定时刮削调度（按各源配置的间隔执行）
    - 下载前执行去重检查
    - 下载完成后自动标记 MPAA 分级并触发 AI 处理流水线
    - _需求: 29.1, 29.2, 29.5_

  - [ ] 17.2 实现成人视频源刮削适配器
    - 创建 `nas-service/src/scheduler/scrapers/adapters/adult-video.ts`
    - 支持 Pornhub/XVideos/XNXX/JavBus/Missav/ThisAV/Jable/Avgle/SpankBang/xHamster/HentaiHaven/Hanime 等源
    - 支持配置刮削频率（默认每 6 小时）和每次最大下载数
    - 支持按标签/分类配置刮削规则
    - _需求: 39.1, 39.2, 39.3, 39.4, 39.5_

  - [ ] 17.3 实现免费影视聚合源刮削适配器
    - 创建 `nas-service/src/scheduler/scrapers/adapters/free-video.ts`
    - 支持低端影视/茶杯狐/电影天堂/韩剧TV/人人视频等源
    - 根据用户搜索热度和播放量决定缓存优先级
    - 支持配置每日最大缓存量（默认 50GB/天）
    - _需求: 40.1, 40.2, 40.3, 40.4, 40.5_

  - [ ] 17.4 实现漫画源刮削适配器
    - 创建 `nas-service/src/scheduler/scrapers/adapters/comic.ts`
    - 普通漫画源：漫画柜/动漫之家/拷贝漫画/包子漫画/MangaDex/Webtoon/快看漫画
    - 成人漫画源：nhentai/E-Hentai/Hitomi/Pixiv/禁漫天堂/紳士漫畫/Wnacg/Tsumino
    - 支持追更（连载漫画新章节自动下载）
    - 根据来源自动标记 MPAA 分级
    - _需求: 41.1, 41.2, 41.3, 41.4, 51.1, 51.2, 51.3, 51.4, 51.5_

  - [ ] 17.5 实现小说源刮削适配器
    - 创建 `nas-service/src/scheduler/scrapers/adapters/novel.ts`
    - 普通小说源：笔趣阁/69书吧/全本小说网/顶点小说/Novel Updates/Light Novel World
    - 成人小说源：禁忌书屋/69书吧成人区/H小说网/成人文学城/Literotica/AO3
    - 支持追更（连载小说新章节自动下载）
    - _需求: 42.1, 42.2, 42.3, 42.4, 50.1, 50.2, 50.3, 50.4_

  - [ ] 17.6 实现动漫源刮削适配器
    - 创建 `nas-service/src/scheduler/scrapers/adapters/anime.ts`
    - 支持樱花动漫/AGE动漫/OmoFun/GoGoAnime/9Anime/动漫花园/萌番组
    - 成人动漫源：Hanime.tv/HentaiHaven
    - 根据用户追番列表自动下载新集
    - _需求: 48.1, 48.2, 48.3, 48.4, 48.5_

  - [ ] 17.7 实现主流视频平台缓存适配器
    - 创建 `nas-service/src/scheduler/scrapers/adapters/mainstream-video.ts`
    - 支持 B站/YouTube/抖音/TikTok/快手/西瓜视频
    - 仅缓存播放超过 N 次（可配置，默认 5 次）的内容
    - _需求: 49.1, 49.2, 49.3, 49.4_

  - [ ] 17.8 实现成人音乐/ASMR 源刮削适配器
    - 创建 `nas-service/src/scheduler/scrapers/adapters/adult-audio.ts`
    - 支持 DLsite/ASMR.one/Japaneseasmr
    - 自动提取元数据（标题/声优/标签/时长）
    - _需求: 43.1, 43.2, 43.3, 43.4_

  - [ ] 17.9 实现成人直播录像缓存适配器
    - 创建 `nas-service/src/scheduler/scrapers/adapters/adult-live.ts`
    - 支持 Chaturbate/StripChat/BongaCams/LiveJasmin/CamSoda/MyFreeCams
    - 按主播关注数/观看人数阈值自动触发录制
    - 自动提取封面截图和元数据
    - _需求: 45.1, 45.2, 45.3, 45.4_

  - [ ] 17.10 实现刮削管理 API
    - `GET /api/scrapers` — 所有刮削源列表
    - `PUT /api/scrapers/:id/config` — 更新刮削源配置
    - `POST /api/scrapers/:id/trigger` — 手动触发刮削
    - `GET /api/scrapers/:id/logs` — 刮削日志
    - _需求: 29.3, 29.5_

- [ ] 18. 带宽调度模块
  - [ ] 18.1 实现带宽调度器
    - 创建 `nas-service/src/scheduler/bandwidth.ts`
    - 按时段配置带宽限制（默认：夜间 00:00-06:00 高带宽，白天低带宽）
    - 时段切换时自动调整 qBittorrent 上传/下载速度限制（调用 qBittorrent API）
    - 与 NAS 代理层每日带宽上限协同工作
    - 当日带宽超过 90% 时自动暂停所有下载并通知管理员
    - _需求: 30.1, 30.2, 30.3, 30.5, 30.6_

  - [ ]* 18.2 编写带宽调度规则属性测试
    - **Property 12: 带宽调度规则时段匹配** — 对任意时刻和规则集，选择正确的覆盖规则
    - **验证: 需求 30.1, 30.3**

  - [ ]* 18.3 编写带宽超限暂停属性测试
    - **Property 13: 带宽超限暂停决策** — 超过 90% 返回暂停，低于 90% 返回继续
    - **验证: 需求 30.6**

  - [ ] 18.4 实现带宽管理 API
    - `GET /api/bandwidth/status` — 当前带宽使用情况
    - `GET /api/bandwidth/rules` — 调度规则列表
    - `PUT /api/bandwidth/rules` — 更新调度规则
    - _需求: 30.3, 30.4_

- [ ] 19. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有疑问请询问用户。


- [ ] 20. nas-media-server 媒体文件服务增强
  - [ ] 20.1 增强 nas-media-server 支持处理结果文件访问
    - 在现有 `nas-service/server.ts` 基础上增强
    - 确保 `GET /media/*` 支持 Range 请求（视频/音频 seek）
    - 确保支持 ETag/Last-Modified 缓存头（配合 CDN 缓存策略）
    - 支持访问 `/data/media/*/ready/` 目录下所有处理结果文件
    - 所有请求需验证 `X-NAS-Signature` 头（HMAC-SHA256）
    - _需求: 32.3, 32.4, 32.6_

  - [ ] 20.2 实现处理结果文件加密存储
    - 对 NAS 本地存储的文件使用 AES-256 加密
    - 与现有 NAS 缓存层（`nas-cache.ts`）的加密方案保持一致
    - _需求: 32.5_

- [ ] 21. 龙虾 AI 配置助手
  - [ ] 21.1 创建 lobster-ai Python 服务
    - 创建 `nas-service/lobster-ai/` 目录
    - 创建 `requirements.txt`：`flask`、`psutil`、`docker`
    - 创建 `Dockerfile`，基于 Python 3.11
    - 创建 `nas-service/lobster-ai/app.py` — Flask HTTP 服务，绑定 `127.0.0.1:8200`
    - _需求: 25.1_

  - [ ] 21.2 实现系统状态读取与诊断
    - 实现 `GET /api/system/status` — 读取 CPU/GPU/RAM 使用率、磁盘空间、Docker 容器状态、网络连接状态
    - 实现 `POST /api/chat` — 对话接口，分析系统状态并提供诊断建议
    - 调用本地 ollama LLM 生成诊断建议
    - _需求: 25.2, 25.3_

  - [ ] 21.3 实现配置变更执行与回滚
    - 实现 `POST /api/actions/execute` — 执行配置变更（重启容器、修改配置、调整资源）
    - 实现 `POST /api/actions/confirm` — 二次确认危险操作
    - 实现 `GET /api/actions/history` — 操作历史日志
    - 实现 `POST /api/actions/rollback/:id` — 回滚指定操作
    - 影响服务可用性的操作需二次确认
    - 记录所有操作日志到 `lobster_actions` 表
    - _需求: 25.4, 25.5, 25.6, 25.7_

- [ ] 22. 一键自动部署脚本
  - [ ] 22.1 实现系统检查与环境准备
    - 创建 `nas-service/deploy/deploy.sh`
    - 检查系统硬件：CPU >= 4 核、RAM >= 32GB、磁盘 >= 500GB、Docker 已安装
    - 检测 NVIDIA GPU（目标 RTX 3090）
    - 创建标准目录结构 `/data/media/`（videos/comics/novels/music 各含 incoming/processing/ready/duplicates/failed 子目录）
    - 初始化 `pipeline.db`
    - _需求: 21.1, 21.3, 57.1, 57.2, 57.3_

  - [ ] 22.2 实现 Docker 镜像加速配置
    - 创建 `nas-service/deploy/mirror.sh`
    - 配置多个国内镜像加速源（xuanyuan.cloud、DaoCloud、docker.aityp.com、1ms.run）
    - 按优先级依次尝试所有镜像源
    - 全部失败时使用 skopeo 作为最终回退
    - 记录每个镜像的拉取源和耗时
    - 支持通过配置文件添加/移除镜像源
    - _需求: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [ ] 22.3 实现 GPU 直通配置
    - 创建 `nas-service/deploy/gpu-setup.sh`
    - 安装 NVIDIA Container Toolkit（nvidia-docker2）
    - 为 AI 容器配置 GPU 直通：whisper-api、xtts-api、sd-api、video-processor、manga-translator
    - 配置 GPU 资源共享（NVIDIA MPS 或时间片轮转）
    - 在每个 AI 容器内运行 nvidia-smi 验证
    - 未检测到 GPU 时输出警告并配置 CPU-only 模式
    - _需求: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6_

  - [ ] 22.4 实现网络安全与隐私配置
    - 创建 `nas-service/deploy/security.sh`
    - 配置防火墙规则：阻止所有入站，仅允许 cloudflared 出站
    - 配置 DNS-over-HTTPS
    - 配置 MAC 地址随机化
    - 配置 cloudflared Tunnel 凭证
    - 生成加密密钥（NAS_SIGNING_KEY、NAS_ENCRYPTION_KEY）
    - 确保所有容器仅绑定 127.0.0.1
    - _需求: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7_

  - [ ] 22.5 实现 18 个 Docker 容器部署
    - 创建 `nas-service/deploy/containers.sh`
    - 按设计文档部署全部 18 个容器（cloudflared、nas-media-server、whisper-api、xtts-api、sd-api、manga-translator、ollama、video-processor、file-watcher、redis、task-scheduler、qbittorrent、sonarr、radarr、prowlarr、bazarr、tdarr、lobster-ai）
    - 全部绑定 127.0.0.1，使用 host 网络模式
    - 幂等执行：已存在的容器跳过
    - _需求: 21.2, 21.5, 21.6_

  - [ ] 22.6 实现自动刮削工具配置
    - 创建 `nas-service/deploy/scrapers-setup.sh`
    - 配置 Prowlarr 添加常用 Torrent 索引器
    - 配置 Sonarr 连接 Prowlarr + qBittorrent
    - 配置 Radarr 连接 Prowlarr + qBittorrent
    - 配置 Bazarr 连接 Sonarr + Radarr
    - 配置 Tdarr 自动转码 H.265
    - 配置 Unraid Community Applications 插件
    - _需求: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6_

  - [ ] 22.7 实现 Webhook 配置与健康检查
    - 配置 qBittorrent webhook → task-scheduler
    - 配置 Sonarr/Radarr webhook → task-scheduler
    - 对所有服务执行健康检查
    - 输出部署报告（成功/失败项列表）
    - _需求: 21.4, 24.7, 56.7, 56.8, 56.9_

  - [ ]* 22.8 编写部署脚本幂等性属性测试
    - **Property 10: 部署脚本幂等性** — 对任意初始状态，执行两次后的最终状态与执行一次相同
    - **验证: 需求 21.6**

- [ ] 23. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有疑问请询问用户。


- [ ] 24. 增强版多人街机系统
  - [ ] 24.1 实现动态多人实例分配器
    - 创建 `src/components/classic/InstanceAllocator.ts`
    - 读取 ROM 元数据获取 `maxPlayers`
    - 玩家加入时检查当前实例是否已满，已满则创建新 WASM 模拟器实例
    - 实例分配算法：`ceil(N/M)` 个实例，每个实例玩家数不超过 M
    - 展示所有活跃实例列表（玩家名称和状态）
    - 实例所有玩家离开时自动销毁并释放资源
    - 创建失败时通知玩家
    - _需求: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [ ]* 24.2 编写实例分配属性测试
    - **Property 9: 动态实例分配正确性** — 对任意玩家数 N 和最大玩家数 M，创建 ceil(N/M) 个实例，每个不超过 M
    - **验证: 需求 16.1, 16.2, 16.3**

  - [ ] 24.3 实现观战系统
    - 创建 `src/components/classic/SpectatorSystem.tsx`
    - 通过 `canvas.captureStream(30)` 捕获 30fps 画面流
    - 观战者通过 WebRTC MediaStream 接收画面
    - CSS Grid 展示所有实例缩略图（低分辨率流）
    - 点击缩略图切换全屏观战（高分辨率流）
    - 观战模式禁止向被观战实例发送输入
    - 叠加显示玩家名称和游戏状态
    - _需求: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [ ] 24.4 实现 WebRTC 语音聊天
    - 创建 `src/components/classic/VoiceChat.tsx`
    - 基于 WebRTC P2P 音频连接，Opus 编码
    - 信令通过 Cloudflare Durable Objects WebSocket 中继
    - 加入房间时请求麦克风权限并自动加入语音频道
    - 支持静音/取消静音、调节其他玩家音量
    - 语音活动检测（VAD）驱动说话指示器
    - 拒绝麦克风权限时以仅收听模式参与
    - _需求: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

  - [ ] 24.5 增强街机房间管理
    - 修改 `src/components/classic/ArcadeRoom.tsx`
    - 创建房间时选择 ROM 和游戏模式（自由对战/团队对战/合作）
    - 生成唯一房间码
    - 支持 FC/NES、SNES、GBA、Genesis/MD、Arcade(MAME)、DOS 游戏
    - DOS 游戏使用 DOSBox WASM
    - ROM 从 NAS 通过 Tunnel + CDN 缓存加载
    - 房主离开时转移权限
    - 房间列表页展示所有公开房间
    - _需求: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7_

- [ ] 25. 视觉小说前端引擎
  - [ ] 25.1 实现视觉小说渲染引擎
    - 创建 `src/components/novel/VNEngine.tsx`
    - 浏览器中渲染：背景 CG 显示、角色立绘叠加、对话框文字逐字显示、配音播放
    - 支持"文字阅读模式"和"视觉小说模式"切换
    - 点击/触摸推进对话、自动播放模式、快进已读内容
    - 回看历史对话记录
    - 从 NAS 通过 Tunnel + CDN 缓存加载素材
    - _需求: 14.1, 14.2, 14.3, 14.5, 14.7_

  - [ ] 25.2 实现视觉小说存档系统
    - 创建 `src/components/novel/VNSaveLoad.tsx`
    - 存档/读档功能，保存当前阅读进度到 NAS 本地 `pipeline.db` 的 `vn_saves` 表
    - 通过 API 代理层读写存档数据
    - _需求: 14.4_

  - [ ]* 25.3 编写视觉小说存档往返属性测试
    - **Property 8: 视觉小说存档读档往返** — 对任意存档状态，保存后读取返回完全相同数据
    - **验证: 需求 14.4**

  - [ ] 25.4 实现视觉小说移动端适配
    - 适配触摸操作和竖屏/横屏布局
    - 深色主题，主色 `#3ea6ff`，背景 `#0f0f0f`
    - _需求: 14.6_

- [ ] 26. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有疑问请询问用户。

- [ ] 27. 管理后台前端页面
  - [ ] 27.1 实现 AI 任务队列仪表盘页面
    - 创建 `src/app/admin/ai-pipeline/page.tsx`
    - 展示待处理、处理中、已完成、失败的任务数量
    - 每个任务展示：类型、目标内容、创建时间、开始时间、预计完成时间、当前状态
    - 支持手动重试失败任务、调整优先级、取消排队任务
    - 展示 GPU 使用率、显存占用、当前运行 AI 模型
    - 深色主题，SVG 图标（Lucide React），默认中文
    - _需求: 7.7, 31.1, 31.2, 31.3, 31.4, 31.5, 31.6_

  - [ ] 27.2 实现 Telegram 频道管理页面
    - 创建 `src/app/admin/telegram/page.tsx`
    - 频道列表：名称、类型、MPAA 分级、抓取间隔、最后抓取时间、已下载消息数
    - 支持添加、编辑、启用/禁用、删除频道
    - 展示抓取日志
    - _需求: 28.1, 28.2, 28.3, 28.4, 28.5_

  - [ ] 27.3 实现去重管理仪表盘页面
    - 创建 `src/app/admin/dedup/page.tsx`
    - 展示各类型（视频/漫画/小说/音乐/图片）的重复检测统计
    - 待清理队列，支持确认/驳回去重建议
    - 支持触发全库扫描
    - _需求: 47.2, 47.3, 47.4_

  - [ ] 27.4 实现带宽调度管理页面
    - 创建 `src/app/admin/bandwidth/page.tsx`
    - 展示当前带宽使用情况和调度规则
    - 支持自定义时段和带宽限制值
    - _需求: 30.3, 30.4_

  - [ ] 27.5 实现刮削源管理页面
    - 创建 `src/app/admin/scrapers/page.tsx`
    - 所有刮削源列表，支持配置刮削频率、最大下载数、标签过滤
    - 支持手动触发刮削
    - 展示刮削日志
    - _需求: 29.3, 29.5, 39.2, 39.5_

  - [ ] 27.6 实现龙虾 AI 助手管理页面
    - 创建 `src/app/admin/lobster/page.tsx`
    - 对话界面，向龙虾 AI 提问并展示诊断建议
    - 展示系统状态（CPU/GPU/RAM/磁盘/容器状态）
    - 操作历史日志，支持回滚
    - _需求: 25.3, 25.6, 25.7_

- [ ] 28. 后端 API 代理层
  - [ ] 28.1 实现 NAS AI 流水线 API 代理
    - 创建 `functions/api/nas/pipeline.ts`
    - 代理前端请求到 NAS task-scheduler API（通过 Cloudflare Tunnel）
    - 包含：任务列表、任务详情、重试、优先级调整、取消
    - _需求: 31, 56.12_

  - [ ] 28.2 实现 NAS Telegram 管理 API 代理
    - 创建 `functions/api/nas/telegram.ts`
    - 代理频道 CRUD、启用/禁用、抓取日志
    - _需求: 28_

  - [ ] 28.3 实现 NAS 去重管理 API 代理
    - 创建 `functions/api/nas/dedup.ts`
    - 代理去重统计、待清理队列、确认/驳回、全库扫描
    - _需求: 47_

  - [ ] 28.4 实现 NAS 带宽与刮削管理 API 代理
    - 创建 `functions/api/nas/bandwidth.ts`（增强现有文件）
    - 创建 `functions/api/nas/scrapers.ts`
    - 代理带宽状态/规则、刮削源配置/触发/日志
    - _需求: 30, 29_

  - [ ] 28.5 实现 NAS 龙虾 AI API 代理
    - 创建 `functions/api/nas/lobster.ts`
    - 代理对话、系统状态、操作执行/确认/回滚
    - _需求: 25_

  - [ ] 28.6 实现视觉小说存档 API
    - 创建 `functions/api/nas/vn-saves.ts`
    - 代理存档保存/读取到 NAS pipeline.db
    - _需求: 14.4_

- [ ] 29. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有疑问请询问用户。

- [ ] 30. Docker 镜像构建与集成联调
  - [ ] 30.1 创建自研服务 Dockerfile
    - 创建 `nas-service/Dockerfile.task-scheduler` — Node.js task-scheduler 镜像
    - 创建 `nas-service/Dockerfile.media-server` — Node.js nas-media-server 镜像
    - 创建 `nas-service/Dockerfile.file-watcher` — Node.js file-watcher 镜像
    - 创建 `nas-service/video-processor/Dockerfile` — Python video-processor 镜像
    - 创建 `nas-service/lobster-ai/Dockerfile` — Python lobster-ai 镜像
    - 所有镜像绑定 127.0.0.1
    - _需求: 21.2, 56.1_

  - [ ] 30.2 创建 docker-compose.yml 开发环境配置
    - 创建 `nas-service/docker-compose.yml`
    - 定义全部 18 个服务的开发环境配置
    - 配置卷挂载、网络、GPU 直通、环境变量
    - 配置服务依赖关系和启动顺序
    - _需求: 21.2, 56.1_

  - [ ] 30.3 集成联调：完整视频处理流水线端到端验证
    - 使用短测试视频验证完整 12 步流水线
    - 验证 file-watcher → task-scheduler → GPU 服务 → ready 目录 → content_registry 全链路
    - 验证 GPU 互斥锁在多步骤间正确获取/释放
    - _需求: 52_

  - [ ] 30.4 集成联调：Webhook 链路验证
    - 验证 qBittorrent webhook → task-scheduler → 文件移动 → 流水线触发
    - 验证 Sonarr/Radarr webhook → task-scheduler
    - _需求: 56.7, 56.8, 56.9_

- [ ] 31. 最终检查点 — 全面验证
  - 确保所有测试通过，如有疑问请询问用户。
  - 验证所有 64 条需求的覆盖情况
  - 验证所有 16 条正确性属性的测试覆盖

---

- [ ] 32. AI 自动标签与分级引擎
  - [ ] 32.1 实现 Content_Tagger 核心框架
    - 创建 `nas-service/src/scheduler/tagger/tagger.ts`
    - 实现统一标签接口 `tagContent(contentId, contentType, filePath)` → 返回标签 JSON
    - 实现标签置信度评估：每个标签附带 0-100 置信度分数
    - 置信度 < 50% 的标签标记为"待人工审核"
    - 将标签结果写入 `content_registry.metadata` JSON 字段
    - _需求: 59.5, 59.6, 60.5, 60.6, 61.5, 61.6, 62.5_

  - [ ] 32.2 实现视频 AI 自动标签
    - 创建 `nas-service/src/scheduler/tagger/video-tagger.ts`
    - 画面分析：用 ffmpeg 提取 5 张均匀分布截图，发送给 ollama 视觉模型分析场景/人物/风格
    - 音频分析：从 Whisper 字幕结果检测语言 → 推断地区
    - 文件名分析：正则匹配关键词（番号、地区代码、分辨率等）
    - LLM 综合分析：将截图+字幕摘要+文件名发送给 ollama，输出结构化标签 JSON
    - 输出标签维度：地区、视频类型、画质、语言
    - NC-17 级额外输出：题材标签、演员特征、时长分类
    - _需求: 59.1, 59.2, 59.3, 59.4_

  - [ ] 32.3 实现漫画 AI 自动标签
    - 创建 `nas-service/src/scheduler/tagger/comic-tagger.ts`
    - 封面分析：发送封面图给 ollama 视觉模型识别画风和角色特征
    - OCR 语言检测：从 OCR 结果判断原始语言
    - 内页分析：对前 5 页调用 LLM 视觉分析识别题材
    - 输出标签维度：画风、语言、类型、页数分类
    - NC-17 级额外输出：成人题材标签
    - _需求: 60.1, 60.2, 60.3, 60.4_

  - [ ] 32.4 实现小说 AI 自动标签
    - 创建 `nas-service/src/scheduler/tagger/novel-tagger.ts`
    - 文本分析：将前 3000 字发送给 ollama LLM 分析题材和风格
    - 语言检测：从字符分布判断语言
    - 输出标签维度：类型、语言、字数分类、状态
    - NC-17 级额外输出：成人题材标签
    - _需求: 61.1, 61.2, 61.3, 61.4_

  - [ ] 32.5 实现音频 AI 自动标签
    - 创建 `nas-service/src/scheduler/tagger/audio-tagger.ts`
    - ID3 标签提取：从文件元数据读取标题/艺术家/专辑/流派
    - Whisper 语言检测：识别音频中的语言
    - 输出标签维度：类型、语言
    - NC-17 级额外输出：成人音频类型、声优性别
    - _需求: 62.1, 62.2, 62.3, 62.4_

  - [ ] 32.6 实现性工作者照片 AI 自动标签
    - 创建 `nas-service/src/scheduler/tagger/provider-tagger.ts`
    - 照片分析：调用 ollama 视觉模型分析人种/体型/年龄段/胸部特征/发色
    - 文本分析：将服务者自由文本描述发送给 LLM，映射到结构化服务类型分类
    - 高优先级任务：5 分钟内完成
    - 支持服务者本人和管理员修正标签
    - _需求: 63.1, 63.2, 63.3, 63.4, 63.5, 63.6_

  - [ ] 32.7 实现 MPAA 分级 AI 自动判定
    - 创建 `nas-service/src/scheduler/tagger/rating-judge.ts`
    - 视频分级：画面裸露/暴力检测 + 音频脏话检测 + LLM 综合判定
    - 漫画分级：画面裸露/色情/暴力检测
    - 小说分级：色情描写/暴力描写/脏话频率检测 + 关键词密度
    - 成人源强制 NC-17，不执行 AI 判定
    - AI 判定与来源预设取更严格的分级
    - 不一致时标记"分级待人工审核"
    - _需求: 64.1, 64.2, 64.3, 64.4, 64.5, 64.6, 64.7_

  - [ ] 32.8 实现标签管理 API
    - 在 task-scheduler 中添加路由：
    - `GET /api/tagger/stats` — 标签统计
    - `GET /api/tagger/review` — 待人工审核列表
    - `PUT /api/tagger/:contentId/tags` — 手动修正标签
    - `PUT /api/tagger/:contentId/rating` — 手动修正分级
    - `POST /api/tagger/:contentId/retag` — 重新触发 AI 标签
    - `POST /api/tagger/batch-retag` — 批量重新标签
    - _需求: 59.7, 63.5_

  - [ ] 32.9 将标签步骤集成到 4 条处理流水线
    - 视频流水线：在 S2（去重）之后、S3（合集检测）之前插入标签步骤
    - 漫画流水线：在 S2（去重）之后、S3（OCR）之前插入标签步骤
    - 小说流水线：在 S2（去重）之后、S3（翻译）之前插入标签步骤
    - 音频流水线：在 S2（去重）之后、S3（格式标准化）之前插入标签步骤
    - 标签步骤需要 GPU 锁（ollama）用于 LLM 分析
    - _需求: 59.1, 60.1, 61.1, 62.1, 64.1_

- [ ] 33. AI 标签管理后台前端
  - [ ] 33.1 实现标签管理仪表盘页面
    - 创建 `src/app/admin/tagger/page.tsx`
    - 展示标签统计：各类型已标签/待审核/待处理数量
    - 待人工审核列表：展示 AI 标签结果和置信度，支持确认/修正/驳回
    - 支持按内容类型/分级/来源筛选
    - 支持批量重新标签操作
    - 深色主题，SVG 图标（Lucide React），默认中文
    - _需求: 59.6, 59.7, 64.6_

  - [ ] 33.2 实现标签 API 代理
    - 创建 `functions/api/nas/tagger.ts`
    - 代理前端请求到 NAS task-scheduler 的标签管理 API
    - _需求: 59, 60, 61, 62, 63, 64_

- [ ] 34. 最终检查点 — 全面验证（含标签引擎）
  - 确保所有测试通过
  - 验证所有 79 条需求的覆盖情况
  - 验证 AI 标签在所有 4 条流水线中正确执行

---

- [ ] 35. NAS 自主 AI 代理（智能体）
  - [ ] 35.1 实现 AI 代理核心决策循环
    - 创建 `nas-service/src/agent/agent.ts`
    - 实现 30 分钟一轮的自主决策循环
    - 每轮收集：用户行为数据（搜索热词/播放量/收藏趋势）、本地内容库状态、AI 队列状态、系统资源状态、外部源更新
    - 将收集的数据组装为结构化 JSON，发送给 ollama LLM 进行决策推理
    - LLM 输出决策动作列表 JSON：`[{action: "download", params: {...}}, {action: "reprioritize", params: {...}}]`
    - 低风险决策自动执行，高风险决策（删除/配置变更）等待管理员确认
    - 所有决策记录到 `pipeline.db` 的 `agent_decisions` 表
    - _需求: 74.1, 74.2, 74.3, 74.4, 74.5, 74.6_

  - [ ] 35.2 实现 AI 代理自动内容发现
    - 创建 `nas-service/src/agent/content-discovery.ts`
    - 每小时分析"未满足搜索"（搜索了但 0 结果的关键词），自动从外部源查找并下载
    - 分析追番/追剧列表，新集发布 1 小时内自动下载
    - 分析各平台热门排行榜，预缓存 Top 50
    - 学习用户偏好模式，自动调整刮削频率
    - 带宽低谷期（凌晨）集中执行大批量下载
    - _需求: 75.1, 75.2, 75.3, 75.4, 75.5, 75.6, 75.7_

  - [ ] 35.3 实现 AI 代理自愈系统
    - 创建 `nas-service/src/agent/self-healing.ts`
    - 每 5 分钟健康巡检：容器状态、GPU 响应、磁盘空间、Tunnel 连接、Redis 连接、DB 完整性
    - 异常自动修复：重启容器、重启 GPU 服务、清理磁盘、重连 Tunnel
    - 同一异常连续 3 次升级告警（Telegram Bot 通知）
    - 管理后台健康状态仪表盘（绿/黄/红）
    - _需求: 76.1, 76.2, 76.3, 76.4, 76.5_

  - [ ] 35.4 实现 AI 代理智能存储管理
    - 创建 `nas-service/src/agent/storage-manager.ts`
    - 维护内容"价值评分"（访问时间/次数/收藏数/分级/大小）
    - 磁盘 > 85% 时自动分级清理（duplicates → processing → 低价值内容）
    - 高访问量内容自动迁移到 SSD 缓存
    - 每周生成存储分析报告
    - _需求: 77.1, 77.2, 77.3, 77.4, 77.5_

  - [ ] 35.5 实现 AI 代理管理后台页面
    - 创建 `src/app/admin/agent/page.tsx`
    - 展示 AI 代理决策日志、当前状态、下一轮决策预告
    - 展示系统健康仪表盘
    - 高风险决策确认/驳回界面
    - 存储分析报告展示
    - 深色主题，SVG 图标
    - _需求: 74.7, 76.4_

  - [ ] 35.6 实现 AI 代理 API 代理层
    - 创建 `functions/api/nas/agent.ts`
    - 代理前端请求到 NAS agent API
    - _需求: 74, 75, 76, 77_

- [ ] 36. 私有网盘功能
  - [ ] 36.1 实现私有网盘后端 API
    - 在 `nas-service/src/media-server/cloud.ts` 中实现：
    - 文件上传（支持分片上传，大文件断点续传）
    - 文件下载（支持 Range 请求）
    - 文件删除、重命名、移动、创建文件夹
    - 文件列表（支持排序、搜索）
    - 文件分享（生成分享链接，密码保护，过期时间）
    - 文件版本历史（保留最近 5 个版本）
    - 每用户独立存储空间（默认 10GB）
    - AES-256 加密存储
    - WebDAV 协议支持
    - _需求: 78.1, 78.2, 78.3, 78.4, 78.5, 78.6, 78.7_

  - [ ] 36.2 实现私有网盘前端页面
    - 创建 `src/app/cloud/page.tsx` "我的网盘"页面
    - 文件树导航 + 文件列表（列表/网格视图）
    - 拖拽上传 + 上传进度条
    - 右键菜单（下载/重命名/移动/删除/分享/详情）
    - 文件搜索
    - 存储空间使用进度条
    - 在线预览（图片/视频/音频/PDF/文本）
    - 深色主题，SVG 图标
    - _需求: 79.1, 79.2, 79.3, 79.4, 79.5, 79.6, 79.7, 79.8_

  - [ ] 36.3 实现网盘内容入库联动
    - 用户上传视频/音乐/漫画/小说到网盘时，询问是否加入平台公共库
    - 用户确认后自动触发 AI 处理流水线
    - 需管理员审核后才正式上架
    - _需求: 78.8_

  - [ ] 36.4 实现网盘 API 代理层
    - 创建 `functions/api/nas/cloud.ts`
    - 代理前端请求到 NAS 网盘 API（通过 Tunnel）
    - _需求: 78, 79_

- [ ] 37. Unraid 7.2.4 完整自动部署脚本
  - [ ] 37.1 实现系统初始化脚本
    - 创建 `nas-service/deploy/01-system-init.sh`
    - 检测 Unraid 7.2.4 版本
    - 安装插件：Community Applications、Nvidia Driver（ich777）、User Scripts、Dynamix File Manager、Unassigned Devices
    - 等待每个插件安装完成
    - 配置 Docker 引擎（存储路径、自动启动）
    - _需求: 65.1, 65.2, 65.3, 65.4, 65.5, 65.6_

  - [ ] 37.2 实现 Docker 镜像加速与断点续传脚本
    - 创建 `nas-service/deploy/02-docker-mirrors.sh`
    - 写入 `/boot/config/docker/daemon.json`（持久化）
    - 配置镜像源：xuanyuan.cloud、docker.aityp.com、1ms.run、DaoCloud
    - 重启 Docker 服务
    - 实现拉取重试（5 次）+ skopeo 回退
    - 安装 skopeo 静态编译版本
    - _需求: 66.1, 66.2, 66.3, 66.4, 66.5, 66.6, 66.7_

  - [ ] 37.3 实现 GPU 驱动与直通配置脚本
    - 创建 `nas-service/deploy/03-gpu-setup.sh`
    - 检测 NVIDIA GPU
    - 通过 Nvidia Driver 插件安装驱动
    - 配置 Docker NVIDIA runtime
    - 配置 GPU 持久化模式
    - 验证 GPU 直通（测试容器 nvidia-smi）
    - 未检测到 GPU 时降级为 CPU 模式
    - _需求: 67.1, 67.2, 67.3, 67.4, 67.5, 67.6, 67.7, 67.8_

  - [ ] 37.4 实现阵列与目录结构配置脚本
    - 创建 `nas-service/deploy/04-storage-setup.sh`
    - 检查阵列状态
    - 创建共享文件夹（media/appdata/downloads）
    - 创建完整目录结构（需求 57）
    - 设置权限
    - 初始化 pipeline.db
    - _需求: 68.1, 68.2, 68.3, 68.4, 68.5, 68.6_

  - [ ] 37.5 实现网络安全配置脚本
    - 创建 `nas-service/deploy/05-security.sh`
    - 配置 iptables 防火墙（INPUT DROP + 局域网白名单）
    - 写入 `/boot/config/go` 持久化
    - 配置 DNS-over-HTTPS（cloudflared proxy-dns）
    - 配置 MAC 地址随机化
    - 禁用 UPnP/DLNA
    - _需求: 69.1, 69.2, 69.3, 69.4, 69.5_

  - [ ] 37.6 实现 Cloudflare Tunnel 配置脚本
    - 创建 `nas-service/deploy/06-tunnel.sh`
    - 交互式引导输入 Tunnel Token
    - 安全存储到 `/boot/config/starhub/`
    - 部署 cloudflared 容器
    - 验证连接成功
    - 配置 ingress 规则
    - _需求: 70.1, 70.2, 70.3, 70.4, 70.5, 70.6_

  - [ ] 37.7 实现 AI 模型自动下载脚本
    - 创建 `nas-service/deploy/07-ai-models.sh`
    - 下载 Whisper large-v3、XTTS-v2、SD 1.5、漫画上色 LoRA、NSFW LoRA、Ollama LLM
    - 多下载源回退（HuggingFace 镜像站/国内镜像/直链）
    - 下载进度显示
    - 预热测试（每个模型执行一次推理验证）
    - _需求: 71.1, 71.2, 71.3, 71.4, 71.5_

  - [ ] 37.8 实现开机自启与监控配置脚本
    - 创建 `nas-service/deploy/08-autostart.sh`
    - 所有容器 `--restart=unless-stopped`
    - `/boot/config/go` 开机脚本（防火墙/DNS/MAC/daemon.json）
    - User Script 定时任务（健康检查/Docker 清理/DB 备份）
    - Docker 日志轮转配置
    - Unraid 通知系统告警配置
    - _需求: 72.1, 72.2, 72.3, 72.4, 72.5_

  - [ ] 37.9 实现部署后验证与报告脚本
    - 创建 `nas-service/deploy/09-verify.sh`
    - 彩色终端报告（系统信息/插件/容器/网络/Tunnel/AI 模型/GPU/磁盘）
    - 保存报告到 `/boot/config/starhub/deploy-report-{timestamp}.txt`
    - 列出"接下来的步骤"
    - 失败项红色标注 + 修复建议
    - _需求: 73.1, 73.2, 73.3, 73.4_

  - [ ] 37.10 实现一键部署主入口脚本
    - 创建 `nas-service/deploy/deploy.sh`
    - 按顺序调用 01-09 所有子脚本
    - 支持 `--skip-gpu`、`--skip-models`、`--skip-security` 参数跳过特定步骤
    - 支持 `--resume` 从上次失败的步骤继续
    - 全程日志记录到 `/boot/config/starhub/deploy.log`
    - _需求: 65.1, 21.1_

- [ ] 38. 最终检查点 — 全面验证
  - 确保所有测试通过
  - 验证所有 79 条需求的覆盖情况
  - 验证部署脚本在干净 Unraid 7.2.4 上端到端执行成功

## 备注

- 标记 `*` 的子任务为可选任务，可跳过以加速 MVP 开发
- 每个任务引用了具体的需求编号，确保可追溯性
- 检查点任务确保增量验证
- 属性测试使用 `fast-check` 库（Node.js），验证 16 条正确性属性
- 单元测试验证具体示例和边界条件
- 所有 NAS 端代码在 `nas-service/` 目录
- 前端管理后台在 `src/`，后端 API 代理在 `functions/api/`
- 深色主题、SVG 图标、默认中文（遵循项目宪法）
