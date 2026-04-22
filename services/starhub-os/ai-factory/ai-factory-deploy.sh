#!/usr/bin/env bash
# ============================================================================
# 星聚OS AI 模型工厂 — 一键部署脚本
# ============================================================================
# 部署全部开源 AI 服务: Ollama + LocalAI + Open WebUI + Dify + ComfyUI
#                       + Unsloth Studio + kohya_ss/SD-Trainer
# 目标硬件: i5-12400 + RTX 3090 24GB + 64GB DDR4
# 前置条件: 已运行 services/starhub-os/deploy.sh 完成基础环境部署
# ============================================================================

set -euo pipefail

# ============================================================================
# 第一节: 颜色输出与基础检查
# ============================================================================

readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[FAIL]${NC}  $*"; }
log_step()  { echo -e "\n${CYAN}========== $* ==========${NC}"; }

# -- 全局路径常量 --
readonly BASE="/mnt/storage"
readonly AI_MODELS="${BASE}/ai_models"
readonly STARHUB_DATA="${BASE}/starhub"
readonly HF_ENDPOINT="https://hf-mirror.com"

# -- 部署结果记录 --
declare -A DEPLOY_RESULTS=()
DEPLOY_SUCCESS=0
DEPLOY_FAIL=0

record_result() {
    local name="$1" status="$2"
    DEPLOY_RESULTS["$name"]="$status"
    case "$status" in
        "running"|"skipped") DEPLOY_SUCCESS=$((DEPLOY_SUCCESS + 1)) ;;
        "failed")            DEPLOY_FAIL=$((DEPLOY_FAIL + 1)) ;;
    esac
}

# 检查 root 权限
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "此脚本必须以 root 权限运行 (sudo bash ai-factory-deploy.sh)"
        exit 1
    fi
    log_ok "root 权限检查通过"
}

# 检查前置条件: Docker + NVIDIA runtime
check_prerequisites() {
    log_step "前置条件检查"

    # Docker 必须可用
    if ! command -v docker &>/dev/null; then
        log_error "Docker 未安装, 请先运行 services/starhub-os/deploy.sh"
        exit 1
    fi
    log_ok "Docker 已安装 ($(docker --version 2>&1))"

    # Docker Compose 插件
    if ! docker compose version &>/dev/null; then
        log_error "docker compose 插件未安装, 请先运行 services/starhub-os/deploy.sh"
        exit 1
    fi
    log_ok "Docker Compose 已安装 ($(docker compose version 2>&1))"

    # NVIDIA GPU (非必须但强烈推荐)
    if command -v nvidia-smi &>/dev/null; then
        local gpu_name
        gpu_name=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || true)
        if [[ -n "$gpu_name" ]]; then
            log_ok "NVIDIA GPU: ${gpu_name}"
            GPU_AVAILABLE=1
        else
            log_warn "nvidia-smi 可用但未检测到 GPU, AI 服务将以 CPU 模式运行"
            GPU_AVAILABLE=0
        fi
    else
        log_warn "未检测到 NVIDIA GPU, AI 服务将以 CPU 模式运行 (性能大幅降低)"
        GPU_AVAILABLE=0
    fi

    # 检查存储目录
    if [[ ! -d "$BASE" ]]; then
        log_error "存储目录 ${BASE} 不存在, 请先运行 services/starhub-os/deploy.sh"
        exit 1
    fi
    log_ok "存储目录: ${BASE}"

    # 检查磁盘可用空间 (AI 模型至少需要 200GB)
    local avail_gb
    avail_gb=$(df -BG "$BASE" | awk 'NR==2 {gsub(/G/,"",$4); print $4}')
    if [[ "$avail_gb" -ge 200 ]]; then
        log_ok "可用空间: ${avail_gb}GB (>= 200GB)"
    elif [[ "$avail_gb" -ge 50 ]]; then
        log_warn "可用空间: ${avail_gb}GB (推荐 >= 200GB, 部分大模型可能无法下载)"
    else
        log_error "可用空间不足: ${avail_gb}GB, AI 模型至少需要 50GB"
        exit 1
    fi

    log_info "前置条件检查完成"
}

# 构建 GPU 参数 (复用 deploy.sh 模式)
gpu_args() {
    if [[ "${GPU_AVAILABLE:-0}" -eq 1 ]]; then
        echo "--gpus all"
    fi
}

# ============================================================================
# 第二节: 部署容器通用函数 (复用 deploy.sh 的 deploy_container 模式)
# ============================================================================

# 拉取 Docker 镜像 (支持重试)
pull_image() {
    local image="$1"

    if docker image inspect "$image" &>/dev/null; then
        log_ok "镜像已存在: ${image}, 跳过拉取"
        return 0
    fi

    log_info "拉取镜像: ${image}"
    local retry=0
    while [[ $retry -lt 3 ]]; do
        if docker pull "$image" 2>/dev/null; then
            log_ok "镜像拉取成功: ${image}"
            return 0
        fi
        retry=$((retry + 1))
        if [[ $retry -lt 3 ]]; then
            log_warn "docker pull 失败 (第${retry}次), ${retry}0秒后重试..."
            sleep $((retry * 10))
        fi
    done

    log_error "镜像拉取失败: ${image} (已重试3次)"
    return 1
}

