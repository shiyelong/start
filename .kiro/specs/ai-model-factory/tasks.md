# 实施计划：AI 模型工厂（全开源组合 + 傻瓜式一键部署）

## 概述

**核心策略：最大化复用开源项目，自研仅写部署脚本和胶水配置。**

原方案自研 ~5000 行代码，现在用成熟开源项目替代 80%，自研仅需 ~800 行（部署脚本 + 配置文件）。
用户体验：运行一个脚本，所有 AI 工具自动部署、配置、串联，打开浏览器就能用。

**开源项目矩阵：**

| 功能 | 开源项目 | Stars | 替代的自研代码 |
|------|---------|-------|--------------|
| 对话界面 + 模型管理 | [Open WebUI](https://github.com/open-webui/open-webui) | 80k+ | 管理界面 + 对话 UI |
| AI 工作流编排 + Agent | [Dify](https://github.com/langgenius/dify) | 130k+ | 路由代理 + 流水线执行器 |
| 图像/视频/3D 工作流 | [ComfyUI](https://github.com/comfyanonymous/ComfyUI) | 70k+ | ComfyUI 编排器 |
| 统一推理 API | [LocalAI](https://github.com/mudler/LocalAI) | 30k+ | 统一 API 网关 + 模型下载 |
| LLM 管理 | [Ollama](https://github.com/ollama/ollama) | 120k+ | LLM 加载/卸载 |
| LLM 微调（no-code） | [Unsloth](https://github.com/unslothai/unsloth) + Studio | 25k+ | QLoRA 训练脚本 |
| 图像 LoRA 训练 | [kohya_ss](https://github.com/bmaltais/kohya_ss) | 10k+ | LoRA 训练脚本 |
| 中文 LoRA 训练 GUI | [SD-Trainer](https://github.com/Akegarasu/lora-scripts) | 5k+ | 中文友好 LoRA GUI |
| ComfyUI + LLM 联动 | [comfyui_LLM_party](https://github.com/heshengtao/comfyui_LLM_party) | 15k+ | ComfyUI 内调 LLM |
| Docker 管理 | [Dockge](https://github.com/louislam/dockge) | 15k+ | 已在 starhub-os 中 |

**自研代码清单（仅胶水）：**

| 文件 | 语言 | 行数 | 职责 |
|------|------|------|------|
| `ai-factory-deploy.sh` | Bash | ~500 行 | 一键部署所有 AI 容器 + 配置 |
| `ai-factory-config.json` | JSON | ~100 行 | 模型矩阵 + 下载源 + 端口配置 |
| `dify-workflows/*.yml` | YAML | ~200 行 | 预置 Dify 工作流模板（赛博朋克视频等） |
| `comfyui-workflows/*.json` | JSON | ~200 行 | 预置 ComfyUI 工作流（漫画上色等） |
| **总计** | | **~1000 行** | |

---

## 阶段一：核心 AI 服务部署（ai-factory-deploy.sh）

- [x] 1. 编写 AI 模型工厂一键部署脚本
  - [x] 1.1 创建部署配置文件 ai-factory-config.json
    - 定义 12 个模型的 HuggingFace repo ID、量化格式、VRAM 需求、领域分类
    - 定义各服务端口映射（全部 127.0.0.1）
    - 定义 SSD/HDD 存储路径
    - 定义白天/夜间模式时间配置
    - **自研代码：** ~100 行 JSON
    - _需求: 1, 9_

  - [x] 1.2 部署 Ollama + 拉取 LLM 模型
    - Ollama 已在 starhub-os deploy.sh 中部署（:11434）
    - 拉取 Qwen3.6-35B-A3B（路由/日常，~21GB GGUF）
    - 拉取 Kimi-K2.6 Q3.6bit（代码主力，~40GB）— 如果 SSD 空间足够
    - 拉取 GLM-5.1 Q4（代码备用，~72GB）— 可选
    - 使用 hf-mirror.com 镜像加速
    - **开源复用：** Ollama 直接用
    - **自研代码：** ~50 行 Bash（拉取脚本）
    - _需求: 2, 12_

  - [x] 1.3 部署 LocalAI 统一推理 API
    - Docker 部署 LocalAI（:8080 → 改为 127.0.0.1:8090 避免与 qBittorrent 冲突）
    - 配置 GPU 直通（--gpus all）
    - 配置模型目录挂载 /mnt/storage/ai_models/
    - LocalAI 自带：模型自动下载、OpenAI 兼容 API、VRAM 管理、TTS/图像/视频支持
    - 替代自研：模型注册表、模型下载器、统一 API 网关、VRAM 管理器
    - **开源复用：** LocalAI 整个项目
    - **自研代码：** ~30 行 Bash（部署配置）
    - _需求: 1, 2, 4, 20_

  - [x] 1.4 部署 Open WebUI 对话界面
    - Docker 部署 Open WebUI（127.0.0.1:3000）
    - 连接 Ollama（:11434）作为 LLM 后端
    - 连接 ComfyUI（:8188）作为图像生成后端
    - 配置深色主题、中文界面
    - 替代自研：对话界面、模型管理界面、GPU 监控面板
    - **开源复用：** Open WebUI 整个项目
    - **自研代码：** ~30 行 Bash（部署配置）
    - _需求: 17_

  - [x] 1.5 部署 Dify AI 工作流平台
    - Docker Compose 部署 Dify（127.0.0.1:3001）
    - 连接 Ollama 作为模型提供者
    - 配置 Agent 工作流模板
    - 替代自研：路由代理、流水线执行器、任务分解引擎
    - **开源复用：** Dify 整个项目
    - **自研代码：** ~50 行 Bash（部署 + 初始配置）
    - _需求: 3, 10, 16_

  - [x] 1.6 部署 ComfyUI + 插件
    - Docker 部署 ComfyUI（127.0.0.1:8188）
    - GPU 直通（--gpus all）
    - 模型目录挂载 /mnt/storage/ai_models/
    - 安装核心插件：
      - comfyui_LLM_party（LLM 联动，支持 Ollama/Qwen/GLM）
      - ComfyUI-Manager（插件管理器）
      - ComfyUI-Impact-Pack（常用节点包）
      - ComfyUI-WanVideoWrapper（Wan 2.7 视频生成）
      - ComfyUI-LivePortrait（口型同步）
      - ComfyUI-CosyVoice（TTS 配音）
    - 替代自研：ComfyUI 编排器
    - **开源复用：** ComfyUI + 社区插件
    - **自研代码：** ~50 行 Bash（部署 + 插件安装）
    - _需求: 6_

  - [x] 1.7 部署 Unsloth Studio（LLM 微调 GUI）
    - Docker 部署 Unsloth Studio（127.0.0.1:7681）
    - GPU 直通
    - 模型目录 + 训练数据目录挂载
    - 浏览器打开即可 no-code 微调 LLM
    - 替代自研：QLoRA 训练脚本、训练任务调度
    - **开源复用：** Unsloth + Unsloth Studio
    - **自研代码：** ~30 行 Bash
    - _需求: 7, 13, 21_

  - [x] 1.8 部署 kohya_ss / SD-Trainer（图像 LoRA 训练 GUI）
    - Docker 部署 kohya_ss GUI（127.0.0.1:7682）
    - 或使用 Akegarasu/lora-scripts（SD-Trainer，中文 GUI）
    - GPU 直通
    - 模型目录 + 训练数据目录挂载
    - 浏览器打开即可训练图像 LoRA
    - 替代自研：LoRA 训练脚本
    - **开源复用：** kohya_ss / SD-Trainer
    - **自研代码：** ~30 行 Bash
    - _需求: 7_

  - [x] 1.9 下载 AI 模型文件到 SSD
    - 通过 Ollama 拉取 LLM 模型（Qwen3.6、Kimi-K2.6 量化版）
    - 通过 HuggingFace CLI 下载 ComfyUI 模型：
      - Nucleus-Image（~10-15GB）→ /mnt/storage/ai_models/image/
      - FLUX.1 Kontext Q4（~7GB）→ /mnt/storage/ai_models/image/
      - Wan 2.7（~30-40GB）→ /mnt/storage/ai_models/video/
      - CosyVoice2-0.5B（~2-5GB）→ /mnt/storage/ai_models/tts/
      - Fish-Speech 1.5（~3-5GB）→ /mnt/storage/ai_models/tts/
      - LivePortrait（~2-5GB）→ /mnt/storage/ai_models/lipsync/
      - Hunyuan3D 2.0（~15-20GB）→ /mnt/storage/ai_models/3d/
    - 使用 HF_ENDPOINT=https://hf-mirror.com 镜像加速
    - 断点续传 + SHA256 校验
    - **自研代码：** ~80 行 Bash（下载脚本）
    - _需求: 2, 9_

  - [x] 1.10 配置服务间连接
    - Open WebUI → Ollama（LLM）+ ComfyUI（图像）
    - Dify → Ollama（LLM）+ LocalAI（统一 API）
    - ComfyUI → Ollama（通过 comfyui_LLM_party 插件）
    - 所有服务绑定 127.0.0.1，通过 Cloudflare Tunnel 暴露
    - 配置 Tunnel ingress 规则：
      - ai.你的域名 → Open WebUI :3000
      - dify.你的域名 → Dify :3001
      - comfy.你的域名 → ComfyUI :8188
    - **自研代码：** ~50 行 Bash
    - _需求: 4, 20_

- [ ] 2. 检查点 — 核心 AI 服务部署完成
  - 确认 Ollama 运行正常，Qwen3.6 可对话
  - 确认 Open WebUI 可访问，能选择模型对话
  - 确认 Dify 可访问，能创建工作流
  - 确认 ComfyUI 可访问，能加载模型生成图片
  - 确认 LocalAI API 可调用
  - 确认 Unsloth Studio 可访问
  - 确认 kohya_ss GUI 可访问
  - 确认所有端口绑定 127.0.0.1

---

## 阶段二：预置工作流模板

- [ ] 3. 创建 Dify 预置工作流
  - [ ] 3.1 赛博朋克短视频工作流
    - 用户输入描述 → Qwen3.6 分解任务 → 调用 ComfyUI 生成关键帧 → 调用 Wan 2.7 图生视频 → 调用 CosyVoice2 配音 → FFmpeg 合并
    - 导出为 Dify DSL YAML 文件
    - **自研代码：** ~50 行 YAML
    - _需求: 3, 11_

  - [ ] 3.2 智能代码助手工作流
    - 用户输入代码需求 → Qwen3.6 路由 → Kimi-K2.6 生成代码 → 自动测试 → 返回结果
    - 备用回退：Kimi 不可用时切换 GLM-5.1
    - **自研代码：** ~30 行 YAML
    - _需求: 3_

  - [ ] 3.3 漫画创作工作流
    - 用户输入故事描述 → Qwen3.6 生成分镜 → DiffSensei 生成漫画 → FLUX Kontext 上色
    - **自研代码：** ~30 行 YAML
    - _需求: 3, 6_

  - [ ] 3.4 3D 资产生成工作流
    - 用户输入描述 → Nucleus-Image 生成概念图 → Hunyuan3D 2.0 生成 3D 模型 → 导出 GLB
    - **自研代码：** ~30 行 YAML
    - _需求: 3, 6_

- [ ] 4. 创建 ComfyUI 预置工作流
  - [ ] 4.1 漫画上色工作流（ComfyUI JSON）
    - 线稿输入 → FLUX Kontext 风格化上色 → 输出彩色漫画
    - **自研代码：** ~50 行 JSON
    - _需求: 6_

  - [ ] 4.2 视频配音 + 口型同步工作流
    - 视频输入 → CosyVoice2 配音 → LivePortrait 口型同步 → FFmpeg 合并
    - **自研代码：** ~50 行 JSON
    - _需求: 6_

  - [ ] 4.3 文生视频工作流
    - 文本 → Nucleus-Image 关键帧 → Wan 2.7 图生视频 → 拼接
    - **自研代码：** ~50 行 JSON
    - _需求: 6_

  - [ ] 4.4 3D 资产生成工作流
    - 概念图 → Hunyuan3D 2.0 → 导出 GLB/FBX
    - **自研代码：** ~50 行 JSON
    - _需求: 6_

- [ ] 5. 检查点 — 工作流模板完成
  - 确认 Dify 4 套工作流可导入并执行
  - 确认 ComfyUI 4 套工作流可加载并运行
  - 确认赛博朋克视频端到端流水线可完成

---

## 阶段三：白天/夜间模式 + 自动化

- [ ] 6. 配置白天/夜间模式自动切换
  - [ ] 6.1 创建模式切换 systemd timer
    - 白天模式（08:00）：启动 Ollama + Open WebUI + Dify + ComfyUI，加载 Qwen3.6
    - 夜间模式（02:00）：停止推理服务，启动 Unsloth Studio + kohya_ss 训练
    - 过渡期：等待当前任务完成（超时 30 分钟）
    - **自研代码：** ~60 行 Bash + systemd unit
    - _需求: 5, 21_

  - [ ] 6.2 配置训练数据自动收集
    - Open WebUI 自带对话历史导出
    - 配置 cron 每天 01:30 导出当天对话数据到 /mnt/storage/ai_models/training_data/
    - 格式化为 Unsloth 兼容的 JSONL 格式
    - **自研代码：** ~40 行 Bash
    - _需求: 13_

  - [ ] 6.3 配置 GPU 温度监控
    - systemd timer 每 10 秒读取 nvidia-smi
    - 85°C 暂停 GPU 容器，75°C 恢复
    - 90°C 持续 5 分钟强制停止所有 GPU 容器
    - **自研代码：** ~40 行 Bash
    - _需求: 14_

- [ ] 7. 检查点 — 自动化完成
  - 确认白天/夜间模式自动切换正常
  - 确认训练数据自动收集正常
  - 确认 GPU 温度保护正常

---

## 阶段四：部署后验证 + 傻瓜式使用指南

- [ ] 8. 部署后验证与状态报告
  - [ ] 8.1 全服务健康检查
    - 检查所有 AI 容器运行状态
    - 检查 GPU 可用性（nvidia-smi）
    - 检查模型文件完整性
    - 检查服务间连接
    - 输出彩色终端报告
    - **自研代码：** ~60 行 Bash
    - _需求: 18, 22_

  - [ ] 8.2 生成傻瓜式使用指南
    - 自动生成 README，包含：
      - 各服务访问地址（Open WebUI / Dify / ComfyUI / Unsloth Studio / kohya_ss）
      - 快速开始：如何对话、如何生成图片、如何创建视频
      - 模型列表和用途说明
      - 常见问题 FAQ
    - 保存到 /mnt/storage/starhub/AI-GUIDE.md
    - **自研代码：** ~50 行 Bash（模板生成）
    - _需求: 17_

- [ ] 9. 最终检查点 — 全系统验证
  - 运行 ai-factory-deploy.sh 完整部署
  - 确认 Open WebUI 对话正常（Qwen3.6）
  - 确认 Dify 工作流可执行（赛博朋克视频）
  - 确认 ComfyUI 图像生成正常
  - 确认 Unsloth Studio 可打开训练界面
  - 确认 kohya_ss 可打开 LoRA 训练界面
  - 确认白天/夜间模式切换正常
  - 确认 GPU 温度保护正常
  - 确认所有端口绑定 127.0.0.1（零公网端口）

---

## 备注

- **核心原则：** 开源项目直接用，自研仅写部署脚本和配置文件
- **总自研代码：** ~1000 行（Bash 脚本 + JSON/YAML 配置）
- **对比原方案：** 从 ~5000 行自研代码减少到 ~1000 行，节省 80% 开发时间
- **用户体验：** 运行一个脚本 → 打开浏览器 → 开始用 AI
- **傻瓜式操作：**
  - 对话 → 打开 Open WebUI
  - 工作流 → 打开 Dify
  - 图像/视频 → 打开 ComfyUI
  - 训练 LLM → 打开 Unsloth Studio
  - 训练图像 → 打开 kohya_ss
  - Docker 管理 → 打开 Dockge
