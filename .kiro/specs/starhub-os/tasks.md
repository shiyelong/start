# 实施计划：星聚OS（StarHub OS）自主 AI 服务器操作系统

## 概述

基于 Debian 13 "Trixie" 的自主 AI 服务器操作系统，最大化复用开源项目，自研仅写胶水代码（~13600 行）。
按 6 个阶段递进实施：基础设施 → 核心调度 → AI 处理 → 内容获取 → AI 代理 → Web 桌面。
一人开发，速度优先，先跑起来再优化。

**技术栈：** Node.js/TypeScript（调度/媒体服务/文件监控）、Python（视频处理/AI代理）、Bash（部署脚本）、React/TypeScript（Puter 应用）

---

## 阶段一：基础设施与部署脚本（deploy.sh ~1500 行 Bash）

- [x] 1. 编写 Debian 13 一键部署脚本 deploy.sh
  - [x] 1.1 系统检测与 apt 源配置
    - 检测 Debian 13 版本（`cat /etc/debian_version`）
    - 检测硬件：CPU >= 4核、RAM >= 32GB、NVIDIA GPU
    - 配置 apt 国内镜像源（清华/中科大/阿里云）
    - **开源复用：** 无需克隆，直接 apt 配置
    - **自研代码：** ~100 行 Bash（检测+配置逻辑）
    - _需求: 80.1, 80.2, 80.4, 81.2_

  - [x] 1.2 安装基础软件包
    - `apt install` 基础工具、Python3、Docker CE、NVIDIA 驱动、mergerfs、snapraid、borgbackup、cloudflared 等
    - 通过 NodeSource 仓库安装 Node.js 20 LTS
    - **开源复用：** 全部 apt 安装，零自研
    - **自研代码：** ~80 行 Bash（安装脚本）
    - _需求: 80.3_

  - [x] 1.3 配置 Docker 镜像加速与 NVIDIA runtime
    - 写入 `/etc/docker/daemon.json`：镜像加速源 + NVIDIA runtime + 日志轮转
    - 实现 `pull_image()` 函数：镜像源轮询 + skopeo 回退
    - 安装 skopeo 静态编译版本
    - **自研代码：** ~120 行 Bash（pull_image 函数 + 配置）
    - _需求: 20.1, 20.2, 20.3, 66.1, 66.4, 67.4, 22.2_

  - [x] 1.4 配置存储系统 mergerfs + snapraid
    - 配置 mergerfs 合并数据盘到 `/mnt/storage/`，策略 `mfs`
    - 配置 snapraid 校验盘 + 每日 sync 定时任务
    - 配置 smartmontools 硬盘健康监控
    - 配置 HDD 休眠策略（`hdparm -S 120`）
    - **开源复用：** mergerfs + snapraid 直接用
    - **自研代码：** ~100 行 Bash（配置生成）
    - _需求: 82.1, 82.2, 82.3, 82.4, 82.5, 82.6, 82.7_

  - [x] 1.5 创建标准目录结构与初始化 pipeline.db
    - 创建 `/mnt/storage/media/` 下所有子目录（videos/comics/novels/music 各含 incoming/processing/ready/duplicates/failed）
    - 创建 `/mnt/storage/starhub/` 配置目录
    - 创建 `/mnt/storage/ai_models/` 模型目录
    - 初始化 SQLite `pipeline.db`（执行 24 张表的 CREATE TABLE）
    - **自研代码：** ~150 行 Bash + ~200 行 SQL schema
    - _需求: 57.1, 57.2, 57.3, 68.2, 68.3, 68.4, 68.6_

  - [x] 1.6 配置网络安全（防火墙 + DNS-over-HTTPS + MAC 随机化）
    - iptables 规则：INPUT DROP + 允许已建立连接 + 允许局域网 SSH/HTTP
    - cloudflared proxy-dns 配置 DNS-over-HTTPS
    - MAC 地址随机化脚本
    - 禁用 UPnP/DLNA
    - 所有 Docker 容器绑定 127.0.0.1
    - **自研代码：** ~120 行 Bash
    - _需求: 23.1, 23.2, 23.3, 23.7, 69.1, 69.3, 69.4, 69.5_

  - [x] 1.7 配置 Cloudflare Tunnel
    - 交互式引导用户输入 Tunnel Token
    - 部署 cloudflared Docker 容器
    - 配置 ingress 规则映射 nas-media-server + task-scheduler
    - 验证 Tunnel 连接成功
    - **开源复用：** cloudflared 官方镜像
    - **自研代码：** ~80 行 Bash
    - _需求: 70.1, 70.2, 70.3, 70.4, 70.5, 70.6_

  - [x] 1.8 拉取并部署 22 个 Docker 容器
    - 使用 `pull_image()` 拉取所有镜像（含镜像加速回退）
    - 部署入口层：cloudflared、nas-media-server
    - 部署 Web 桌面层：puter、dockge
    - 部署调度层：task-scheduler、redis、file-watcher、nas-agent
    - 部署 AI 处理层：whisper-api、xtts-api、sd-api、manga-translator、ollama、tdarr
    - 部署辅助处理层：video-processor
    - 部署下载层：qbittorrent、sonarr、radarr、prowlarr、bazarr
    - 幂等性：已存在的容器跳过
    - **自研代码：** ~250 行 Bash（容器部署逻辑）
    - _需求: 21.1, 21.2, 21.5, 21.6, 56.1_

  - [x] 1.9 配置 Sonarr/Radarr/Prowlarr webhook 集成
    - 配置 Prowlarr 索引器
    - 配置 Sonarr/Radarr 连接 Prowlarr + qBittorrent
    - 配置 Bazarr 连接 Sonarr/Radarr
    - 配置 Tdarr H.265 转码规则
    - 配置 webhook 回调到 task-scheduler
    - **开源复用：** Sonarr/Radarr/Prowlarr/Bazarr/Tdarr 全部直接用
    - **自研代码：** ~80 行 Bash（API 配置调用）
    - _需求: 24.1, 24.2, 24.3, 24.4, 24.5_

  - [x] 1.10 下载 AI 模型并预热测试
    - 下载 Whisper large-v3、XTTS-v2、SD 1.5 + LoRA、Ollama LLM 模型
    - 支持 HuggingFace 镜像站 / 国内镜像
    - 预热测试：Whisper 5秒音频、SD 512x512 图片、Ollama 文本生成、XTTS 3秒语音
    - **自研代码：** ~100 行 Bash
    - _需求: 71.1, 71.2, 71.3_

  - [x] 1.11 配置 systemd 服务与定时器
    - 创建 starhub-docker.service、starhub-firewall.service、starhub-dns.service
    - 创建 starhub-backup.timer（每日03:00）、starhub-snapraid.timer（每日02:00）
    - 创建 starhub-health.timer（每5分钟）、starhub-cleanup.timer（每周）
    - 配置 systemd-journald 日志限制 500M
    - **自研代码：** ~120 行 Bash + systemd unit 文件
    - _需求: 86.1, 86.2, 86.3, 86.4, 86.5, 72.1, 72.3, 72.4_

  - [x] 1.12 初始化 BorgBackup 加密备份仓库
    - `borg init --encryption=repokey` 初始化仓库
    - 配置每日备份内容：pipeline.db、Docker 配置、存储配置、防火墙规则、Tunnel 凭证
    - 配置保留策略：7天日备 + 4周周备 + 6月月备
    - 生成 restore.sh 恢复脚本
    - **开源复用：** BorgBackup 直接用
    - **自研代码：** ~80 行 Bash
    - _需求: 83.1, 83.2, 83.3, 83.4, 83.5, 83.6, 83.7_

  - [x] 1.13 部署后验证与状态报告
    - 全服务健康检查（所有容器运行状态、GPU nvidia-smi、Tunnel 连接、pipeline.db 完整性）
    - 输出彩色终端报告 + 保存到文件
    - 列出"接下来的步骤"
    - **自研代码：** ~120 行 Bash
    - _需求: 73.1, 73.2, 73.3, 73.4, 21.3, 21.4_