# 部署单个 Docker 容器 (幂等)
# 参数: $1=容器名, $2=镜像名, $3...=docker run 额外参数
deploy_container() {
    local name="$1"
    local image="$2"
    shift 2
    local run_args=("$@")

    # 幂等: 容器已在运行则跳过
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
        log_ok "[${name}] 容器已在运行, 跳过"
        record_result "$name" "skipped"
        return 0
    fi

    # 容器存在但已停止, 移除后重新部署
    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
        log_warn "[${name}] 容器已存在但未运行, 移除后重新部署"
        docker rm -f "$name" &>/dev/null || true
    fi

    # 拉取镜像
    if ! pull_image "$image"; then
        record_result "$name" "failed"
        return 1
    fi

    # 启动容器
    log_info "[${name}] 部署容器: ${image}"
    if docker run -d \
        --name "$name" \
        --restart unless-stopped \
        "${run_args[@]}" \
        "$image"; then
        # 等待容器启动 (最多 15 秒)
        local wait=0
        while ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; do
            sleep 1
            wait=$((wait + 1))
            if [[ $wait -ge 15 ]]; then
                log_error "[${name}] 容器启动超时 (15秒), 检查日志: docker logs ${name}"
                record_result "$name" "failed"
                return 1
            fi
        done
        log_ok "[${name}] 容器启动成功"
        record_result "$name" "running"
        return 0
    else
        log_error "[${name}] docker run 失败"
        record_result "$name" "failed"
        return 1
    fi
}

# ============================================================================
# 第三节: 部署 Ollama + 拉取 LLM 模型
# ============================================================================

deploy_ollama_models() {
    log_step "Ollama LLM 模型拉取"

    # Ollama 容器应已在 starhub-os deploy.sh 中部署
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^ollama$"; then
        log_warn "Ollama 容器未运行, 尝试启动..."
        mkdir -p "${AI_MODELS}/ollama"
        local ollama_args=(-p 127.0.0.1:11434:11434 -v "${AI_MODELS}/ollama:/root/.ollama")
        if [[ "${GPU_AVAILABLE:-0}" -eq 1 ]]; then
            ollama_args+=(--gpus all)
        fi
        deploy_container "ollama" "ollama/ollama:latest" "${ollama_args[@]}"
    else
        log_ok "[ollama] 容器已在运行"
        record_result "ollama" "skipped"
    fi

    # 等待 Ollama API 就绪
    log_info "等待 Ollama API 就绪..."
    local wait=0
    while ! curl -sf http://127.0.0.1:11434/api/tags &>/dev/null; do
        sleep 2
        wait=$((wait + 2))
        if [[ $wait -ge 30 ]]; then
            log_error "Ollama API 启动超时 (30秒)"
            return 1
        fi
    done
    log_ok "Ollama API 就绪"

    # -- 拉取 Qwen3.6-35B-A3B (路由/日常, 必需) --
    log_info "拉取 Qwen3 35B-A3B (路由/日常模型, ~21GB)..."
    if docker exec ollama ollama list 2>/dev/null | grep -q "qwen3:35b-a3b"; then
        log_ok "qwen3:35b-a3b 已存在, 跳过"
    else
        if docker exec ollama ollama pull qwen3:35b-a3b; then
            log_ok "qwen3:35b-a3b 拉取完成"
        else
            log_error "qwen3:35b-a3b 拉取失败"
        fi
    fi

    # -- 拉取 Kimi-K2.6 量化版 (代码主力, 推荐) --
    # 注: Kimi-K2.6 量化版需要通过 GGUF 文件导入, 如果 Ollama 官方库有则直接 pull
    log_info "检查 Kimi-K2.6 量化版可用性..."
    local ssd_avail_gb
    ssd_avail_gb=$(df -BG "${AI_MODELS}" | awk 'NR==2 {gsub(/G/,"",$4); print $4}')
    if [[ "$ssd_avail_gb" -ge 50 ]]; then
        log_info "SSD 剩余 ${ssd_avail_gb}GB, 尝试拉取 Kimi-K2.6 量化版 (~40GB)..."
        # 尝试从 Ollama 库拉取 (如果已有社区上传的量化版)
        if docker exec ollama ollama list 2>/dev/null | grep -q "kimi-k2"; then
            log_ok "kimi-k2 模型已存在, 跳过"
        else
            # Ollama 官方库可能尚未收录, 记录提示信息
            log_warn "Kimi-K2.6 量化版暂未在 Ollama 官方库中"
            log_info "可手动通过 GGUF 导入: 从 ${HF_ENDPOINT} 下载后使用 ollama create 导入"
            log_info "  HuggingFace 仓库: inferencerlabs/Kimi-K2.6-MLX-3.6bit"
        fi
    else
        log_warn "SSD 剩余空间不足 (${ssd_avail_gb}GB < 50GB), 跳过 Kimi-K2.6"
    fi

    log_info "Ollama 模型拉取完成"
}

