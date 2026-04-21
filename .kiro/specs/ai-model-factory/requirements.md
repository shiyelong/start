# 需求文档 — AI 模型工厂（多模型编排系统）

## 简介

AI 模型工厂是星聚OS（StarHub OS）的多模型 AI 编排系统，替代原有的单 Ollama 方案，实现 12+ 专业 AI 模型的统一管理、智能路由和协同工作。系统运行在 Debian 13 + i5-12400 + RTX 3090 24GB + 64GB DDR4 硬件上，通过路由代理（Qwen3.6-35B-A3B）将用户任务自动分解并派发到代码、图像、视频、3D、语音、口型同步等专业模型。系统支持白天推理/夜间训练的 24 小时运行模式，使用 ComfyUI 工作流串联多模型流水线，模型存储在 SSD 阵列上，媒体数据存储在 HDD 上。所有模块遵循星聚项目宪法：NAS 零公网端口、所有流量走 Cloudflare Tunnel、深色主题、SVG 图标、默认中文。

**核心设计目标：**
- 单 GPU（RTX 3090 24GB VRAM）高效调度 12+ 模型，同一时间仅一个大模型占用 VRAM
- 路由代理常驻内存（白天模式），其他模型按需加载/卸载
- 白天推理 + 夜间自动微调（QLoRA/LoRA），实现 24 小时持续学习
- ComfyUI 工作流编排多模型协作，支持复杂创作流水线
- 自动从 HuggingFace（含中国镜像）下载模型，定期搜索并更新最优模型
- 与现有 task-scheduler（BullMQ 队列）和 GPU 互斥锁深度集成

**目标硬件约束：**

| 组件 | 规格 | 约束 |
|------|------|------|
| GPU | RTX 3090 24GB VRAM | 同一时间仅一个大模型占用 VRAM |
| RAM | 64GB DDR4 | Qwen3.6 常驻约 21GB RAM（GGUF 格式） |
| SSD 阵列 | 多块 NVMe/SATA SSD | 模型存储，路径 /mnt/storage/ai_models/ |
| HDD | 用户现有 HDD（mergerfs） | 网站/媒体数据存储 |

**确认的模型矩阵：**

| 领域 | 模型 | 大小 | 许可证 | 用途 |
|------|------|------|--------|------|
| 代码（主力） | Kimi-K2.6（1T MoE, 32B 活跃） | ~40GB Q3.6bit | Modified MIT | SWE-Bench 80.2% |
| 代码（备用） | GLM-5.1（754B MoE, 40B 活跃） | ~72GB Q4 GGUF | MIT | SWE-Bench Pro #1 |
| 日常/路由 | Qwen3.6-35B-A3B | ~21GB GGUF | Apache 2.0 | 快速路由、日常任务 |
| 图像生成 | Nucleus-Image（17B MoE, 2B 活跃） | ~10-15GB | 开源 | GenEval 0.87 |
| 线稿上色 | FLUX.1 Kontext（12B） | ~7GB Q4 | 非商用 | 风格迁移、上色 |
| 漫画生成 | DiffSensei（MLLM+Diffusion） | ~10-15GB | 学术 | 角色一致性漫画 |
| 视频生成 | Wan 2.7（阿里巴巴, 14B） | ~30-40GB | 开源 | 文/图/声转视频 |
| 3D 资产 | Hunyuan3D 2.0（腾讯） | ~15-20GB | 开源 | 单角色/道具 mesh+贴图 |
| 3D 场景 | HY-World 2.0（腾讯） | ~20-30GB | 开源 | 完整场景，Unity/Unreal 导出 |
| TTS 配音 | CosyVoice2-0.5B（阿里巴巴） | ~2-5GB | 开源 | 多语言声音克隆 |
| TTS 配音 | Fish-Speech 1.5 | ~3-5GB | Apache 2.0 | SiliconFlow 推荐 #1 |
| 口型同步 | LivePortrait（腾讯 ARC） | ~2-5GB | MIT | 开源口型同步 |

## 术语表

- **Model_Registry**: 模型注册表，管理所有 AI 模型的元数据、存储路径、版本信息和运行状态的中央数据库
- **Routing_Agent**: 路由代理，基于 Qwen3.6-35B-A3B 的智能任务分解和模型派发引擎，白天常驻内存
- **VRAM_Manager**: 显存管理器，负责模型的 VRAM 加载/卸载调度，确保同一时间仅一个大模型占用 GPU
- **Model_Loader**: 模型加载器，负责将模型从 SSD 加载到 VRAM 或 RAM，支持 Ollama/vLLM/llama.cpp 等多种推理后端
- **ComfyUI_Orchestrator**: ComfyUI 工作流编排器，管理多模型串联的 ComfyUI 工作流定义和执行
- **Night_Trainer**: 夜间训练器，在夜间模式下执行 QLoRA/LoRA 微调任务，使用白天收集的数据持续改进模型
- **Model_Downloader**: 模型下载器，从 HuggingFace（含 hf-mirror.com 中国镜像）自动下载和更新模型文件
- **Model_Scout**: 模型侦察器，定期搜索互联网发现各领域最新最优模型，推荐更新
- **Storage_Tier_Manager**: 存储分层管理器，管理 SSD（模型）和 HDD（媒体数据）的存储分配和数据迁移
- **Pipeline_Executor**: 流水线执行器，按照路由代理分解的任务计划，依次调用多个模型完成复杂创作任务
- **Day_Mode**: 白天模式，Qwen3.6 常驻内存（~21GB RAM），其他模型按需加载到 VRAM 执行推理
- **Night_Mode**: 夜间模式，卸载 Qwen3.6，使用全部 GPU 资源执行 QLoRA/LoRA 微调训练
- **Task_Scheduler**: 任务调度服务（已有），运行在 NAS 端，管理异步 AI 处理任务队列（Redis/BullMQ）
- **GPU_Mutex**: GPU 互斥锁（已有），确保同一时间仅一个 GPU 密集型任务运行