- [x] 2. 检查点 — 部署脚本完成
  - 在测试环境运行 deploy.sh，确认所有容器启动、GPU 可用、Tunnel 连通
  - 确认 pipeline.db 24 张表创建成功
  - 确认 mergerfs + snapraid 配置正确
  - 如有问题请向用户确认


---

## 阶段二：核心调度引擎 task-scheduler（Node.js/TS ~3000 行）

- [x] 3. 搭建 task-scheduler 项目骨架
  - [x] 3.1 初始化 Node.js/TypeScript 项目
    - 创建 `/mnt/storage/starhub/services/task-scheduler/`
    - `npm init` + TypeScript 配置 + ESLint
    - 安装核心依赖：`bullmq`, `ioredis`, `better-sqlite3`, `express`, `node-cron`
    - 安装测试依赖：`vitest`, `fast-check`, `supertest`
    - 创建 Dockerfile（Node.js 20 Alpine）
    - **自研代码：** ~100 行（项目配置）
    - _需求: 7.1, 31.1_

  - [x] 3.2 实现 SQLite 数据访问层
    - 封装 `better-sqlite3` 连接 `/mnt/storage/starhub/pipeline.db`
    - 实现 tasks/task_steps/gpu_lock/content_registry 表的 CRUD 操作
    - 实现事务支持和连接池
    - **自研代码：** ~200 行
    - _需求: 32.2, 58.1_

  - [x] 3.3 实现 GPU 互斥锁调度器
    - 基于 SQLite `gpu_lock` 单行表实现互斥锁
    - 锁获取：检查 → 写入 locked_by/service/locked_at/expires_at
    - 锁释放：清空 locked_by
    - 超时保护：各服务不同超时（Whisper 60min、XTTS 120min、SD 180min 等）
    - 优先级队列：紧急(0-10) > 高(11-50) > 中(51-100) > 低(101-200) > 后台(201-999)
    - **自研代码：** ~250 行
    - _需求: 7.4, 56.3, 56.4_

  - [x] 3.4 GPU 互斥锁属性测试
    - **Property 7: GPU 互斥锁不变性** — 任意时刻最多一个任务持有锁
    - **验证: 需求 7.4, 56.3**

  - [x] 3.5 实现 BullMQ 任务队列核心
    - 创建 4 条流水线队列：video_pipeline、comic_pipeline、novel_pipeline、audio_pipeline
    - 实现任务创建、状态更新、优先级调整、取消、重试
    - 实现步骤级状态持久化（每步完成写入 task_steps 表）
    - 实现崩溃恢复：启动时恢复 processing 状态任务
    - **自研代码：** ~400 行
    - _需求: 7.1, 7.2, 31.1, 31.2, 31.7, 58.1, 58.6_

  - [x] 3.6 流水线步骤顺序属性测试
    - **Property 5: 流水线步骤顺序不变性** — task_steps 严格按定义顺序排列
    - **验证: 需求 7.1, 10.1, 15.1, 52, 53, 54, 55**

  - [x] 3.7 步骤失败降级属性测试
    - **Property 6: 步骤失败降级继续** — 前置步骤失败不终止整个流水线
    - **验证: 需求 7.3, 58.3**

  - [x] 3.8 实现重试退避机制
    - 指数退避：1分钟 → 5分钟 → 30分钟
    - 3 次均失败 → 跳过该步骤，继续后续步骤
    - 支持管理员手动重试任意步骤
    - **自研代码：** ~80 行
    - _需求: 58.2, 58.3, 58.5_

  - [x] 3.9 重试退避时间属性测试
    - **Property 16: 重试退避时间计算** — 第0次=60s, 第1次=300s, 第2次=1800s, n>=3放弃
    - **验证: 需求 58.2**

  - [x] 3.10 崩溃恢复断点续传属性测试
    - **Property 15: 崩溃恢复断点续传** — 从最后完成步骤的下一步继续
    - **验证: 需求 58.1, 58.6**

  - [x] 3.11 实现 Express REST API
    - 任务管理：POST/GET/PUT/DELETE /api/tasks
    - GPU 状态：GET /api/gpu/status, /api/gpu/lock
    - 队列统计：GET /api/queue/stats
    - 系统健康：GET /api/system/health
    - Webhook 接收：POST /webhook/download-complete, /webhook/import-complete, /webhook/file-detected
    - Telegram 频道管理：CRUD /api/telegram/channels
    - 带宽调度：GET/PUT /api/bandwidth/*
    - 去重管理：GET /api/dedup/stats, POST /api/dedup/full-scan
    - AI 标签管理：GET/PUT /api/tagger/*
    - 刮削源管理：GET/PUT/POST /api/scrapers/*
    - **自研代码：** ~600 行
    - _需求: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6, 28.1, 28.2, 28.3, 28.4, 28.5_

  - [x] 3.12 实现带宽调度器
    - 按时段配置下载带宽限制（默认夜间高/白天低）
    - 时段切换时调用 qBittorrent API 调整速度限制
    - 每日带宽上限监控，超 90% 暂停下载
    - **自研代码：** ~150 行
    - _需求: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6_

  - [x] 3.13 带宽调度属性测试
    - **Property 12: 带宽调度规则时段匹配** — 正确选择覆盖当前时刻的规则
    - **Property 13: 带宽超限暂停决策** — 超90%暂停，低于90%继续
    - **验证: 需求 30.1, 30.3, 30.6**

  - [x] 3.14 实现 Telegram 频道抓取器
    - 集成 Telegram Bot API / MTProto
    - 定时从已启用频道获取新消息
    - 下载视频/图片/文档到 `/mnt/storage/media/telegram/{channel_id}/`
    - 自动分类并移动到对应 incoming 目录
    - **自研代码：** ~300 行
    - _需求: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 44.1, 44.2, 44.3_

  - [x] 3.15 实现 AI 自动标签与分级引擎（Content Tagger）
    - 提取特征：视频截图/漫画封面/小说前3000字/音频ID3
    - 调用 ollama LLM 输出结构化标签 JSON
    - 写入 content_registry.metadata
    - 置信度 < 50% 标记"待人工审核"
    - MPAA 分级判定：AI判定 vs 来源预设取更严格值
    - **自研代码：** ~350 行
    - _需求: 59.1, 59.2, 59.3, 59.5, 59.6, 59.7, 60.1, 60.5, 61.1, 61.5, 62.1, 62.5, 64.1, 64.5, 64.6, 64.7_

  - [x] 3.16 MPAA 分级取严格值属性测试
    - **Property 17: MPAA 分级取严格值** — 两个分级合并取更严格的
    - **验证: 需求 64.5**

  - [x] 3.17 内容分类与分级继承属性测试
    - **Property 11: 内容分类与分级继承** — 文件归入正确类别并继承频道分级
    - **验证: 需求 27.1, 27.2**

  - [x] 3.18 任务依赖触发属性测试
    - **Property 14: 任务依赖触发正确性** — 仅触发所有前置依赖已完成的后续任务
    - **验证: 需求 31.7**

- [x] 4. 检查点 — task-scheduler 核心完成
  - 确认所有 API 端点可访问
  - 确认 GPU 锁正确工作
  - 确认 BullMQ 队列创建/消费正常
  - 确认 webhook 接收正常
  - 如有问题请向用户确认

---

## 阶段三：文件监控 + 媒体服务 + 视频处理（Node.js ~1100 行 + Python ~2000 行）

- [x] 5. 实现 file-watcher 文件监控服务（Node.js/TS ~300 行）
  - [x] 5.1 创建 file-watcher 项目
    - 使用 chokidar 监控 4 个 incoming 目录
    - 文件写入完成检测（文件大小 5 秒内无变化）
    - 检测到新文件后 POST 到 task-scheduler webhook
    - 支持压缩包自动解压（zip/rar/7z）
    - 创建 Dockerfile
    - **开源复用：** chokidar 库
    - **自研代码：** ~300 行
    - _需求: 52.1, 52.2, 53.1, 54.1, 55.1, 56.5, 56.6_

- [ ] 6. 实现 nas-media-server 媒体服务（Node.js/TS ~800 行，复用已有代码）
  - [~] 6.1 扩展现有 nas-media-server
    - 复用 `functions/api/nas/` 已有代码
    - 实现 HTTP 文件服务：Range 请求（视频 seek）、ETag/Last-Modified 缓存头
    - 实现私有网盘 API：上传/下载/删除/重命名/移动/创建文件夹
    - 实现 WebDAV 协议支持
    - 实现 AES-256 加密存储/解密读取
    - 实现文件分享（生成 share_token + 密码 + 过期时间）
    - 实现文件版本历史（保留最近 5 个版本）
    - 创建 Dockerfile
    - **开源复用：** webdav-server 库
    - **自研代码：** ~800 行（含已有代码扩展）
    - _需求: 32.3, 32.4, 32.5, 32.6, 78.1, 78.2, 78.4, 78.5, 78.6, 78.7_

  - [~] 6.2 私有网盘加密往返属性测试
    - **Property 19: 私有网盘加密往返** — AES-256 加密后解密返回原始内容
    - **验证: 需求 78.6**

- [ ] 7. 实现 video-processor 视频处理引擎（Python ~2000 行）
  - [~] 7.1 搭建 Python 项目骨架
    - 创建 `/mnt/storage/starhub/services/video-processor/`
    - FastAPI 框架 + uvicorn
    - 安装依赖：ffmpeg-python, scenedetect, Pillow, imagehash, numpy
    - 安装测试依赖：pytest, hypothesis
    - 创建 Dockerfile（Python 3.12 + ffmpeg）
    - **自研代码：** ~50 行（项目配置）
    - _需求: 52_

  - [~] 7.2 实现感知哈希去重引擎
    - ffmpeg 提取关键帧（每 10 秒一帧）
    - 计算 pHash（64-bit）+ 场景指纹
    - 汉明距离比对（< 10 视为重复）
    - 版本选择：分辨率优先 → 文件大小优先
    - 支持视频/漫画/小说/音频统一去重 API
    - 漫画：封面 + 前5页 pHash，汉明距离 < 8
    - 小说：前1000字 SimHash，相似度 > 90%
    - 音频：Chromaprint 指纹，相似度 > 90%
    - **自研代码：** ~400 行
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 36.1, 36.2, 36.3, 36.4, 46.1, 46.2, 46.3, 47.1_

  - [~] 7.3 汉明距离去重属性测试
    - **Property 1: 汉明距离去重决策正确性** — 距离<10返回duplicate，>=10返回not_duplicate
    - **验证: 需求 1.2, 36.2**

  - [~] 7.4 质量优选版本属性测试
    - **Property 2: 质量优选版本保留** — 始终保留质量更高版本，具有反对称性
    - **验证: 需求 1.4, 36.3, 46.3**

  - [~] 7.5 实现广告检测与移除
    - 使用 PySceneDetect 分析场景切换点、黑屏帧、音频静音段
    - 识别片头/片尾/插播广告
    - ffmpeg 裁剪移除广告并重新拼接
    - 置信度 < 70% 标记"待人工审核"
    - **开源复用：** PySceneDetect
    - **自研代码：** ~250 行
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [~] 7.6 实现短剧合集检测与拆分
    - 分析时长 + 场景切换频率 + 标题关键词
    - 时长 > 60min + >= 3 个黑屏分隔 → 判定为合集
    - ffmpeg 按黑屏分隔点拆分
    - 为每集生成标题和封面截图
    - 置信度 < 60% 标记"待人工拆分"
    - **自研代码：** ~200 行
    - _需求: 34.1, 34.2, 34.3, 34.4, 34.5, 34.6, 34.7_

  - [~] 7.7 实现水印检测与移除（调用 SD API）
    - 对视频前 30 秒采样检测水印位置
    - 调用 SD API inpainting 移除水印
    - ffmpeg 将处理后帧序列重新编码
    - **自研代码：** ~200 行
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [~] 7.8 实现字幕生成（调用 Whisper API）
    - ffmpeg 提取音频流
    - POST 到 whisper-api 容器
    - 解析 JSON 结果转换为 SRT/ASS 格式
    - 支持多语言自动检测
    - **自研代码：** ~150 行
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [~] 7.9 实现字幕翻译（调用 ollama）
    - 读取原始字幕，调用 ollama LLM 翻译为中/日/英
    - 保持时间戳不变
    - 保留专有名词原文标注
    - 源语言已是目标语言则跳过
    - **自研代码：** ~150 行
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [~] 7.10 字幕翻译时间戳属性测试
    - **Property 3: 字幕翻译时间戳不变性** — 翻译后时间戳与原始完全一致
    - **验证: 需求 5.2**

  - [~] 7.11 翻译语言跳过属性测试
    - **Property 4: 翻译语言跳过逻辑** — 源语言在目标列表中时跳过
    - **验证: 需求 5.5**

  - [~] 7.12 实现多语言配音（调用 XTTS API）
    - 从原始视频提取说话人音色样本
    - 按字幕时间戳逐句调用 XTTS API
    - 拼接为完整配音音轨（中/日/英）
    - **自研代码：** ~200 行
    - _需求: 6.1, 6.2, 6.3, 6.6_

  - [~] 7.13 实现多轨封装（ffmpeg MKV）
    - 封装视频轨 + 4 音轨（原始+中+日+英）+ 4 字幕轨
    - 输出到 ready/{content_id}.mkv
    - 元数据注册到 pipeline.db content_registry 表
    - 清理 processing/ 临时目录
    - **自研代码：** ~100 行
    - _需求: 6.4, 32.1, 32.2, 52.29, 52.30, 52.31, 52.35, 52.36_

  - [~] 7.14 实现漫画处理流水线 API
    - OCR：调用 manga-translator 容器 /ocr
    - 翻译：调用 ollama LLM
    - 文字渲染：调用 manga-translator /render
    - 上色：调用 SD API img2img（黑白漫画）
    - 版本打包：original/translated/colorized
    - **自研代码：** ~250 行
    - _需求: 8.1, 8.2, 8.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1, 10.2, 53.8, 53.13, 53.16, 53.19_

  - [~] 7.15 实现小说处理流水线 API
    - 文本预处理：章节分割、语言检测、字数统计
    - 翻译（非中文）
    - 视觉小说脚本生成（调用 ollama LLM）
    - 角色立绘生成（调用 SD API txt2img，固定 seed）
    - 背景 CG 生成
    - 角色配音生成（调用 XTTS API）
    - 资源打包为 vn_package.json
    - **自研代码：** ~350 行
    - _需求: 11.1, 11.2, 11.3, 11.4, 12.1, 12.2, 12.3, 12.4, 13.1, 13.2, 13.3, 13.4, 54.9, 54.13, 54.16, 54.19_

  - [~] 7.16 实现音频处理流水线 API
    - ffprobe 元数据提取 + ID3 标签
    - Chromaprint 音频指纹去重
    - 格式标准化：FLAC 高品质 + AAC 256kbps 流媒体
    - **自研代码：** ~100 行
    - _需求: 55.2, 55.4, 55.7, 55.11_

  - [~] 7.17 实现 FastAPI HTTP 接口
    - POST /process/video — 视频完整流水线
    - POST /process/comic — 漫画完整流水线
    - POST /process/novel — 小说完整流水线
    - POST /process/audio — 音频完整流水线
    - POST /process/dedup — 统一去重
    - GET /health — 健康检查
    - **自研代码：** ~100 行
    - _需求: 56.2_

- [ ] 8. 检查点 — 核心处理引擎完成
  - 确认 file-watcher 检测到新文件能触发 task-scheduler
  - 确认 video-processor 各 API 端点可调用
  - 确认 nas-media-server 文件服务 + Range 请求正常
  - 确认 GPU 锁在处理链中正确获取/释放
  - 如有问题请向用户确认

---

## 阶段四：内容获取与自动刮削（集成在 task-scheduler 中）

- [ ] 9. 实现自动刮削与下载系统
  - [~] 9.1 实现刮削源适配器框架
    - 定义统一的 ScraperAdapter 接口（fetchLatest/fetchByTag/download）
    - 实现适配器注册机制
    - 实现刮削调度（node-cron 定时触发，每个源独立间隔）
    - 下载前执行去重检查（调用 video-processor /process/dedup）
    - **自研代码：** ~200 行
    - _需求: 29.1, 29.2, 39.2, 39.3_

  - [~] 9.2 实现成人视频源适配器
    - 支持 Pornhub/XVideos/XNXX/JavBus/Missav 等源
    - 热门/最新/分类排行刮削
    - 自动标记 NC-17 级
    - 按标签/分类配置刮削规则
    - **自研代码：** ~200 行
    - _需求: 39.1, 39.4, 39.5, 33.2_

  - [~] 9.3 实现免费影视聚合源适配器
    - 支持低端影视/茶杯狐/电影天堂等源
    - 根据用户搜索热度决定缓存优先级
    - 每日最大缓存量限制（默认 50GB/天）
    - **自研代码：** ~150 行
    - _需求: 40.1, 40.2, 40.3, 40.4_

  - [~] 9.4 实现动漫源适配器
    - 支持樱花动漫/AGE动漫/GoGoAnime/动漫花园等源
    - 用户追番列表自动下载新集
    - 成人动漫自动标记 NC-17
    - **自研代码：** ~150 行
    - _需求: 48.1, 48.2, 48.3, 48.4, 48.5_

  - [~] 9.5 实现漫画源适配器
    - 支持漫画柜/动漫之家/MangaDex/nhentai/E-Hentai 等源
    - 追更：连载漫画新章节自动下载
    - 成人漫画源强制 NC-17
    - **自研代码：** ~150 行
    - _需求: 51.1, 51.2, 51.3, 51.4, 51.5, 41.1, 41.2, 41.3, 41.4_

  - [~] 9.6 实现小说源适配器
    - 支持笔趣阁/69书吧/Novel Updates 等源
    - 追更：连载小说新章节自动下载
    - 成人小说源自动标记 NC-17
    - **自研代码：** ~120 行
    - _需求: 50.1, 50.2, 50.3, 50.4, 42.1, 42.2, 42.3, 42.4_

  - [~] 9.7 实现音频/ASMR 源适配器
    - 支持 DLsite/ASMR.one 等源
    - 自动提取元数据（标题/声优/标签/时长）
    - 成人音频自动标记 NC-17
    - **自研代码：** ~100 行
    - _需求: 43.1, 43.2, 43.3, 43.4_

  - [~] 9.8 实现主流视频平台缓存适配器
    - 支持 B站/YouTube（代理）/抖音/快手/西瓜视频
    - 仅缓存播放超过 N 次的内容
    - **自研代码：** ~120 行
    - _需求: 49.1, 49.2, 49.3, 49.4_

  - [~] 9.9 实现 Sonarr/Radarr webhook 处理
    - 接收 qBittorrent 下载完成 webhook
    - 接收 Sonarr/Radarr 导入完成 webhook
    - 自动将文件移动到对应 incoming 目录
    - 触发 AI 处理流水线
    - **自研代码：** ~100 行
    - _需求: 29.1, 29.2, 56.7, 56.8, 56.9_

  - [~] 9.10 实现内容自动分类器
    - 根据文件类型和来源频道自动分类
    - 继承频道预设 MPAA 分级
    - 无法分类的标记"待人工分类"
    - **自研代码：** ~80 行
    - _需求: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6_

- [ ] 10. 检查点 — 内容获取系统完成
  - 确认各刮削源适配器能正常抓取内容列表
  - 确认下载完成后自动触发 AI 处理流水线
  - 确认 Telegram 抓取正常工作
  - 确认去重检查在下载前执行
  - 如有问题请向用户确认

---

## 阶段五：NAS 自主 AI 代理 nas-agent（Python ~4000 行）

- [ ] 11. 搭建 nas-agent 项目骨架
  - [~] 11.1 初始化 Python 项目
    - 创建 `/mnt/storage/starhub/services/nas-agent/`
    - FastAPI + uvicorn + asyncio
    - 安装依赖：httpx, python-telegram-bot, aiofiles, aiosqlite, pydantic
    - 安装测试依赖：pytest, hypothesis
    - 创建 Dockerfile（Python 3.12）
    - **自研代码：** ~50 行（项目配置）
    - _需求: 74.1_

  - [~] 11.2 实现工具调用框架（Tool Calling）
    - 定义 Tool 基类和注册机制
    - 实现 `run_command(cmd)` — bash 沙箱执行（危险命令拦截）
    - 实现 `read_file(path)` / `write_file(path, content)` — 文件读写（自动 Git 提交）
    - 实现 `docker_manage(action, container)` — Docker 容器管理
    - 实现 `db_query(sql)` / `db_execute(sql)` — pipeline.db 读写
    - 实现 `web_search(query)` / `web_fetch(url)` — 网络搜索
    - 实现 `api_call(url, method, body)` — HTTP API 调用
    - 实现 `create_task(type, params)` — 创建 AI 处理任务
    - 实现 `send_notification(message)` — Telegram/管理后台通知
    - 实现 `spend_money(amount, purpose)` — 消费（受预算限制）
    - 实现 `git_commit(message)` — Git 提交
    - 危险命令模式匹配拦截（rm -rf /、iptables -F、docker stop cloudflared 等）
    - **自研代码：** ~600 行
    - _需求: 96.1, 96.2, 96.3, 96.4_

  - [~] 11.3 危险命令安全拦截属性测试
    - **Property 21: 危险命令安全拦截** — 匹配危险模式的命令被拦截，安全命令放行
    - **验证: 需求 96.3**

  - [~] 11.4 实现消费限额检查
    - 每日/每月/单笔消费上限检查
    - 超限自动暂停并通知管理员
    - 消费记录写入 agent_expenses 表
    - 仅允许：云 API 额度、域名续费、VPS 续费
    - 禁止：硬件购买、非星聚消费
    - **自研代码：** ~150 行
    - _需求: 94.1, 94.2, 94.3, 94.4, 94.5, 94.6, 94.7_

  - [~] 11.5 AI 代理消费限额属性测试
    - **Property 20: AI 代理消费限额检查** — 超限拒绝，未超限允许
    - **验证: 需求 94.2**

  - [~] 11.6 实现自主决策循环
    - 每 30 分钟执行一轮决策
    - 收集数据：用户搜索热词、内容库统计、队列状态、系统资源、外部源更新
    - 调用 ollama LLM 推理（Qwen2.5 72B 4bit）
    - 解析决策 JSON：内容获取/优先级调整/存储清理/配置优化/内容推荐
    - 低风险自动执行，高风险等待确认
    - 记录到 agent_decisions 表
    - **自研代码：** ~500 行
    - _需求: 74.1, 74.2, 74.3, 74.4, 74.5, 74.6, 74.7_

  - [~] 11.7 AI 代理风险决策路由属性测试
    - **Property 18: AI 代理风险决策路由** — 低风险自动执行，高风险等待确认
    - **验证: 需求 74.6, 93.4**

  - [~] 11.8 实现自愈巡检（每 5 分钟）
    - 检查所有 Docker 容器状态，异常自动重启
    - 检查 GPU 响应（nvidia-smi），无响应重启 GPU 容器
    - 检查磁盘空间，< 10% 自动清理
    - 检查 Tunnel 连接，断开重启 cloudflared
    - 检查 Redis 连接，断开重启 Redis + task-scheduler
    - 检查 pipeline.db 完整性（PRAGMA integrity_check）
    - 同一异常连续 3 次 → Telegram 通知管理员
    - **自研代码：** ~300 行
    - _需求: 76.1, 76.2, 76.3, 76.4, 76.5_

  - [~] 11.9 实现知识库自动更新（每 6 小时）
    - 爬取 GitHub Trending、Docker Hub 更新、Debian 安全公告
    - 检查已配置源域名变更
    - LLM 总结为结构化知识条目
    - 存储到 knowledge_base 表
    - **自研代码：** ~250 行
    - _需求: 87.1, 87.2, 87.3, 87.4_

  - [~] 11.10 实现智能存储管理
    - 维护内容"价值评分"（访问时间/次数/收藏数/分级/大小）
    - 磁盘 > 85% 自动分级清理
    - 高访问量内容保留 SSD 缓存，低访问量移到 HDD
    - 每周存储分析报告
    - **自研代码：** ~200 行
    - _需求: 77.1, 77.2, 77.3, 77.4, 77.5_

  - [~] 11.11 实现自动内容发现
    - 分析未满足搜索关键词 → 自动下载
    - 追番/追剧新集自动下载
    - 热门排行榜预缓存
    - 学习用户偏好模式
    - **自研代码：** ~200 行
    - _需求: 75.1, 75.2, 75.3, 75.4, 75.5, 75.6, 75.7_

  - [~] 11.12 实现自动系统维护
    - 每周：Docker 镜像更新检查、Debian 安全补丁、日志清理、临时文件清理
    - 更新前创建 BorgBackup 快照
    - 失败自动回滚
    - **自研代码：** ~200 行
    - _需求: 88.1, 88.2, 88.3, 88.4_

  - [~] 11.13 实现自动配置优化
    - 分析 GPU 队列等待时间 → 调整超时和优先级
    - 分析带宽使用模式 → 调整调度规则
    - 分析内容访问热度 → 调整缓存策略
    - 配置变更记录到 agent_config_changes 表
    - A/B 测试：24 小时后指标恶化自动回滚
    - **自研代码：** ~200 行
    - _需求: 89.1, 89.2, 89.3_

  - [~] 11.14 实现对话接口（类 ChatGPT SSE 流式）
    - FastAPI SSE 端点 POST /api/chat
    - 多轮对话上下文管理
    - 工具调用展示（类 Kiro 风格）
    - 对话历史 GET /api/chat/history
    - 使用本地 ollama LLM（Qwen2.5 32B），离线可用
    - **自研代码：** ~300 行
    - _需求: 95.1, 95.2, 95.3, 95.4, 95.5, 95.6_

  - [~] 11.15 实现 Telegram Bot 集成
    - python-telegram-bot 库
    - 接收用户消息 → 转发给 Agent 对话接口
    - 返回 Agent 回复
    - 支持自然语言指令、系统查询、故障排查
    - **自研代码：** ~150 行
    - _需求: 95.8_

  - [~] 11.16 实现 Aider 代码生成集成
    - 调用 Aider CLI 连接本地 ollama（Qwen2.5-Coder 32B）
    - 维护 Git 仓库 `/mnt/storage/starhub/repo/`
    - 代码变更创建 Git 分支（agent/feature-xxx），不直接合并主分支
    - 支持：新建适配器、修复 bug、修改配置、编写脚本
    - **开源复用：** Aider CLI 直接用
    - **自研代码：** ~200 行（集成封装）
    - _需求: 92.1, 92.2, 92.3, 92.4, 92.5, 92.6_

  - [~] 11.17 实现 nas-agent REST API
    - 对话：POST /api/chat, GET /api/chat/history
    - 系统状态：GET /api/system/status, /api/system/health
    - 决策日志：GET /api/decisions, /api/decisions/next
    - 运营报告：GET /api/reports/daily, /api/reports/monthly
    - 知识库：GET /api/knowledge, /api/knowledge/updates
    - 消费管理：GET /api/expenses, PUT /api/expenses/limits
    - 工具调用：POST /api/tools/execute
    - 代码生成：POST /api/code/generate, GET /api/code/branches
    - **自研代码：** ~300 行
    - _需求: 93.3, 74.7, 90.1, 90.2, 90.3, 91.1, 91.2_

  - [~] 11.18 实现自主运营循环调度
    - 每小时：分析搜索热词 → 下载缺失内容
    - 每 6 小时：更新知识库 → 发现新源
    - 每天：系统维护 → 配置优化 → 存储清理 → 运营报告
    - 每周：全库去重 → 硬件评估 → 安全审计
    - 每月：月度运营报告
    - 管理员可设置自主权限等级（全自主/半自主/仅建议）
    - **自研代码：** ~200 行
    - _需求: 93.1, 93.2, 93.4_

  - [~] 11.19 配置无审查 LLM 模型
    - 通过 ollama pull 下载无审查版 Qwen2.5 / Llama 3
    - 配置 Agent 使用无审查模型处理成人内容
    - 仅在管理员设置"成人模式"时解除限制
    - **自研代码：** ~50 行（配置）
    - _需求: 97.1, 97.2, 97.3, 97.4, 97.5_

- [ ] 12. 检查点 — AI 代理核心完成
  - 确认决策循环正常运行（30 分钟一轮）
  - 确认自愈巡检正常（5 分钟一轮）
  - 确认对话接口 SSE 流式输出正常
  - 确认 Telegram Bot 能收发消息
  - 确认工具调用（run_command/docker_manage 等）正常
  - 确认危险命令被正确拦截
  - 如有问题请向用户确认

---

## 阶段六：Web 桌面 UI — Puter 集成 + 自定义应用（React/TS ~2000 行）

- [ ] 13. 配置 Puter Web 桌面
  - [~] 13.1 部署并定制 Puter
    - 使用 `ghcr.io/heyputer/puter` 官方镜像（已在 deploy.sh 中部署）
    - 配置深色主题（#0f0f0f 背景、#3ea6ff 主色）
    - 配置默认中文语言
    - 配置自定义壁纸
    - 注册自定义应用到 Puter 桌面
    - **开源复用：** Puter 整个项目直接用
    - **自研代码：** ~100 行（配置脚本）
    - _需求: 85.1, 85.2, 85.5_

  - [~] 13.2 嵌入 Dockge Docker 管理
    - Dockge 已部署在 :5001
    - 在 Puter 中注册为 iframe 应用
    - **开源复用：** Dockge 直接用
    - **自研代码：** ~20 行（iframe 注册）
    - _需求: 85.4_

- [ ] 14. 开发 Puter 自定义应用（React SPA → iframe）
  - [~] 14.1 搭建 puter-apps 项目骨架
    - 创建 `/mnt/storage/starhub/services/puter-apps/`
    - Vite + React + TypeScript + Tailwind CSS
    - 多入口构建（每个应用独立 HTML 入口）
    - 安装 Lucide React 图标库（SVG 图标，禁止 emoji）
    - 深色主题全局样式（#0f0f0f 背景、#3ea6ff 主色）
    - **自研代码：** ~100 行（项目配置）
    - _需求: 85.5_

  - [~] 14.2 开发系统监控应用
    - 实时 CPU/RAM/GPU/磁盘/网络图表
    - 数据源：nas-agent GET /api/system/status
    - 使用 recharts 或 lightweight-charts 绘图
    - 自动刷新（5 秒间隔）
    - **自研代码：** ~300 行
    - _需求: 85.4, 84.4_

  - [~] 14.3 开发 AI 队列管理应用
    - 任务列表：待处理/处理中/已完成/失败
    - 每个任务展示类型、进度、步骤状态
    - 支持重试/取消/调整优先级
    - GPU 状态指示器
    - 数据源：task-scheduler GET /api/tasks, /api/gpu/status
    - **自研代码：** ~350 行
    - _需求: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6, 85.4_

  - [~] 14.4 开发存储管理应用
    - mergerfs 池状态、各盘使用情况
    - snapraid 状态
    - 存储清理触发
    - 数据源：nas-agent GET /api/system/status
    - **自研代码：** ~200 行
    - _需求: 85.4_

  - [~] 14.5 开发备份管理应用
    - BorgBackup 备份历史列表
    - 手动触发备份/恢复
    - 备份大小和时间统计
    - 数据源：封装 BorgBackup CLI 的 API
    - **自研代码：** ~200 行
    - _需求: 85.4_

  - [~] 14.6 开发龙虾 AI 对话应用
    - 类 ChatGPT 全屏对话 UI
    - SSE 流式输出
    - 工具调用过程展示
    - 多轮对话
    - 数据源：nas-agent POST /api/chat
    - **自研代码：** ~400 行
    - _需求: 95.1, 95.2, 95.3, 95.4, 95.5, 85.4_

  - [~] 14.7 开发应用市场应用
    - 应用列表（从 templates.json 读取）
    - 分类浏览（媒体/工具/AI/开发）
    - 一键安装 = 写入 docker-compose.yml + docker compose up -d
    - 已安装应用管理（启动/停止/卸载）
    - 数据源：Docker Hub API + /mnt/storage/starhub/app-store/templates.json
    - **自研代码：** ~350 行
    - _需求: 85.4_

  - [~] 14.8 构建并部署所有 Puter 应用
    - Vite 构建所有应用为静态文件
    - 部署到 Puter 可访问的目录
    - 注册所有应用到 Puter 桌面（图标 + 名称 + URL）
    - **自研代码：** ~50 行（构建脚本）
    - _需求: 85.1, 85.4_

- [ ] 15. 检查点 — Web 桌面 UI 完成
  - 确认 Puter 桌面可访问，深色主题正确
  - 确认所有自定义应用窗口可打开
  - 确认系统监控实时数据正常
  - 确认 AI 队列管理可操作任务
  - 确认龙虾 AI 对话 SSE 流式正常
  - 确认应用市场一键安装功能正常
  - 如有问题请向用户确认

---

## 阶段七：前端集成与收尾

- [ ] 16. 前端页面集成
  - [~] 16.1 实现私有网盘前端页面
    - 创建 `src/app/cloud/page.tsx`
    - 文件树导航 + 文件列表
    - 拖拽上传 + 进度条
    - 右键菜单：下载/重命名/移动/删除/分享
    - 文件搜索
    - 存储空间使用进度条
    - 图片/视频/音频/PDF 在线预览
    - 深色主题 + SVG 图标
    - **自研代码：** ~400 行
    - _需求: 79.1, 79.2, 79.3, 79.4, 79.5, 79.6, 79.7, 79.8_

  - [~] 16.2 实现视觉小说前端引擎
    - 浏览器渲染：背景 CG + 角色立绘叠加 + 对话框逐字显示 + 配音播放
    - 文字阅读模式 / 视觉小说模式切换
    - 点击推进对话、自动播放、快进已读
    - 存档/读档（保存到 pipeline.db vn_saves 表）
    - 回看历史对话
    - 移动端触摸适配
    - 素材从 NAS 通过 Tunnel + CDN 加载
    - **自研代码：** ~500 行
    - _需求: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [~] 16.3 视觉小说存档读档属性测试
    - **Property 8: 视觉小说存档读档往返** — 保存后读取返回完全相同的数据
    - **验证: 需求 14.4**

  - [~] 16.4 实现多人街机系统
    - 动态实例分配：ceil(N/M) 个 WASM 模拟器实例
    - 观战系统：canvas.captureStream(30) → WebRTC MediaStream
    - 语音聊天：WebRTC P2P 音频 + Opus 编码
    - 房间管理：创建/加入/房间码/房主转移
    - ROM 加载：NAS → Tunnel → CDN → IndexedDB → WASM
    - 支持 FC/SNES/GBA/Genesis/MAME/DOS 平台
    - **开源复用：** EmulatorWrapper + Nostalgist（已有）、DOSBox WASM
    - **自研代码：** ~300 行（房间管理 + 实例分配）
    - _需求: 16.1, 16.2, 16.3, 16.4, 16.5, 17.1, 17.2, 17.3, 18.1, 18.2, 18.3, 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7_

  - [~] 16.5 动态实例分配属性测试
    - **Property 9: 动态实例分配正确性** — ceil(N/M) 个实例，每个不超过 M 人，总数等于 N
    - **验证: 需求 16.1, 16.2, 16.3**

  - [~] 16.6 实现手机端 PWA 管理后台
    - 配置 manifest.json：应用名"星聚管理"、主题色 #0f0f0f
    - 移动端响应式布局
    - 系统状态仪表盘、AI 队列、存储管理、通知中心、快捷操作
    - Web Push 通知
    - **自研代码：** ~200 行
    - _需求: 84.1, 84.2, 84.3, 84.4, 84.5, 84.6_

- [ ] 17. 检查点 — 前端集成完成
  - 确认私有网盘上传/下载/分享正常
  - 确认视觉小说引擎渲染正常
  - 确认多人街机房间创建/加入/观战正常
  - 确认 PWA 安装到手机桌面正常
  - 如有问题请向用户确认

---

## 阶段八：端到端测试与部署验证

- [ ] 18. 端到端流水线测试
  - [~] 18.1 视频完整流水线测试
    - 准备 5 秒测试视频
    - 放入 incoming → 验证 12 步链路完整执行
    - 验证最终 MKV 包含多音轨多字幕
    - _需求: 52_

  - [~] 18.2 漫画完整流水线测试
    - 准备 3 页测试漫画
    - 放入 incoming → 验证 9 步链路完整执行
    - 验证 original/translated/colorized 三个版本
    - _需求: 53_

  - [~] 18.3 小说完整流水线测试
    - 准备 1000 字测试小说
    - 放入 incoming → 验证 10 步链路完整执行
    - 验证 text + vn 两种模式
    - _需求: 54_

  - [~] 18.4 音频完整流水线测试
    - 准备 10 秒测试音频
    - 放入 incoming → 验证 6 步链路完整执行
    - 验证 FLAC + AAC 两个版本
    - _需求: 55_

  - [~] 18.5 部署脚本幂等性属性测试
    - **Property 10: 部署脚本幂等性** — 执行两次后状态与一次相同
    - **验证: 需求 21.6**

  - [~] 18.6 Cloudflare Tunnel 端到端测试
    - 外部访问 → CDN → Tunnel → nas-media-server → 文件
    - 验证 Range 请求（视频 seek）
    - 验证 CDN 缓存命中
    - _需求: 32.3, 32.4, 32.6_

- [ ] 19. 最终检查点 — 全系统验证
  - 运行所有属性测试（fast-check + hypothesis）
  - 运行所有单元测试（vitest + pytest）
  - 验证 22 个 Docker 容器全部运行
  - 验证 GPU 互斥调度正常
  - 验证 AI 代理决策循环正常
  - 验证 Puter Web 桌面所有应用正常
  - 验证私有网盘完整流程
  - 验证 Telegram Bot 正常
  - 确认所有测试通过，如有问题请向用户确认

---

## 备注

- 标记 `*` 的子任务为可选测试任务，可跳过以加速 MVP
- 每个任务引用具体需求编号，确保 97 个需求全覆盖
- 检查点确保增量验证，避免后期大规模返工
- 属性测试验证 21 个正确性属性（设计文档定义）
- 属性测试使用 `fast-check`（Node.js）和 `hypothesis`（Python）
- 单元测试使用 `vitest`（Node.js）和 `pytest`（Python）
- 开源项目直接用，自研仅写胶水代码，总计 ~13600 行