# ============================================================================
# 第四节: 部署 LocalAI 统一推理 API
# ============================================================================

deploy_localai() {
    log_step "部署 LocalAI 统一推理 API"

    mkdir -p "${AI_MODELS}"

    local localai_args=(
        -p 127.0.0.1:8090:8080
        -v "${AI_MODELS}:/models"
        -e "GALLERIES=[{\"name\":\"model-gallery\",\"url\":\"github:mudler/LocalAI/gallery/index.yaml@master\"}]"
    )

    # GPU 直通
    if [[ "${GPU_AVAILABLE:-0}" -eq 1 ]]; then
        localai_args+=(--gpus all)
        deploy_container "localai" "localai/localai:latest-gpu-nvidia-cuda-12" "${localai_args[@]}"
    else
        deploy_container "localai" "localai/localai:latest" "${localai_args[@]}"
    fi
}

# ============================================================================
# 第五节: 部署 Open WebUI 对话界面
# ============================================================================

deploy_open_webui() {
    log_step "部署 Open WebUI 对话界面"

    mkdir -p "${STARHUB_DATA}/open-webui-data"

    local webui_args=(
        -p 127.0.0.1:3000:8080
        -v "${STARHUB_DATA}/open-webui-data:/app/backend/data"
        -e OLLAMA_BASE_URL=http://host.docker.internal:11434
        -e COMFYUI_BASE_URL=http://host.docker.internal:8188
        --add-host=host.docker.internal:host-gateway
    )

    deploy_container "open-webui" "ghcr.io/open-webui/open-webui:main" "${webui_args[@]}"
}

# ============================================================================
# 第六节: 部署 Dify AI 工作流平台 (Docker Compose)
# ============================================================================

deploy_dify() {
    log_step "部署 Dify AI 工作流平台"

    local dify_dir="${STARHUB_DATA}/dify"
    mkdir -p "${dify_dir}"

    # 幂等: 检查 Dify 容器是否已在运行
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^dify-api$"; then
        log_ok "[dify] 已在运行, 跳过"
        record_result "dify" "skipped"
        return 0
    fi

    # 生成 Dify docker-compose.yml
    log_info "生成 Dify docker-compose.yml..."

    # 生成随机密钥
    local secret_key
    secret_key=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n' | head -c 64)

    cat > "${dify_dir}/docker-compose.yml" <<DIFY_EOF
# Dify AI 工作流平台 — 星聚OS AI 模型工厂
# 由 ai-factory-deploy.sh 自动生成

services:
  # -- PostgreSQL 数据库 --
  db:
    image: postgres:16-alpine
    container_name: dify-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: dify
      POSTGRES_PASSWORD: dify_starhub_2024
      POSTGRES_DB: dify
    volumes:
      - ${dify_dir}/data/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dify"]
      interval: 10s
      timeout: 5s
      retries: 5

  # -- Redis 缓存 --
  redis:
    image: redis:7-alpine
    container_name: dify-redis
    restart: unless-stopped
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - ${dify_dir}/data/redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # -- SSRF 代理 (安全防护) --
  ssrf_proxy:
    image: ubuntu/squid:latest
    container_name: dify-ssrf-proxy
    restart: unless-stopped
    volumes:
      - ${dify_dir}/data/ssrf_proxy:/var/spool/squid

  # -- 沙箱 (代码执行隔离) --
  sandbox:
    image: langgenius/dify-sandbox:latest
    container_name: dify-sandbox
    restart: unless-stopped
    environment:
      API_KEY: dify-sandbox-key
      GIN_MODE: release
    volumes:
      - ${dify_dir}/data/sandbox:/dependencies

  # -- Dify API 服务 --
  api:
    image: langgenius/dify-api:latest
    container_name: dify-api
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      MODE: api
      LOG_LEVEL: INFO
      SECRET_KEY: "${secret_key}"
      CONSOLE_WEB_URL: ""
      INIT_PASSWORD: ""
      CONSOLE_API_URL: ""
      SERVICE_API_URL: ""
      APP_WEB_URL: ""
      DB_USERNAME: dify
      DB_PASSWORD: dify_starhub_2024
      DB_HOST: db
      DB_PORT: 5432
      DB_DATABASE: dify
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_DB: 0
      STORAGE_TYPE: local
      STORAGE_LOCAL_PATH: /app/api/storage
      CODE_EXECUTION_ENDPOINT: http://sandbox:8194
      CODE_EXECUTION_API_KEY: dify-sandbox-key
      SSRF_PROXY_HTTP_URL: http://ssrf_proxy:3128
      SSRF_PROXY_HTTPS_URL: http://ssrf_proxy:3128
    volumes:
      - ${dify_dir}/data/api_storage:/app/api/storage
    extra_hosts:
      - "host.docker.internal:host-gateway"

  # -- Dify Worker (异步任务) --
  worker:
    image: langgenius/dify-api:latest
    container_name: dify-worker
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      MODE: worker
      LOG_LEVEL: INFO
      SECRET_KEY: "${secret_key}"
      DB_USERNAME: dify
      DB_PASSWORD: dify_starhub_2024
      DB_HOST: db
      DB_PORT: 5432
      DB_DATABASE: dify
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_DB: 0
      STORAGE_TYPE: local
      STORAGE_LOCAL_PATH: /app/api/storage
      CODE_EXECUTION_ENDPOINT: http://sandbox:8194
      CODE_EXECUTION_API_KEY: dify-sandbox-key
    volumes:
      - ${dify_dir}/data/api_storage:/app/api/storage
    extra_hosts:
      - "host.docker.internal:host-gateway"

  # -- Dify Web 前端 --
  web:
    image: langgenius/dify-web:latest
    container_name: dify-web
    restart: unless-stopped
    depends_on:
      - api
    environment:
      CONSOLE_API_URL: ""
      APP_API_URL: ""
    ports:
      - "127.0.0.1:3001:3000"

DIFY_EOF

    log_ok "Dify docker-compose.yml 已生成"

    # 创建数据目录
    mkdir -p "${dify_dir}/data/postgres"
    mkdir -p "${dify_dir}/data/redis"
    mkdir -p "${dify_dir}/data/api_storage"
    mkdir -p "${dify_dir}/data/sandbox"
    mkdir -p "${dify_dir}/data/ssrf_proxy"

    # 启动 Dify
    log_info "启动 Dify 服务 (docker compose up -d)..."
    if docker compose -f "${dify_dir}/docker-compose.yml" up -d; then
        # 等待 API 就绪
        local wait=0
        while ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^dify-api$"; do
            sleep 2
            wait=$((wait + 2))
            if [[ $wait -ge 60 ]]; then
                log_error "[dify] API 容器启动超时 (60秒)"
                record_result "dify" "failed"
                return 1
            fi
        done
        log_ok "[dify] 全部服务启动成功"
        record_result "dify" "running"
    else
        log_error "[dify] docker compose up 失败"
        record_result "dify" "failed"
        return 1
    fi
}