## 需求

---

### 需求 1: 模型注册表与元数据管理

**用户故事:** 作为星聚OS管理员，我希望系统有一个统一的模型注册表来管理所有 AI 模型的元数据、版本和状态，以便清晰掌握模型工厂的全貌。

#### 验收标准

1. THE Model_Registry SHALL 维护所有已注册模型的元数据记录，包含模型名称、领域分类（code/image/video/3d/tts/lipsync）、文件路径、文件大小、量化格式、许可证类型和推理后端类型（ollama/vllm/llama.cpp/comfyui）
2. THE Model_Registry SHALL 为每个模型记录 VRAM 需求（MB）和 RAM 需求（MB），供 VRAM_Manager 调度时参考
3. THE Model_Registry SHALL 跟踪每个模型的当前状态：unloaded（未加载）、loading（加载中）、loaded（已加载到 VRAM）、resident（常驻 RAM）、training（训练中）
4. WHEN 新模型文件出现在 /mnt/storage/ai_models/ 目录下, THE Model_Registry SHALL 自动扫描并注册该模型的元数据
5. THE Model_Registry SHALL 支持为同一模型注册多个版本（如 Kimi-K2.6 的 Q3 和 Q4 量化版本），并标记当前活跃版本
6. IF 模型文件被删除或损坏, THEN THE Model_Registry SHALL 将该模型状态标记为 unavailable 并在管理后台发出告警
7. THE Model_Registry SHALL 在管理后台提供模型列表界面，展示所有模型的名称、领域、大小、状态、最后使用时间和累计调用次数

---

### 需求 2: 模型自动下载与中国镜像加速

**用户故事:** 作为中国大陆的星聚OS用户，我希望系统能自动从 HuggingFace 下载所需模型，并优先使用中国镜像加速，以便快速获取模型文件。

#### 验收标准

1. THE Model_Downloader SHALL 支持从 HuggingFace Hub 下载模型文件，使用 huggingface-cli 或等效工具
2. THE Model_Downloader SHALL 优先使用中国镜像源 hf-mirror.com 下载模型，当镜像源不可用时回退到 HuggingFace 官方源
3. WHEN 管理员在管理后台添加新模型下载任务（指定 HuggingFace repo ID 和量化格式）, THE Model_Downloader SHALL 将模型文件下载到 /mnt/storage/ai_models/{domain}/{model_name}/ 目录
4. THE Model_Downloader SHALL 支持断点续传，下载中断后重新启动时从断点继续
5. THE Model_Downloader SHALL 在下载过程中展示下载进度（已下载大小/总大小、下载速度、预计剩余时间）
6. WHEN 模型下载完成, THE Model_Downloader SHALL 验证文件完整性（SHA256 校验）并自动注册到 Model_Registry
7. IF 下载失败（网络错误或校验失败）, THEN THE Model_Downloader SHALL 记录错误日志并在 30 分钟后自动重试，最多重试 3 次
8. THE Model_Downloader SHALL 支持批量下载：管理员可一次性提交多个模型的下载任务，系统按队列依次下载

---

### 需求 3: 路由代理与任务分解

**用户故事:** 作为星聚OS用户，我希望向系统提交自然语言任务后，路由代理能自动理解任务意图、分解为子任务并派发到合适的专业模型，无需我手动选择模型。

#### 验收标准

1. THE Routing_Agent SHALL 基于 Qwen3.6-35B-A3B 模型运行，接收用户的自然语言任务描述并分析任务意图
2. THE Routing_Agent SHALL 将复杂任务分解为有序的子任务列表，每个子任务指定目标模型、输入参数和依赖关系
3. THE Routing_Agent SHALL 根据任务类型自动选择最合适的模型：代码任务派发到 Kimi-K2.6，图像生成派发到 Nucleus-Image，视频生成派发到 Wan 2.7，3D 资产派发到 Hunyuan3D 2.0，TTS 派发到 CosyVoice2 或 Fish-Speech，口型同步派发到 LivePortrait
4. WHEN 用户提交任务"帮我做一个赛博朋克风格的短视频，带配音", THE Routing_Agent SHALL 生成包含以下子任务的执行计划：剧本编写（Kimi-K2.6）→ 关键帧概念图（Nucleus-Image）→ 风格化上色（FLUX Kontext）→ 图生视频（Wan 2.7）→ 旁白配音（CosyVoice2）→ 角色配音（Fish-Speech）→ 口型同步（LivePortrait）→ 音视频合并（FFmpeg 脚本由 Kimi-K2.6 生成）
5. THE Routing_Agent SHALL 输出结构化的 JSON 执行计划，包含每个子任务的 task_id、model_name、input_type、output_type、depends_on 字段
6. IF Routing_Agent 无法理解用户任务意图, THEN THE Routing_Agent SHALL 向用户提出澄清问题，而非盲目派发任务
7. THE Routing_Agent SHALL 在生成执行计划后向用户展示计划摘要，用户确认后开始执行
8. WHEN 主力代码模型 Kimi-K2.6 不可用（未下载或加载失败）, THE Routing_Agent SHALL 自动回退到备用代码模型 GLM-5.1

---

### 需求 4: 模型加载/卸载与 VRAM 管理

**用户故事:** 作为星聚OS管理员，我希望系统能智能管理 RTX 3090 的 24GB VRAM，高效地加载和卸载模型，确保同一时间仅一个大模型占用 GPU。

