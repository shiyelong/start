# 需求文档 — 星聚OS（StarHub OS）自主 AI 服务器操作系统

## 简介

星聚OS（StarHub OS）是基于 Debian 13 "Trixie"（内核 6.12 LTS）的自主 AI 服务器操作系统，集五大核心能力于一体：私有网盘、AI 内容处理流水线、自主 AI 代理（类 Claude/Kiro 的本地开发助手）、娱乐内容聚合服务器、飞牛风格 Web 桌面管理界面。系统运行在 i5-12400 + RTX 3090 24GB 硬件上，所有数据存储在本地（SQLite + mergerfs 文件系统），用户通过 Cloudflare Tunnel + CDN 边缘缓存访问。

**核心开发策略：最大化复用开源项目，下载改改就用。** 主要复用的开源项目：

| 功能 | 开源项目 | Stars | 说明 |
|---|---|---|---|
| Web 桌面 UI | [Puter](https://github.com/HeyPuter/puter) | 38.5k | 浏览器内完整桌面环境，自托管 |
| Docker GUI | [Dockge](https://github.com/louislam/dockge) | 15k+ | 轻量 Docker Compose 管理 |
| AI 编程代理 | [Aider](https://github.com/paul-gauthier/aider) + [Open Interpreter](https://github.com/OpenInterpreter/open-interpreter) | 25k+ / 58k+ | AI 编程 + 系统操作 |
| 漫画翻译 | [manga-image-translator](https://github.com/zyddnys/manga-image-translator) | 8k+ | OCR + 翻译 + 渲染一体 |
| 视频处理 | ffmpeg + [PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | — / 2k+ | 场景检测 + 视频编辑 |
| 刮削工具 | Sonarr / Radarr / Prowlarr / Bazarr | — | Docker 镜像直接用 |
| 私有网盘 | [Nextcloud](https://github.com/nextcloud) 或自研轻量版 | 30k+ | 文件管理 + WebDAV + 分享 |
| 备份 | [BorgBackup](https://github.com/borgbackup/borg) | 12k+ | 增量加密备份 |
| 存储管理 | [mergerfs](https://github.com/trapexit/mergerfs) + [snapraid](https://github.com/amadvance/snapraid) | 4k+ / 2k+ | 混合硬盘 + 校验保护 |
| 本地 LLM | [Ollama](https://github.com/ollama/ollama) | 120k+ | 本地 LLM 推理 |
| 语音识别 | [Whisper](https://github.com/openai/whisper) | 75k+ | 语音转文字 |
| TTS 配音 | [XTTS](https://github.com/coqui-ai/TTS) | 40k+ | 多语言语音合成 |
| 图像生成 | [Stable Diffusion WebUI](https://github.com/AUTOMATIC1111/stable-diffusion-webui) | 145k+ | 图像生成/修复/上色 |
| 任务队列 | [BullMQ](https://github.com/taskforcesh/bullmq) + Redis | 6k+ | 任务调度 |
| 应用市场 | 自研（基于 Docker Hub API + 模板系统） | — | 一键安装 Docker 应用 |

所有模块遵循星聚项目宪法：NAS 零公网端口、所有流量走 Cloudflare Tunnel、深色主题、SVG 图标。

## 术语表

- **AI_Pipeline**: AI 处理流水线调度器，管理所有 AI 处理任务的队列、优先级和 GPU 资源分配
- **Task_Scheduler**: 任务调度服务，运行在 NAS 端的 Docker 容器，管理异步 AI 处理任务队列（Redis/BullMQ）
- **Video_Processor**: 视频处理引擎，负责视频去重、去广告、去水印等预处理任务
- **Perceptual_Hasher**: 感知哈希引擎，使用 pHash/dHash 算法和场景指纹识别检测重复视频
- **Ad_Detector**: 广告检测引擎，基于场景切换检测和模式匹配识别视频中的片头/片尾/插播广告段
- **Watermark_Remover**: 水印移除引擎，使用 AI 模型（LaMa/ProPainter）检测并修复视频水印区域
- **Whisper_API**: 语音识别服务，基于 OpenAI Whisper large-v3 模型的 Docker 容器，提供语音转文字 API
- **Subtitle_Generator**: 字幕生成器，调用 Whisper_API 生成原始语言字幕并输出 SRT/ASS 格式
- **Subtitle_Translator**: 字幕翻译器，将字幕文本翻译为中文/日文/英文等多语言版本
- **XTTS_API**: 多语言语音合成服务，基于 XTTS-v2 模型的 Docker 容器，提供文字转语音 API
- **Dubbing_Engine**: 配音引擎，调用 XTTS_API 为视频生成多语言配音音轨
- **Media_Packager**: 媒体封装器，将多音轨、多字幕封装进视频容器（MKV/MP4）
- **Manga_Colorizer**: 漫画上色引擎，使用 Stable Diffusion 模型将黑白漫画自动上色
- **Manga_Translator**: 漫画翻译引擎，集成 OCR 文字识别、翻译和文字渲染，将漫画翻译为目标语言
- **SD_API**: Stable Diffusion WebUI API 服务，运行在 NAS 端的 Docker 容器，提供图像生成/修复 API
- **Novel_VN_Converter**: 小说转视觉小说转换器，使用 LLM 分析小说章节并生成视觉小说脚本
- **VN_Asset_Generator**: 视觉小说素材生成器，调用 SD_API 生成角色立绘和背景 CG
- **VN_Voice_Generator**: 视觉小说语音生成器，调用 XTTS_API 为角色对话生成配音
- **VN_Engine**: 视觉小说前端引擎，在浏览器中渲染视觉小说（JSON 脚本 + 图片 + 音频）
- **Arcade_Room**: 多人街机房间系统，管理玩家匹配、实例分配和观战功能
- **Instance_Allocator**: 动态实例分配器，根据玩家人数和游戏最大玩家数自动创建多个模拟器实例
- **Spectator_System**: 观战系统，允许房间内玩家实时观看其他实例的游戏画面
- **Voice_Chat**: 语音聊天系统，基于 WebRTC 实现房间内玩家语音通信
- **Deploy_Script**: 自动部署脚本，在 Unraid 上一键配置所有 Docker 容器和系统设置
- **Mirror_Manager**: Docker 镜像加速管理器，配置多个国内 Docker 镜像源并支持 skopeo 回退
- **GPU_Passthrough**: GPU 直通配置器，为 AI 容器配置 NVIDIA RTX 3090 GPU 直通
- **Lobster_AI**: 龙虾 AI 配置助手，运行在 NAS 端的 AI 助手，可读取系统状态并建议/执行配置变更
- **Telegram_Scraper**: Telegram 自动抓取服务，定时从配置的频道/群组下载内容到 NAS 本地存储
- **Content_Classifier**: 内容分类器，自动识别下载内容的类型（视频/图片/文档）和 MPAA 分级
- **Auto_Downloader**: 自动下载管理器，集成 Sonarr/Radarr/Prowlarr 实现媒体自动发现和下载
- **Bandwidth_Scheduler**: 带宽调度器，根据时段自动调整下载带宽（夜间高带宽、白天低带宽）
- **Content_Rating**: 美国 MPAA 式内容分级标签体系（G/PG/PG-13/R/NC-17）

## 需求

---

### 需求 1: 视频去重检测

**用户故事:** 作为星聚平台管理员，我希望新入库的视频能自动检测是否与已有视频重复，以避免存储空间浪费和用户看到重复内容。

#### 验收标准

1. WHEN 新视频文件入库, THE Perceptual_Hasher SHALL 计算该视频的感知哈希值（pHash）和场景指纹
2. WHEN 感知哈希计算完成, THE Perceptual_Hasher SHALL 将哈希值与数据库中所有已有视频的哈希值进行比对，汉明距离小于 10 的视为疑似重复
3. WHEN 检测到疑似重复视频, THE Video_Processor SHALL 将该视频标记为"疑似重复"并记录匹配到的原始视频 ID
4. WHEN 检测到疑似重复视频, THE Video_Processor SHALL 保留画质更高或文件更完整的版本，将另一版本移入待清理队列
5. IF 感知哈希计算失败（文件损坏或格式不支持）, THEN THE Perceptual_Hasher SHALL 记录错误日志并跳过该视频，继续处理队列中的下一个任务
6. THE Perceptual_Hasher SHALL 支持对视频的关键帧提取场景指纹，检测内容相同但编码参数不同的重复视频

---

### 需求 2: 视频广告检测与移除

**用户故事:** 作为星聚用户，我希望观看的视频已自动去除片头广告、片尾广告和插播广告，以获得纯净的观看体验。

#### 验收标准

1. WHEN 视频进入 AI 处理队列, THE Ad_Detector SHALL 分析视频的场景切换点、黑屏帧和音频静音段以识别广告片段
2. WHEN Ad_Detector 识别到广告片段, THE Video_Processor SHALL 从视频中裁剪移除该广告片段并重新拼接视频
3. THE Ad_Detector SHALL 支持检测三种广告类型：片头广告（视频开头固定时长）、片尾广告（视频结尾固定时长）和插播广告（视频中间的场景突变段）
4. WHEN 广告移除完成, THE Video_Processor SHALL 保留原始视频文件作为备份，生成去广告版本作为默认播放版本
5. IF Ad_Detector 无法确定某片段是否为广告（置信度低于 70%）, THEN THE Ad_Detector SHALL 保留该片段并在管理后台标记为"待人工审核"
6. THE Ad_Detector SHALL 在处理完成后生成报告，记录检测到的广告片段时间范围和移除结果

---

### 需求 3: 视频水印检测与移除

**用户故事:** 作为星聚用户，我希望观看的视频已自动去除来源网站的水印，以获得干净的画面体验。

#### 验收标准

1. WHEN 视频进入 AI 处理队列, THE Watermark_Remover SHALL 使用 AI 模型（LaMa 或 ProPainter）检测视频画面中的静态水印区域
2. WHEN 水印区域被检测到, THE Watermark_Remover SHALL 使用图像修复（inpainting）技术移除水印并重建被遮挡的画面内容
3. THE Watermark_Remover SHALL 支持检测和移除文字水印、Logo 水印和半透明水印
4. WHEN 水印移除完成, THE Video_Processor SHALL 保留原始视频文件作为备份，生成去水印版本
5. IF Watermark_Remover 未检测到任何水印, THEN THE Watermark_Remover SHALL 跳过水印移除步骤并标记该视频为"无水印"
6. THE Watermark_Remover SHALL 对视频的前 30 秒进行水印检测采样，确认水印位置后对全片统一处理，避免逐帧检测浪费 GPU 资源

---

### 需求 4: AI 字幕生成

**用户故事:** 作为星聚用户，我希望没有字幕的视频能自动生成原始语言字幕，以便我理解视频内容。

#### 验收标准

1. WHEN 视频进入 AI 处理队列且该视频未包含字幕轨, THE Subtitle_Generator SHALL 调用 Whisper_API 对视频音频进行语音识别
2. THE Whisper_API SHALL 使用 Whisper large-v3 模型，支持自动检测音频语言并生成对应语言的字幕
3. WHEN 语音识别完成, THE Subtitle_Generator SHALL 输出 SRT 格式和 ASS 格式的字幕文件
4. THE Subtitle_Generator SHALL 为每条字幕生成精确的时间戳（误差不超过 500 毫秒）
5. IF 视频音频中包含多种语言, THEN THE Subtitle_Generator SHALL 为每种检测到的语言分别生成字幕轨
6. IF 语音识别失败（音频质量过差或无人声）, THEN THE Subtitle_Generator SHALL 记录错误日志并标记该视频为"字幕生成失败"

---

### 需求 5: 多语言字幕翻译

**用户故事:** 作为星聚用户，我希望视频字幕能自动翻译为中文、日文和英文，以便不同语言的用户都能理解视频内容。

#### 验收标准

1. WHEN 原始语言字幕生成完成, THE Subtitle_Translator SHALL 将字幕文本翻译为中文、日文和英文三种目标语言
2. THE Subtitle_Translator SHALL 保持翻译后字幕的时间戳与原始字幕一致
3. THE Subtitle_Translator SHALL 在翻译时保留专有名词、人名和技术术语的原文标注
4. WHEN 翻译完成, THE Subtitle_Translator SHALL 为每种目标语言输出独立的 SRT 和 ASS 字幕文件
5. IF 原始字幕语言已是目标语言之一, THEN THE Subtitle_Translator SHALL 跳过该语言的翻译，直接使用原始字幕
6. IF 翻译服务不可用, THEN THE Subtitle_Translator SHALL 将任务标记为"翻译待重试"并在 30 分钟后重新入队

---

### 需求 6: 多语言 AI 配音

**用户故事:** 作为星聚用户，我希望视频能自动生成中文、日文和英文配音，以便我选择自己熟悉的语言收听。

#### 验收标准

1. WHEN 多语言字幕翻译完成, THE Dubbing_Engine SHALL 调用 XTTS_API 为每种目标语言（中文/日文/英文）生成配音音轨
2. THE XTTS_API SHALL 使用 XTTS-v2 模型，支持根据原始音频的说话人音色进行声音克隆
3. THE Dubbing_Engine SHALL 将生成的配音音轨与视频画面进行时间对齐，确保口型同步误差不超过 200 毫秒
4. WHEN 配音生成完成, THE Media_Packager SHALL 将原始音轨和所有配音音轨封装为多音轨视频文件（MKV 格式）
5. WHEN 用户播放视频, THE Video_Player SHALL 提供音轨切换控件，允许用户在原始语言、中文、日文和英文配音之间切换
6. IF XTTS_API 服务不可用, THEN THE Dubbing_Engine SHALL 将任务标记为"配音待重试"并在 30 分钟后重新入队

---

### 需求 7: 视频处理流水线编排

**用户故事:** 作为星聚平台管理员，我希望视频入库后自动按顺序执行所有 AI 处理步骤，无需手动干预。

#### 验收标准

1. WHEN 新视频入库, THE AI_Pipeline SHALL 自动创建处理任务并按以下顺序执行：去重检测 → 广告移除 → 水印移除 → 字幕生成 → 字幕翻译 → 多语言配音 → 多轨封装
2. THE AI_Pipeline SHALL 在每个处理步骤完成后更新任务状态（pending/processing/completed/failed）
3. IF 某个处理步骤失败, THEN THE AI_Pipeline SHALL 记录错误并跳过该步骤，继续执行后续步骤
4. THE Task_Scheduler SHALL 管理 GPU 资源分配，同一时间仅允许一个 GPU 密集型任务运行（Whisper/XTTS/SD 互斥）
5. THE AI_Pipeline SHALL 尊重 MPAA 分级：NC-17 级成人内容执行完整处理流程，其他分级内容同样执行完整处理流程
6. WHEN 所有处理步骤完成, THE AI_Pipeline SHALL 将处理结果（字幕文件、配音音轨、去水印视频）存储在 NAS 本地 `/data/media/` 对应目录，通过 Cloudflare Tunnel + CDN 边缘缓存向用户分发
7. THE AI_Pipeline SHALL 提供管理后台界面，展示所有任务的处理进度、队列状态和 GPU 使用率

---

### 需求 8: 漫画黑白自动上色

**用户故事:** 作为星聚用户，我希望黑白漫画能自动上色为彩色版本，以获得更丰富的阅读体验。

#### 验收标准

1. WHEN 黑白漫画入库, THE Manga_Colorizer SHALL 调用 SD_API 使用 Stable Diffusion 模型对每页漫画进行自动上色
2. THE Manga_Colorizer SHALL 保持上色后图片的分辨率与原始图片一致
3. THE Manga_Colorizer SHALL 在上色时保持角色服装、头发等元素在不同页面间的颜色一致性
4. WHEN 上色完成, THE Manga_Colorizer SHALL 同时保留原始黑白版本和彩色版本，用户可在阅读器中切换
5. IF 某页漫画上色失败, THEN THE Manga_Colorizer SHALL 记录错误并跳过该页，使用原始黑白版本替代
6. THE Manga_Colorizer SHALL 支持批量处理，按章节为单位将整章漫画加入上色队列

---

### 需求 9: 漫画 OCR 与翻译

**用户故事:** 作为星聚用户，我希望日文/韩文/英文漫画能自动翻译为中文，且翻译文字自然地融入原始气泡中。

#### 验收标准

1. WHEN 漫画入库且原始语言非中文, THE Manga_Translator SHALL 对每页漫画执行 OCR 文字识别，提取对话框和旁白中的文字
2. THE Manga_Translator SHALL 支持识别日文、韩文和英文三种源语言
3. WHEN OCR 识别完成, THE Manga_Translator SHALL 将识别到的文字翻译为中文
4. WHEN 翻译完成, THE Manga_Translator SHALL 使用图像修复技术擦除原始文字区域，并将中文译文渲染到对应位置
5. THE Manga_Translator SHALL 匹配原始文字的字体风格和气泡大小，确保译文自然融入画面
6. WHEN 翻译渲染完成, THE Manga_Translator SHALL 同时保留原始版本和中文翻译版本，用户可在阅读器中切换
7. IF OCR 识别置信度低于 60%, THEN THE Manga_Translator SHALL 在管理后台标记该页为"OCR 待人工校对"

---

### 需求 10: 漫画处理流水线编排

**用户故事:** 作为星聚平台管理员，我希望漫画入库后自动按顺序执行上色和翻译处理，无需手动干预。

#### 验收标准

1. WHEN 新漫画入库, THE AI_Pipeline SHALL 自动创建处理任务并按以下顺序执行：OCR 文字识别 → 翻译 → 文字渲染 → 黑白上色（如适用）
2. THE AI_Pipeline SHALL 在处理完成后为每部漫画生成三个版本：原始版本、中文翻译版本、彩色版本（如原始为黑白）
3. IF 漫画原始语言已是中文, THEN THE AI_Pipeline SHALL 跳过 OCR 和翻译步骤，仅执行上色处理（如适用）
4. WHEN 所有处理步骤完成, THE AI_Pipeline SHALL 将处理结果存储在 NAS 本地 `/data/media/comics/ready/` 目录，通过 Cloudflare Tunnel + CDN 边缘缓存向用户分发
5. THE AI_Pipeline SHALL 按章节为单位管理漫画处理任务，支持查看每章的处理进度

---

### 需求 11: 小说场景脚本生成

**用户故事:** 作为星聚用户，我希望小说能自动转换为视觉小说格式，以获得沉浸式的阅读体验。

#### 验收标准

1. WHEN 小说入库且用户选择"转换为视觉小说", THE Novel_VN_Converter SHALL 使用 LLM 分析小说章节内容
2. THE Novel_VN_Converter SHALL 从小说文本中提取以下元素：场景描述、角色列表、角色表情/动作、对话内容和旁白
3. THE Novel_VN_Converter SHALL 将提取的元素转换为 JSON 格式的视觉小说脚本，包含场景切换指令、角色立绘指令、对话显示指令和音效指令
4. THE Novel_VN_Converter SHALL 为每个角色生成一致的角色描述（外貌、服装、发色等），用于后续图像生成
5. IF LLM 分析失败, THEN THE Novel_VN_Converter SHALL 记录错误并标记该章节为"脚本生成失败"
6. THE Novel_VN_Converter SHALL 尊重 MPAA 分级：NC-17 级成人小说的脚本中包含成人场景描述，用于生成对应的成人 CG

---

### 需求 12: 视觉小说素材生成

**用户故事:** 作为星聚用户，我希望视觉小说的角色立绘和背景 CG 由 AI 自动生成，且角色形象在不同场景中保持一致。

#### 验收标准

1. WHEN 视觉小说脚本生成完成, THE VN_Asset_Generator SHALL 调用 SD_API 根据角色描述生成角色立绘
2. THE VN_Asset_Generator SHALL 为每个角色使用固定的 Stable Diffusion seed 值，确保同一角色在不同表情/姿势下保持外貌一致
3. THE VN_Asset_Generator SHALL 为每个角色生成至少 5 种表情变体（普通、高兴、悲伤、愤怒、惊讶）
4. THE VN_Asset_Generator SHALL 根据脚本中的场景描述生成背景 CG 图片
5. THE VN_Asset_Generator SHALL 尊重 MPAA 分级：NC-17 级成人小说生成包含成人内容的 CG（明确场景）
6. IF SD_API 服务不可用, THEN THE VN_Asset_Generator SHALL 将任务标记为"素材生成待重试"并在 30 分钟后重新入队
7. WHEN 素材生成完成, THE VN_Asset_Generator SHALL 将所有立绘和 CG 存储到 NAS 本地 `/data/media/novels/ready/{content_id}/vn/` 目录

---

### 需求 13: 视觉小说语音生成

**用户故事:** 作为星聚用户，我希望视觉小说中的角色对话有配音，以增强沉浸感。

#### 验收标准

1. WHEN 视觉小说脚本生成完成, THE VN_Voice_Generator SHALL 调用 XTTS_API 为每个角色的对话生成配音
2. THE VN_Voice_Generator SHALL 为每个角色分配独特的声音特征，确保不同角色的声音可区分
3. THE VN_Voice_Generator SHALL 根据脚本中的表情/情绪标注调整语音的语调和语速
4. WHEN 语音生成完成, THE VN_Voice_Generator SHALL 将音频文件与脚本中的对话节点关联
5. IF XTTS_API 服务不可用, THEN THE VN_Voice_Generator SHALL 将任务标记为"语音生成待重试"并在 30 分钟后重新入队

---

### 需求 14: 视觉小说前端引擎

**用户故事:** 作为星聚用户，我希望在浏览器中流畅地体验视觉小说，可以选择以文字模式阅读或以视觉小说模式游玩。

#### 验收标准

1. THE VN_Engine SHALL 在浏览器中渲染视觉小说，支持背景 CG 显示、角色立绘叠加、对话框文字逐字显示和配音播放
2. THE VN_Engine SHALL 支持用户在"文字阅读模式"和"视觉小说模式"之间切换
3. WHILE 视觉小说模式激活, THE VN_Engine SHALL 支持点击/触摸推进对话、自动播放模式和快进已读内容
4. THE VN_Engine SHALL 支持存档和读档功能，保存当前阅读进度到 NAS 本地 SQLite 数据库（`pipeline.db`）
5. THE VN_Engine SHALL 支持回看历史对话记录
6. WHEN 用户在移动端体验视觉小说, THE VN_Engine SHALL 适配触摸操作和竖屏/横屏布局
7. THE VN_Engine SHALL 从 NAS 本地通过 Cloudflare Tunnel + CDN 缓存加载素材（立绘、CG、音频），确保加载速度

---

### 需求 15: 小说转视觉小说流水线编排

**用户故事:** 作为星聚平台管理员，我希望小说转视觉小说的全流程自动执行，无需手动干预。

#### 验收标准

1. WHEN 小说被标记为"转换为视觉小说", THE AI_Pipeline SHALL 自动创建处理任务并按以下顺序执行：LLM 脚本生成 → 角色立绘生成 → 背景 CG 生成 → 角色配音生成 → 资源打包
2. THE AI_Pipeline SHALL 按章节为单位管理转换任务，支持查看每章的处理进度
3. WHEN 某章节所有素材生成完成, THE AI_Pipeline SHALL 将脚本 JSON、立绘、CG 和音频打包存储到 NAS 本地 `/data/media/novels/ready/{content_id}/vn/`
4. IF 某个处理步骤失败, THEN THE AI_Pipeline SHALL 记录错误并允许管理员手动重试该步骤
5. THE AI_Pipeline SHALL 在管理后台展示小说转换队列、每章处理状态和预计完成时间


---

### 需求 16: 动态多人街机实例分配

**用户故事:** 作为星聚用户，我希望多人街机房间能根据玩家人数自动分配游戏实例，以便超过游戏最大玩家数时也能一起玩。

#### 验收标准

1. WHEN 玩家加入街机房间且当前实例玩家数已达游戏最大玩家数, THE Instance_Allocator SHALL 自动创建新的模拟器实例并将新玩家分配到该实例
2. THE Instance_Allocator SHALL 根据游戏的最大玩家数（从 ROM 元数据读取）决定每个实例的玩家上限
3. WHEN 房间内有 4 名玩家且游戏支持 2 人对战, THE Instance_Allocator SHALL 创建 2 个实例并支持 2v2 团队模式
4. THE Instance_Allocator SHALL 在房间内展示所有活跃实例的列表，标注每个实例的玩家名称和状态
5. WHEN 某个实例的所有玩家离开, THE Instance_Allocator SHALL 自动销毁该实例并释放资源
6. IF 实例创建失败（浏览器资源不足）, THEN THE Instance_Allocator SHALL 通知玩家当前无法创建新实例并建议等待

---

### 需求 17: 街机房间观战系统

**用户故事:** 作为星聚用户，我希望在街机房间中能观看其他实例的游戏画面，以便在等待时观赛或学习其他玩家的操作。

#### 验收标准

1. THE Spectator_System SHALL 允许房间内的玩家切换到观战模式，实时观看任意实例的游戏画面
2. WHEN 玩家选择观战某个实例, THE Spectator_System SHALL 通过 WebRTC 接收该实例的画面流并在观战者浏览器中渲染
3. THE Spectator_System SHALL 在房间界面中以缩略图形式同时展示所有活跃实例的实时画面
4. WHILE 玩家处于观战模式, THE Spectator_System SHALL 禁止观战者向被观战实例发送输入指令
5. WHEN 观战者点击某个实例的缩略图, THE Spectator_System SHALL 将该实例画面放大为全屏观战视图
6. THE Spectator_System SHALL 在观战画面上叠加显示当前实例的玩家名称和游戏状态信息

---

### 需求 18: 街机房间语音聊天

**用户故事:** 作为星聚用户，我希望在街机房间中能与其他玩家语音聊天，以便在游戏中实时沟通。

#### 验收标准

1. THE Voice_Chat SHALL 基于 WebRTC 实现房间内所有玩家的实时语音通信
2. WHEN 玩家加入街机房间, THE Voice_Chat SHALL 请求麦克风权限并自动加入语音频道
3. THE Voice_Chat SHALL 支持静音/取消静音自己的麦克风
4. THE Voice_Chat SHALL 支持调节其他玩家的音量
5. THE Voice_Chat SHALL 在房间界面中显示正在说话的玩家的语音活动指示器
6. IF 玩家拒绝麦克风权限, THEN THE Voice_Chat SHALL 允许该玩家以仅收听模式参与语音频道

---

### 需求 19: 街机房间管理

**用户故事:** 作为星聚用户，我希望能创建和管理街机房间，选择游戏并邀请朋友加入。

#### 验收标准

1. WHEN 用户创建街机房间, THE Arcade_Room SHALL 要求选择游戏 ROM 和游戏模式（自由对战/团队对战/合作）
2. THE Arcade_Room SHALL 生成唯一的房间码，用户可分享房间码邀请其他玩家加入
3. THE Arcade_Room SHALL 支持以下游戏平台的 ROM：FC/NES、SNES、GBA、Genesis/MD、Arcade（MAME）、DOS 游戏
4. WHEN 用户选择 DOS 游戏, THE Arcade_Room SHALL 使用 DOSBox WASM 在浏览器中运行游戏
5. THE Arcade_Room SHALL 从 NAS 通过 Cloudflare Tunnel + CDN 缓存加载 ROM/磁盘镜像文件
6. WHEN 房间创建者离开房间, THE Arcade_Room SHALL 将房主权限转移给房间内的下一个玩家
7. THE Arcade_Room SHALL 在房间列表页展示所有公开房间，包含游戏名称、玩家数量和房间状态

---

### 需求 20: Docker 镜像加速配置

**用户故事:** 作为中国大陆的 NAS 用户，我希望部署脚本能自动配置多个 Docker 镜像加速源，以便快速拉取 Docker 镜像。

#### 验收标准

1. THE Mirror_Manager SHALL 在 Unraid Docker daemon 配置中添加以下镜像加速源：
   - https://xuanyuan.cloud/free
   - DaoCloud 公共镜像镜像（github.com/DaoCloud/public-image-mirror）
   - https://docker.aityp.com/
   - https://1ms.run/
   - 以及其他可用的国内镜像源
2. THE Mirror_Manager SHALL 在拉取镜像前按优先级依次尝试所有配置的镜像源
3. IF 所有镜像源均拉取失败, THEN THE Mirror_Manager SHALL 使用 skopeo 工具作为最终回退方案拉取镜像
4. THE Mirror_Manager SHALL 在部署日志中记录每个镜像的拉取源和耗时
5. THE Mirror_Manager SHALL 支持管理员通过配置文件添加或移除镜像加速源

---

### 需求 21: 一键自动部署脚本

**用户故事:** 作为 NAS 用户，我希望运行一个脚本就能自动部署和配置所有需要的 Docker 容器和系统设置，无需手动操作。

#### 验收标准

1. THE Deploy_Script SHALL 在 Unraid 7.x 系统上以 bash 脚本形式运行，自动完成所有部署步骤
2. THE Deploy_Script SHALL 拉取并配置以下 Docker 容器：
   - cloudflared（Cloudflare Tunnel 客户端）
   - nas-media-server（星聚媒体服务）
   - whisper-api（语音识别，GPU 直通）
   - xtts-api（多语言 TTS，GPU 直通）
   - stable-diffusion-webui-api（图像生成，GPU 直通）
   - manga-translator（OCR + 翻译 + 文字渲染）
   - video-processor（去重/去广告/去水印）
   - novel-to-vn（小说转视觉小说）
   - task-scheduler（AI 任务队列）
   - qbittorrent（下载器）
   - sonarr（电视剧自动刮削）
   - radarr（电影自动刮削）
   - prowlarr（索引器管理）
   - bazarr（字幕管理）
   - tdarr（视频转码）
3. THE Deploy_Script SHALL 在部署前检查系统硬件（CPU、GPU、RAM、存储空间）是否满足最低要求
4. WHEN 部署完成, THE Deploy_Script SHALL 对所有服务执行健康检查并输出部署报告
5. IF 某个容器拉取或启动失败, THEN THE Deploy_Script SHALL 记录错误并继续部署其他容器，最终在报告中列出失败项
6. THE Deploy_Script SHALL 支持幂等执行：重复运行不会创建重复容器或覆盖已有配置

---

### 需求 22: GPU 直通配置

**用户故事:** 作为 NAS 用户，我希望部署脚本能自动为 AI 容器配置 NVIDIA GPU 直通，以便 AI 处理任务能使用 GPU 加速。

#### 验收标准

1. THE GPU_Passthrough SHALL 检测系统中的 NVIDIA GPU 设备（目标：RTX 3090 24GB）
2. THE GPU_Passthrough SHALL 安装 NVIDIA Container Toolkit（nvidia-docker2）
3. THE GPU_Passthrough SHALL 为以下容器配置 GPU 直通：whisper-api、xtts-api、stable-diffusion-webui-api、video-processor、manga-translator
4. WHEN GPU 直通配置完成, THE GPU_Passthrough SHALL 在每个 AI 容器内运行 nvidia-smi 验证 GPU 可访问
5. IF 系统未检测到 NVIDIA GPU, THEN THE GPU_Passthrough SHALL 输出警告并将 AI 容器配置为 CPU-only 模式
6. THE GPU_Passthrough SHALL 配置 GPU 资源共享，允许多个容器共享同一块 GPU（通过 NVIDIA MPS 或时间片轮转）

---

### 需求 23: 网络安全与隐私配置

**用户故事:** 作为 NAS 用户，我希望部署脚本能自动配置防火墙和网络安全设置，确保 NAS 的真实 IP 永远不暴露。

#### 验收标准

1. THE Deploy_Script SHALL 配置 Unraid 防火墙规则：阻止所有入站连接，仅允许 cloudflared 的出站连接
2. THE Deploy_Script SHALL 配置 DNS-over-HTTPS，防止 DNS 查询泄露
3. THE Deploy_Script SHALL 配置 MAC 地址随机化
4. THE Deploy_Script SHALL 使用提供的 Cloudflare Tunnel 凭证配置 cloudflared 容器
5. THE Deploy_Script SHALL 生成并安全存储所有加密密钥（NAS_SIGNING_KEY、NAS_ENCRYPTION_KEY）到 Unraid 的加密密钥存储中
6. IF Cloudflare Tunnel 凭证未提供, THEN THE Deploy_Script SHALL 提示用户输入凭证并验证连接成功
7. THE Deploy_Script SHALL 确保所有 Docker 容器仅绑定到 127.0.0.1，禁止绑定到 0.0.0.0

---

### 需求 24: 自动刮削工具配置

**用户故事:** 作为 NAS 用户，我希望部署脚本能自动配置 Sonarr/Radarr/Prowlarr 等刮削工具，以便自动发现和下载媒体内容。

#### 验收标准

1. THE Deploy_Script SHALL 配置 Prowlarr 并添加常用的 Torrent 索引器
2. THE Deploy_Script SHALL 配置 Sonarr 连接 Prowlarr 和 qBittorrent，实现电视剧自动搜索和下载
3. THE Deploy_Script SHALL 配置 Radarr 连接 Prowlarr 和 qBittorrent，实现电影自动搜索和下载
4. THE Deploy_Script SHALL 配置 Bazarr 连接 Sonarr 和 Radarr，实现字幕自动下载
5. THE Deploy_Script SHALL 配置 Tdarr 实现视频自动转码（统一为 H.265/HEVC 格式以节省存储空间）
6. THE Deploy_Script SHALL 配置 Unraid Community Applications（CA）插件
7. WHEN 刮削工具下载完成新内容, THE Auto_Downloader SHALL 自动将新内容注册到 NAS 媒体库并触发 AI 处理流水线

---

### 需求 25: 龙虾 AI 配置助手

**用户故事:** 作为 NAS 用户，我希望有一个 AI 助手能帮我诊断和配置 NAS 系统，以便在遇到问题时获得智能帮助。

#### 验收标准

1. THE Lobster_AI SHALL 作为 Docker 容器运行在 NAS 上，提供 HTTP API 接口
2. THE Lobster_AI SHALL 能读取 Unraid 系统状态信息（CPU/GPU/RAM 使用率、磁盘空间、Docker 容器状态、网络连接状态）
3. WHEN 用户通过管理后台向 Lobster_AI 提问, THE Lobster_AI SHALL 分析系统状态并提供诊断建议
4. THE Lobster_AI SHALL 支持执行配置变更操作（重启容器、修改配置文件、调整资源分配），需用户确认后执行
5. IF Lobster_AI 建议的操作可能影响服务可用性, THEN THE Lobster_AI SHALL 在执行前明确警告用户并要求二次确认
6. THE Lobster_AI SHALL 记录所有操作日志，支持回滚最近的配置变更
7. THE Lobster_AI SHALL 通过 Cloudflare Tunnel 接入，管理后台通过星聚平台的管理界面访问，NAS 端零公网端口


---

### 需求 26: Telegram 频道自动抓取

**用户故事:** 作为星聚平台管理员，我希望系统能自动从配置的 Telegram 频道/群组下载内容到 NAS 本地存储，以丰富平台内容库。

#### 验收标准

1. THE Telegram_Scraper SHALL 定时从所有已启用的 Telegram 频道/群组获取新消息
2. THE Telegram_Scraper SHALL 支持下载视频、图片和文档类型的媒体文件到 NAS 本地存储
3. THE Telegram_Scraper SHALL 支持配置公开频道和群组作为内容源
4. THE Telegram_Scraper SHALL 为每个频道支持独立配置抓取间隔（默认 30 分钟）
5. WHEN 新媒体文件下载完成, THE Telegram_Scraper SHALL 自动将文件注册到 NAS 媒体库的对应分类中
6. IF Telegram API 请求失败, THEN THE Telegram_Scraper SHALL 记录错误并在下一个抓取周期重试

---

### 需求 27: Telegram 内容自动分类

**用户故事:** 作为星聚平台管理员，我希望从 Telegram 下载的内容能自动分类和分级，以便直接进入对应的内容库。

#### 验收标准

1. WHEN Telegram 媒体文件下载完成, THE Content_Classifier SHALL 根据文件类型（视频/图片/文档）和来源频道的配置自动分类
2. THE Content_Classifier SHALL 根据来源频道的预设 MPAA 分级自动为下载内容标记分级
3. WHEN 内容分类完成, THE Content_Classifier SHALL 将视频内容自动加入视频 AI 处理流水线（去重/字幕/配音等）
4. WHEN 内容分类完成, THE Content_Classifier SHALL 将图片内容自动加入漫画处理流水线（如适用）
5. THE Content_Classifier SHALL 在管理后台展示分类结果，支持管理员手动调整分类和分级
6. IF 内容无法自动分类, THEN THE Content_Classifier SHALL 将该内容标记为"待人工分类"

---

### 需求 28: Telegram 频道管理界面

**用户故事:** 作为星聚平台管理员，我希望在管理后台中管理 Telegram 频道配置，以便灵活添加或移除内容源。

#### 验收标准

1. THE Telegram_Scraper SHALL 在管理后台提供频道管理界面，支持添加、编辑、启用/禁用和删除频道配置
2. THE Telegram_Scraper SHALL 为每个频道展示名称、类型、MPAA 分级、抓取间隔、最后抓取时间和已下载消息数
3. WHEN 管理员添加新频道, THE Telegram_Scraper SHALL 验证频道 ID 有效性并在下一个抓取周期开始抓取
4. WHEN 管理员禁用某个频道, THE Telegram_Scraper SHALL 停止该频道的定时抓取
5. THE Telegram_Scraper SHALL 在管理后台展示抓取日志，包含每次抓取的时间、下载文件数和错误信息

---

### 需求 29: 自动下载与刮削集成

**用户故事:** 作为星聚平台管理员，我希望 Sonarr/Radarr/Prowlarr 下载的内容能自动进入 AI 处理流水线，实现从发现到处理的全自动化。

#### 验收标准

1. WHEN Sonarr/Radarr 下载完成新的视频内容, THE Auto_Downloader SHALL 自动将新内容注册到 NAS 媒体库
2. WHEN 新内容注册到 NAS 媒体库, THE Auto_Downloader SHALL 自动触发 AI 处理流水线（去重/去广告/去水印/字幕/配音）
3. THE Auto_Downloader SHALL 支持根据平台用户的观看热度和搜索趋势自动添加下载任务到 Sonarr/Radarr
4. THE Auto_Downloader SHALL 支持多种下载源：Torrent（通过 qBittorrent）、直接下载和 Usenet
5. WHEN 下载任务完成, THE Auto_Downloader SHALL 在管理后台记录下载来源、文件大小和处理状态
6. THE Auto_Downloader SHALL 确保所有下载流量通过 Cloudflare Tunnel，NAS 真实 IP 不暴露

---

### 需求 30: 下载带宽调度

**用户故事:** 作为 NAS 用户，我希望下载任务能根据时段自动调整带宽，以避免白天影响正常使用和被运营商检测。

#### 验收标准

1. THE Bandwidth_Scheduler SHALL 支持按时段配置下载带宽限制（默认：夜间 00:00-06:00 高带宽，白天 06:00-00:00 低带宽）
2. THE Bandwidth_Scheduler SHALL 在时段切换时自动调整 qBittorrent 的上传/下载速度限制
3. THE Bandwidth_Scheduler SHALL 支持管理员自定义时段和对应的带宽限制值
4. THE Bandwidth_Scheduler SHALL 在管理后台展示当前带宽使用情况和调度规则
5. THE Bandwidth_Scheduler SHALL 与 NAS 代理层的每日带宽上限（nas-proxy.ts 中的 BandwidthStatus）协同工作，避免超出每日总带宽限制
6. IF 当日带宽使用量接近上限（超过 90%）, THEN THE Bandwidth_Scheduler SHALL 自动暂停所有下载任务并通知管理员

---

### 需求 31: AI 处理任务队列管理

**用户故事:** 作为星聚平台管理员，我希望能在管理后台查看和管理所有 AI 处理任务的状态，以便监控系统运行情况。

#### 验收标准

1. THE Task_Scheduler SHALL 在管理后台提供任务队列仪表盘，展示待处理、处理中、已完成和失败的任务数量
2. THE Task_Scheduler SHALL 为每个任务展示任务类型、目标内容、创建时间、开始时间、预计完成时间和当前状态
3. THE Task_Scheduler SHALL 支持管理员手动重试失败的任务
4. THE Task_Scheduler SHALL 支持管理员调整任务优先级（将某个任务提前或延后）
5. THE Task_Scheduler SHALL 支持管理员取消排队中的任务
6. THE Task_Scheduler SHALL 展示 GPU 使用率、显存占用和当前正在运行的 AI 模型信息
7. THE Task_Scheduler SHALL 支持任务依赖关系：当前置任务完成后自动触发后续任务

---

### 需求 32: 处理结果本地存储与 CDN 分发

**用户故事:** 作为星聚用户，我希望 AI 处理后的内容（字幕、配音、彩色漫画、视觉小说素材）能通过 CDN 快速加载。

#### 验收标准

1. WHEN AI 处理任务完成, THE AI_Pipeline SHALL 将处理结果文件存储在 NAS 本地 `/data/media/` 对应的 `ready/` 目录中
2. THE AI_Pipeline SHALL 在 NAS 本地 SQLite 数据库（`pipeline.db`）中记录处理结果的文件路径、内容类型和元数据
3. THE nas-media-server SHALL 通过 HTTP API 提供所有 `ready/` 目录下文件的访问，Cloudflare Tunnel 将请求转发到此服务
4. WHEN 用户请求已处理的内容, THE Cloudflare CDN SHALL 在边缘节点缓存该文件，后续相同请求直接从 CDN 返回，不再访问 NAS
5. THE AI_Pipeline SHALL 对 NAS 本地存储的文件使用 AES-256 加密，与现有 NAS 缓存层（nas-cache.ts）的加密方案保持一致
6. THE nas-media-server SHALL 支持 Range 请求（视频/音频 seek），支持 ETag/Last-Modified 缓存头以配合 CDN 缓存策略


---

### 需求 33: 成人视频 AI 处理流水线

**用户故事:** 作为星聚平台管理员，我希望所有成人视频（NC-17级）入库后也能自动执行完整的 AI 处理流水线（去重/去广告/去水印/字幕/配音），与普通视频享受同等处理质量。

#### 验收标准

1. THE AI_Pipeline SHALL 对所有 NC-17 级成人视频执行与普通视频完全相同的处理流水线：去重 → 去广告 → 去水印 → 字幕生成 → 字幕翻译 → 多语言配音 → 多轨封装
2. THE AI_Pipeline SHALL 对成人视频源（Pornhub/XVideos/XNXX/JavBus/Missav/ThisAV/Jable/Avgle/SpankBang/HentaiHaven/Hanime/R18 等）下载的视频自动触发处理
3. THE Perceptual_Hasher SHALL 对成人视频执行跨源去重：同一视频在 Pornhub 和 XVideos 上的不同编码版本应被识别为重复，保留画质最高版本
4. THE Ad_Detector SHALL 识别成人视频中常见的片头/片尾广告模式（网站 Logo 动画、订阅提示、其他视频推荐片段）
5. THE Watermark_Remover SHALL 识别并移除成人视频网站的水印（如 Pornhub Logo、JavBus 水印、字幕组水印等）
6. THE Subtitle_Generator SHALL 对成人视频中的对话/呻吟/旁白进行语音识别，生成原始语言字幕
7. THE Dubbing_Engine SHALL 为成人视频生成中文/日文/英文配音，配音风格匹配原始音频的情感和语调
8. WHEN 成人视频处理完成, THE Media_Packager SHALL 将多音轨（原始+中文+日文+英文）和多字幕封装为 MKV 文件

---

### 需求 34: 短剧合集智能识别与拆分

**用户故事:** 作为星聚平台管理员，我希望 AI 能自动识别下载的视频是单集还是短剧合集，并将合集自动拆分为独立集数。

#### 验收标准

1. WHEN 新视频入库, THE Video_Processor SHALL 分析视频时长、场景切换频率和标题信息，判断该视频是单集还是短剧合集
2. THE Video_Processor SHALL 识别以下合集特征：视频时长超过 60 分钟且包含多次明显的场景切换/黑屏分隔、标题中包含"合集"/"全集"/"1-N集"等关键词
3. WHEN 检测到短剧合集, THE Video_Processor SHALL 根据场景切换点自动将合集拆分为独立集数
4. THE Video_Processor SHALL 为拆分后的每集自动生成标题（如"第1集"/"第2集"）和封面截图
5. THE Video_Processor SHALL 将拆分后的集数关联为同一系列，在前端展示为连续剧集列表
6. IF Video_Processor 无法确定拆分点（置信度低于 60%）, THEN THE Video_Processor SHALL 保留原始合集视频并在管理后台标记为"待人工拆分"
7. THE Video_Processor SHALL 对拆分后的每集独立执行后续 AI 处理流水线（字幕/配音等）

---

### 需求 35: 成人漫画 AI 处理流水线

**用户故事:** 作为星聚平台管理员，我希望所有成人漫画（NC-17级）入库后也能自动执行上色和翻译处理。

#### 验收标准

1. THE AI_Pipeline SHALL 对所有 NC-17 级成人漫画执行与普通漫画相同的处理流水线：OCR → 翻译 → 文字渲染 → 上色（如适用）
2. THE AI_Pipeline SHALL 对成人漫画源（nhentai/E-Hentai/Hitomi/Pixiv/禁漫天堂/紳士漫畫/Wnacg/Tsumino 等）下载的漫画自动触发处理
3. THE Manga_Colorizer SHALL 对成人黑白漫画上色时保持成人内容的准确性，不模糊或遮挡成人画面
4. THE Manga_Translator SHALL 对成人漫画中的对话、音效文字和旁白进行 OCR 识别和翻译
5. THE Manga_Translator SHALL 在翻译成人漫画时保持原始的排版风格（竖排/横排、气泡大小、字体粗细）

---

### 需求 36: 成人漫画跨源去重

**用户故事:** 作为星聚平台管理员，我希望从不同成人漫画源下载的相同漫画能被自动识别为重复，避免存储浪费。

#### 验收标准

1. THE Perceptual_Hasher SHALL 对成人漫画的封面和前 5 页内容计算感知哈希，用于跨源去重
2. WHEN 新漫画入库, THE Perceptual_Hasher SHALL 将哈希值与已有漫画库比对，汉明距离小于 8 的视为疑似重复
3. THE Perceptual_Hasher SHALL 识别同一漫画在不同源上的不同分辨率/压缩质量版本，保留画质最高版本
4. THE Perceptual_Hasher SHALL 识别同一漫画的不同语言翻译版本（日文原版 vs 中文翻译版），将它们关联为同一作品的不同语言版本而非重复
5. WHEN 检测到重复漫画, THE Video_Processor SHALL 保留画质最高或页数最完整的版本，将其他版本移入待清理队列

---

### 需求 37: 成人小说 AI 处理与视觉小说转换

**用户故事:** 作为星聚平台管理员，我希望成人小说（NC-17级）也能自动转换为视觉小说，且生成的 CG 包含与小说分级匹配的成人内容。

#### 验收标准

1. THE Novel_VN_Converter SHALL 对 NC-17 级成人小说生成包含成人场景描述的视觉小说脚本
2. THE VN_Asset_Generator SHALL 根据成人场景描述生成对应尺度的 CG 图片（明确的成人镜头）
3. THE VN_Asset_Generator SHALL 使用 NSFW 专用的 Stable Diffusion 模型/LoRA 生成成人 CG，确保画面质量和一致性
4. THE VN_Voice_Generator SHALL 为成人小说的角色对话生成匹配情感的配音（包括成人场景的语音表演）
5. THE AI_Pipeline SHALL 在生成成人视觉小说素材时严格标记为 NC-17 级，确保仅成人模式用户可访问
6. THE Novel_VN_Converter SHALL 对成人小说源（禁忌书屋/69书吧/H小说网/Literotica/AO3 等）下载的小说自动触发转换

---

### 需求 38: 性工作者内容去重与验证

**用户故事:** 作为星聚平台管理员，我希望 AI 能自动检测性工作者（服务者）上传的照片和视频是否与已有内容重复或盗用他人照片。

#### 验收标准

1. THE Perceptual_Hasher SHALL 对服务者上传的每张照片计算人脸特征向量和感知哈希
2. WHEN 新服务者提交资料, THE Perceptual_Hasher SHALL 将照片与已有所有服务者的照片库比对，检测是否存在人脸高度相似（余弦相似度 > 0.85）的已有服务者
3. IF 检测到照片与已有服务者高度相似, THEN THE Adult_Service_Platform SHALL 在管理后台标记为"疑似重复/盗图"并通知管理员审核
4. THE Perceptual_Hasher SHALL 对服务者上传的视频验证材料进行人脸比对，确认视频中的人与照片是否一致（AI 人脸比对分数 > 0.8 视为通过）
5. THE Perceptual_Hasher SHALL 检测服务者照片是否来自网络盗图（与已知的网络图库/其他平台的服务者照片比对）
6. THE AI_Pipeline SHALL 将服务者照片去重和验证作为高优先级任务处理，确保在 5 分钟内完成

---

### 需求 39: 成人视频源自动刮削与下载

**用户故事:** 作为星聚平台管理员，我希望系统能自动从所有已配置的成人视频源刮削热门内容并下载到 NAS。

#### 验收标准

1. THE Auto_Downloader SHALL 支持从以下成人视频源自动刮削和下载热门内容：
   - Pornhub（热门/最新/分类排行）
   - XVideos（热门/最新/分类排行）
   - XNXX（热门/最新）
   - JavBus（最新番号/热门番号）
   - Missav（最新/热门）
   - ThisAV（最新/热门）
   - Jable（最新/热门）
   - Avgle（最新/热门）
   - SpankBang（热门/最新）
   - xHamster（热门/最新）
   - HentaiHaven（最新里番）
   - Hanime.tv（最新里番）
   - E-Hentai/nhentai（热门同人志）
2. THE Auto_Downloader SHALL 为每个成人源支持配置刮削频率（默认每 6 小时）和每次最大下载数量
3. THE Auto_Downloader SHALL 在下载前先执行去重检查，已存在的内容不重复下载
4. WHEN 成人内容下载完成, THE Auto_Downloader SHALL 自动标记为 NC-17 级并触发 AI 处理流水线
5. THE Auto_Downloader SHALL 支持按标签/分类配置刮削规则（如仅下载日本AV、仅下载4K内容等）

---

### 需求 40: 免费影视聚合源自动缓存

**用户故事:** 作为星聚平台管理员，我希望系统能自动从免费影视聚合站缓存热门影视内容到 NAS，提高用户访问速度。

#### 验收标准

1. THE Auto_Downloader SHALL 支持从以下免费影视聚合站自动缓存热门内容：
   - 低端影视
   - 茶杯狐
   - 电影天堂
   - 韩剧TV
   - 人人视频
   - 以及管理员后续配置的其他免费影视源
2. THE Auto_Downloader SHALL 根据平台用户的搜索热度和播放量自动决定缓存优先级
3. THE Auto_Downloader SHALL 支持配置每日最大缓存量（默认 50GB/天）
4. WHEN 免费影视内容缓存完成, THE Auto_Downloader SHALL 自动触发 AI 处理流水线（字幕/配音）
5. THE Auto_Downloader SHALL 对缓存的免费影视内容根据原始分级标记 MPAA 分级

---

### 需求 41: 成人漫画源自动刮削与下载

**用户故事:** 作为星聚平台管理员，我希望系统能自动从成人漫画源刮削热门内容并下载到 NAS。

#### 验收标准

1. THE Auto_Downloader SHALL 支持从以下成人漫画源自动刮削和下载：
   - nhentai（热门/最新/标签排行）
   - E-Hentai（热门/最新）
   - Hitomi（热门/最新）
   - Pixiv（R-18 标签热门）
   - 禁漫天堂（热门/最新）
   - 紳士漫畫（热门/最新）
   - Wnacg（热门/最新）
   - Tsumino（热门/最新）
2. THE Auto_Downloader SHALL 在下载前执行漫画去重检查（需求 36），避免重复下载
3. WHEN 成人漫画下载完成, THE Auto_Downloader SHALL 自动标记为 NC-17 级并触发漫画 AI 处理流水线（OCR/翻译/上色）
4. THE Auto_Downloader SHALL 支持按标签配置刮削规则（如仅下载中文翻译版、仅下载全彩等）

---

### 需求 42: 成人小说源自动刮削与下载

**用户故事:** 作为星聚平台管理员，我希望系统能自动从成人小说源刮削热门内容并下载到 NAS。

#### 验收标准

1. THE Auto_Downloader SHALL 支持从以下成人小说源自动刮削和下载：
   - 禁忌书屋（热门/最新/分类排行）
   - 69书吧成人区（热门/最新）
   - H小说网（热门/最新）
   - 成人文学城（热门/最新）
   - Literotica（热门/最新/分类排行）
   - AO3 成人分区（热门/最新）
2. THE Auto_Downloader SHALL 在下载前执行小说去重检查（标题+作者匹配），避免重复下载
3. WHEN 成人小说下载完成, THE Auto_Downloader SHALL 自动标记为 NC-17 级并可选触发视觉小说转换流水线
4. THE Auto_Downloader SHALL 支持按类型/标签配置刮削规则

---

### 需求 43: 成人音乐/ASMR 源自动刮削与下载

**用户故事:** 作为星聚平台管理员，我希望系统能自动从成人音乐/ASMR 源刮削热门内容并下载到 NAS。

#### 验收标准

1. THE Auto_Downloader SHALL 支持从以下成人音乐/ASMR 源自动刮削和下载：
   - DLsite 音声作品（热门/最新）
   - ASMR.one（热门/最新）
   - Japaneseasmr（热门/最新）
   - 各平台 Explicit 标记歌曲
2. THE Auto_Downloader SHALL 在下载前执行音频去重检查（音频指纹比对），避免重复下载
3. WHEN 成人音乐下载完成, THE Auto_Downloader SHALL 自动标记为 NC-17 级
4. THE Auto_Downloader SHALL 对下载的音声作品自动提取元数据（标题/声优/标签/时长）

---

### 需求 44: Telegram 成人频道自动抓取

**用户故事:** 作为星聚平台管理员，我希望系统能自动从配置的成人 Telegram 频道/群组下载内容到 NAS，并自动分级和处理。

#### 验收标准

1. THE Telegram_Scraper SHALL 支持配置成人 Telegram 频道/群组，这些频道的内容自动标记为 NC-17 级
2. THE Telegram_Scraper SHALL 从成人频道下载的视频自动进入成人视频 AI 处理流水线（去重/去水印/字幕/配音）
3. THE Telegram_Scraper SHALL 从成人频道下载的图片自动归类到成人漫画/图集库
4. THE Telegram_Scraper SHALL 支持识别 Telegram 频道中的短剧合集并触发短剧拆分流水线（需求 34）
5. THE Content_Classifier SHALL 对成人 Telegram 频道内容自动打标签（地区/类型/题材），复用原平台的多标签分类体系

---

### 需求 45: 成人直播录像自动缓存

**用户故事:** 作为星聚平台管理员，我希望系统能自动录制和缓存热门成人直播的精彩片段到 NAS。

#### 验收标准

1. THE Auto_Downloader SHALL 支持从以下成人直播平台录制热门直播片段：
   - Chaturbate（热门主播）
   - StripChat（热门主播）
   - BongaCams（热门主播）
   - LiveJasmin（热门主播）
   - CamSoda（热门主播）
   - MyFreeCams（热门主播）
2. THE Auto_Downloader SHALL 支持配置录制规则：按主播关注数/观看人数阈值自动触发录制
3. WHEN 直播录像缓存完成, THE Auto_Downloader SHALL 自动标记为 NC-17 级并触发视频 AI 处理流水线
4. THE Auto_Downloader SHALL 对录制的直播片段自动提取封面截图和元数据（主播名/平台/时长/分类）

---

### 需求 46: 音频去重与指纹识别

**用户故事:** 作为星聚平台管理员，我希望 AI 能自动检测重复的音乐/ASMR 音频文件，避免存储浪费。

#### 验收标准

1. THE Perceptual_Hasher SHALL 对所有入库音频文件计算音频指纹（Chromaprint/AcoustID 算法）
2. WHEN 新音频入库, THE Perceptual_Hasher SHALL 将音频指纹与已有音频库比对，相似度 > 90% 的视为重复
3. THE Perceptual_Hasher SHALL 识别同一音频的不同编码格式版本（MP3 vs FLAC vs AAC），保留音质最高版本
4. THE Perceptual_Hasher SHALL 识别同一歌曲的不同版本（原版 vs 翻唱 vs remix），将它们关联为同一作品的不同版本而非重复
5. WHEN 检测到重复音频, THE Video_Processor SHALL 保留音质最高版本，将其他版本移入待清理队列

---

### 需求 47: 全内容类型统一去重引擎

**用户故事:** 作为星聚平台管理员，我希望有一个统一的去重引擎，覆盖所有内容类型（视频/漫画/小说/音乐/服务者照片），避免任何重复内容浪费存储。

#### 验收标准

1. THE Perceptual_Hasher SHALL 提供统一的去重 API，支持以下内容类型的去重检测：
   - 视频：感知哈希 + 场景指纹（需求 1）
   - 漫画：封面 + 内页感知哈希（需求 36）
   - 小说：标题 + 作者 + 内容摘要比对
   - 音频：音频指纹（需求 46）
   - 图片/照片：人脸特征 + 感知哈希（需求 38）
2. THE Perceptual_Hasher SHALL 在管理后台提供去重仪表盘，展示各类型的重复检测统计和待清理队列
3. THE Perceptual_Hasher SHALL 支持管理员手动确认或驳回去重建议
4. THE Perceptual_Hasher SHALL 支持定期全库扫描（可配置，默认每周一次），检测历史入库内容中的重复项
5. THE Perceptual_Hasher SHALL 对所有分级（G/PG/PG-13/R/NC-17）的内容统一执行去重，不因分级不同而跳过

---

### 需求 48: 动漫源自动刮削与下载

**用户故事:** 作为星聚平台管理员，我希望系统能自动从动漫源刮削新番和热门动漫并下载到 NAS。

#### 验收标准

1. THE Auto_Downloader SHALL 支持从以下动漫源自动刮削和下载：
   - 樱花动漫（新番更新/热门）
   - AGE动漫（新番更新/热门）
   - OmoFun（新番更新）
   - GoGoAnime（新番更新/热门）
   - 9Anime（新番更新/热门）
   - 动漫花园（BT 资源）
   - 萌番组（BT 资源）
   - 以及成人动漫源：Hanime.tv、HentaiHaven 等
2. THE Auto_Downloader SHALL 根据用户追番列表自动下载新集更新
3. THE Auto_Downloader SHALL 在下载前执行视频去重检查，避免同一集从多个源重复下载
4. WHEN 动漫下载完成, THE Auto_Downloader SHALL 自动触发 AI 处理流水线（字幕/配音）
5. THE Auto_Downloader SHALL 对成人动漫自动标记为 NC-17 级

---

### 需求 49: 主流视频平台内容自动缓存

**用户故事:** 作为星聚平台管理员，我希望系统能根据用户行为自动缓存热门的 B站/YouTube/抖音等平台内容到 NAS。

#### 验收标准

1. THE Auto_Downloader SHALL 支持根据平台用户的播放热度自动缓存以下平台的热门内容：
   - B站（热门视频/UP主视频）
   - YouTube（通过代理，热门视频）
   - 抖音/TikTok（热门短视频）
   - 快手（热门短视频）
   - 西瓜视频（热门中长视频）
2. THE Auto_Downloader SHALL 仅缓存被平台用户播放超过 N 次（可配置，默认 5 次）的内容
3. WHEN 主流平台内容缓存完成, THE Auto_Downloader SHALL 自动触发 AI 处理流水线
4. THE Auto_Downloader SHALL 根据原始平台的内容分级标记 MPAA 分级

---

### 需求 50: 小说源自动刮削与下载

**用户故事:** 作为星聚平台管理员，我希望系统能自动从小说源刮削热门小说并下载到 NAS。

#### 验收标准

1. THE Auto_Downloader SHALL 支持从以下小说源自动刮削和下载：
   - 笔趣阁（热门/最新/分类排行）
   - 69书吧（热门/最新）
   - 全本小说网（完本排行）
   - 顶点小说（热门/最新）
   - Novel Updates（英文轻小说）
   - Light Novel World（英文轻小说）
2. THE Auto_Downloader SHALL 在下载前执行小说去重检查（标题+作者），避免重复下载
3. WHEN 小说下载完成, THE Auto_Downloader SHALL 根据内容自动标记 MPAA 分级
4. THE Auto_Downloader SHALL 支持追更：已下载的连载小说有新章节时自动下载更新

---

### 需求 51: 漫画源自动刮削与下载

**用户故事:** 作为星聚平台管理员，我希望系统能自动从漫画源刮削热门漫画并下载到 NAS。

#### 验收标准

1. THE Auto_Downloader SHALL 支持从以下漫画源自动刮削和下载：
   - 漫画柜（热门/最新）
   - 动漫之家（热门/最新）
   - 拷贝漫画（热门/最新）
   - 包子漫画（热门/最新）
   - MangaDex（热门/最新）
   - Webtoon（热门/最新）
   - 快看漫画（热门/最新）
2. THE Auto_Downloader SHALL 在下载前执行漫画去重检查（需求 36），避免重复下载
3. WHEN 漫画下载完成, THE Auto_Downloader SHALL 自动触发漫画 AI 处理流水线（OCR/翻译/上色）
4. THE Auto_Downloader SHALL 支持追更：已下载的连载漫画有新章节时自动下载更新
5. THE Auto_Downloader SHALL 根据来源自动标记 MPAA 分级（主流漫画源默认 PG，成人漫画源强制 NC-17）


---

## 附录 A: NAS 端完整处理步骤链路

以下详细描述每种内容类型从下载到最终上架的完整处理链路，包括每一步调用的服务、输入/输出、存储路径和错误处理。

---

### 需求 52: 视频完整处理链路（从下载到上架）

**用户故事:** 作为星聚平台管理员，我需要清楚了解一个视频从下载到用户可播放的每一个处理步骤、调用的服务和数据流向。

#### 验收标准 — 视频处理 12 步链路

**步骤 0: 文件入库触发**
1. WHEN 新视频文件出现在 NAS 监控目录（`/data/media/videos/incoming/`）, THE File_Watcher SHALL 检测到文件写入完成（文件大小 5 秒内无变化）并向 Task_Scheduler 发送入库事件
2. THE Task_Scheduler SHALL 创建一条 `video_pipeline` 类型的任务记录，状态为 `pending`，包含文件路径、文件大小、来源标识（sonarr/radarr/telegram/manual）

**步骤 1: 文件预检**
3. THE Video_Processor SHALL 调用 `ffprobe`（NAS 本地安装）提取视频元数据：时长、分辨率、编码格式、音轨数、字幕轨数、文件完整性
4. IF 文件损坏或格式不支持, THEN THE Video_Processor SHALL 标记任务为 `failed:invalid_file` 并移动文件到 `/data/media/videos/failed/`
5. THE Video_Processor SHALL 将元数据写入 NAS 本地 SQLite 数据库 `pipeline.db` 的 `video_tasks` 表

**步骤 2: 感知哈希去重**
6. THE Perceptual_Hasher SHALL 调用 NAS 本地的 `ffmpeg` 提取视频关键帧（每 10 秒一帧），对每帧计算 pHash（64-bit）
7. THE Perceptual_Hasher SHALL 将所有关键帧哈希组合为视频指纹，与 `pipeline.db` 的 `video_hashes` 表中已有指纹比对
8. IF 汉明距离 < 10 的匹配存在, THEN THE Perceptual_Hasher SHALL 比较两个视频的分辨率和文件大小，保留更优版本，将劣质版本标记为 `duplicate`
9. IF 视频为重复, THEN THE Task_Scheduler SHALL 跳过后续所有步骤，将文件移动到 `/data/media/videos/duplicates/`

**步骤 3: 短剧合集检测与拆分**
10. THE Video_Processor SHALL 分析视频时长和场景切换：IF 时长 > 60 分钟 AND 存在 >= 3 个黑屏分隔段（> 2 秒黑屏）, THEN 判定为合集
11. WHEN 判定为合集, THE Video_Processor SHALL 调用 `ffmpeg` 按黑屏分隔点拆分为独立集数文件，存储到 `/data/media/videos/processing/{task_id}/episodes/`
12. THE Video_Processor SHALL 为每个拆分集数创建独立的子任务，后续步骤对每集独立执行

**步骤 4: 广告检测与移除**
13. THE Ad_Detector SHALL 调用 NAS 本地 Python 脚本 `ad_detect.py`（使用 scenedetect 库），分析视频的场景切换点、黑屏帧和音频静音段
14. THE Ad_Detector SHALL 将检测到的广告片段时间范围写入 `pipeline.db` 的 `ad_segments` 表
15. WHEN 广告片段确认, THE Video_Processor SHALL 调用 `ffmpeg -ss -to` 裁剪移除广告片段并重新拼接，输出到 `/data/media/videos/processing/{task_id}/no_ads.mkv`
16. THE Video_Processor SHALL 保留原始文件到 `/data/media/videos/originals/{hash}.mkv` 作为备份

**步骤 5: 水印检测与移除**
17. THE Watermark_Remover SHALL 调用 SD_API 容器（`http://127.0.0.1:7860/sdapi/v1/img2img`）的 inpainting 功能，对视频前 30 秒采样检测水印位置
18. IF 检测到水印区域, THEN THE Watermark_Remover SHALL 对全片逐帧应用 inpainting 移除水印，调用 `ffmpeg` 将处理后的帧序列重新编码为视频
19. THE Watermark_Remover SHALL 输出去水印视频到 `/data/media/videos/processing/{task_id}/no_watermark.mkv`

**步骤 6: 语音识别生成字幕**
20. THE Subtitle_Generator SHALL 调用 Whisper_API 容器（`http://127.0.0.1:9000/asr`），POST 请求体为视频音频流（`ffmpeg -i input -vn -f wav -`），参数 `model=large-v3, language=auto`
21. THE Whisper_API SHALL 返回 JSON 格式的识别结果（含时间戳和文本），Subtitle_Generator 将其转换为 SRT 和 ASS 格式
22. THE Subtitle_Generator SHALL 将字幕文件存储到 `/data/media/videos/processing/{task_id}/subs/original.srt` 和 `original.ass`

**步骤 7: 字幕翻译**
23. THE Subtitle_Translator SHALL 读取原始字幕文件，调用翻译 API（优先本地 LLM 容器 `http://127.0.0.1:11434/api/generate`，回退到云端 DeepL API）
24. THE Subtitle_Translator SHALL 为每种目标语言（中文/日文/英文）生成独立字幕文件：`zh.srt`、`ja.srt`、`en.srt`
25. THE Subtitle_Translator SHALL 保持翻译后字幕的时间戳与原始字幕完全一致

**步骤 8: 多语言配音生成**
26. THE Dubbing_Engine SHALL 读取翻译后的字幕文件，按时间戳逐句调用 XTTS_API 容器（`http://127.0.0.1:8020/tts_to_audio`），参数包含文本、目标语言和参考音频（从原始视频提取的说话人音色样本）
27. THE XTTS_API SHALL 返回 WAV 格式音频片段，Dubbing_Engine 将所有片段按时间戳拼接为完整配音音轨
28. THE Dubbing_Engine SHALL 为每种语言生成独立音轨文件：`dub_zh.wav`、`dub_ja.wav`、`dub_en.wav`，存储到 `/data/media/videos/processing/{task_id}/dubs/`

**步骤 9: 多轨封装**
29. THE Media_Packager SHALL 调用 `ffmpeg` 将以下内容封装为最终 MKV 文件：
    - 视频轨：去水印/去广告后的视频
    - 音轨 0：原始音频（标记为原始语言）
    - 音轨 1：中文配音
    - 音轨 2：日文配音
    - 音轨 3：英文配音
    - 字幕轨 0：原始语言字幕
    - 字幕轨 1：中文字幕
    - 字幕轨 2：日文字幕
    - 字幕轨 3：英文字幕
30. THE Media_Packager SHALL 输出最终文件到 `/data/media/videos/ready/{content_id}.mkv`

**步骤 10: 元数据注册**
31. THE AI_Pipeline SHALL 将处理结果写入 NAS 本地 `pipeline.db`：内容 ID、标题、时长、分辨率、可用音轨列表、可用字幕列表、MPAA 分级、处理时间
32. THE AI_Pipeline SHALL 通过 Cloudflare Tunnel 调用星聚平台 API（`POST /api/nas/register`）将元数据同步到平台前端可查询的 NAS 本地 API

**步骤 11: 文件归档**
33. THE AI_Pipeline SHALL 将字幕文件（SRT/ASS）和配音音轨（WAV 转 AAC）存储到 `/data/media/videos/ready/{content_id}/` 目录，nas-media-server 通过 Tunnel + CDN 缓存向用户提供访问
34. THE AI_Pipeline SHALL 将视频文件保留在 NAS 本地（`/data/media/videos/ready/`），用户播放时通过 Cloudflare Tunnel + CDN 缓存访问

**步骤 12: 清理与完成**
35. THE AI_Pipeline SHALL 删除 `/data/media/videos/processing/{task_id}/` 临时目录
36. THE AI_Pipeline SHALL 更新任务状态为 `completed`，记录总处理时间和各步骤耗时
37. THE AI_Pipeline SHALL 通过 Cloudflare Tunnel 调用通知 API（`POST /api/notify/admin`）通知管理员处理完成


---

### 需求 53: 漫画完整处理链路（从下载到上架）

**用户故事:** 作为星聚平台管理员，我需要清楚了解一部漫画从下载到用户可阅读的每一个处理步骤。

#### 验收标准 — 漫画处理 9 步链路

**步骤 0: 文件入库触发**
1. WHEN 新漫画文件夹或压缩包出现在 NAS 监控目录（`/data/media/comics/incoming/`）, THE File_Watcher SHALL 检测到并解压（如为 zip/rar/7z），将图片文件整理到 `/data/media/comics/processing/{task_id}/pages/`
2. THE Task_Scheduler SHALL 创建一条 `comic_pipeline` 类型的任务记录

**步骤 1: 文件预检与元数据提取**
3. THE Video_Processor SHALL 扫描页面图片：统计页数、检测图片分辨率、判断是否为黑白（灰度直方图分析）、检测原始语言（对前 3 页执行 OCR 语言检测）
4. THE Video_Processor SHALL 将元数据写入 `pipeline.db` 的 `comic_tasks` 表：页数、分辨率、是否黑白、检测到的语言

**步骤 2: 漫画去重**
5. THE Perceptual_Hasher SHALL 对封面和前 5 页计算感知哈希，与 `pipeline.db` 的 `comic_hashes` 表比对
6. IF 汉明距离 < 8 的匹配存在, THEN 比较分辨率和页数完整性，保留更优版本
7. IF 检测到是同一漫画的不同语言版本, THEN 关联为同一作品的语言变体而非重复

**步骤 3: OCR 文字识别**
8. THE Manga_Translator SHALL 对每页图片调用 NAS 本地 OCR 引擎（`manga-translator` 容器，`http://127.0.0.1:5003/ocr`），POST 请求体为图片二进制数据
9. THE OCR 引擎 SHALL 返回 JSON：每个文字区域的坐标（x, y, w, h）、识别文本、语言、置信度
10. THE Manga_Translator SHALL 将 OCR 结果存储到 `/data/media/comics/processing/{task_id}/ocr/{page_num}.json`

**步骤 4: 文字翻译**
11. THE Manga_Translator SHALL 读取 OCR 结果，将所有非中文文本调用翻译服务（优先本地 LLM `http://127.0.0.1:11434/api/generate`，回退到云端 API）翻译为中文
12. THE Manga_Translator SHALL 将翻译结果存储到 `/data/media/comics/processing/{task_id}/translations/{page_num}.json`，包含原文、译文和坐标

**步骤 5: 文字擦除与渲染**
13. THE Manga_Translator SHALL 对每页图片调用 `manga-translator` 容器的渲染 API（`http://127.0.0.1:5003/render`），POST 请求体包含原始图片和翻译 JSON
14. THE 渲染引擎 SHALL 执行：(a) 使用 inpainting 擦除原始文字区域 (b) 根据气泡大小自动选择字体和字号 (c) 将中文译文渲染到对应位置，匹配原始排版风格（竖排/横排）
15. THE Manga_Translator SHALL 将翻译版页面存储到 `/data/media/comics/processing/{task_id}/translated/{page_num}.png`

**步骤 6: 黑白上色（如适用）**
16. IF 步骤 1 检测到漫画为黑白, THEN THE Manga_Colorizer SHALL 对每页调用 SD_API 容器（`http://127.0.0.1:7860/sdapi/v1/img2img`），使用漫画上色专用模型/LoRA
17. THE Manga_Colorizer SHALL 使用固定的颜色参考（第一页的上色结果作为后续页面的风格参考），确保角色颜色跨页一致
18. THE Manga_Colorizer SHALL 将上色版页面存储到 `/data/media/comics/processing/{task_id}/colorized/{page_num}.png`

**步骤 7: 版本打包**
19. THE AI_Pipeline SHALL 将处理结果整理为三个版本目录：
    - `/data/media/comics/ready/{content_id}/original/` — 原始版本
    - `/data/media/comics/ready/{content_id}/translated/` — 中文翻译版本
    - `/data/media/comics/ready/{content_id}/colorized/` — 彩色版本（如适用）
20. THE AI_Pipeline SHALL 为每个版本生成封面缩略图（取第一页缩放为 300x400）

**步骤 8: 元数据注册与文件归档**
21. THE AI_Pipeline SHALL 将元数据写入 NAS 本地 `pipeline.db`：内容 ID、标题、页数、可用版本列表（original/translated/colorized）、语言、MPAA 分级
22. THE AI_Pipeline SHALL 将封面缩略图和前 3 页预览存储到 `/data/media/comics/ready/{content_id}/thumbnails/`，完整页面同样在 NAS 本地，通过 Tunnel + CDN 缓存访问
23. THE AI_Pipeline SHALL 清理临时目录，更新任务状态为 `completed`

---

### 需求 54: 小说完整处理链路（从下载到上架）

**用户故事:** 作为星聚平台管理员，我需要清楚了解一部小说从下载到用户可阅读（含视觉小说模式）的每一个处理步骤。

#### 验收标准 — 小说处理 10 步链路

**步骤 0: 文件入库触发**
1. WHEN 新小说文件出现在 NAS 监控目录（`/data/media/novels/incoming/`）, THE File_Watcher SHALL 检测文件格式（TXT/EPUB/PDF）并提取纯文本内容到 `/data/media/novels/processing/{task_id}/text/`
2. THE Task_Scheduler SHALL 创建一条 `novel_pipeline` 类型的任务记录

**步骤 1: 文本预处理与元数据提取**
3. THE Video_Processor SHALL 分析文本：统计字数、检测语言、提取章节结构（按"第X章"/"Chapter X"等模式分割）、检测是否包含成人内容关键词（用于 MPAA 分级）
4. THE Video_Processor SHALL 将元数据写入 `pipeline.db`：标题、作者（从文件名或文本头部提取）、字数、章节数、检测语言、MPAA 分级

**步骤 2: 小说去重**
5. THE Perceptual_Hasher SHALL 提取小说前 1000 字的文本指纹（SimHash），与已有小说库比对
6. IF 相似度 > 90%, THEN 比较字数完整性，保留更完整版本

**步骤 3: 文本翻译（如非中文）**
7. IF 检测语言非中文, THEN THE Subtitle_Translator SHALL 按章节调用翻译服务将全文翻译为中文
8. THE Subtitle_Translator SHALL 将翻译结果存储为独立文件：`/data/media/novels/processing/{task_id}/translated_zh/chapter_{n}.txt`

**步骤 4: 视觉小说脚本生成（可选，管理员配置或用户触发）**
9. THE Novel_VN_Converter SHALL 按章节调用本地 LLM 容器（`http://127.0.0.1:11434/api/generate`），prompt 包含章节文本和指令："提取场景、角色、对话、表情、动作，输出 JSON 格式视觉小说脚本"
10. THE LLM SHALL 返回 JSON 脚本，包含：scenes[{background, characters[{name, expression, position}], dialogues[{speaker, text, emotion}]}]
11. THE Novel_VN_Converter SHALL 将脚本存储到 `/data/media/novels/processing/{task_id}/vn_scripts/chapter_{n}.json`
12. IF MPAA 分级为 NC-17, THEN THE Novel_VN_Converter SHALL 在 prompt 中指示 LLM 保留成人场景描述，生成对应的成人 CG 指令

**步骤 5: 角色立绘生成**
13. THE VN_Asset_Generator SHALL 从所有章节脚本中提取唯一角色列表，为每个角色调用 SD_API（`http://127.0.0.1:7860/sdapi/v1/txt2img`），prompt 为角色外貌描述，使用固定 seed 确保一致性
14. THE VN_Asset_Generator SHALL 为每个角色生成 5 种表情变体（neutral/happy/sad/angry/surprised），存储到 `/data/media/novels/processing/{task_id}/vn_assets/characters/{name}_{expression}.png`
15. IF NC-17 级, THEN THE VN_Asset_Generator SHALL 使用 NSFW 模型/LoRA 生成成人立绘变体

**步骤 6: 背景 CG 生成**
16. THE VN_Asset_Generator SHALL 从脚本中提取唯一场景列表，为每个场景调用 SD_API 生成背景 CG
17. THE VN_Asset_Generator SHALL 存储到 `/data/media/novels/processing/{task_id}/vn_assets/backgrounds/{scene_id}.png`
18. IF NC-17 级, THEN THE VN_Asset_Generator SHALL 为成人场景生成对应尺度的 CG

**步骤 7: 角色配音生成**
19. THE VN_Voice_Generator SHALL 从脚本中提取所有对话，为每个角色分配独特声音（调用 XTTS_API `http://127.0.0.1:8020/tts_to_audio`，每个角色使用不同的参考音频）
20. THE VN_Voice_Generator SHALL 将音频片段存储到 `/data/media/novels/processing/{task_id}/vn_assets/voices/{chapter}_{dialogue_id}.wav`

**步骤 8: 视觉小说资源打包**
21. THE AI_Pipeline SHALL 将视觉小说资源打包为标准格式：
    - `vn_package.json` — 主索引文件，包含章节列表、角色列表、资源路径映射
    - `scripts/` — 每章的 JSON 脚本
    - `characters/` — 角色立绘
    - `backgrounds/` — 背景 CG
    - `voices/` — 配音音频
22. THE AI_Pipeline SHALL 将打包结果存储到 `/data/media/novels/ready/{content_id}/vn/`

**步骤 9: 元数据注册与文件归档**
23. THE AI_Pipeline SHALL 将元数据写入 NAS 本地 `pipeline.db`：内容 ID、标题、作者、字数、章节数、可用模式（text/vn）、MPAA 分级
24. THE AI_Pipeline SHALL 将视觉小说资源包（立绘/CG/音频）存储到 `/data/media/novels/ready/{content_id}/vn/`，纯文本同样在 NAS 本地，通过 Tunnel + CDN 缓存访问
25. THE AI_Pipeline SHALL 清理临时目录，更新任务状态为 `completed`

---

### 需求 55: 音频完整处理链路（从下载到上架）

**用户故事:** 作为星聚平台管理员，我需要清楚了解音乐/ASMR 音频从下载到用户可播放的每一个处理步骤。

#### 验收标准 — 音频处理 6 步链路

**步骤 0: 文件入库触发**
1. WHEN 新音频文件出现在 NAS 监控目录（`/data/media/music/incoming/`）, THE File_Watcher SHALL 检测文件格式（MP3/FLAC/WAV/AAC/OGG）并向 Task_Scheduler 发送入库事件

**步骤 1: 元数据提取**
2. THE Video_Processor SHALL 调用 `ffprobe` 提取音频元数据：时长、采样率、比特率、声道数、ID3 标签（标题/艺术家/专辑/年份）
3. IF ID3 标签缺失, THEN THE Video_Processor SHALL 从文件名解析标题和艺术家

**步骤 2: 音频指纹去重**
4. THE Perceptual_Hasher SHALL 调用 NAS 本地 `fpcalc`（Chromaprint 工具）计算音频指纹
5. THE Perceptual_Hasher SHALL 将指纹与 `pipeline.db` 的 `audio_fingerprints` 表比对，相似度 > 90% 视为重复
6. IF 重复, THEN 保留音质最高版本（比特率更高或无损格式优先）

**步骤 3: 格式标准化**
7. THE Video_Processor SHALL 将所有音频统一转码为两个版本：
    - 高品质版：FLAC（无损）或原始格式（如已是无损）
    - 流媒体版：AAC 256kbps（用于在线播放）
8. THE Video_Processor SHALL 存储到 `/data/media/music/ready/{content_id}/hq.flac` 和 `stream.m4a`

**步骤 4: MPAA 分级标记**
9. THE Content_Classifier SHALL 根据来源频道/平台的预设分级标记 MPAA 等级
10. IF 来源为成人音乐源（DLsite/ASMR.one 等）, THEN 强制标记为 NC-17

**步骤 5: 元数据注册与文件归档**
11. THE AI_Pipeline SHALL 将元数据写入 NAS 本地 `pipeline.db`：内容 ID、标题、艺术家、时长、可用格式、MPAA 分级
12. THE AI_Pipeline SHALL 将流媒体版（AAC）和高品质版均保留在 NAS 本地 `/data/media/music/ready/{content_id}/`，通过 Tunnel + CDN 缓存访问
13. THE AI_Pipeline SHALL 清理临时文件，更新任务状态为 `completed`


---

### 需求 56: NAS 端服务间调用关系与 API 清单

**用户故事:** 作为星聚平台开发者，我需要清楚了解 NAS 上所有 Docker 容器之间的调用关系和 API 接口。

#### 验收标准 — NAS 端服务拓扑

**服务清单与端口分配：**
1. THE Deploy_Script SHALL 按以下端口分配部署所有 NAS 端 Docker 容器（全部绑定 127.0.0.1）：

| 服务名 | 容器镜像 | 端口 | GPU | 功能 |
|---|---|---|---|---|
| task-scheduler | 自研 Node.js | 127.0.0.1:8000 | 否 | 任务队列管理（BullMQ + Redis） |
| nas-media-server | 自研 Node.js | 127.0.0.1:8765 | 否 | 媒体文件 HTTP 服务（供 Tunnel 访问） |
| whisper-api | `onerahmet/openai-whisper-asr-webservice` | 127.0.0.1:9000 | 是 | 语音识别（Whisper large-v3） |
| xtts-api | `ghcr.io/coqui-ai/xtts-streaming-server` | 127.0.0.1:8020 | 是 | 多语言 TTS 配音（XTTS-v2） |
| sd-api | `ghcr.io/abetlen/stable-diffusion-webui` | 127.0.0.1:7860 | 是 | 图像生成/修复/上色（SD 1.5/SDXL） |
| manga-translator | `zyddnys/manga-image-translator` | 127.0.0.1:5003 | 是 | 漫画 OCR + 翻译 + 文字渲染 |
| ollama | `ollama/ollama` | 127.0.0.1:11434 | 是 | 本地 LLM 推理（翻译/脚本生成） |
| video-processor | 自研 Python | 127.0.0.1:8100 | 部分 | 视频去重/去广告/去水印/拆分 |
| file-watcher | 自研 Node.js | 无（内部进程） | 否 | 监控入库目录，触发任务 |
| cloudflared | `cloudflare/cloudflared` | 无（出站隧道） | 否 | Cloudflare Tunnel 客户端 |
| redis | `redis:7-alpine` | 127.0.0.1:6379 | 否 | 任务队列后端（BullMQ） |
| qbittorrent | `linuxserver/qbittorrent` | 127.0.0.1:8080 | 否 | BT 下载器 |
| sonarr | `linuxserver/sonarr` | 127.0.0.1:8989 | 否 | 电视剧/动漫自动刮削 |
| radarr | `linuxserver/radarr` | 127.0.0.1:7878 | 否 | 电影自动刮削 |
| prowlarr | `linuxserver/prowlarr` | 127.0.0.1:9696 | 否 | 索引器管理 |
| bazarr | `linuxserver/bazarr` | 127.0.0.1:6767 | 否 | 字幕自动下载 |
| tdarr | `haveagitgat/tdarr` | 127.0.0.1:8265 | 是 | 视频自动转码（H.265） |
| lobster-ai | 自研 Python | 127.0.0.1:8200 | 否 | 龙虾 AI 配置助手 |

**服务间调用关系：**
2. THE task-scheduler SHALL 作为中央调度器，通过 HTTP API 调用以下服务：
    - `POST http://127.0.0.1:8100/process/video` → video-processor（视频预处理）
    - `POST http://127.0.0.1:9000/asr` → whisper-api（语音识别）
    - `POST http://127.0.0.1:8020/tts_to_audio` → xtts-api（配音生成）
    - `POST http://127.0.0.1:7860/sdapi/v1/img2img` → sd-api（水印移除/漫画上色）
    - `POST http://127.0.0.1:7860/sdapi/v1/txt2img` → sd-api（视觉小说 CG 生成）
    - `POST http://127.0.0.1:5003/ocr` → manga-translator（漫画 OCR）
    - `POST http://127.0.0.1:5003/render` → manga-translator（漫画文字渲染）
    - `POST http://127.0.0.1:11434/api/generate` → ollama（翻译/脚本生成）

**GPU 资源互斥调度：**
3. THE task-scheduler SHALL 维护 GPU 锁，同一时间仅允许一个 GPU 密集型任务运行：
    - whisper-api（语音识别）
    - xtts-api（TTS 配音）
    - sd-api（图像生成/修复）
    - manga-translator（OCR + 渲染）
    - tdarr（视频转码）
4. THE task-scheduler SHALL 按优先级调度 GPU 任务：用户触发的实时任务 > 新入库内容处理 > 批量历史内容处理

**文件监控触发链：**
5. THE file-watcher SHALL 监控以下入库目录，检测到新文件后向 task-scheduler 发送 HTTP 事件：
    - `/data/media/videos/incoming/` → 触发视频处理流水线（需求 52）
    - `/data/media/comics/incoming/` → 触发漫画处理流水线（需求 53）
    - `/data/media/novels/incoming/` → 触发小说处理流水线（需求 54）
    - `/data/media/music/incoming/` → 触发音频处理流水线（需求 55）
6. THE file-watcher SHALL 在文件写入完成后（文件大小 5 秒内无变化）才触发事件，避免处理未完成的下载文件

**下载完成触发链：**
7. WHEN qbittorrent 下载完成, THE qbittorrent SHALL 通过 webhook（`POST http://127.0.0.1:8000/webhook/download-complete`）通知 task-scheduler
8. THE task-scheduler SHALL 根据下载任务的来源（sonarr/radarr/manual）将文件移动到对应的入库目录
9. WHEN sonarr/radarr 导入完成, THE sonarr/radarr SHALL 通过 webhook（`POST http://127.0.0.1:8000/webhook/import-complete`）通知 task-scheduler

**Telegram 抓取触发链：**
10. THE telegram-scraper（集成在 task-scheduler 中）SHALL 按配置的间隔定时执行抓取
11. WHEN 新媒体文件下载完成, THE telegram-scraper SHALL 将文件移动到对应的入库目录并触发处理流水线

**处理结果同步链：**
12. WHEN 任何处理流水线完成, THE task-scheduler SHALL 通过 cloudflared 隧道执行以下操作：
    - 调用 `POST /api/nas/register` 将元数据同步到平台前端（元数据存 NAS 本地 `pipeline.db`，前端通过 Tunnel API 查询）
    - 所有处理结果文件保留在 NAS 本地 `/data/media/*/ready/` 目录，nas-media-server 通过 Tunnel + CDN 缓存提供访问
    - 调用 `POST /api/notify/admin` 发送处理完成通知

---

### 需求 57: NAS 端目录结构规范

**用户故事:** 作为星聚平台开发者，我需要清楚了解 NAS 上的文件目录结构，以便所有服务使用统一的路径约定。

#### 验收标准

1. THE Deploy_Script SHALL 在首次部署时创建以下标准目录结构：

```
/data/media/
├── videos/
│   ├── incoming/          ← 新视频入库目录（file-watcher 监控）
│   ├── processing/        ← 处理中的临时目录（按 task_id 分子目录）
│   ├── ready/             ← 处理完成的最终视频（按 content_id 分子目录）
│   ├── originals/         ← 原始备份（按哈希命名）
│   ├── duplicates/        ← 检测到的重复文件（待清理）
│   └── failed/            ← 处理失败的文件
├── comics/
│   ├── incoming/          ← 新漫画入库目录
│   ├── processing/        ← 处理中
│   ├── ready/             ← 处理完成（每部漫画含 original/translated/colorized 子目录）
│   ├── duplicates/
│   └── failed/
├── novels/
│   ├── incoming/          ← 新小说入库目录
│   ├── processing/        ← 处理中
│   ├── ready/             ← 处理完成（每部小说含 text/ 和可选 vn/ 子目录）
│   ├── duplicates/
│   └── failed/
├── music/
│   ├── incoming/          ← 新音频入库目录
│   ├── processing/
│   ├── ready/             ← 处理完成（每首含 hq.flac 和 stream.m4a）
│   ├── duplicates/
│   └── failed/
├── telegram/              ← Telegram 抓取的原始文件（按频道分子目录）
├── downloads/             ← qbittorrent 下载目录
│   ├── complete/          ← 下载完成
│   └── incomplete/        ← 下载中
├── cache/                 ← 加密缓存目录（AES-256，哈希命名）
│   └── {bucket}/{sub}/    ← 按哈希前缀分桶
└── ai_models/             ← AI 模型文件存储
    ├── whisper/           ← Whisper large-v3 模型
    ├── xtts/              ← XTTS-v2 模型
    ├── sd/                ← Stable Diffusion 模型 + LoRA
    ├── ollama/            ← Ollama LLM 模型
    └── manga/             ← 漫画翻译/上色模型
```

2. THE Deploy_Script SHALL 为所有目录设置正确的权限（Docker 容器用户可读写）
3. THE Deploy_Script SHALL 在 `/data/media/` 根目录创建 `pipeline.db`（SQLite 数据库），用于 NAS 端本地任务管理和去重索引

---

### 需求 58: 处理失败重试与错误恢复机制

**用户故事:** 作为星聚平台管理员，我希望 AI 处理失败时能自动重试，且不会丢失已完成的中间步骤。

#### 验收标准

1. THE Task_Scheduler SHALL 为每个处理步骤实现独立的状态持久化：每完成一步，将该步骤状态写入 `pipeline.db`，即使进程崩溃重启也能从上次完成的步骤继续
2. THE Task_Scheduler SHALL 对失败的步骤自动重试最多 3 次，每次重试间隔递增（1 分钟 → 5 分钟 → 30 分钟）
3. IF 某步骤重试 3 次仍失败, THEN THE Task_Scheduler SHALL 跳过该步骤并继续执行后续步骤（降级处理）
4. THE Task_Scheduler SHALL 在管理后台展示每个任务的详细步骤状态：每步的开始时间、结束时间、耗时、状态（pending/running/completed/failed/skipped）和错误信息
5. THE Task_Scheduler SHALL 支持管理员手动重试任意失败的步骤，而不需要重新执行整个流水线
6. WHEN NAS 重启或 Docker 容器重启, THE Task_Scheduler SHALL 自动恢复所有 `running` 状态的任务，从最后完成的步骤继续执行
7. THE Task_Scheduler SHALL 对处理中的临时文件实现自动清理：超过 7 天未完成的 `processing/` 目录自动删除



---

### 需求 59: 视频 AI 自动标签分类

**用户故事:** 作为星聚平台管理员，我希望入库的视频能由 AI 自动打上详细的分类标签（地区/类型/题材/演员特征等），无需人工手动标注。

#### 验收标准

1. WHEN 视频完成去重检测后, THE Content_Tagger SHALL 对视频进行 AI 自动标签分析
2. THE Content_Tagger SHALL 通过以下方式提取标签：
   - 视频画面分析：调用 SD_API 或本地视觉模型识别场景类型（室内/室外/学校/办公室等）、人物特征（人种/性别/体型/发色）、画面风格（动画/实拍/3D）
   - 音频分析：通过 Whisper 识别的字幕文本检测语言（中文/日文/英文/韩文）→ 推断地区
   - 文件名/来源分析：从文件名、来源 URL、Telegram 频道名称中提取关键词匹配标签
   - LLM 综合分析：将视频截图 + 字幕文本 + 文件名发送给本地 LLM（ollama），让 LLM 输出结构化标签 JSON
3. THE Content_Tagger SHALL 为视频输出以下维度的标签：
   - 地区/产地：中国大陆、港台、日本、韩国、欧美、东南亚、印度、拉美、俄罗斯、非洲
   - 视频类型：电影、电视剧、综艺、纪录片、短视频、动漫、MV、直播录像、短剧
   - 画质：4K、1080p、720p、480p（从 ffprobe 元数据直接读取）
   - 语言：中文、日文、英文、韩文、其他
4. THE Content_Tagger SHALL 为 NC-17 级成人视频额外输出以下标签：
   - 题材标签：校园、职场/OL、家庭/人妻、户外、制服、角色扮演、SM/BDSM、群交、同性、变装、老少配、巨乳、贫乳、肛交、口交、颜射、中出、足交、丝袜、按摩、催眠、NTR、痴女、露出、触手、怀孕、母乳等
   - 演员特征：人种（亚洲/白人/黑人/拉丁/混血）、体型（纤细/匀称/丰满/BBW/肌肉）、年龄段（18-20/20-25/25-30/30-40/40+/熟女）、胸部（贫乳/普通/巨乳/超巨乳）
   - 时长分类：短片（<10分钟）、中片（10-30分钟）、长片（30-60分钟）、全片电影（>60分钟）
5. THE Content_Tagger SHALL 将标签结果写入 `content_registry` 表的 `metadata` JSON 字段
6. IF AI 标签置信度低于 50%, THEN THE Content_Tagger SHALL 在管理后台标记为"标签待人工审核"
7. THE Content_Tagger SHALL 支持管理员在后台手动修正 AI 生成的标签

---

### 需求 60: 漫画 AI 自动标签分类

**用户故事:** 作为星聚平台管理员，我希望入库的漫画能由 AI 自动打上分类标签（画风/题材/语言等）。

#### 验收标准

1. WHEN 漫画完成去重检测后, THE Content_Tagger SHALL 对漫画进行 AI 自动标签分析
2. THE Content_Tagger SHALL 通过以下方式提取漫画标签：
   - 封面图像分析：调用视觉模型识别画风（日漫/韩漫/欧美/国漫）、是否黑白/彩色、角色特征
   - OCR 文字语言检测：从 OCR 结果判断原始语言（日文/韩文/英文/中文）
   - 内页内容分析：对前 5 页调用 LLM 视觉分析，识别题材和内容类型
   - 文件名/来源分析：从文件名和来源 URL 提取关键词
3. THE Content_Tagger SHALL 为漫画输出以下维度的标签：
   - 画风：日漫、韩漫（竖屏彩漫）、欧美、国漫、同人志
   - 语言：日文原版、韩文原版、中文翻译、英文翻译
   - 类型：热血、恋爱、搞笑、冒险、奇幻、科幻、悬疑、恐怖、日常、运动
   - 页数分类：短篇（<30页）、中篇（30-100页）、长篇（>100页）
4. THE Content_Tagger SHALL 为 NC-17 级成人漫画额外输出以下标签：
   - 题材：纯爱、后宫、触手、NTR、百合、耽美/BL、校园、奇幻、调教/SM、凌辱、痴女、人妻/熟女、巨乳、贫乳、萝莉风、正太风、怀孕、母乳、催眠、肛交、群交、人外/怪物、全彩、黑白
5. THE Content_Tagger SHALL 将标签结果写入 `content_registry` 表的 `metadata` JSON 字段
6. IF AI 标签置信度低于 50%, THEN THE Content_Tagger SHALL 标记为"标签待人工审核"

---

### 需求 61: 小说 AI 自动标签分类

**用户故事:** 作为星聚平台管理员，我希望入库的小说能由 AI 自动打上分类标签（类型/题材/语言等）。

#### 验收标准

1. WHEN 小说完成去重检测后, THE Content_Tagger SHALL 对小说进行 AI 自动标签分析
2. THE Content_Tagger SHALL 通过以下方式提取小说标签：
   - 文本内容分析：将前 3000 字发送给本地 LLM（ollama），让 LLM 分析题材、风格和内容类型
   - 语言检测：从文本编码和字符分布判断语言
   - 文件名/来源分析：从文件名和来源 URL 提取关键词
3. THE Content_Tagger SHALL 为小说输出以下维度的标签：
   - 类型：玄幻、都市、科幻、历史、言情、武侠、仙侠、悬疑、恐怖、游戏、体育
   - 语言：中文、英文、日文
   - 字数分类：短篇（<5万字）、中篇（5-20万字）、长篇（20-100万字）、超长篇（>100万字）
   - 状态：连载中、已完结
4. THE Content_Tagger SHALL 为 NC-17 级成人小说额外输出以下标签：
   - 题材：纯爱、后宫、NTR、百合、耽美/BL、校园、奇幻、都市、古代/宫廷、科幻、调教/SM、凌辱、人妻、催眠、换妻、群交、人外/怪物、穿越+色情、修仙+色情、末日+色情
5. THE Content_Tagger SHALL 将标签结果写入 `content_registry` 表的 `metadata` JSON 字段
6. IF AI 标签置信度低于 50%, THEN THE Content_Tagger SHALL 标记为"标签待人工审核"

---

### 需求 62: 音频 AI 自动标签分类

**用户故事:** 作为星聚平台管理员，我希望入库的音频能由 AI 自动打上分类标签。

#### 验收标准

1. WHEN 音频完成去重检测后, THE Content_Tagger SHALL 对音频进行自动标签分析
2. THE Content_Tagger SHALL 通过以下方式提取音频标签：
   - ID3 标签提取：从文件元数据读取标题、艺术家、专辑、年份、流派
   - 音频内容分析：调用 Whisper 识别音频中的语言
   - 文件名/来源分析：从文件名和来源 URL 提取关键词
3. THE Content_Tagger SHALL 为音频输出以下维度的标签：
   - 类型：流行、摇滚、电子、古典、说唱、R&B、民谣、爵士、ASMR、广播剧、音声作品、播客
   - 语言：中文、英文、日文、韩文、纯音乐
4. THE Content_Tagger SHALL 为 NC-17 级成人音频额外输出以下标签：
   - 类型：成人ASMR（耳语/舔耳/心跳/呼吸/触发音）、成人广播剧（纯爱/NTR/SM/百合/耽美）、音声作品（催眠/调教/女友体验/姐姐体验）、Explicit歌曲、成人催眠音频、性爱环境音
   - 声优性别：女声、男声、双人、多人
5. THE Content_Tagger SHALL 将标签结果写入 `content_registry` 表的 `metadata` JSON 字段

---

### 需求 63: 性工作者资料 AI 自动标签

**用户故事:** 作为星聚平台管理员，我希望性工作者（服务者）上传的照片和资料能由 AI 自动打上外貌特征和服务类型标签，减少人工标注工作量。

#### 验收标准

1. WHEN 服务者提交个人资料和照片, THE Content_Tagger SHALL 对照片进行 AI 自动标签分析
2. THE Content_Tagger SHALL 通过照片分析提取以下标签：
   - 人种/族裔：亚洲人、白人、黑人、拉丁裔、混血
   - 体型：纤细、匀称、丰满、BBW、健壮
   - 年龄段估计：18-20、20-25、25-30、30-40、40+
   - 胸部特征：贫乳、普通、巨乳、超巨乳
   - 发色：黑发、棕发、金发、红发、彩发
3. THE Content_Tagger SHALL 通过服务者填写的文本描述，使用 LLM 自动提取和标准化服务类型标签：
   - 将自由文本描述映射到结构化服务类型分类（SPA/按摩类、陪伴类、表演类、成人服务类、特殊服务类等）
4. THE Content_Tagger SHALL 将标签结果写入服务者资料的 `tags` 字段
5. THE Content_Tagger SHALL 支持管理员和服务者本人修正 AI 生成的标签
6. THE Content_Tagger SHALL 对照片标签分析在 5 分钟内完成（高优先级任务）

---

### 需求 64: MPAA 分级 AI 自动判定

**用户故事:** 作为星聚平台管理员，我希望 AI 能自动判定入库内容的 MPAA 分级（G/PG/PG-13/R/NC-17），而不仅仅依赖来源频道的预设分级。

#### 验收标准

1. THE Content_Tagger SHALL 在标签分析的同时对内容进行 MPAA 分级判定
2. THE Content_Tagger SHALL 通过以下规则判定视频分级：
   - 画面分析：检测裸露程度、暴力程度、血腥程度
   - 音频分析：检测脏话/粗口频率
   - 来源预设：成人源（Pornhub/nhentai 等）强制 NC-17，不执行 AI 判定
   - LLM 综合判定：将截图+字幕摘要发送给 LLM，输出分级建议
3. THE Content_Tagger SHALL 通过以下规则判定漫画分级：
   - 画面分析：检测裸露/色情/暴力内容
   - 来源预设：成人漫画源强制 NC-17
4. THE Content_Tagger SHALL 通过以下规则判定小说分级：
   - 文本分析：检测色情描写、暴力描写、脏话频率
   - 关键词匹配：成人关键词密度超过阈值 → NC-17
5. THE Content_Tagger SHALL 将 AI 判定的分级与来源预设分级比较，取更严格的分级作为最终结果
6. IF AI 判定分级与来源预设分级不一致, THEN THE Content_Tagger SHALL 在管理后台标记为"分级待人工审核"
7. THE Content_Tagger SHALL 将最终分级写入 `content_registry` 表的 `mpaa_rating` 字段


---

## 附录 B: Unraid 7.2.4 自动化部署完整规范

---

### 需求 65: Unraid 7.2.4 系统初始化自动化

**用户故事:** 作为 NAS 用户，我希望部署脚本能自动完成 Unraid 7.2.4 系统的所有初始化配置，包括插件安装、Docker 引擎配置、网络设置等，我只需要运行一个脚本。

#### 验收标准

1. THE Deploy_Script SHALL 在 Unraid 7.2.4 系统上以 bash 脚本形式运行，入口为 `deploy.sh`，用户只需执行 `bash deploy.sh` 即可开始全自动部署
2. THE Deploy_Script SHALL 在开始前检测 Unraid 版本（`cat /etc/unraid-version`），确认为 7.x 系列
3. THE Deploy_Script SHALL 自动安装以下 Unraid 插件（通过 `plugin install` CLI 命令）：
   - Community Applications（CA）插件：`https://raw.githubusercontent.com/Squidly271/community.applications/master/plugins/community.applications.plg`
   - Nvidia Driver 插件（ich777）：用于 Docker 容器 GPU 直通
   - User Scripts 插件：用于定时任务和开机自启脚本
   - Dynamix File Manager 插件：文件管理
   - Unassigned Devices 插件：外部设备管理
4. THE Deploy_Script SHALL 等待每个插件安装完成后再继续下一步（检查 `/var/log/plugins/` 日志）
5. THE Deploy_Script SHALL 配置 Unraid 的 Docker 引擎设置：
   - Docker 存储路径：`/mnt/user/appdata/`
   - Docker 镜像存储：使用 btrfs 或 xfs 格式的 docker.img
   - 启用 Docker 服务自动启动
6. THE Deploy_Script SHALL 使用 Unraid 7.2+ 内置 API（`unraid-api`）进行系统配置（如可用），回退到直接编辑配置文件
7. IF 某个插件安装失败, THEN THE Deploy_Script SHALL 记录错误并尝试从备用 URL 安装，最终在报告中列出失败项

---

### 需求 66: Docker 镜像加速与断点续传

**用户故事:** 作为中国大陆用户，我希望部署脚本能配置多个 Docker 镜像加速源，并在拉取大镜像时支持断点续传，避免因网络不稳定导致重新下载。

#### 验收标准

1. THE Deploy_Script SHALL 修改 Unraid 的 Docker daemon 配置文件（`/etc/docker/daemon.json`），添加以下镜像加速源：
   ```json
   {
     "registry-mirrors": [
       "https://xuanyuan.cloud/free",
       "https://docker.aityp.com",
       "https://1ms.run",
       "https://docker.m.daocloud.io"
     ]
   }
   ```
2. THE Deploy_Script SHALL 在修改 daemon.json 后重启 Docker 服务（`/etc/rc.d/rc.docker restart`）
3. THE Deploy_Script SHALL 将 daemon.json 配置写入 Unraid 的持久化目录（`/boot/config/docker/daemon.json`），确保重启后配置不丢失
4. THE Deploy_Script SHALL 实现镜像拉取断点续传方案：
   - 首先尝试 `docker pull`（利用 Docker 自身的层缓存机制）
   - 如果 `docker pull` 失败（超时/网络中断），等待 30 秒后自动重试（最多 5 次）
   - 如果所有镜像源的 `docker pull` 均失败，使用 `skopeo copy` 作为最终回退
   - `skopeo copy` 支持断点续传（`--src-tls-verify=false` + 重试机制）
5. THE Deploy_Script SHALL 在拉取每个镜像前检查本地是否已存在该镜像（`docker image inspect`），已存在则跳过
6. THE Deploy_Script SHALL 安装 `skopeo` 工具（如未安装）：从 GitHub Releases 下载静态编译版本到 `/usr/local/bin/`
7. THE Deploy_Script SHALL 记录每个镜像的拉取源、耗时和文件大小到部署日志

---

### 需求 67: NVIDIA GPU 驱动与 Docker GPU 直通自动配置

**用户故事:** 作为 NAS 用户，我希望部署脚本能自动安装 NVIDIA 驱动并配置 Docker 容器的 GPU 直通，无需我手动操作 Unraid WebGUI。

#### 验收标准

1. THE Deploy_Script SHALL 检测系统中的 NVIDIA GPU（`lspci | grep -i nvidia`）
2. THE Deploy_Script SHALL 通过 Unraid 的 Nvidia Driver 插件（ich777）自动安装匹配的 NVIDIA 驱动
3. THE Deploy_Script SHALL 等待驱动安装完成并验证（`nvidia-smi` 输出正常）
4. THE Deploy_Script SHALL 配置 Docker 的 NVIDIA runtime：
   - 在 `/etc/docker/daemon.json` 中添加 `"runtimes": {"nvidia": {"path": "nvidia-container-runtime", "runtimeArgs": []}}`
   - 设置 `"default-runtime": "nvidia"`（或在需要 GPU 的容器中单独指定 `--runtime=nvidia`）
5. THE Deploy_Script SHALL 为需要 GPU 的容器配置环境变量：
   - `NVIDIA_VISIBLE_DEVICES=all`
   - `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`
6. THE Deploy_Script SHALL 验证 GPU 直通成功：在测试容器中运行 `nvidia-smi` 并检查输出
7. IF 系统未检测到 NVIDIA GPU, THEN THE Deploy_Script SHALL 输出警告"未检测到 NVIDIA GPU，AI 容器将以 CPU 模式运行"并跳过 GPU 配置
8. THE Deploy_Script SHALL 配置 GPU 持久化模式（`nvidia-smi -pm 1`），避免 GPU 空闲时进入低功耗状态导致首次推理延迟

---

### 需求 68: Unraid 阵列与共享文件夹自动配置

**用户故事:** 作为 NAS 用户，我希望部署脚本能自动创建所需的共享文件夹和目录结构，无需我在 WebGUI 中手动操作。

#### 验收标准

1. THE Deploy_Script SHALL 检查 Unraid 阵列是否已启动（`/proc/mdcmd` 状态检查），未启动则提示用户先在 WebGUI 中启动阵列
2. THE Deploy_Script SHALL 在 `/mnt/user/` 下创建以下共享文件夹（如不存在）：
   - `media` — 媒体文件主目录
   - `appdata` — Docker 容器配置数据
   - `downloads` — 下载目录
3. THE Deploy_Script SHALL 在 `/mnt/user/media/` 下创建完整的目录结构（需求 57 定义的所有子目录）
4. THE Deploy_Script SHALL 设置正确的文件权限：`chmod -R 777 /mnt/user/media/`（Docker 容器需要读写权限）
5. THE Deploy_Script SHALL 创建 `/mnt/user/appdata/starhub/` 目录用于存放所有星聚相关容器的配置数据
6. THE Deploy_Script SHALL 在 `/mnt/user/appdata/starhub/` 下初始化 `pipeline.db`（执行 schema.sql）

---

### 需求 69: 网络安全自动配置（防火墙/DNS/MAC）

**用户故事:** 作为 NAS 用户，我希望部署脚本能自动配置所有网络安全设置，确保 NAS 的真实 IP 永远不暴露。

#### 验收标准

1. THE Deploy_Script SHALL 配置 iptables 防火墙规则：
   - 默认策略：INPUT DROP, FORWARD DROP, OUTPUT ACCEPT
   - 允许已建立的连接回包：`-A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT`
   - 允许本地回环：`-A INPUT -i lo -j ACCEPT`
   - 允许 Unraid WebGUI 本地访问（仅局域网 IP 段）：`-A INPUT -s 192.168.0.0/16 -p tcp --dport 80 -j ACCEPT` 和 443 端口
   - 允许 SSH 本地访问（仅局域网）：`-A INPUT -s 192.168.0.0/16 -p tcp --dport 22 -j ACCEPT`
2. THE Deploy_Script SHALL 将防火墙规则写入 Unraid 的开机自启脚本（`/boot/config/go`），确保重启后生效
3. THE Deploy_Script SHALL 配置 DNS-over-HTTPS：
   - 使用 cloudflared 的 DNS 代理功能：`cloudflared proxy-dns --port 5053 --upstream https://1.1.1.1/dns-query`
   - 修改 `/etc/resolv.conf` 指向 `127.0.0.1:5053`
   - 将 DNS 配置写入持久化目录
4. THE Deploy_Script SHALL 配置网络接口 MAC 地址随机化：
   - 生成随机 MAC 地址并写入 Unraid 网络配置
   - 每次系统启动时生成新的随机 MAC
5. THE Deploy_Script SHALL 禁用 Unraid 的 UPnP 和 DLNA 服务（如已启用），避免被局域网设备发现

---

### 需求 70: Cloudflare Tunnel 自动配置

**用户故事:** 作为 NAS 用户，我希望部署脚本能引导我完成 Cloudflare Tunnel 配置，并自动部署 cloudflared 容器。

#### 验收标准

1. THE Deploy_Script SHALL 交互式引导用户输入 Cloudflare Tunnel Token（从 Cloudflare Zero Trust Dashboard 获取）
2. THE Deploy_Script SHALL 将 Tunnel Token 安全存储到 `/boot/config/starhub/tunnel-token`（Unraid 持久化目录）
3. THE Deploy_Script SHALL 部署 cloudflared Docker 容器，使用提供的 Token 连接到 Cloudflare
4. THE Deploy_Script SHALL 验证 Tunnel 连接成功（检查 cloudflared 容器日志中的 "Connection registered" 消息）
5. THE Deploy_Script SHALL 配置 cloudflared 的 ingress 规则，将以下服务映射到 Tunnel：
   - `nas-media-server` (127.0.0.1:8765) → 媒体文件访问
   - `task-scheduler` (127.0.0.1:8000) → 管理 API
6. IF Tunnel Token 未提供, THEN THE Deploy_Script SHALL 输出详细的获取 Token 步骤说明并暂停等待用户输入

---

### 需求 71: AI 模型自动下载与预热

**用户故事:** 作为 NAS 用户，我希望部署脚本能自动下载所有需要的 AI 模型文件，避免首次使用时长时间等待。

#### 验收标准

1. THE Deploy_Script SHALL 在 GPU 配置完成后自动下载以下 AI 模型到 `/mnt/user/appdata/starhub/ai_models/`：
   - Whisper large-v3 模型（约 3GB）：通过 whisper-api 容器启动时自动下载，或预先下载到挂载目录
   - XTTS-v2 模型（约 2GB）：通过 xtts-api 容器启动时自动下载
   - Stable Diffusion 1.5 基础模型（约 4GB）：下载到 sd-api 的 models 目录
   - 漫画上色专用 LoRA（约 500MB）：下载到 sd-api 的 lora 目录
   - NSFW 专用模型/LoRA（约 2GB）：用于成人内容 CG 生成
   - Ollama LLM 模型（如 llama3.2 或 qwen2.5，约 4-8GB）：通过 `ollama pull` 命令下载
2. THE Deploy_Script SHALL 支持从多个下载源获取模型（HuggingFace 镜像站 / 国内镜像 / 直链），自动选择最快的源
3. THE Deploy_Script SHALL 在模型下载完成后执行预热测试：
   - Whisper：用 5 秒测试音频执行一次推理
   - SD：生成一张 512x512 测试图片
   - Ollama：执行一次简单的文本生成
   - XTTS：生成一段 3 秒测试语音
4. THE Deploy_Script SHALL 显示每个模型的下载进度和预计剩余时间
5. IF 模型下载失败, THEN THE Deploy_Script SHALL 记录错误并在报告中标注"模型 X 下载失败，首次使用该功能时将自动下载"

---

### 需求 72: 开机自启与服务监控自动配置

**用户故事:** 作为 NAS 用户，我希望 NAS 重启后所有服务能自动启动，且有异常时能自动恢复。

#### 验收标准

1. THE Deploy_Script SHALL 将所有 Docker 容器配置为 `--restart=unless-stopped`，确保 Docker 服务启动后容器自动恢复
2. THE Deploy_Script SHALL 在 Unraid 的开机脚本（`/boot/config/go`）中添加以下启动项：
   - 防火墙规则加载
   - DNS-over-HTTPS 启动
   - MAC 地址随机化
   - Docker daemon.json 配置恢复（从持久化目录复制到 `/etc/docker/`）
3. THE Deploy_Script SHALL 创建 Unraid User Script 定时任务：
   - 每 5 分钟健康检查：检测所有容器运行状态，异常容器自动重启
   - 每天凌晨 3 点：清理 Docker 悬空镜像和未使用的卷（`docker system prune -f`）
   - 每周日凌晨 4 点：pipeline.db 备份到 `/boot/config/starhub/backups/`
4. THE Deploy_Script SHALL 配置 Docker 日志轮转（`--log-opt max-size=50m --log-opt max-file=3`），防止日志占满磁盘
5. THE Deploy_Script SHALL 在 Unraid 的通知系统中配置告警：容器异常停止时发送通知

---

### 需求 73: 部署后验证与状态报告

**用户故事:** 作为 NAS 用户，我希望部署完成后能看到一份清晰的状态报告，知道哪些成功了、哪些失败了、接下来该做什么。

#### 验收标准

1. THE Deploy_Script SHALL 在所有步骤完成后输出彩色终端报告，包含：
   - 系统信息：Unraid 版本、CPU、RAM、GPU、磁盘空间
   - 插件安装状态：每个插件的安装结果（成功/失败）
   - Docker 容器状态：每个容器的运行状态、端口、GPU 分配
   - 网络安全状态：防火墙规则数、DNS 配置、MAC 随机化状态
   - Cloudflare Tunnel 状态：连接状态、映射的服务
   - AI 模型状态：每个模型的下载状态和预热测试结果
   - GPU 状态：nvidia-smi 输出摘要
   - 磁盘使用：各目录占用空间
2. THE Deploy_Script SHALL 将完整报告保存到 `/boot/config/starhub/deploy-report-{timestamp}.txt`
3. THE Deploy_Script SHALL 在报告末尾列出"接下来的步骤"：
   - 如何访问管理后台
   - 如何添加 Telegram 频道
   - 如何配置刮削源
   - 如何查看 AI 处理队列
4. IF 有任何步骤失败, THEN THE Deploy_Script SHALL 在报告中用红色标注失败项，并提供修复建议


---

## 附录 C: NAS 智能体与私有网盘

---

### 需求 74: NAS 自主 AI 代理（智能体核心）

**用户故事:** 作为星聚平台运营者，我希望 NAS 本身就是一个 AI 智能体，能自主决策下载什么内容、处理什么优先、优化什么配置，而不是被动等待我的指令。

#### 验收标准

1. THE NAS_Agent SHALL 作为一个持续运行的 AI 代理服务（Docker 容器），每 30 分钟执行一轮自主决策循环
2. THE NAS_Agent SHALL 在每轮决策循环中分析以下数据源：
   - 平台用户行为数据：搜索热词、播放量排行、收藏趋势、追番列表（通过 Tunnel 从平台 API 获取）
   - NAS 本地内容库：已有内容的类型/标签/分级分布、缺失的热门内容
   - AI 处理队列状态：待处理任务数、GPU 使用率、预计完成时间
   - 系统资源状态：CPU/RAM/GPU/磁盘使用率、网络带宽使用量
   - 外部内容源状态：各刮削源的最新内容列表、Telegram 频道更新
3. THE NAS_Agent SHALL 基于分析结果自主做出以下决策：
   - **内容获取决策**：自动添加下载任务（用户搜索了但本地没有的内容、热门趋势内容、追番新集）
   - **处理优先级决策**：自动调整 AI 处理队列优先级（热门内容优先处理、用户正在等待的内容紧急处理）
   - **存储优化决策**：自动清理低访问量的过期内容、压缩不常用的文件、调整缓存策略
   - **系统优化决策**：根据负载自动调整带宽调度规则、GPU 任务超时时间、容器资源分配
   - **内容推荐决策**：根据用户画像生成个性化推荐列表，预缓存可能被访问的内容
4. THE NAS_Agent SHALL 调用本地 ollama LLM 进行决策推理，输入为结构化的系统状态 JSON，输出为决策动作列表 JSON
5. THE NAS_Agent SHALL 将每轮决策的输入、推理过程和输出记录到 `pipeline.db` 的 `agent_decisions` 表，支持管理员审计
6. THE NAS_Agent SHALL 对高风险决策（删除文件、修改系统配置）需要管理员确认后才执行，低风险决策（调整优先级、添加下载）自动执行
7. THE NAS_Agent SHALL 在管理后台展示 AI 代理的决策日志、当前状态和下一轮决策预告

---

### 需求 75: AI 代理自动内容发现与获取

**用户故事:** 作为星聚平台运营者，我希望 NAS AI 代理能自动发现用户想要但本地没有的内容，并自动下载。

#### 验收标准

1. THE NAS_Agent SHALL 每小时分析平台用户的搜索日志，提取搜索了但返回 0 结果的关键词列表
2. THE NAS_Agent SHALL 将这些"未满足搜索"关键词发送给各刮削源适配器，尝试从外部源找到匹配内容
3. WHEN 找到匹配内容, THE NAS_Agent SHALL 自动创建下载任务，优先级设为"高"（用户主动搜索的内容）
4. THE NAS_Agent SHALL 分析用户追番/追剧列表，在新集发布后 1 小时内自动触发下载
5. THE NAS_Agent SHALL 分析各平台的热门排行榜（B站热门、YouTube趋势、Pornhub热门等），自动预缓存 Top 50 内容
6. THE NAS_Agent SHALL 学习用户偏好模式：如果某类型内容（如日本AV/韩漫/玄幻小说）被频繁搜索，自动增加该类型的刮削频率和数量
7. THE NAS_Agent SHALL 在每日带宽低谷期（凌晨）集中执行大批量下载任务

---

### 需求 76: AI 代理自愈与异常处理

**用户故事:** 作为 NAS 用户，我希望 NAS AI 代理能自动发现系统异常并尝试修复，无需我手动干预。

#### 验收标准

1. THE NAS_Agent SHALL 每 5 分钟执行一次系统健康巡检：
   - 检查所有 Docker 容器运行状态，异常停止的自动重启
   - 检查 GPU 是否响应（`nvidia-smi`），无响应则重启 GPU 相关容器
   - 检查磁盘空间，低于 10% 时自动触发存储清理（删除 duplicates/ 和 failed/ 目录中超过 7 天的文件）
   - 检查 Cloudflare Tunnel 连接状态，断开则自动重启 cloudflared
   - 检查 Redis 连接状态，断开则重启 Redis 和 task-scheduler
   - 检查 pipeline.db 完整性（`PRAGMA integrity_check`）
2. THE NAS_Agent SHALL 对检测到的异常自动执行修复操作，并记录到 `agent_actions` 表
3. THE NAS_Agent SHALL 对同一异常连续出现 3 次以上的情况升级告警：通过 Telegram Bot 通知管理员
4. THE NAS_Agent SHALL 在管理后台展示系统健康状态仪表盘：绿色（正常）/黄色（警告）/红色（异常）
5. THE NAS_Agent SHALL 支持管理员配置告警规则：哪些异常需要通知、通知方式（Telegram/邮件）

---

### 需求 77: AI 代理智能存储管理

**用户故事:** 作为 NAS 用户，我希望 AI 代理能智能管理存储空间，自动清理不需要的内容，确保磁盘不会满。

#### 验收标准

1. THE NAS_Agent SHALL 维护每个内容的"价值评分"，基于：最近访问时间、总访问次数、用户收藏数、内容分级、文件大小
2. WHEN 磁盘使用率超过 85%, THE NAS_Agent SHALL 自动执行存储清理：
   - 第一轮：删除 duplicates/ 和 failed/ 目录中的所有文件
   - 第二轮：删除 processing/ 中超过 3 天的临时文件
   - 第三轮：删除价值评分最低的 10% 内容（保留元数据，删除文件，标记为"已清理，可重新下载"）
3. THE NAS_Agent SHALL 对即将被清理的内容在管理后台展示预览，高风险清理（删除用户收藏的内容）需要管理员确认
4. THE NAS_Agent SHALL 自动将高访问量内容的缩略图/预览图保留在快速存储（SSD 缓存），低访问量内容移到慢速存储（HDD 阵列）
5. THE NAS_Agent SHALL 每周生成存储分析报告：各类型内容占比、增长趋势、预计磁盘满时间

---

### 需求 78: 私有网盘功能

**用户故事:** 作为星聚用户，我希望平台提供私有网盘功能，可以通过手机/电脑随时上传、下载和管理我的个人文件。

#### 验收标准

1. THE NAS_Media_Server SHALL 提供私有网盘 API，支持文件上传、下载、删除、重命名、移动、创建文件夹
2. THE 私有网盘 SHALL 为每个注册用户分配独立的存储空间（默认 10GB，管理员可调整），存储在 NAS 本地 `/mnt/user/media/cloud/{user_id}/`
3. THE 私有网盘 SHALL 支持通过星聚平台前端的"我的网盘"页面管理文件：
   - 文件列表（支持列表/网格视图）
   - 文件上传（支持拖拽上传、多文件上传、大文件分片上传）
   - 文件下载（支持单文件下载和文件夹打包下载）
   - 文件预览（图片/视频/音频/PDF/文本在线预览）
   - 文件分享（生成分享链接，可设置密码和过期时间）
4. THE 私有网盘 SHALL 支持 WebDAV 协议，用户可通过第三方文件管理器（如 ES 文件浏览器、Solid Explorer）访问
5. THE 私有网盘 SHALL 所有文件通过 Cloudflare Tunnel 传输，NAS IP 不暴露
6. THE 私有网盘 SHALL 对上传的文件使用 AES-256 加密存储
7. THE 私有网盘 SHALL 支持文件版本历史（保留最近 5 个版本）
8. WHEN 用户上传视频/音乐/漫画/小说到网盘, THE NAS_Agent SHALL 询问用户是否将该内容加入平台公共库（需管理员审核）

---

### 需求 79: 私有网盘前端页面

**用户故事:** 作为星聚用户，我希望在平台内有一个类似百度网盘的文件管理界面。

#### 验收标准

1. THE 前端 SHALL 在 `src/app/cloud/page.tsx` 创建"我的网盘"页面
2. THE 页面 SHALL 展示文件树导航（左侧）和文件列表（右侧）
3. THE 页面 SHALL 支持拖拽上传文件，显示上传进度条
4. THE 页面 SHALL 支持文件右键菜单：下载、重命名、移动、删除、分享、查看详情
5. THE 页面 SHALL 支持文件搜索（按文件名搜索）
6. THE 页面 SHALL 展示存储空间使用情况（已用/总量进度条）
7. THE 页面 SHALL 支持图片缩略图预览、视频在线播放、音频在线播放、PDF/文本在线查看
8. THE 页面 SHALL 遵循深色主题（#0f0f0f 背景、#3ea6ff 主色），SVG 图标（Lucide React）


---

## 附录 D: 系统平台变更（Unraid → Debian 13）与新增功能

---

### 需求 80: 目标系统平台 — Debian 13 "Trixie" 无桌面

**用户故事:** 作为 NAS 用户，我希望系统运行在最新稳定的 Linux 发行版上，拥有完整的工具链和最新内核，无需第三方插件补全缺失工具。

#### 验收标准

1. THE Deploy_Script SHALL 目标系统为 Debian 13 "Trixie"（2025-08-09 发布，内核 6.12 LTS），使用 netinst 最小安装（无桌面环境）
2. THE Deploy_Script SHALL 在部署开始时检测系统版本（`cat /etc/debian_version`），确认为 Debian 13.x
3. THE Deploy_Script SHALL 使用 `apt` 包管理器安装所有依赖，不依赖任何第三方插件系统：
   - 基础工具：`git curl wget htop iotop tmux vim nano jq unzip p7zip-full`
   - Python：`python3 python3-pip python3-venv`
   - Node.js：通过 NodeSource 仓库安装 Node.js 20 LTS + npm
   - Docker：通过 Docker 官方仓库安装 `docker-ce docker-ce-cli containerd.io docker-compose-plugin`
   - NVIDIA：`nvidia-driver nvidia-container-toolkit`（从 non-free-firmware 仓库）
   - 存储：`mergerfs snapraid smartmontools hdparm`
   - 备份：`borgbackup`
   - 网络：`cloudflared iptables-persistent ufw`
   - 监控：`cockpit`（可选 Web 管理面板）
4. THE Deploy_Script SHALL 配置 apt 源为国内镜像（清华/中科大/阿里云），加速软件包下载
5. 所有安装的软件包在系统重启后自动保持，无需持久化 hack

---

### 需求 81: 硬件配置规范

**用户故事:** 作为 NAS 用户，我需要明确的硬件配置推荐，确保系统省电又能满足 AI 推理需求。

#### 验收标准

1. THE 推荐硬件配置 SHALL 为：
   - CPU：Intel i5-12400（6C12T，PBP 65W，待机 < 12W）
   - 主板：B660M M-ATX（PCIe x16 + 4+ SATA + 2x M.2）
   - 内存：64GB DDR4（2x32GB）
   - GPU：NVIDIA RTX 3090 24GB（AI 推理专用）
   - 系统盘：512GB NVMe SSD（Debian + Docker + pipeline.db）
   - 缓存盘：1TB NVMe SSD（AI 临时文件 + 热门内容缓存）
   - 存储盘：用户现有 HDD（mergerfs 合并）
   - 电源：650W 80Plus 金牌
2. THE Deploy_Script SHALL 在部署时检测硬件是否满足最低要求：CPU >= 4 核、RAM >= 32GB、磁盘 >= 200GB 可用、NVIDIA GPU（推荐）
3. THE Deploy_Script SHALL 配置以下省电优化：
   - GPU 空闲时进入 P8 低功耗状态（`nvidia-smi -pm 0`）
   - HDD 不访问时自动休眠（`hdparm -S 120`，10 分钟无访问停转）
   - CPU C-state 深度休眠（BIOS 启用 C6/C8/C10）
   - 目标待机功耗：35-45W（含 GPU 空闲）

---

### 需求 82: 存储管理 — mergerfs + snapraid

**用户故事:** 作为 NAS 用户，我希望能像 Unraid 一样灵活管理多块不同大小的硬盘，随时加盘，且有数据保护。

#### 验收标准

1. THE Deploy_Script SHALL 安装并配置 mergerfs，将所有数据盘合并为一个统一挂载点 `/mnt/storage/`
2. THE Deploy_Script SHALL 配置 mergerfs 策略为 `mfs`（most free space），新文件写入剩余空间最多的盘
3. THE Deploy_Script SHALL 安装并配置 snapraid，使用一块校验盘保护数据（类似 Unraid 的 parity）
4. THE Deploy_Script SHALL 创建 snapraid 定时任务：每天凌晨 2 点自动执行 `snapraid sync`
5. THE Deploy_Script SHALL 配置 smartmontools 监控所有硬盘健康状态，异常时通知管理员
6. THE Deploy_Script SHALL 支持用户后续添加新硬盘：只需格式化、挂载、添加到 mergerfs 配置即可
7. THE Deploy_Script SHALL 将 `/mnt/storage/` 作为所有媒体文件的根目录（替代之前的 `/data/media/` 和 `/mnt/user/media/`）

---

### 需求 83: 自动备份系统 — BorgBackup

**用户故事:** 作为 NAS 用户，我希望系统能自动备份重要数据（配置文件、数据库、Docker 配置），且备份是增量的、加密的、可恢复的。

#### 验收标准

1. THE Deploy_Script SHALL 安装 BorgBackup 并初始化加密备份仓库（`borg init --encryption=repokey`）
2. THE Deploy_Script SHALL 配置每日自动备份以下内容：
   - `pipeline.db`（SQLite 数据库）
   - `/etc/docker/`（Docker 配置）
   - Docker 容器的配置卷（`/var/lib/docker/volumes/starhub-*/`）
   - `/etc/mergerfs/`、`/etc/snapraid.conf`（存储配置）
   - `/etc/iptables/`（防火墙规则）
   - Cloudflare Tunnel 凭证
   - 部署脚本和配置文件
3. THE BorgBackup SHALL 使用增量备份（仅备份变化的数据块），节省存储空间
4. THE BorgBackup SHALL 对备份数据使用 AES-256 加密
5. THE Deploy_Script SHALL 配置备份保留策略：保留最近 7 天的每日备份 + 最近 4 周的每周备份 + 最近 6 个月的每月备份
6. THE Deploy_Script SHALL 将备份存储到独立的备份盘（不在 mergerfs 池中）或远程位置
7. THE Deploy_Script SHALL 创建备份恢复脚本 `restore.sh`，支持一键恢复到指定时间点

---

### 需求 84: 手机端管理 — PWA + 响应式管理后台

**用户故事:** 作为 NAS 用户，我希望通过手机随时随地管理 NAS，查看系统状态、AI 处理进度、存储使用情况。

#### 验收标准

1. THE 星聚管理后台 SHALL 完全支持移动端响应式布局，在手机浏览器中提供完整的管理功能
2. THE 星聚管理后台 SHALL 支持 PWA（Progressive Web App）安装，用户可将管理后台添加到手机桌面作为独立 APP
3. THE PWA SHALL 配置 `manifest.json`：应用名称"星聚管理"、主题色 #0f0f0f、图标、启动画面
4. THE 手机端管理界面 SHALL 提供以下功能：
   - 系统状态仪表盘：CPU/RAM/GPU/磁盘使用率、网络流量、容器状态
   - AI 处理队列：查看进度、重试失败任务、调整优先级
   - 存储管理：查看各盘使用情况、触发清理
   - 通知中心：系统告警、处理完成通知、异常通知
   - 快捷操作：重启容器、触发备份、触发刮削
5. THE 手机端 SHALL 支持推送通知（通过 Telegram Bot 或 Web Push API），系统异常时实时推送到手机
6. THE 手机端 SHALL 通过 Cloudflare Tunnel 安全访问，无需暴露 NAS 端口

---

### 需求 85: Web 桌面 UI（飞牛风格）

**用户故事:** 作为 NAS 用户，我希望管理后台有一个类似飞牛 fnOS 的 Web 桌面界面，有桌面图标、可拖拽窗口、任务栏，而不是传统的列表式管理页面。

#### 验收标准

1. THE 星聚管理后台 SHALL 提供一个 Web 桌面环境，包含：
   - 桌面背景（可自定义壁纸，默认深色主题）
   - 桌面图标（每个管理功能一个图标：文件管理、AI 队列、系统监控、Docker 管理、存储管理、网络设置、备份管理、Telegram 管理、刮削管理、龙虾 AI、终端）
   - 可拖拽、可缩放的浮动窗口（点击桌面图标打开对应功能窗口）
   - 底部任务栏（显示已打开的窗口列表、系统时间、CPU/RAM/GPU 实时状态指示器）
   - 右键菜单（桌面右键：刷新、设置壁纸、系统信息）
2. THE Web 桌面 SHALL 使用 React + Tailwind CSS 实现，集成到星聚平台的 `/admin/desktop` 路由
3. THE 窗口系统 SHALL 支持：
   - 窗口拖拽移动
   - 窗口缩放（拖拽边角）
   - 窗口最小化（收到任务栏）
   - 窗口最大化（全屏）
   - 窗口关闭
   - 多窗口层叠（z-index 管理，点击窗口置顶）
4. THE Web 桌面 SHALL 内置以下应用窗口：
   - 文件管理器（私有网盘 UI，类似 Windows 资源管理器）
   - 系统监控（实时 CPU/RAM/GPU/磁盘/网络图表）
   - Docker 管理（容器列表、启动/停止/重启/日志查看）
   - AI 队列管理（任务列表、进度、GPU 状态）
   - 终端（Web 终端，通过 WebSocket 连接到 NAS 的 bash shell）
   - 存储管理（mergerfs 池状态、各盘使用情况、snapraid 状态）
   - 备份管理（备份历史、手动触发备份/恢复）
   - 设置（系统配置、网络配置、用户管理）
5. THE Web 桌面 SHALL 遵循深色主题（#0f0f0f 背景、#3ea6ff 主色），所有图标使用 SVG（Lucide React）
6. THE Web 桌面 SHALL 在移动端自动切换为传统列表式布局（手机屏幕太小不适合桌面模式）
7. THE Web 桌面 SHALL 支持键盘快捷键：`Ctrl+Alt+T` 打开终端、`Ctrl+Alt+M` 打开系统监控

---

### 需求 86: 开机自启与服务管理（Debian systemd）

**用户故事:** 作为 NAS 用户，我希望 NAS 重启后所有服务自动启动，使用 Debian 原生的 systemd 管理。

#### 验收标准

1. THE Deploy_Script SHALL 使用 systemd 管理所有服务的自启动，不依赖 /boot/config/go 等 hack
2. THE Deploy_Script SHALL 创建以下 systemd 服务单元：
   - `starhub-docker.service` — 确保 Docker 启动后自动恢复所有容器
   - `starhub-firewall.service` — 开机加载防火墙规则
   - `starhub-dns.service` — 启动 DNS-over-HTTPS
   - `starhub-backup.timer` — 每日自动备份定时器
   - `starhub-snapraid.timer` — 每日 snapraid sync 定时器
   - `starhub-health.timer` — 每 5 分钟健康检查定时器
   - `starhub-cleanup.timer` — 每周清理 Docker 悬空镜像
3. THE Deploy_Script SHALL 配置所有 Docker 容器为 `--restart=unless-stopped`
4. THE Deploy_Script SHALL 配置 Docker 日志轮转（`/etc/docker/daemon.json` 中 `log-opts`）
5. THE Deploy_Script SHALL 配置 systemd-journald 日志大小限制（`SystemMaxUse=500M`）


---

### 需求 87: AI 代理持续学习 — 知识库自动更新

**用户故事:** 作为 NAS 用户，我希望 AI 代理能 24 小时自动从网络上学习最新的技术知识、内容源信息和系统优化方案，保持知识库始终最新。

#### 验收标准

1. THE NAS_Agent SHALL 每 6 小时执行一轮知识更新循环，从以下来源获取最新信息：
   - GitHub Trending：发现新的开源工具和 Docker 镜像
   - Docker Hub：检查已使用镜像的新版本
   - Debian 安全公告：检查系统安全更新
   - NVIDIA 驱动更新：检查 GPU 驱动新版本
   - 技术博客/RSS：订阅 AI/NAS/Docker 相关技术博客，获取最新教程和最佳实践
   - 内容源网站：检查已配置的刮削源是否有新的 API 变更或域名变更
2. THE NAS_Agent SHALL 将获取的信息通过 LLM 总结为结构化知识条目，存储到 `pipeline.db` 的 `knowledge_base` 表
3. THE NAS_Agent SHALL 在做决策时参考知识库（RAG 模式）：将当前问题 + 相关知识条目一起发送给 LLM
4. THE NAS_Agent SHALL 在管理后台展示知识库更新日志：最近学到了什么、知识条目总数、最后更新时间

---

### 需求 88: AI 代理自动系统维护

**用户故事:** 作为 NAS 用户，我希望 AI 代理能自动维护系统，包括更新软件、优化配置、清理垃圾。

#### 验收标准

1. THE NAS_Agent SHALL 每周自动检查并执行以下维护任务：
   - Docker 镜像更新：检查所有容器是否有新版本，低风险镜像（非核心服务）自动更新，核心服务（task-scheduler/media-server）通知管理员确认后更新
   - Debian 安全补丁：自动安装安全更新（`apt upgrade -y` 仅安全更新）
   - NVIDIA 驱动更新：检测新版本，通知管理员确认后更新（驱动更新有风险）
   - 日志清理：清理超过 30 天的日志文件
   - Docker 清理：删除悬空镜像、未使用的网络和卷
   - 临时文件清理：清理 processing/ 中超过 7 天的文件
2. THE NAS_Agent SHALL 在执行任何更新前创建 BorgBackup 快照，确保可回滚
3. THE NAS_Agent SHALL 记录所有维护操作到 `agent_maintenance` 表，包含操作类型、执行时间、结果和回滚命令
4. THE NAS_Agent SHALL 在维护操作失败时自动回滚到上一个备份快照

---

### 需求 89: AI 代理自动配置优化

**用户故事:** 作为 NAS 用户，我希望 AI 代理能根据实际使用情况自动优化系统配置参数。

#### 验收标准

1. THE NAS_Agent SHALL 每天分析以下指标并自动调整配置：
   - GPU 任务队列等待时间 → 调整 GPU 超时时间和优先级权重
   - 磁盘 I/O 等待时间 → 调整 HDD 休眠策略和缓存策略
   - 网络带宽使用模式 → 调整带宽调度规则（白天/夜间分配）
   - 内容访问热度分布 → 调整 SSD 缓存中的热门内容列表
   - AI 处理成功率 → 调整重试次数和超时时间
   - 存储增长速度 → 预测磁盘满时间，提前建议扩容
2. THE NAS_Agent SHALL 将配置调整记录到 `agent_config_changes` 表，支持管理员审计和回滚
3. THE NAS_Agent SHALL 对每次配置调整进行 A/B 测试：调整后观察 24 小时，如果指标恶化则自动回滚

---

### 需求 90: AI 代理硬件建议（非自动购买）

**用户故事:** 作为 NAS 用户，我希望 AI 代理能根据系统负载和存储趋势，主动建议我需要购买什么硬件。

#### 验收标准

1. THE NAS_Agent SHALL 每月生成一份硬件评估报告，包含：
   - 当前硬件利用率（CPU/RAM/GPU/磁盘各项的峰值和平均值）
   - 存储增长趋势和预计磁盘满时间
   - GPU 任务队列平均等待时间（是否需要更强的 GPU）
   - 内存使用峰值（是否需要扩容）
   - 网络带宽瓶颈分析
2. WHEN 某项资源持续超过 80% 利用率, THE NAS_Agent SHALL 生成硬件升级建议：
   - 磁盘快满 → 建议购买 X TB 硬盘，推荐型号和价格范围
   - GPU 队列过长 → 建议升级 GPU 或添加第二块 GPU
   - 内存不足 → 建议扩容到 X GB
3. THE NAS_Agent SHALL 将建议推送到管理后台和手机端通知，**不自动购买**
4. THE NAS_Agent SHALL 在建议中附带购买链接（京东/淘宝/亚马逊搜索链接），方便用户直接下单

---

### 需求 91: AI 代理内容源自动发现

**用户故事:** 作为 NAS 用户，我希望 AI 代理能自动发现新的内容源（视频站/漫画站/小说站），并建议接入。

#### 验收标准

1. THE NAS_Agent SHALL 每周执行一轮内容源发现：
   - 爬取 GitHub 上的开源刮削项目（搜索 "scraper"/"crawler" + "video"/"manga"/"novel"），发现新的内容源 API
   - 分析用户搜索日志中频繁出现但无结果的关键词，推断可能的新内容源
   - 检查已配置源的域名是否变更（DNS 解析失败 → 搜索新域名）
   - 监控 Reddit/V2EX/NGA 等社区中关于新资源站的讨论
2. WHEN 发现新的潜在内容源, THE NAS_Agent SHALL 在管理后台展示发现报告：源名称、URL、内容类型、预估内容量、接入难度评估
3. THE NAS_Agent SHALL 对简单的新源（有公开 API 或标准 RSS）自动生成刮削适配器代码草稿
4. THE NAS_Agent SHALL **不自动接入新源**，需要管理员审核确认后才添加到刮削配置


---

## 附录 E: 自主 AI 代理（龙虾 AI 进化版）

---

### 需求 92: 本地 AI 开发代理 — 自主编写代码

**用户故事:** 作为星聚平台运营者，我希望 NAS 上的 AI 代理能像 Kiro/Claude 一样自主编写代码，当我需要新功能时告诉它，它自己去开发、测试、部署。

#### 验收标准

1. THE NAS_Agent SHALL 集成 Aider（开源 AI 编程工具）或类似的代码生成框架，连接本地 ollama LLM（Qwen2.5-Coder 32B 4-bit 量化）
2. THE NAS_Agent SHALL 维护星聚项目的本地 Git 仓库（`/mnt/storage/starhub-repo/`），所有代码变更通过 Git 管理
3. WHEN 管理员通过对话界面下达开发指令（如"给我写一个新的漫画源适配器，目标站点是 XXX"）, THE NAS_Agent SHALL：
   - 分析现有代码结构（读取 source-adapter.ts 等文件）
   - 参考知识库中的类似适配器实现
   - 生成新的适配器代码
   - 创建 Git 分支并提交代码
   - 在 Docker 容器中运行测试
   - 测试通过后通知管理员审核
4. THE NAS_Agent SHALL 支持以下开发任务类型：
   - 新建刮削适配器（给定目标站点 URL，自动分析页面结构并生成爬虫代码）
   - 修复 bug（给定错误日志，自动定位问题并生成修复补丁）
   - 修改配置（给定需求描述，自动修改对应的配置文件）
   - 编写部署脚本（给定需求，生成 bash 脚本）
5. THE NAS_Agent SHALL 对所有自动生成的代码创建 Git 分支（`agent/feature-xxx`），**不直接合并到主分支**，需要管理员审核确认后合并
6. THE NAS_Agent SHALL 在管理后台展示代码变更 diff，管理员可逐行审核

---

### 需求 93: AI 代理自主运营能力

**用户故事:** 作为星聚平台运营者，我希望 AI 代理能完全自主运营平台的内容获取、处理和分发，我只需要偶尔检查一下。

#### 验收标准

1. THE NAS_Agent SHALL 7x24 小时持续运行，自主执行以下运营循环：
   - 每小时：分析用户搜索热词 → 自动下载缺失内容
   - 每 6 小时：更新知识库 → 发现新内容源 → 生成适配器草稿
   - 每天：系统维护 → 配置优化 → 存储清理 → 生成运营报告
   - 每周：全库去重扫描 → 硬件评估 → 安全审计
   - 每月：生成月度运营报告（内容增长、用户活跃度、系统健康度、成本分析）
2. THE NAS_Agent SHALL 维护一个"运营日志"，记录每次自主决策的原因、执行结果和影响
3. THE NAS_Agent SHALL 在管理后台提供"AI 运营仪表盘"：
   - 今日自主决策数量和类型分布
   - 本周新增内容数量（按类型/分级）
   - AI 处理队列吞吐量
   - 系统健康评分（0-100）
   - 下一步计划预告
4. THE NAS_Agent SHALL 支持管理员设置"自主权限等级"：
   - 全自主：所有决策自动执行（包括下载、处理、清理、配置变更）
   - 半自主：低风险自动执行，高风险需确认
   - 仅建议：所有决策仅生成建议，不自动执行

---

### 需求 94: AI 代理自主消费能力（银行卡绑定）

**用户故事:** 作为星聚平台运营者，我希望给 AI 代理绑定一张银行卡，让它在预算范围内自主购买需要的资源（云 API 额度、域名续费等）。

#### 验收标准

1. THE NAS_Agent SHALL 支持绑定支付方式（银行卡/支付宝/微信支付 API），用于自主消费
2. THE NAS_Agent SHALL 严格遵守以下消费安全规则：
   - 每日消费上限：管理员设置（默认 50 元/天）
   - 每月消费上限：管理员设置（默认 500 元/月）
   - 单笔消费上限：管理员设置（默认 100 元/笔）
   - 超过任何上限时自动暂停消费并通知管理员
3. THE NAS_Agent SHALL 仅允许以下消费类型：
   - 云 API 额度充值（OpenRouter/DeepL/翻译 API）
   - 域名续费（Cloudflare/Namecheap）
   - VPS/代理服务续费（用于刮削）
   - **禁止**：硬件购买（仅生成建议，不自动下单）
   - **禁止**：任何非星聚相关的消费
4. THE NAS_Agent SHALL 记录每笔消费到 `agent_expenses` 表：金额、用途、时间、审批状态
5. THE NAS_Agent SHALL 每周生成消费报告：本周总消费、各类型占比、预算剩余
6. THE NAS_Agent SHALL 在消费前进行成本效益分析：如果本地 LLM 能完成的任务不调用云 API
7. IF 银行卡余额不足, THEN THE NAS_Agent SHALL 通知管理员充值，**不自动从其他账户转账**

---

### 需求 95: AI 代理对话界面（类 Claude 体验）

**用户故事:** 作为星聚平台运营者，我希望能像和 Claude/ChatGPT 对话一样和 NAS AI 代理对话，用自然语言下达指令。

#### 验收标准

1. THE NAS_Agent SHALL 在管理后台提供全屏对话界面（类似 ChatGPT/Claude 的聊天 UI）
2. THE 对话界面 SHALL 支持以下交互模式：
   - 自然语言指令："帮我下载最新的海贼王漫画" → AI 自动执行
   - 开发指令："写一个 nhentai 的刮削适配器" → AI 生成代码
   - 系统查询："现在 GPU 在干什么？" → AI 返回实时状态
   - 运营查询："这周下载了多少内容？" → AI 返回统计报告
   - 故障排查："为什么 Whisper 容器一直重启？" → AI 分析日志并给出修复方案
3. THE 对话界面 SHALL 支持流式输出（SSE），实时显示 AI 回复
4. THE 对话界面 SHALL 支持多轮对话，AI 记住上下文
5. THE 对话界面 SHALL 在 AI 执行操作时实时展示执行过程（类似 Kiro 的工具调用展示）
6. THE 对话界面 SHALL 使用本地 ollama LLM（Qwen2.5 32B），不依赖云端 API（离线可用）
7. THE 对话界面 SHALL 在手机端 PWA 中同样可用
8. THE NAS_Agent SHALL 支持通过 Telegram Bot 对话（在手机 Telegram 中直接和 AI 代理聊天）

---

### 需求 96: AI 代理工具调用能力

**用户故事:** 作为星聚平台运营者，我希望 AI 代理不只是聊天，而是能实际执行操作 — 读写文件、运行命令、调用 API、管理容器。

#### 验收标准

1. THE NAS_Agent SHALL 实现以下工具（Tool）供 LLM 调用：
   - `run_command(cmd)` — 在 NAS 上执行 bash 命令（沙箱环境，禁止 rm -rf / 等危险命令）
   - `read_file(path)` — 读取文件内容
   - `write_file(path, content)` — 写入文件（自动 Git 提交）
   - `docker_manage(action, container)` — 管理 Docker 容器（start/stop/restart/logs）
   - `db_query(sql)` — 查询 pipeline.db（只读）
   - `db_execute(sql)` — 执行 pipeline.db 写操作（需确认）
   - `web_search(query)` — 搜索网络信息
   - `web_fetch(url)` — 获取网页内容
   - `api_call(url, method, body)` — 调用 HTTP API
   - `git_commit(message)` — Git 提交代码变更
   - `create_task(type, params)` — 创建 AI 处理任务
   - `send_notification(message)` — 发送通知（Telegram/管理后台）
   - `spend_money(amount, purpose)` — 消费（受预算限制）
2. THE NAS_Agent SHALL 对每个工具调用记录日志：调用时间、参数、结果、调用者（LLM 决策链）
3. THE NAS_Agent SHALL 对危险工具调用（write_file/db_execute/docker_manage/spend_money）实施安全检查：
   - 禁止删除系统文件（/etc、/boot、/usr）
   - 禁止修改防火墙规则
   - 禁止停止 cloudflared 容器（会断开 Tunnel）
   - 消费操作受预算限制
4. THE NAS_Agent SHALL 在对话界面中展示工具调用过程（类似 Kiro 的工具调用 UI）

---

### 需求 97: AI 代理成人内容处理无限制

**用户故事:** 作为星聚平台运营者，我希望 AI 代理在处理成人内容（NC-17级）时没有任何审查限制，能正常处理所有类型的成人内容。

#### 验收标准

1. THE NAS_Agent SHALL 使用无审查版本的本地 LLM（如 Qwen2.5 无审查版 / Llama 3 无审查版），不对成人内容进行拒绝或过滤
2. THE NAS_Agent SHALL 在处理成人视频标签时能正确识别和标注所有成人题材标签（需求 59.4 定义的完整标签列表）
3. THE NAS_Agent SHALL 在生成成人视觉小说 CG 时使用 NSFW 专用 SD 模型，不对成人内容进行模糊或遮挡
4. THE NAS_Agent SHALL 在对话中能正常讨论成人内容相关的运营决策（如"哪个成人视频源的内容质量最好"）
5. THE NAS_Agent SHALL 仅在管理员设置为"成人模式"时解除内容限制，非成人模式下仍遵守 MPAA 分级过滤