# ============================================================================
# 第七节: 部署 ComfyUI + 插件
# ============================================================================

deploy_comfyui() {
    log_step "部署 ComfyUI + 插件"

    mkdir -p "${AI_MODELS}"
    mkdir -p "${STARHUB_DATA}/comfyui-data"

    local comfyui_args=(
        -p 127.0.0.1:8188:8188
        -v "${AI_MODELS}:/comfyui/models"
        -v "${STARHUB_DATA}/comfyui-data:/comfyui/output"
    )

    # GPU 直通
    if [[ "${GPU_AVAILABLE:-0}" -eq 1 ]]; then
        comfyui_args+=(--gpus all)
    fi

    deploy_container "comfyui" "ghcr.io/ai-dock/comfyui:latest" "${comfyui_args[@]}"

    # -- 安装核心插件 --
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^comfyui$"; then
        log_info "安装 ComfyUI 核心插件..."

        local plugins=(
            "https://github.com/ltdrdata/ComfyUI-Manager.git"
            "https://github.com/ltdrdata/ComfyUI-Impact-Pack.git"
            "https://github.com/heshengtao/comfyui_LLM_party.git"
            "https://github.com/kijai/ComfyUI-WanVideoWrapper.git"
            "https://github.com/PowerHouseMan/ComfyUI-AdvancedLivePortrait.git"
        )

        for plugin_url in "${plugins[@]}"; do
            local plugin_name
            plugin_name=$(basename "$plugin_url" .git)
            # 幂等: 插件目录已存在则跳过
            if docker exec comfyui test -d "/comfyui/custom_nodes/${plugin_name}" 2>/dev/null; then
                log_ok "  插件已存在: ${plugin_name}, 跳过"
            else
                log_info "  安装插件: ${plugin_name}..."
                if docker exec comfyui git clone "$plugin_url" "/comfyui/custom_nodes/${plugin_name}" 2>/dev/null; then
                    log_ok "  插件安装成功: ${plugin_name}"
                else
                    log_warn "  插件安装失败: ${plugin_name} (可稍后手动安装)"
                fi
            fi
        done

        log_info "ComfyUI 插件安装完成"
    fi
}

# ============================================================================
# 第八节: 部署 Unsloth Studio (LLM 微调 GUI)
# ============================================================================