#### 验收标准

1. THE VRAM_Manager SHALL 在加载新模型到 VRAM 之前，检查当前 VRAM 占用情况，如果剩余 VRAM 不足以容纳目标模型，先卸载当前占用 VRAM 的模型
2. THE VRAM_Manager SHALL 与现有 Task_Scheduler 的 GPU_Mutex 锁集成，在加载/卸载模型期间持有 GPU 锁
3. THE VRAM_Manager SHALL 支持三种推理后端的模型加载：Ollama（用于 Qwen3.6、Kimi-K2.6 量化版、GLM-5.1 量化版等 LLM）、vLLM 或 llama.cpp（用于大型 MoE 模型高效推理）、ComfyUI 原生加载（用于图像/视频/3D/TTS 模型）
4. THE VRAM_Manager SHALL 记录每次模型加载/卸载的耗时，用于优化调度决策
5. WHEN 模型加载耗时超过 120 秒, THE VRAM_Manager SHALL 在管理后台发出性能告警
6. THE VRAM_Manager SHALL 维护模型使用频率统计，优先保留高频使用的模型在 VRAM 中（LRU 策略）
7. IF 模型加载失败（VRAM 不足、文件损坏或推理后端错误）, THEN THE VRAM_Manager SHALL 记录错误日志、释放已占用的资源并通知 Task_Scheduler 该任务失败
8. THE VRAM_Manager SHALL 在管理后台实时展示 VRAM 使用情况：总量、已用量、当前加载的模型名称和占用量

---

### 需求 5: 白天/夜间运行模式切换

**用户故事:** 作为星聚OS管理员，我希望系统支持白天推理模式和夜间训练模式的自动切换，白天专注于用户任务响应，夜间利用空闲 GPU 进行模型微调。

#### 验收标准

1. THE VRAM_Manager SHALL 支持两种运行模式：Day_Mode（白天推理模式）和 Night_Mode（夜间训练模式）
2. WHILE Day_Mode 激活, THE VRAM_Manager SHALL 将 Qwen3.6-35B-A3B 常驻 RAM（约 21GB），其他模型按需加载到 VRAM 执行推理后卸载
3. WHILE Night_Mode 激活, THE VRAM_Manager SHALL 卸载 Qwen3.6 并将全部 GPU 资源分配给 Night_Trainer 执行微调任务
4. THE VRAM_Manager SHALL 支持管理员配置模式切换时间（默认：白天 08:00-02:00，夜间 02:00-08:00）
5. WHEN 到达模式切换时间点, THE VRAM_Manager SHALL 等待当前正在执行的任务完成后再切换模式，等待超时时间为 30 分钟
6. THE VRAM_Manager SHALL 支持管理员手动强制切换模式（覆盖自动调度）
7. IF 夜间模式期间收到用户紧急任务（优先级 0-10）, THEN THE VRAM_Manager SHALL 暂停训练任务、保存训练检查点、切换到白天模式处理紧急任务，完成后恢复夜间训练

---

### 需求 6: ComfyUI 工作流编排

**用户故事:** 作为星聚OS用户，我希望系统能通过 ComfyUI 工作流将多个模型串联起来，实现复杂的创作流水线（如漫画上色、视频配音+口型同步）。

#### 验收标准

1. THE ComfyUI_Orchestrator SHALL 运行 ComfyUI 作为 Docker 容器，配置 GPU 直通访问 RTX 3090
2. THE ComfyUI_Orchestrator SHALL 预置以下工作流模板：
   - 漫画上色工作流：线稿输入 → FLUX Kontext 风格化上色 → 输出彩色漫画
   - 视频配音+口型同步工作流：视频输入 → CosyVoice2/Fish-Speech 生成配音 → LivePortrait 口型同步 → FFmpeg 合并输出
   - 文生视频工作流：文本描述 → Nucleus-Image 关键帧 → Wan 2.7 图生视频 → 输出视频
   - 3D 资产生成工作流：概念图输入 → Hunyuan3D 2.0 生成 mesh+贴图 → 输出 GLB/FBX
3. THE ComfyUI_Orchestrator SHALL 支持管理员通过 ComfyUI Web 界面自定义和编辑工作流
4. WHEN Pipeline_Executor 执行 ComfyUI 工作流时, THE ComfyUI_Orchestrator SHALL 按工作流节点顺序依次加载所需模型，每个节点执行完成后卸载该模型再加载下一个
5. THE ComfyUI_Orchestrator SHALL 将工作流执行进度实时推送到管理后台，展示当前执行的节点、已完成节点和预计剩余时间
6. IF ComfyUI 工作流中某个节点执行失败, THEN THE ComfyUI_Orchestrator SHALL 记录错误日志、保存已完成节点的中间结果，并支持从失败节点重试
7. THE ComfyUI_Orchestrator SHALL 将工作流的最终输出文件存储到 HDD 的 /mnt/storage/media/ai_output/ 目录

---

### 需求 7: 夜间自动微调训练（QLoRA/LoRA）

**用户故事:** 作为星聚OS管理员，我希望系统在夜间自动使用白天收集的数据对模型进行微调训练，使代码模型和图像模型持续改进。

#### 验收标准