deploy_unsloth() {
    log_step "部署 Unsloth Studio (LLM 微调)"

    mkdir -p "${AI_MODELS}/lora_adapters"
    mkdir -p "${AI_MODELS}/training_data"
    mkdir -p "${STARHUB_DATA}/unsloth-data"

    local unsloth_args=(
        -p 127.0.0.1:7681:7681
        -v "${AI_MODELS}:/workspace/models"
        -v "${AI_MODELS}/training_data:/workspace/training_data"
        -v "${AI_MODELS}/lora_adapters:/workspace/lora_adapters"
        -v "${STARHUB_DATA}/unsloth-data:/workspace/outputs"
        -e HF_ENDPOINT="${HF_ENDPOINT}"
    )

    # GPU 直通 (微调必须有 GPU)
    if [[ "${GPU_AVAILABLE:-0}" -eq 1 ]]; then
        unsloth_args+=(--gpus all)
        # 使用 Unsloth 官方 Docker 镜像
        deploy_container "unsloth-studio" "unslothai/unsloth:latest" "${unsloth_args[@]}"
    else
        log_warn "[unsloth-studio] 无 GPU 可用, LLM 微调需要 GPU, 跳过部署"
        record_result "unsloth-studio" "failed"
    fi
}

# ============================================================================
# 第九节: 部署 kohya_ss / SD-Trainer (图像 LoRA 训练)
# ============================================================================

deploy_kohya_ss() {
    log_step "部署 kohya_ss / SD-Trainer (图像 LoRA 训练)"

    mkdir -p "${AI_MODELS}/lora_adapters"
    mkdir -p "${AI_MODELS}/training_data"
    mkdir -p "${STARHUB_DATA}/kohya-data"

    local kohya_args=(
        -p 127.0.0.1:7682:7860
        -v "${AI_MODELS}:/workspace/models"
        -v "${AI_MODELS}/training_data:/workspace/training_data"
        -v "${AI_MODELS}/lora_adapters:/workspace/lora_adapters"
        -v "${STARHUB_DATA}/kohya-data:/workspace/outputs"
        -e HF_ENDPOINT="${HF_ENDPOINT}"
    )

    # GPU 直通 (LoRA 训练必须有 GPU)
    if [[ "${GPU_AVAILABLE:-0}" -eq 1 ]]; then
        kohya_args+=(--gpus all)
        deploy_container "kohya-ss" "bmaltais/kohya_ss:latest" "${kohya_args[@]}"
    else
        log_warn "[kohya-ss] 无 GPU 可用, LoRA 训练需要 GPU, 跳过部署"
        record_result "kohya-ss" "failed"
    fi
}

# ============================================================================
# 第十节: 下载 AI 模型文件 (HuggingFace CLI)
# ============================================================================

download_ai_models() {
    log_step "下载 AI 模型文件 (HuggingFace CLI)"

    # -- 安装 huggingface-cli --
    if ! command -v huggingface-cli &>/dev/null; then
        log_info "安装 huggingface-cli..."
        pip3 install -q huggingface_hub[cli] 2>/dev/null || pip3 install -q huggingface_hub 2>/dev/null
        if command -v huggingface-cli &>/dev/null; then
            log_ok "huggingface-cli 安装完成"
        else
            log_error "huggingface-cli 安装失败, 跳过模型下载"
            return 1
        fi
    else
        log_ok "huggingface-cli 已安装, 跳过"
    fi

    # 设置 HuggingFace 镜像加速
    export HF_ENDPOINT="${HF_ENDPOINT}"
    log_info "HuggingFace 镜像: ${HF_ENDPOINT}"

    # -- 创建模型目录结构 --
    local model_dirs=("image" "video" "tts" "lipsync" "3d" "checkpoints")
    for dir in "${model_dirs[@]}"; do
        mkdir -p "${AI_MODELS}/${dir}"
    done

    # -- 模型下载列表 (仓库ID:目标目录:描述) --
    # 格式: "repo_id|local_dir|description|priority"
    local models=(
        "NucleusAI/Nucleus-Image|${AI_MODELS}/image/nucleus-image|Nucleus-Image 17B (图像生成)|required"
        "QuantStack/FLUX.1-Kontext-dev-GGUF|${AI_MODELS}/image/flux-kontext|FLUX.1 Kontext Q4 (线稿上色)|required"
        "Wan-AI/Wan2.1-T2V-14B|${AI_MODELS}/video/wan-2.7|Wan 2.7 (视频生成)|required"
        "FunAudioLLM/CosyVoice2-0.5B|${AI_MODELS}/tts/cosyvoice2|CosyVoice2-0.5B (TTS 配音)|required"
        "fishaudio/fish-speech-1.5|${AI_MODELS}/tts/fish-speech|Fish-Speech 1.5 (TTS 配音)|required"
        "KwaiVGI/LivePortrait|${AI_MODELS}/lipsync/liveportrait|LivePortrait (口型同步)|required"
        "tencent/Hunyuan3D-2|${AI_MODELS}/3d/hunyuan3d|Hunyuan3D 2.0 (3D 资产)|optional"
        "tencent/HY-World-2.0|${AI_MODELS}/3d/hy-world|HY-World 2.0 (3D 场景)|optional"
        "jianzongwu/DiffSensei|${AI_MODELS}/image/diffsensei|DiffSensei (漫画生成)|optional"
    )

    local download_count=0
    local skip_count=0
    local fail_count=0

    for entry in "${models[@]}"; do
        IFS='|' read -r repo_id local_dir description priority <<< "$entry"

        # 幂等: 目录已存在且非空则跳过
        if [[ -d "$local_dir" ]] && [[ -n "$(ls -A "$local_dir" 2>/dev/null)" ]]; then
            log_ok "模型已存在: ${description}, 跳过"
            skip_count=$((skip_count + 1))
            continue
        fi

        # 可选模型: 检查磁盘空间
        if [[ "$priority" == "optional" ]]; then
            local avail_gb
            avail_gb=$(df -BG "${AI_MODELS}" | awk 'NR==2 {gsub(/G/,"",$4); print $4}')
            if [[ "$avail_gb" -lt 30 ]]; then
                log_warn "磁盘空间不足 (${avail_gb}GB), 跳过可选模型: ${description}"
                skip_count=$((skip_count + 1))
                continue
            fi
        fi

        # 下载模型 (huggingface-cli 原生支持断点续传)
        log_info "下载模型: ${description} (${repo_id})..."
        mkdir -p "$local_dir"

        if HF_ENDPOINT="${HF_ENDPOINT}" huggingface-cli download \
            "$repo_id" \
            --local-dir "$local_dir" \
            --local-dir-use-symlinks False \
            --resume-download 2>&1 | tail -5; then
            log_ok "模型下载完成: ${description}"
            download_count=$((download_count + 1))
        else
            log_error "模型下载失败: ${description}"
            fail_count=$((fail_count + 1))
        fi
    done

    log_info "模型下载汇总: 成功=${download_count}, 跳过=${skip_count}, 失败=${fail_count}"
}