1. WHILE Night_Mode 激活, THE Night_Trainer SHALL 自动启动微调训练任务
2. THE Night_Trainer SHALL 对代码模型（Kimi-K2.6 或 GLM-5.1）执行 QLoRA 微调，使用白天用户交互中收集的代码补全/修复数据作为训练集
3. THE Night_Trainer SHALL 对图像模型（Nucleus-Image 或 FLUX Kontext）执行 LoRA 微调，使用白天用户生成的图像及其反馈数据作为训练集
4. THE Night_Trainer SHALL 在训练前自动验证训练数据集的质量：数据量不少于 100 条有效样本，数据格式符合模型要求
5. THE Night_Trainer SHALL 每 30 分钟保存一次训练检查点到 /mnt/storage/ai_models/checkpoints/ 目录
6. WHEN 训练完成, THE Night_Trainer SHALL 自动评估新模型的性能指标（代码模型：pass@1 准确率；图像模型：FID 分数），仅当新模型性能优于当前版本时才更新 Model_Registry 中的活跃版本
7. IF 训练过程中 GPU 温度超过 85°C, THEN THE Night_Trainer SHALL 暂停训练 10 分钟等待降温后继续
8. THE Night_Trainer SHALL 在管理后台展示训练日志：当前 epoch、loss 曲线、GPU 温度、预计完成时间
9. IF 训练数据不足（少于 100 条有效样本）, THEN THE Night_Trainer SHALL 跳过当晚训练并在管理后台记录原因

---

### 需求 8: 模型自动更新与最优模型搜索

**用户故事:** 作为星聚OS管理员，我希望系统能定期搜索互联网发现各领域最新最优的 AI 模型，并推荐或自动更新，确保模型工厂始终使用最强模型。

#### 验收标准

1. THE Model_Scout SHALL 定期（默认每周一次）搜索 HuggingFace、GitHub、Papers with Code 和主流 AI 评测榜单，发现各领域的最新模型
2. THE Model_Scout SHALL 根据以下维度评估候选模型：评测分数（如 SWE-Bench、GenEval、FID）、模型大小是否适配 RTX 3090 24GB VRAM、许可证是否允许本地部署、社区活跃度（Stars/Downloads）
3. WHEN Model_Scout 发现某领域有评测分数显著优于当前模型的新模型, THE Model_Scout SHALL 在管理后台生成更新推荐报告，包含新旧模型对比、评测分数差异和存储空间需求
4. THE Model_Scout SHALL 支持管理员配置自动更新策略：仅推荐（默认）、自动下载但不激活、自动下载并激活
5. WHERE 管理员启用自动下载并激活策略, THE Model_Scout SHALL 自动下载新模型、运行基准测试验证性能、确认优于当前模型后自动切换活跃版本
6. THE Model_Scout SHALL 在搜索时过滤掉 VRAM 需求超过 24GB 的模型（不适配目标硬件）
7. IF 自动更新后新模型性能不及预期（基准测试分数低于当前模型）, THEN THE Model_Scout SHALL 自动回滚到之前的模型版本并在管理后台记录回滚原因


---

### 需求 9: 存储分层管理（SSD 模型 / HDD 数据）

**用户故事:** 作为星聚OS管理员，我希望系统能智能管理 SSD 和 HDD 的存储分配，模型文件存储在高速 SSD 上以加快加载速度，媒体数据存储在大容量 HDD 上以节省成本。

#### 验收标准

1. THE Storage_Tier_Manager SHALL 将所有 AI 模型文件存储在 SSD 阵列的 /mnt/storage/ai_models/ 目录下，按领域分类组织子目录（code/image/video/3d/tts/lipsync/router）
2. THE Storage_Tier_Manager SHALL 将所有 AI 生成的媒体输出文件（图片、视频、音频、3D 资产）存储在 HDD 的 /mnt/storage/media/ai_output/ 目录下
3. THE Storage_Tier_Manager SHALL 将训练数据和训练检查点存储在 SSD 的 /mnt/storage/ai_models/training_data/ 和 /mnt/storage/ai_models/checkpoints/ 目录下
4. THE Storage_Tier_Manager SHALL 监控 SSD 阵列的可用空间，当可用空间低于 50GB 时在管理后台发出存储告警
5. WHEN SSD 可用空间低于 50GB, THE Storage_Tier_Manager SHALL 自动将不活跃的旧版本模型文件（非当前活跃版本）移动到 HDD 的 /mnt/storage/ai_models_archive/ 目录
6. THE Storage_Tier_Manager SHALL 在管理后台展示存储使用仪表盘：SSD 总量/已用/可用、HDD 总量/已用/可用、各领域模型占用空间、训练数据占用空间
7. THE Storage_Tier_Manager SHALL 定期清理过期的训练检查点（默认保留最近 7 天的检查点），释放 SSD 空间

---

### 需求 10: 多模型流水线执行引擎

**用户故事:** 作为星聚OS用户，我希望系统能按照路由代理生成的执行计划，依次调用多个模型完成复杂创作任务，并在每个步骤之间正确传递中间结果。

#### 验收标准

1. THE Pipeline_Executor SHALL 接收 Routing_Agent 生成的 JSON 执行计划，按照子任务的依赖关系确定执行顺序
2. THE Pipeline_Executor SHALL 为每个子任务执行以下流程：请求 VRAM_Manager 加载目标模型 → 等待模型加载完成 → 发送推理请求 → 接收推理结果 → 请求 VRAM_Manager 卸载模型
3. THE Pipeline_Executor SHALL 在子任务之间正确传递中间结果：前一个子任务的输出文件路径作为下一个子任务的输入参数
4. THE Pipeline_Executor SHALL 将每个子任务的中间结果文件存储在 /tmp/ai_pipeline/{task_id}/ 临时目录
5. WHEN 所有子任务执行完成, THE Pipeline_Executor SHALL 将最终输出文件移动到 HDD 的 /mnt/storage/media/ai_output/ 目录，并清理临时文件
6. THE Pipeline_Executor SHALL 在管理后台实时展示流水线执行进度：总步骤数、当前步骤、每步耗时、预计总耗时
7. IF 某个子任务执行失败, THEN THE Pipeline_Executor SHALL 记录错误日志、保存已完成步骤的中间结果，并支持从失败步骤重试
8. THE Pipeline_Executor SHALL 支持并行执行无依赖关系的子任务（当这些子任务不需要 GPU 时，如 FFmpeg 音视频合并）

---

### 需求 11: 赛博朋克短视频端到端流水线

**用户故事:** 作为星聚OS用户，我希望能通过一句话指令（如"帮我做一个赛博朋克风格的短视频，带配音"）触发完整的多模型创作流水线，最终获得一个完整的短视频文件。

#### 验收标准

1. WHEN 用户提交"帮我做一个赛博朋克风格的短视频，带配音"类型的任务, THE Routing_Agent SHALL 生成包含 9 个步骤的执行计划
2. THE Pipeline_Executor SHALL 按以下顺序执行子任务：
   - 步骤 1：Kimi-K2.6 编写剧本和分镜脚本（输出 JSON 格式的分镜列表）
   - 步骤 2：Nucleus-Image 根据分镜描述生成关键帧概念图（输出 PNG 图片）
   - 步骤 3：FLUX Kontext 对概念图进行赛博朋克风格化上色/调色（输出风格化 PNG）
   - 步骤 4：Wan 2.7 将风格化图片转为视频动画片段（输出 MP4 片段）
   - 步骤 5：CosyVoice2 生成旁白配音（输出 WAV 音频）
   - 步骤 6：Fish-Speech 克隆特定角色声音生成对话配音（输出 WAV 音频）
   - 步骤 7：LivePortrait 对视频中的角色执行口型同步（输出同步后 MP4）
   - 步骤 8：Kimi-K2.6 生成 FFmpeg 合并脚本（输出 shell 脚本）
   - 步骤 9：执行 FFmpeg 脚本合并所有音视频片段（输出最终 MP4 文件）
3. THE Pipeline_Executor SHALL 在整个流水线执行过程中，每完成一个步骤向用户推送进度通知
4. WHEN 流水线执行完成, THE Pipeline_Executor SHALL 将最终视频文件存储到 HDD 并在管理后台提供下载链接
5. THE Pipeline_Executor SHALL 记录整个流水线的总执行时间和每步耗时，用于性能优化参考
6. IF 流水线中任一步骤失败, THEN THE Pipeline_Executor SHALL 保存已完成步骤的中间结果，支持管理员手动修正后从失败步骤继续执行

---

### 需求 12: Ollama 集成与 LLM 推理管理

**用户故事:** 作为星聚OS管理员，我希望系统通过 Ollama 统一管理 LLM 模型（Qwen3.6、Kimi-K2.6 量化版、GLM-5.1 量化版）的加载和推理，提供标准化的 API 接口。

#### 验收标准

1. THE Model_Loader SHALL 通过 Ollama 管理以下 LLM 模型的加载和推理：Qwen3.6-35B-A3B（路由/日常）、Kimi-K2.6 Q3.6bit（代码主力）、GLM-5.1 Q4 GGUF（代码备用）
2. THE Model_Loader SHALL 通过 Ollama API（POST /api/generate、POST /api/chat）向 LLM 发送推理请求
3. THE Model_Loader SHALL 支持通过 Ollama 的 /api/pull 接口拉取新模型，与 Model_Downloader 协同工作
4. WHEN VRAM_Manager 请求加载某个 LLM 模型, THE Model_Loader SHALL 调用 Ollama 的模型加载机制将模型加载到 VRAM
5. WHEN VRAM_Manager 请求卸载某个 LLM 模型, THE Model_Loader SHALL 调用 Ollama 的模型卸载机制释放 VRAM
6. THE Model_Loader SHALL 监控 Ollama 服务的健康状态，当 Ollama 服务不可用时在管理后台发出告警
7. IF Ollama 无法高效运行大型 MoE 模型（如 Kimi-K2.6 1T MoE）, THEN THE Model_Loader SHALL 回退到 vLLM 或 llama.cpp 作为替代推理后端

---

### 需求 13: 训练数据自动收集

**用户故事:** 作为星聚OS管理员，我希望系统在白天推理过程中自动收集高质量的训练数据，为夜间微调提供数据支撑。

#### 验收标准

1. WHILE Day_Mode 激活, THE Night_Trainer SHALL 自动记录所有用户与 AI 模型的交互数据：用户输入、模型输出、用户反馈（接受/拒绝/修改）
2. THE Night_Trainer SHALL 将代码模型的交互数据格式化为 instruction-response 对，存储到 /mnt/storage/ai_models/training_data/code/ 目录
3. THE Night_Trainer SHALL 将图像模型的交互数据格式化为 prompt-image 对（含用户对生成图像的评分反馈），存储到 /mnt/storage/ai_models/training_data/image/ 目录
4. THE Night_Trainer SHALL 对收集的训练数据执行去重和质量过滤：移除重复样本、移除用户明确拒绝的低质量输出
5. THE Night_Trainer SHALL 在管理后台展示训练数据统计：今日新增样本数、累计样本数、各领域样本分布
6. THE Night_Trainer SHALL 遵守用户隐私：训练数据中不包含用户身份信息，仅保留匿名化的交互内容
7. IF 训练数据存储空间超过 SSD 配额（默认 20GB）, THEN THE Night_Trainer SHALL 按时间顺序清理最旧的训练数据

---

### 需求 14: GPU 温度与功耗监控

**用户故事:** 作为星聚OS管理员，我希望系统能实时监控 GPU 温度和功耗，在过热时自动降频保护硬件。

#### 验收标准