# ============================================================================
# 第十一节: 配置服务间连接
# ============================================================================

configure_connections() {
    log_step "配置服务间连接"

    # -- 验证各服务端口可达 --
    local services=(
        "Ollama|127.0.0.1:11434|/api/tags"
        "LocalAI|127.0.0.1:8090|/readyz"
        "Open WebUI|127.0.0.1:3000|/"
        "Dify|127.0.0.1:3001|/"
        "ComfyUI|127.0.0.1:8188|/"
    )

    for entry in "${services[@]}"; do
        IFS='|' read -r name addr path <<< "$entry"
        if curl -sf --max-time 5 "http://${addr}${path}" &>/dev/null; then
            log_ok "${name} (${addr}) -- 连接正常"
        else
            log_warn "${name} (${addr}) -- 连接失败 (服务可能仍在启动中)"
        fi
    done

    # -- 配置 Dify 连接 Ollama --
    log_info "Dify 连接 Ollama: 请在 Dify Web 界面中添加模型提供者"
    log_info "  地址: http://host.docker.internal:11434"
    log_info "  类型: Ollama"

    # -- 配置 Open WebUI 连接 ComfyUI --
    log_info "Open WebUI 已配置连接:"
    log_info "  Ollama: http://host.docker.internal:11434"
    log_info "  ComfyUI: http://host.docker.internal:8188"

    log_info "服务间连接配置完成"
}

# ============================================================================
# 第十二节: 健康检查 + 状态报告
# ============================================================================

health_check() {
    log_step "健康检查 + 状态报告"

    # -- 检查所有 AI 容器运行状态 --
    local all_containers=(
        "ollama"
        "localai"
        "open-webui"
        "dify-api"
        "dify-web"
        "dify-worker"
        "dify-db"
        "dify-redis"
        "dify-sandbox"
        "dify-ssrf-proxy"
        "comfyui"
        "unsloth-studio"
        "kohya-ss"
    )

    local running=0
    local stopped=0
    local missing=0

    echo ""
    printf "${CYAN}%-20s %-12s %-25s${NC}\n" "容器名称" "状态" "端口"
    printf "${CYAN}%-20s %-12s %-25s${NC}\n" "--------------------" "------------" "-------------------------"

    for name in "${all_containers[@]}"; do
        local status port_info
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
            status="${GREEN}运行中${NC}"
            running=$((running + 1))
            # 获取端口映射
            port_info=$(docker port "$name" 2>/dev/null | head -1 | sed 's/.*-> //' || echo "-")
        elif docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
            status="${RED}已停止${NC}"
            stopped=$((stopped + 1))
            port_info="-"
        else
            status="${YELLOW}未部署${NC}"
            missing=$((missing + 1))
            port_info="-"
        fi
        printf "%-20s %-24s %-25s\n" "$name" "$status" "$port_info"
    done

    echo ""
    log_info "容器汇总: 运行=${running}, 停止=${stopped}, 未部署=${missing}"

    # -- 检查 GPU 状态 --
    if command -v nvidia-smi &>/dev/null; then
        echo ""
        log_info "GPU 状态:"
        nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total \
            --format=csv,noheader 2>/dev/null | while IFS=',' read -r name temp util mem_used mem_total; do
            log_info "  ${name} | 温度:${temp}C | 利用率:${util} | 显存:${mem_used}/${mem_total}"
        done
    fi

    # -- 检查端口绑定安全性 (确保全部绑定 127.0.0.1) --
    log_info "检查端口绑定安全性..."
    local unsafe_ports=0
    for name in "${all_containers[@]}"; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
            local ports
            ports=$(docker port "$name" 2>/dev/null || true)
            if echo "$ports" | grep -v "127.0.0.1" | grep -q "0.0.0.0"; then
                log_error "  [${name}] 端口绑定到 0.0.0.0 (不安全)"
                unsafe_ports=$((unsafe_ports + 1))
            fi
        fi
    done

    if [[ $unsafe_ports -eq 0 ]]; then
        log_ok "所有端口均绑定 127.0.0.1 (安全)"
    else
        log_error "${unsafe_ports} 个容器端口绑定到 0.0.0.0, 请检查并修复"
    fi
}