1. THE VRAM_Manager SHALL 每 10 秒通过 nvidia-smi 读取 GPU 温度、功耗、风扇转速和 VRAM 使用率
2. THE VRAM_Manager SHALL 在管理后台实时展示 GPU 监控仪表盘：温度曲线、功耗曲线、VRAM 使用率、当前运行的模型
3. WHEN GPU 温度超过 80°C, THE VRAM_Manager SHALL 在管理后台发出温度告警
4. WHEN GPU 温度超过 85°C, THE VRAM_Manager SHALL 自动暂停当前 GPU 任务，等待温度降至 75°C 以下后恢复
5. IF GPU 温度持续 5 分钟超过 90°C, THEN THE VRAM_Manager SHALL 强制卸载所有模型并停止所有 GPU 任务，在管理后台发出紧急告警
6. THE VRAM_Manager SHALL 记录 GPU 温度和功耗的历史数据（保留 30 天），支持在管理后台查看历史趋势图

---

### 需求 15: 模型性能基准测试

**用户故事:** 作为星聚OS管理员，我希望系统能对每个模型运行标准化的基准测试，以便评估模型性能和比较不同版本。

#### 验收标准

1. THE Model_Registry SHALL 为每个领域定义标准基准测试集：
   - 代码模型：10 道编程题（涵盖 Python/TypeScript/Rust），评估 pass@1 准确率
   - 图像模型：10 个标准 prompt，评估生成图像的 CLIP 分数
   - TTS 模型：10 段标准文本，评估语音自然度 MOS 分数
   - 视频模型：5 个标准场景描述，评估生成视频的帧一致性
2. WHEN 新模型注册到 Model_Registry 或模型版本更新时, THE Model_Registry SHALL 自动触发基准测试
3. THE Model_Registry SHALL 将基准测试结果存储在数据库中，支持同一模型不同版本的性能对比
4. THE Model_Registry SHALL 在管理后台展示基准测试结果：各模型的评测分数、与上一版本的对比、历史分数趋势
5. IF 基准测试中某个模型的分数显著低于预期（低于历史平均值 20%）, THEN THE Model_Registry SHALL 在管理后台发出性能异常告警

---

### 需求 16: 任务队列与优先级管理

**用户故事:** 作为星聚OS管理员，我希望 AI 模型工厂的任务能与现有 Task_Scheduler 的 BullMQ 队列集成，支持优先级管理和任务依赖。

#### 验收标准

1. THE Pipeline_Executor SHALL 将每个多模型流水线任务注册到现有 Task_Scheduler 的 BullMQ 队列中，任务类型为 model_factory_pipeline
2. THE Pipeline_Executor SHALL 将流水线中的每个子任务作为独立的 BullMQ job 入队，通过 job 依赖关系确保执行顺序
3. THE Pipeline_Executor SHALL 复用现有 Task_Scheduler 的优先级规则：紧急（0-10）、高（11-50）、中（51-100）、低（101-200）、后台（201-999）
4. THE Pipeline_Executor SHALL 复用现有 Task_Scheduler 的 GPU_Mutex 锁机制，模型加载/推理期间持有 GPU 锁
5. WHEN 多个流水线任务同时排队, THE Pipeline_Executor SHALL 按优先级和提交时间排序执行
6. THE Pipeline_Executor SHALL 在管理后台展示模型工厂专属的任务队列视图：待处理、执行中、已完成、失败的任务列表
7. THE Pipeline_Executor SHALL 支持管理员手动取消排队中的任务、重试失败的任务、调整任务优先级


---

### 需求 17: 模型工厂管理后台界面

**用户故事:** 作为星聚OS管理员，我希望在 Web 管理后台中有一个专属的模型工厂仪表盘，集中展示所有模型状态、任务进度和系统资源使用情况。

#### 验收标准

1. THE Model_Registry SHALL 在管理后台提供模型工厂仪表盘页面，包含以下模块：
   - 模型概览：所有已注册模型的卡片视图，展示名称、领域、状态（已加载/未加载/训练中）、VRAM 占用
   - GPU 监控：实时温度、功耗、VRAM 使用率图表
   - 任务队列：当前执行中的流水线任务、排队任务数、今日完成任务数
   - 存储状态：SSD/HDD 使用率、各领域模型占用空间
   - 训练状态：当前/最近的训练任务进度、loss 曲线
2. THE Model_Registry SHALL 在仪表盘中支持一键操作：手动加载/卸载模型、触发基准测试、切换白天/夜间模式、触发模型搜索更新
3. THE Model_Registry SHALL 在仪表盘中展示最近 24 小时的模型调用统计：各模型的调用次数、平均响应时间、成功率
4. THE Model_Registry SHALL 遵循星聚项目宪法的 UI 规范：深色主题（背景 #0f0f0f、主色 #3ea6ff）、SVG 图标（Lucide React）、默认中文
5. WHEN 管理后台页面加载, THE Model_Registry SHALL 通过 WebSocket 实时推送 GPU 状态和任务进度更新，无需手动刷新

---

### 需求 18: 模型文件完整性与健康检查

**用户故事:** 作为星聚OS管理员，我希望系统能定期检查模型文件的完整性和可用性，确保所有模型随时可用。

#### 验收标准

1. THE Model_Registry SHALL 每日执行一次模型文件完整性检查：验证所有已注册模型的文件存在且 SHA256 校验值与注册时一致
2. THE Model_Registry SHALL 每周执行一次模型可用性检查：尝试加载每个模型并执行一次简单推理请求，验证模型可正常工作
3. WHEN 完整性检查发现文件缺失或校验失败, THE Model_Registry SHALL 将该模型标记为 corrupted 并在管理后台发出告警
4. WHEN 可用性检查发现模型无法正常推理, THE Model_Registry SHALL 将该模型标记为 unhealthy 并在管理后台发出告警
5. IF 模型被标记为 corrupted, THEN THE Model_Downloader SHALL 自动重新下载该模型文件
6. THE Model_Registry SHALL 在管理后台展示健康检查报告：最近一次检查时间、各模型的健康状态、历史检查记录