# ============================================================================
# 第十三节: 生成 AI-GUIDE.md 使用指南
# ============================================================================

generate_guide() {
    log_step "生成 AI-GUIDE.md 使用指南"

    local guide_path="${STARHUB_DATA}/AI-GUIDE.md"

    cat > "$guide_path" <<'GUIDE_EOF'
# 星聚OS AI 模型工厂 — 使用指南

## 服务访问地址

| 服务 | 地址 | 用途 |
|------|------|------|
| Open WebUI | http://127.0.0.1:3000 | AI 对话界面 (支持多模型切换) |
| Dify | http://127.0.0.1:3001 | AI 工作流编排 + Agent |
| ComfyUI | http://127.0.0.1:8188 | 图像/视频/3D 生成工作流 |
| LocalAI | http://127.0.0.1:8090 | 统一推理 API (OpenAI 兼容) |
| Ollama | http://127.0.0.1:11434 | LLM 模型管理 |
| Unsloth Studio | http://127.0.0.1:7681 | LLM 微调 (QLoRA) |
| kohya_ss | http://127.0.0.1:7682 | 图像 LoRA 训练 |

> 所有服务仅绑定 127.0.0.1, 通过 Cloudflare Tunnel 安全暴露到公网。

---

## 快速开始

### 1. AI 对话
打开 Open WebUI (http://127.0.0.1:3000), 首次使用需注册管理员账号。
左上角选择模型 (推荐 qwen3:35b-a3b), 即可开始对话。

### 2. 图像生成
打开 ComfyUI (http://127.0.0.1:8188), 加载预置工作流或自行搭建节点。
推荐模型: Nucleus-Image (文生图), FLUX Kontext (线稿上色)。

### 3. 视频生成
在 ComfyUI 中使用 WanVideoWrapper 节点, 加载 Wan 2.7 模型。
支持文生视频和图生视频。

### 4. AI 工作流
打开 Dify (http://127.0.0.1:3001), 首次使用需设置管理员账号。
在"设置 > 模型提供者"中添加 Ollama (http://host.docker.internal:11434)。
然后创建工作流或导入预置模板。

### 5. LLM 微调
打开 Unsloth Studio (http://127.0.0.1:7681)。
上传训练数据 (JSONL 格式) 到 /mnt/storage/ai_models/training_data/。
选择基础模型, 配置 QLoRA 参数, 开始训练。

### 6. 图像 LoRA 训练
打开 kohya_ss (http://127.0.0.1:7682)。
准备训练图片到 /mnt/storage/ai_models/training_data/。
选择基础模型 (如 FLUX), 配置训练参数, 开始训练。

---

## 模型列表

### LLM 模型 (Ollama 管理)
| 模型 | 大小 | 用途 |
|------|------|------|
| qwen3:35b-a3b | ~21GB | 路由/日常对话 (白天常驻) |
| kimi-k2 (量化) | ~40GB | 代码生成主力 |

### 图像模型 (ComfyUI)
| 模型 | 大小 | 用途 |
|------|------|------|
| Nucleus-Image | ~12GB | 文生图 (GenEval 0.87) |
| FLUX.1 Kontext | ~7GB | 线稿上色/风格迁移 |
| DiffSensei | ~12GB | 漫画生成 |

### 视频模型 (ComfyUI)
| 模型 | 大小 | 用途 |
|------|------|------|
| Wan 2.7 | ~35GB | 文/图/声转视频 |

### TTS 模型 (ComfyUI)
| 模型 | 大小 | 用途 |
|------|------|------|
| CosyVoice2-0.5B | ~3GB | 多语言声音克隆 |
| Fish-Speech 1.5 | ~4GB | TTS 配音 |

### 其他模型
| 模型 | 大小 | 用途 |
|------|------|------|
| LivePortrait | ~3GB | 口型同步 |
| Hunyuan3D 2.0 | ~18GB | 3D 资产生成 |
| HY-World 2.0 | ~25GB | 3D 场景生成 |

---

## 常见问题

### Q: 模型下载很慢怎么办?
A: 脚本已配置 hf-mirror.com 镜像加速。如果仍然很慢, 可手动设置:
```bash
export HF_ENDPOINT=https://hf-mirror.com
huggingface-cli download <repo_id> --local-dir <path> --resume-download
```

### Q: GPU 显存不够怎么办?
A: 白天模式仅加载 qwen3:35b-a3b (~22GB VRAM), 其他模型按需加载。
   使用 `nvidia-smi` 查看显存占用, 用 `docker stop <容器名>` 释放显存。

### Q: 如何添加新模型?
A: Ollama 模型: `docker exec ollama ollama pull <模型名>`
   ComfyUI 模型: 下载到 /mnt/storage/ai_models/ 对应目录
   LocalAI 模型: 通过 API 或 Gallery 安装

### Q: 如何更新服务?
A: 重新运行 ai-factory-deploy.sh, 脚本会自动跳过已运行的容器。
   如需强制更新: `docker stop <容器名> && docker rm <容器名>`, 然后重新运行脚本。

### Q: 端口冲突怎么办?
A: 修改 ai-factory-config.json 中对应服务的端口配置, 然后重新部署。

---

## 目录结构

```
/mnt/storage/ai_models/          # AI 模型文件 (SSD)
  image/                         # 图像模型
  video/                         # 视频模型
  tts/                           # TTS 模型
  lipsync/                       # 口型同步模型
  3d/                            # 3D 模型
  ollama/                        # Ollama LLM 模型
  training_data/                 # 训练数据
  lora_adapters/                 # LoRA 适配器
  checkpoints/                   # 训练检查点

/mnt/storage/starhub/            # 服务数据
  open-webui-data/               # Open WebUI 数据
  dify/                          # Dify 配置和数据
  comfyui-data/                  # ComfyUI 输出
  unsloth-data/                  # Unsloth 训练输出
  kohya-data/                    # kohya_ss 训练输出
```

---

> 由 ai-factory-deploy.sh 自动生成
GUIDE_EOF

    log_ok "AI-GUIDE.md 已生成: ${guide_path}"
}

# ============================================================================
# 第十四节: 主函数
# ============================================================================

main() {
    echo ""
    echo -e "${CYAN}============================================================${NC}"
    echo -e "${CYAN}  星聚OS AI 模型工厂 — 一键部署${NC}"
    echo -e "${CYAN}  开源 AI 服务全家桶: Ollama + LocalAI + Open WebUI${NC}"
    echo -e "${CYAN}                       Dify + ComfyUI + Unsloth + kohya_ss${NC}"
    echo -e "${CYAN}============================================================${NC}"
    echo ""

    local start_time
    start_time=$(date +%s)

    # -- 第一步: 基础检查 --
    check_root
    check_prerequisites

    # -- 第二步: 部署 Ollama + 拉取 LLM 模型 --
    deploy_ollama_models

    # -- 第三步: 部署 LocalAI --
    deploy_localai

    # -- 第四步: 部署 Open WebUI --
    deploy_open_webui

    # -- 第五步: 部署 Dify --
    deploy_dify

    # -- 第六步: 部署 ComfyUI + 插件 --
    deploy_comfyui

    # -- 第七步: 部署 Unsloth Studio --
    deploy_unsloth

    # -- 第八步: 部署 kohya_ss --
    deploy_kohya_ss

    # -- 第九步: 下载 AI 模型 --
    download_ai_models

    # -- 第十步: 配置服务间连接 --
    configure_connections

    # -- 第十一步: 健康检查 --
    health_check

    # -- 第十二步: 生成使用指南 --
    generate_guide

    # -- 部署完成汇总 --
    local elapsed=$(( $(date +%s) - start_time ))
    local elapsed_min=$(( elapsed / 60 ))
    local elapsed_sec=$(( elapsed % 60 ))

    echo ""
    echo -e "${CYAN}============================================================${NC}"
    echo -e "${CYAN}  AI 模型工厂部署完成${NC}"
    echo -e "${CYAN}============================================================${NC}"
    echo ""
    log_info "耗时: ${elapsed_min}分${elapsed_sec}秒"
    log_info "成功: ${DEPLOY_SUCCESS} 个服务"
    if [[ $DEPLOY_FAIL -gt 0 ]]; then
        log_warn "失败: ${DEPLOY_FAIL} 个服务 (请检查上方日志)"
    fi
    echo ""
    log_info "服务访问地址:"
    log_info "  Open WebUI:      http://127.0.0.1:3000"
    log_info "  Dify:            http://127.0.0.1:3001"
    log_info "  ComfyUI:         http://127.0.0.1:8188"
    log_info "  LocalAI API:     http://127.0.0.1:8090"
    log_info "  Ollama API:      http://127.0.0.1:11434"
    log_info "  Unsloth Studio:  http://127.0.0.1:7681"
    log_info "  kohya_ss:        http://127.0.0.1:7682"
    echo ""
    log_info "使用指南: ${STARHUB_DATA}/AI-GUIDE.md"
    log_ok "AI 模型工厂部署完成, 打开浏览器开始使用"
    echo ""
}

# 执行主函数
main "$@"