---

### 需求 19: 多模型并发安全与资源隔离

**用户故事:** 作为星聚OS管理员，我希望系统能确保多个模型任务之间的资源隔离，防止一个模型的异常影响其他模型的运行。

#### 验收标准

1. THE VRAM_Manager SHALL 确保同一时间仅一个模型占用 GPU VRAM，通过 GPU_Mutex 锁实现严格互斥
2. THE VRAM_Manager SHALL 为每个模型推理请求设置超时时间（默认：LLM 30 分钟、图像模型 10 分钟、视频模型 60 分钟、TTS 模型 15 分钟），超时后强制终止并释放 GPU 锁
3. THE VRAM_Manager SHALL 在模型卸载后验证 VRAM 已完全释放（通过 nvidia-smi 检查），如果存在 VRAM 泄漏则强制清理
4. IF 模型推理进程崩溃（OOM 或 CUDA 错误）, THEN THE VRAM_Manager SHALL 自动清理残留的 GPU 进程、释放 VRAM 并通知 Task_Scheduler 该任务失败
5. THE VRAM_Manager SHALL 限制 RAM 使用：白天模式下 Qwen3.6 常驻 RAM 不超过 25GB，为系统和其他服务保留至少 30GB RAM
6. THE VRAM_Manager SHALL 记录所有 GPU 异常事件（OOM、CUDA 错误、超时、VRAM 泄漏）的详细日志，支持管理员排查问题

---

### 需求 20: 模型推理 API 统一网关

**用户故事:** 作为星聚OS开发者，我希望系统提供统一的模型推理 API 网关，屏蔽不同推理后端（Ollama/vLLM/ComfyUI）的差异，提供标准化的调用接口。

#### 验收标准

1. THE Model_Loader SHALL 提供统一的 HTTP API 网关，所有模型推理请求通过该网关路由到对应的推理后端
2. THE Model_Loader SHALL 支持以下统一 API 端点：
   - POST /api/inference/text — 文本生成（路由到 Ollama/vLLM/llama.cpp）
   - POST /api/inference/image — 图像生成（路由到 ComfyUI）
   - POST /api/inference/video — 视频生成（路由到 ComfyUI）
   - POST /api/inference/tts — 语音合成（路由到 ComfyUI 或独立 TTS 服务）
   - POST /api/inference/3d — 3D 资产生成（路由到 ComfyUI）
   - POST /api/inference/lipsync — 口型同步（路由到 ComfyUI 或独立服务）
3. THE Model_Loader SHALL 在 API 请求中自动处理模型加载/卸载：如果目标模型未加载，先加载模型再执行推理
4. THE Model_Loader SHALL 为每个 API 请求返回标准化的响应格式：{ status, result, model_used, inference_time_ms, error }
5. THE Model_Loader SHALL 对所有 API 请求进行认证（复用现有 NAS 签名机制 X-NAS-Signature）
6. THE Model_Loader SHALL 记录所有 API 调用的日志：请求时间、目标模型、推理耗时、成功/失败状态

---

### 需求 21: 24 小时自动学习循环

**用户故事:** 作为星聚OS管理员，我希望系统实现完整的 24 小时自动学习循环：白天收集数据并推理 → 夜间微调训练 → 次日使用改进后的模型，形成持续改进的闭环。

#### 验收标准

1. THE Night_Trainer SHALL 实现以下 24 小时循环：
   - 08:00-02:00（白天）：Routing_Agent 常驻，处理用户任务，同时收集训练数据
   - 02:00-02:30（过渡期）：等待当前任务完成，保存 Qwen3.6 状态，切换到夜间模式
   - 02:30-07:30（夜间）：执行 QLoRA/LoRA 微调训练，评估新模型性能
   - 07:30-08:00（过渡期）：保存训练检查点，加载新模型（如果性能提升），切换到白天模式
2. THE Night_Trainer SHALL 在每个训练周期结束后生成训练报告：训练数据量、训练轮次、loss 变化、新旧模型性能对比
3. THE Night_Trainer SHALL 维护模型版本历史：每次训练产生的新版本都有唯一版本号，支持回滚到任意历史版本
4. THE Night_Trainer SHALL 在管理后台展示学习循环时间线：过去 7 天每天的训练数据量、训练结果和模型版本变更
5. IF 连续 3 天训练后模型性能未提升, THEN THE Night_Trainer SHALL 在管理后台建议管理员调整训练超参数或增加训练数据多样性

---

### 需求 22: 错误恢复与容错机制

**用户故事:** 作为星聚OS管理员，我希望模型工厂具备完善的错误恢复能力，单个模型或任务的失败不会影响整个系统的运行。

#### 验收标准

1. IF 某个模型推理失败, THEN THE Pipeline_Executor SHALL 自动重试该步骤（最多 3 次），每次重试间隔 30 秒
2. IF 重试 3 次后仍然失败, THEN THE Pipeline_Executor SHALL 检查是否有备用模型可用（如 Kimi-K2.6 失败时回退到 GLM-5.1），有备用模型则使用备用模型重试
3. IF Ollama 服务崩溃, THEN THE VRAM_Manager SHALL 自动重启 Ollama 服务并在 60 秒内恢复可用
4. IF ComfyUI 服务崩溃, THEN THE ComfyUI_Orchestrator SHALL 自动重启 ComfyUI 容器并恢复中断的工作流
5. THE Pipeline_Executor SHALL 为每个流水线任务维护执行状态检查点，系统重启后能从最后的检查点恢复执行
6. THE VRAM_Manager SHALL 在系统启动时执行 GPU 状态清理：终止残留的 GPU 进程、释放泄漏的 VRAM、重置 GPU_Mutex 锁
7. THE Model_Registry SHALL 在系统启动时执行模型状态同步：扫描 /mnt/storage/ai_models/ 目录，更新所有模型的文件状态

---

## 附录 A: 模型存储目录结构

```
/mnt/storage/ai_models/                    # SSD 阵列 — 模型存储根目录
├── router/                                # 路由代理模型
│   └── qwen3.6-35b-a3b/
│       └── qwen3.6-35b-a3b.gguf          # ~21GB
├── code/                                  # 代码模型
│   ├── kimi-k2.6-q3/
│   │   └── kimi-k2.6-q3.gguf            # ~40GB
│   └── glm-5.1-q4/
│       └── glm-5.1-q4.gguf              # ~72GB
├── image/                                 # 图像模型
│   ├── nucleus-image/
│   │   └── model files...                # ~10-15GB
│   ├── flux-kontext/
│   │   └── model files...                # ~7GB Q4
│   └── diffsensei/
│       └── model files...                # ~10-15GB
├── video/                                 # 视频模型
│   └── wan-2.7/
│       └── model files...                # ~30-40GB
├── 3d/                                    # 3D 模型
│   ├── hunyuan3d-2.0/
│   │   └── model files...                # ~15-20GB
│   └── hy-world-2.0/
│       └── model files...                # ~20-30GB
├── tts/                                   # TTS 模型
│   ├── cosyvoice2-0.5b/
│   │   └── model files...                # ~2-5GB
│   └── fish-speech-1.5/
│       └── model files...                # ~3-5GB
├── lipsync/                               # 口型同步模型
│   └── liveportrait/
│       └── model files...                # ~2-5GB
├── training_data/                         # 训练数据
│   ├── code/                              # 代码训练数据
│   └── image/                             # 图像训练数据
├── checkpoints/                           # 训练检查点
│   ├── code/
│   └── image/
└── lora_adapters/                         # LoRA 适配器
    ├── code/
    └── image/

/mnt/storage/media/ai_output/             # HDD — AI 生成输出
├── videos/                                # 生成的视频
├── images/                                # 生成的图片
├── audio/                                 # 生成的音频
├── 3d_assets/                             # 生成的 3D 资产
└── pipelines/                             # 流水线完整输出
    └── {task_id}/                         # 按任务 ID 组织
```

## 附录 B: 模型加载/卸载时序图

```
用户提交任务 → Routing_Agent 分解任务
    │
    ├─ 子任务 1: Kimi-K2.6 编写剧本
    │   ├─ VRAM_Manager: 获取 GPU_Mutex 锁
    │   ├─ VRAM_Manager: 检查 VRAM（Qwen3.6 在 RAM，VRAM 空闲）
    │   ├─ Model_Loader: Ollama 加载 Kimi-K2.6 Q3 到 VRAM（~40GB → 需卸载后加载）
    │   ├─ Model_Loader: 执行推理 → 输出剧本 JSON
    │   ├─ Model_Loader: Ollama 卸载 Kimi-K2.6
    │   └─ VRAM_Manager: 释放 GPU_Mutex 锁
    │
    ├─ 子任务 2: Nucleus-Image 生成关键帧
    │   ├─ VRAM_Manager: 获取 GPU_Mutex 锁
    │   ├─ ComfyUI_Orchestrator: 加载 Nucleus-Image 到 VRAM（~10-15GB）
    │   ├─ ComfyUI_Orchestrator: 执行图像生成 → 输出 PNG
    │   ├─ ComfyUI_Orchestrator: 卸载 Nucleus-Image
    │   └─ VRAM_Manager: 释放 GPU_Mutex 锁
    │
    ├─ ... (后续子任务类似)
    │
    └─ 子任务 9: FFmpeg 合并（无需 GPU，直接执行）
        └─ 输出最终 MP4 文件
```

## 附录 C: 白天/夜间模式切换状态机

```
                    ┌──────────────────────────────────┐
                    │                                  │
    08:00 触发      ▼                                  │
    ┌──────────────────────┐                           │
    │     白天推理模式       │                           │
    │                      │                           │
    │ - Qwen3.6 常驻 RAM   │                           │
    │ - 其他模型按需加载    │     07:30-08:00           │
    │ - 收集训练数据        │     过渡期                │
    │ - 处理用户任务        │     加载新模型            │
    └──────────┬───────────┘     切换白天模式           │
               │                                       │
               │ 02:00 触发                            │
               ▼                                       │
    ┌──────────────────────┐                           │
    │   过渡期（30分钟）    │                           │
    │                      │                           │
    │ - 等待当前任务完成    │                           │
    │ - 保存 Qwen3.6 状态  │                           │
    │ - 卸载所有模型        │                           │
    └──────────┬───────────┘                           │
               │                                       │
               ▼                                       │
    ┌──────────────────────┐                           │
    │     夜间训练模式       │                           │
    │                      │                           │
    │ - QLoRA 微调代码模型  │     07:30 触发            │
    │ - LoRA 微调图像模型   │─────────────────────────►│
    │ - 全 GPU 资源训练     │     保存检查点            │
    │ - 每30分钟保存检查点  │     评估新模型            │
    └──────────────────────┘                           │
                                                       │
    紧急任务中断（优先级 0-10）:                         │
    夜间模式 → 暂停训练 → 保存检查点 → 白天模式         │
    → 处理紧急任务 → 完成后恢复夜间训练                 │
```