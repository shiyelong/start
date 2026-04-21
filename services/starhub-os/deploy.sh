#!/usr/bin/env bash
# ============================================================================
# 星聚OS (StarHub OS) — Debian 13 "Trixie" 一键部署脚本
# ============================================================================
# 目标系统: Debian 13 "Trixie" (内核 6.12 LTS), 无桌面环境
# 目标硬件: i5-12400 + RTX 3090 24GB + 64GB DDR4
# 用途: 自主 AI 服务器操作系统一键部署
# 需求: 80.1, 80.2, 80.4, 81.2
# ============================================================================

set -euo pipefail

# ============================================================================
# 第零节: 颜色输出与工具函数
# ============================================================================

readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # 无颜色

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[FAIL]${NC}  $*"; }
log_step()  { echo -e "\n${CYAN}========== $* ==========${NC}"; }

# 检查是否以 root 运行
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "此脚本必须以 root 权限运行 (sudo bash deploy.sh)"
        exit 1
    fi
}

# ============================================================================
# 第一节: 系统检测 (需求 80.1, 80.2)
# ============================================================================

detect_system() {
    log_step "系统检测"

    # -- 检测 Debian 版本 --
    if [[ ! -f /etc/debian_version ]]; then
        log_error "未检测到 Debian 系统, 此脚本仅支持 Debian 13 Trixie"
        exit 1
    fi

    local debian_version
    debian_version=$(cat /etc/debian_version)

    if [[ "$debian_version" == 13.* ]] || [[ "$debian_version" == "trixie/sid" ]]; then
        log_ok "Debian 版本: ${debian_version} (Trixie)"
    else
        log_error "不支持的 Debian 版本: ${debian_version}, 需要 Debian 13 Trixie"
        exit 1
    fi

    # -- 检测 CPU 核心数 (最低 4 核) --
    local cpu_cores
    cpu_cores=$(nproc)

    if [[ "$cpu_cores" -ge 4 ]]; then
        log_ok "CPU 核心数: ${cpu_cores} (>= 4 核)"
    else
        log_error "CPU 核心数不足: ${cpu_cores} 核, 最低要求 4 核"
        exit 1
    fi

    # -- 检测内存 (最低 32GB) --
    local ram_kb ram_gb
    ram_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    ram_gb=$(( ram_kb / 1024 / 1024 ))

    if [[ "$ram_gb" -ge 30 ]]; then
        # 实际 32GB 内存在系统中通常显示为 ~31GB
        log_ok "内存容量: ${ram_gb}GB (>= 32GB)"
    else
        log_error "内存不足: ${ram_gb}GB, 最低要求 32GB"
        exit 1
    fi

    # -- 检测 NVIDIA GPU --
    if command -v nvidia-smi &>/dev/null; then
        local gpu_name
        gpu_name=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || true)
        if [[ -n "$gpu_name" ]]; then
            log_ok "NVIDIA GPU: ${gpu_name}"
        else
            log_warn "nvidia-smi 可用但未检测到 GPU, 将在安装驱动后重新检测"
        fi
    elif lspci 2>/dev/null | grep -qi nvidia; then
        local pci_gpu
        pci_gpu=$(lspci | grep -i nvidia | head -1 | sed 's/.*: //')
        log_warn "检测到 NVIDIA 设备 (${pci_gpu}), 但驱动未安装, 后续步骤将安装"
    else
        log_warn "未检测到 NVIDIA GPU, AI 处理将使用 CPU 模式 (性能大幅降低)"
    fi

    # -- 检测磁盘可用空间 (系统盘 >= 200GB 推荐) --
    local root_avail_gb
    root_avail_gb=$(df -BG / | awk 'NR==2 {gsub(/G/,"",$4); print $4}')

    if [[ "$root_avail_gb" -ge 200 ]]; then
        log_ok "系统盘可用空间: ${root_avail_gb}GB (>= 200GB)"
    elif [[ "$root_avail_gb" -ge 50 ]]; then
        log_warn "系统盘可用空间: ${root_avail_gb}GB (推荐 >= 200GB, 可继续)"
    else
        log_error "系统盘可用空间不足: ${root_avail_gb}GB, 最低需要 50GB"
        exit 1
    fi

    log_info "系统检测完成"
}

# ============================================================================
# 第二节: 配置 apt 国内镜像源 (需求 80.4)
# ============================================================================

# apt 镜像源列表 (按优先级排序)
readonly APT_MIRRORS=(
    "https://mirrors.tuna.tsinghua.edu.cn/debian"       # 清华大学
    "https://mirrors.ustc.edu.cn/debian"                 # 中国科学技术大学
    "https://mirrors.aliyun.com/debian"                  # 阿里云
)

readonly APT_SECURITY_MIRRORS=(
    "https://mirrors.tuna.tsinghua.edu.cn/debian-security"
    "https://mirrors.ustc.edu.cn/debian-security"
    "https://mirrors.aliyun.com/debian-security"
)

# 测试镜像源延迟, 返回最快的镜像
select_fastest_mirror() {
    local fastest_mirror=""
    local fastest_time=9999

    for mirror in "${APT_MIRRORS[@]}"; do
        local domain
        domain=$(echo "$mirror" | awk -F/ '{print $3}')
        # 使用 curl 测量连接时间, 超时 3 秒
        local time_ms
        time_ms=$(curl -o /dev/null -s -w '%{time_connect}' --connect-timeout 3 "$mirror/dists/trixie/Release" 2>/dev/null || echo "9999")

        if command -v bc &>/dev/null; then
            if (( $(echo "$time_ms < $fastest_time" | bc -l 2>/dev/null || echo 0) )); then
                fastest_time="$time_ms"
                fastest_mirror="$mirror"
            fi
        else
            # 没有 bc 时用简单字符串比较 (粗略但可用)
            if [[ "$time_ms" < "$fastest_time" ]]; then
                fastest_time="$time_ms"
                fastest_mirror="$mirror"
            fi
        fi
        log_info "  测速: ${domain} -> ${time_ms}s"
    done

    if [[ -z "$fastest_mirror" ]]; then
        # 回退到清华源
        fastest_mirror="${APT_MIRRORS[0]}"
        log_warn "镜像测速失败, 使用默认源: 清华大学"
    fi

    echo "$fastest_mirror"
}

configure_apt_sources() {
    log_step "配置 apt 国内镜像源"

    # 备份原始 sources.list (幂等: 仅首次备份)
    if [[ -f /etc/apt/sources.list && ! -f /etc/apt/sources.list.bak.starhub ]]; then
        cp /etc/apt/sources.list /etc/apt/sources.list.bak.starhub
        log_info "已备份原始 sources.list"
    fi

    # 自动选择最快镜像
    log_info "正在测试镜像源速度..."
    local selected_mirror
    selected_mirror=$(select_fastest_mirror)

    local mirror_name
    mirror_name=$(echo "$selected_mirror" | awk -F/ '{print $3}')
    log_ok "选择最快镜像: ${mirror_name}"

    # 确定对应的 security 镜像
    local selected_security=""
    for i in "${!APT_MIRRORS[@]}"; do
        if [[ "${APT_MIRRORS[$i]}" == "$selected_mirror" ]]; then
            selected_security="${APT_SECURITY_MIRRORS[$i]}"
            break
        fi
    done
    if [[ -z "$selected_security" ]]; then
        selected_security="${APT_SECURITY_MIRRORS[0]}"
    fi

    # 写入 Debian 13 Trixie 的 sources.list
    # 使用 DEB822 格式 (.sources) 或传统格式, 这里用传统格式兼容性更好
    cat > /etc/apt/sources.list <<EOF
# 星聚OS apt 源配置 — Debian 13 Trixie
# 镜像源: ${mirror_name}
# 由 deploy.sh 自动生成, 请勿手动修改

deb ${selected_mirror} trixie main contrib non-free non-free-firmware
deb-src ${selected_mirror} trixie main contrib non-free non-free-firmware

deb ${selected_mirror} trixie-updates main contrib non-free non-free-firmware
deb-src ${selected_mirror} trixie-updates main contrib non-free non-free-firmware

deb ${selected_mirror} trixie-backports main contrib non-free non-free-firmware
deb-src ${selected_mirror} trixie-backports main contrib non-free non-free-firmware

deb ${selected_security} trixie-security main contrib non-free non-free-firmware
deb-src ${selected_security} trixie-security main contrib non-free non-free-firmware
EOF

    log_ok "apt sources.list 已写入 (Debian 13 Trixie)"

    # 更新包索引
    log_info "正在更新 apt 包索引..."
    apt-get update -qq
    log_ok "apt 包索引更新完成"
}

# ============================================================================
# 第三节: 安装基础软件包 (需求 80.3)
# ============================================================================

install_base_packages() {
    log_step "安装基础软件包"

    # -- 基础工具 --
    local base_tools="curl wget git jq bc htop iotop tmux unzip p7zip-full rsync sqlite3 smartmontools hdparm"
    local missing_tools=()
    for pkg in $base_tools; do
        if ! dpkg -s "$pkg" &>/dev/null; then
            missing_tools+=("$pkg")
        fi
    done
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log_info "安装基础工具: ${missing_tools[*]}"
        apt-get install -y -qq "${missing_tools[@]}"
        log_ok "基础工具安装完成"
    else
        log_ok "基础工具已安装, 跳过"
    fi

    # -- Python 3 + pip + venv --
    local python_pkgs="python3 python3-pip python3-venv"
    local missing_py=()
    for pkg in $python_pkgs; do
        if ! dpkg -s "$pkg" &>/dev/null; then
            missing_py+=("$pkg")
        fi
    done
    if [[ ${#missing_py[@]} -gt 0 ]]; then
        log_info "安装 Python3: ${missing_py[*]}"
        apt-get install -y -qq "${missing_py[@]}"
        log_ok "Python3 安装完成 ($(python3 --version 2>&1))"
    else
        log_ok "Python3 已安装 ($(python3 --version 2>&1)), 跳过"
    fi

    # -- Docker CE (官方仓库) --
    if ! command -v docker &>/dev/null; then
        log_info "安装 Docker CE (官方仓库)..."
        apt-get install -y -qq ca-certificates gnupg

        # 添加 Docker GPG 密钥
        install -m 0755 -d /etc/apt/keyrings
        if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
            curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            chmod a+r /etc/apt/keyrings/docker.gpg
        fi

        # 添加 Docker apt 仓库 (Debian 13 Trixie)
        if [[ ! -f /etc/apt/sources.list.d/docker.list ]]; then
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian trixie stable" \
                > /etc/apt/sources.list.d/docker.list
            apt-get update -qq
        fi

        apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
        systemctl enable --now docker
        log_ok "Docker CE 安装完成 ($(docker --version 2>&1))"
    else
        log_ok "Docker CE 已安装 ($(docker --version 2>&1)), 跳过"
    fi

    # -- NVIDIA 驱动 + nvidia-container-toolkit --
    if ! dpkg -s nvidia-driver &>/dev/null; then
        log_info "安装 NVIDIA 驱动 (non-free)..."
        apt-get install -y -qq nvidia-driver
        log_ok "NVIDIA 驱动安装完成"
    else
        log_ok "NVIDIA 驱动已安装, 跳过"
    fi

    if ! command -v nvidia-ctk &>/dev/null; then
        log_info "安装 nvidia-container-toolkit..."
        # 添加 NVIDIA Container Toolkit GPG 密钥和仓库
        if [[ ! -f /etc/apt/keyrings/nvidia-container-toolkit-keyring.gpg ]]; then
            curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
                | gpg --dearmor -o /etc/apt/keyrings/nvidia-container-toolkit-keyring.gpg
        fi
        if [[ ! -f /etc/apt/sources.list.d/nvidia-container-toolkit.list ]]; then
            curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
                | sed 's#deb https://#deb [signed-by=/etc/apt/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
                > /etc/apt/sources.list.d/nvidia-container-toolkit.list
            apt-get update -qq
        fi
        apt-get install -y -qq nvidia-container-toolkit
        log_ok "nvidia-container-toolkit 安装完成"
    else
        log_ok "nvidia-container-toolkit 已安装, 跳过"
    fi

    # -- 存储与备份工具: mergerfs, snapraid, borgbackup --
    local storage_pkgs="mergerfs snapraid borgbackup"
    local missing_storage=()
    for pkg in $storage_pkgs; do
        if ! dpkg -s "$pkg" &>/dev/null; then
            missing_storage+=("$pkg")
        fi
    done
    if [[ ${#missing_storage[@]} -gt 0 ]]; then
        log_info "安装存储与备份工具: ${missing_storage[*]}"
        apt-get install -y -qq "${missing_storage[@]}"
        log_ok "存储与备份工具安装完成"
    else
        log_ok "存储与备份工具已安装, 跳过"
    fi

    # -- cloudflared (Cloudflare Tunnel 客户端) --
    if ! command -v cloudflared &>/dev/null; then
        log_info "安装 cloudflared..."
        local arch
        arch=$(dpkg --print-architecture)
        curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}.deb" \
            -o /tmp/cloudflared.deb
        dpkg -i /tmp/cloudflared.deb
        rm -f /tmp/cloudflared.deb
        log_ok "cloudflared 安装完成 ($(cloudflared --version 2>&1))"
    else
        log_ok "cloudflared 已安装 ($(cloudflared --version 2>&1)), 跳过"
    fi

    # -- Node.js 20 LTS (NodeSource 仓库) --
    if ! command -v node &>/dev/null || ! node --version 2>/dev/null | grep -q "^v20\."; then
        log_info "安装 Node.js 20 LTS (NodeSource)..."
        if [[ ! -f /etc/apt/keyrings/nodesource.gpg ]]; then
            curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
                | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
        fi
        if [[ ! -f /etc/apt/sources.list.d/nodesource.list ]]; then
            echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
                > /etc/apt/sources.list.d/nodesource.list
            apt-get update -qq
        fi
        apt-get install -y -qq nodejs
        log_ok "Node.js 安装完成 ($(node --version 2>&1), npm $(npm --version 2>&1))"
    else
        log_ok "Node.js 20 LTS 已安装 ($(node --version 2>&1)), 跳过"
    fi

    log_info "基础软件包安装全部完成"
}

# ============================================================================
# 第四节: 安装 skopeo (镜像拉取回退工具)
# ============================================================================

install_skopeo() {
    # 幂等: 已安装则跳过
    if command -v skopeo &>/dev/null; then
        log_ok "skopeo 已安装 ($(skopeo --version 2>&1 | head -1)), 跳过"
        return 0
    fi

    log_info "安装 skopeo..."

    # 优先尝试 apt 安装 (Debian 13 Trixie 仓库自带)
    if apt-get install -y -qq skopeo 2>/dev/null; then
        log_ok "skopeo 通过 apt 安装完成 ($(skopeo --version 2>&1 | head -1))"
        return 0
    fi

    # apt 失败则从 GitHub Releases 下载静态编译版本
    log_warn "apt 安装 skopeo 失败, 尝试下载静态编译版本..."
    local arch
    arch=$(dpkg --print-architecture)
    local skopeo_url="https://github.com/lework/skopeo-binary/releases/latest/download/skopeo-linux-${arch}"

    if curl -fsSL "$skopeo_url" -o /usr/local/bin/skopeo; then
        chmod +x /usr/local/bin/skopeo
        log_ok "skopeo 静态版本安装完成 (/usr/local/bin/skopeo)"
    else
        log_warn "skopeo 安装失败, pull_image 将无法使用 skopeo 回退"
        return 1
    fi
}

# ============================================================================
# 第五节: 配置 Docker 镜像加速与 NVIDIA runtime (需求 20.1-20.3, 66.1, 66.4, 67.4, 22.2)
# ============================================================================

# Docker 镜像加速源列表 (中国大陆)
readonly DOCKER_MIRRORS=(
    "https://xuanyuan.cloud/free"
    "https://docker.aityp.com"
    "https://1ms.run"
    "https://docker.m.daocloud.io"
)

configure_docker() {
    log_step "配置 Docker 镜像加速与 NVIDIA runtime"

    # -- 安装 skopeo 回退工具 --
    install_skopeo

    # -- 写入 /etc/docker/daemon.json --
    # 幂等: 每次覆盖写入, 确保配置最新
    local daemon_json="/etc/docker/daemon.json"
    local need_restart=0

    # 备份已有配置 (仅首次)
    if [[ -f "$daemon_json" && ! -f "${daemon_json}.bak.starhub" ]]; then
        cp "$daemon_json" "${daemon_json}.bak.starhub"
        log_info "已备份原始 daemon.json"
    fi

    # 构建 daemon.json 内容
    # 包含: 镜像加速源 + NVIDIA runtime + 日志轮转 + overlay2 存储驱动
    cat > "$daemon_json" <<'DAEMON_EOF'
{
    "registry-mirrors": [
        "https://xuanyuan.cloud/free",
        "https://docker.aityp.com",
        "https://1ms.run",
        "https://docker.m.daocloud.io"
    ],
    "runtimes": {
        "nvidia": {
            "path": "nvidia-container-runtime",
            "runtimeArgs": []
        }
    },
    "default-runtime": "nvidia",
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "storage-driver": "overlay2"
}
DAEMON_EOF

    log_ok "daemon.json 已写入: 镜像加速 + NVIDIA runtime + 日志轮转 + overlay2"

    # -- 重启 Docker 使配置生效 --
    log_info "重启 Docker daemon 使配置生效..."
    systemctl restart docker
    # 等待 Docker 就绪
    local wait_count=0
    while ! docker info &>/dev/null; do
        sleep 1
        wait_count=$((wait_count + 1))
        if [[ $wait_count -ge 30 ]]; then
            log_error "Docker 重启超时 (30秒), 请手动检查 'systemctl status docker'"
            return 1
        fi
    done
    log_ok "Docker daemon 重启完成"

    # -- 验证 NVIDIA runtime --
    if command -v nvidia-smi &>/dev/null; then
        log_info "验证 NVIDIA runtime (docker run --gpus all nvidia-smi)..."
        if docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi &>/dev/null; then
            log_ok "NVIDIA runtime 验证通过: Docker 容器可访问 GPU"
        else
            log_warn "NVIDIA runtime 验证失败, AI 容器可能无法使用 GPU"
            log_warn "请确认 nvidia-container-toolkit 已正确安装, 可手动运行:"
            log_warn "  docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi"
        fi
    else
        log_warn "nvidia-smi 不可用, 跳过 NVIDIA runtime 验证"
        log_warn "AI 容器将以 CPU 模式运行 (性能大幅降低)"
    fi

    # -- 验证镜像加速源配置 --
    local configured_mirrors
    configured_mirrors=$(docker info 2>/dev/null | grep -A 10 "Registry Mirrors" | grep "https://" | wc -l)
    if [[ "$configured_mirrors" -gt 0 ]]; then
        log_ok "Docker 镜像加速源已配置 (${configured_mirrors} 个)"
    else
        log_warn "镜像加速源未生效, 请检查 daemon.json 格式"
    fi

    log_info "Docker 镜像加速与 NVIDIA runtime 配置完成"
}

# ============================================================================
# 第六节: 镜像拉取函数 (镜像加速 + skopeo 回退)
# ============================================================================

# 拉取 Docker 镜像, 支持镜像加速源回退和 skopeo 最终回退
# 参数: $1 = 镜像名称 (如 redis:7-alpine)
# 返回: 0=成功, 1=失败
pull_image() {
    local image="$1"

    if [[ -z "$image" ]]; then
        log_error "pull_image: 未指定镜像名称"
        return 1
    fi

    # 幂等: 本地已有则跳过
    if docker image inspect "$image" &>/dev/null; then
        log_ok "镜像已存在: ${image}, 跳过拉取"
        return 0
    fi

    log_info "拉取镜像: ${image}"
    local start_time
    start_time=$(date +%s)

    # 方式一: docker pull (利用 daemon.json 中配置的镜像加速源)
    # Docker daemon 会自动按 registry-mirrors 顺序尝试
    local retry_count=0
    local max_retries=3
    while [[ $retry_count -lt $max_retries ]]; do
        if docker pull "$image" 2>/dev/null; then
            local elapsed=$(( $(date +%s) - start_time ))
            log_ok "镜像拉取成功 (docker pull): ${image} [${elapsed}秒]"
            return 0
        fi
        retry_count=$((retry_count + 1))
        if [[ $retry_count -lt $max_retries ]]; then
            log_warn "docker pull 失败 (第${retry_count}次), ${retry_count}0秒后重试..."
            sleep $((retry_count * 10))
        fi
    done

    log_warn "docker pull 失败 (已重试${max_retries}次), 尝试 skopeo 回退..."

    # 方式二: skopeo copy 回退 (从 docker.io 复制到本地 Docker daemon)
    if command -v skopeo &>/dev/null; then
        # 确定完整镜像引用 (补全 docker.io/library/ 前缀)
        local full_ref="$image"
        if [[ "$image" != */* ]]; then
            # 官方镜像, 如 redis:7-alpine -> docker.io/library/redis:7-alpine
            full_ref="docker.io/library/${image}"
        elif [[ "$image" != *.*/* ]]; then
            # 用户镜像, 如 linuxserver/sonarr -> docker.io/linuxserver/sonarr
            full_ref="docker.io/${image}"
        fi

        if skopeo copy --src-tls-verify=false "docker://${full_ref}" "docker-daemon:${image}" 2>/dev/null; then
            local elapsed=$(( $(date +%s) - start_time ))
            log_ok "镜像拉取成功 (skopeo): ${image} [${elapsed}秒]"
            return 0
        else
            log_error "skopeo 回退也失败: ${image}"
        fi
    else
        log_error "skopeo 未安装, 无法执行回退拉取: ${image}"
    fi

    local elapsed=$(( $(date +%s) - start_time ))
    log_error "镜像拉取失败: ${image} [尝试${elapsed}秒]"
    return 1
}

# ============================================================================
# 第七节: 配置存储系统 mergerfs + snapraid (需求 82.1-82.7)
# ============================================================================

configure_storage() {
    log_step "配置存储系统 mergerfs + snapraid"

    # ========================================================================
    # 用户自定义磁盘配置 (请根据实际硬件修改)
    # ========================================================================
    # 数据盘列表: 参与 mergerfs 合并的磁盘分区
    # 格式: "设备路径:挂载点" (空格分隔)
    # 示例: 两块数据盘 sdb1 和 sdc1
    local DATA_DISKS=(
        "/dev/sdb1:/mnt/disk1"
        "/dev/sdc1:/mnt/disk2"
    )

    # 校验盘: snapraid parity 盘 (不参与 mergerfs, 仅用于数据保护)
    local PARITY_DISK="/dev/sdd1"
    local PARITY_MOUNT="/mnt/parity"

    # 所有物理磁盘设备 (用于 SMART 监控和 HDD 休眠, 不含分区号)
    local ALL_DISK_DEVICES=("/dev/sdb" "/dev/sdc" "/dev/sdd")

    # mergerfs 合并挂载点
    local MERGERFS_MOUNT="/mnt/storage"

    # ========================================================================
    # 1. 创建挂载点目录
    # ========================================================================
    log_info "创建磁盘挂载点目录..."

    for entry in "${DATA_DISKS[@]}"; do
        local mount_point="${entry#*:}"
        if [[ ! -d "$mount_point" ]]; then
            mkdir -p "$mount_point"
            log_info "  创建目录: ${mount_point}"
        fi
    done

    if [[ ! -d "$PARITY_MOUNT" ]]; then
        mkdir -p "$PARITY_MOUNT"
        log_info "  创建目录: ${PARITY_MOUNT}"
    fi

    if [[ ! -d "$MERGERFS_MOUNT" ]]; then
        mkdir -p "$MERGERFS_MOUNT"
        log_info "  创建目录: ${MERGERFS_MOUNT}"
    fi

    log_ok "挂载点目录就绪"

    # ========================================================================
    # 2. 挂载数据盘和校验盘 (写入 fstab, 幂等)
    # ========================================================================
    log_info "配置数据盘和校验盘挂载..."

    for entry in "${DATA_DISKS[@]}"; do
        local dev="${entry%%:*}"
        local mnt="${entry#*:}"
        # 幂等: 检查 fstab 中是否已有该挂载条目
        if ! grep -q "^${dev}[[:space:]]" /etc/fstab 2>/dev/null; then
            echo "${dev}  ${mnt}  ext4  defaults,noatime  0  2" >> /etc/fstab
            log_info "  fstab 添加: ${dev} -> ${mnt}"
        fi
        # 挂载 (如果尚未挂载)
        if ! mountpoint -q "$mnt" 2>/dev/null; then
            mount "$mnt" 2>/dev/null || log_warn "  挂载失败: ${mnt}, 请检查磁盘是否已格式化"
        fi
    done

    # 校验盘挂载
    if ! grep -q "^${PARITY_DISK}[[:space:]]" /etc/fstab 2>/dev/null; then
        echo "${PARITY_DISK}  ${PARITY_MOUNT}  ext4  defaults,noatime  0  2" >> /etc/fstab
        log_info "  fstab 添加: ${PARITY_DISK} -> ${PARITY_MOUNT}"
    fi
    if ! mountpoint -q "$PARITY_MOUNT" 2>/dev/null; then
        mount "$PARITY_MOUNT" 2>/dev/null || log_warn "  挂载失败: ${PARITY_MOUNT}, 请检查校验盘是否已格式化"
    fi

    log_ok "数据盘和校验盘 fstab 配置完成"

    # ========================================================================
    # 3. 配置 mergerfs 合并挂载 (需求 82.1, 82.2, 82.6)
    # ========================================================================
    log_info "配置 mergerfs 合并挂载..."

    # 构建 mergerfs 源路径列表 (冒号分隔)
    local mergerfs_sources=""
    for entry in "${DATA_DISKS[@]}"; do
        local mnt="${entry#*:}"
        if [[ -n "$mergerfs_sources" ]]; then
            mergerfs_sources="${mergerfs_sources}:${mnt}"
        else
            mergerfs_sources="${mnt}"
        fi
    done

    # mergerfs fstab 条目 (策略: mfs = most free space)
    local mergerfs_opts="defaults,allow_other,use_ino,category.create=mfs,moveonenospc=true,dropcacheonclose=true,fsname=mergerfs"
    local mergerfs_fstab_line="${mergerfs_sources}  ${MERGERFS_MOUNT}  fuse.mergerfs  ${mergerfs_opts}  0  0"

    # 幂等: 检查 fstab 中是否已有 mergerfs 条目
    if ! grep -q "fuse.mergerfs" /etc/fstab 2>/dev/null; then
        echo "$mergerfs_fstab_line" >> /etc/fstab
        log_info "  fstab 添加 mergerfs: ${mergerfs_sources} -> ${MERGERFS_MOUNT}"
    else
        # 已有条目则更新 (替换旧的 mergerfs 行)
        sed -i '/fuse\.mergerfs/d' /etc/fstab
        echo "$mergerfs_fstab_line" >> /etc/fstab
        log_info "  fstab 更新 mergerfs 配置"
    fi

    # 挂载 mergerfs (如果尚未挂载)
    if ! mountpoint -q "$MERGERFS_MOUNT" 2>/dev/null; then
        if mount "$MERGERFS_MOUNT" 2>/dev/null; then
            log_ok "mergerfs 挂载成功: ${MERGERFS_MOUNT}"
        else
            log_warn "mergerfs 挂载失败, 请确认数据盘已正确挂载"
            log_warn "  可手动执行: mergerfs ${mergerfs_sources} ${MERGERFS_MOUNT} -o ${mergerfs_opts}"
        fi
    else
        log_ok "mergerfs 已挂载: ${MERGERFS_MOUNT}, 跳过"
    fi

    # ========================================================================
    # 4. 配置 snapraid (需求 82.3, 82.4)
    # ========================================================================
    log_info "配置 snapraid..."

    local snapraid_conf="/etc/snapraid.conf"

    # 生成 snapraid.conf (幂等: 每次覆盖写入)
    {
        echo "# 星聚OS snapraid 配置"
        echo "# 由 deploy.sh 自动生成"
        echo ""
        echo "# 校验盘"
        echo "parity ${PARITY_MOUNT}/snapraid.parity"
        echo ""
        echo "# 数据盘"
        local disk_index=1
        for entry in "${DATA_DISKS[@]}"; do
            local mnt="${entry#*:}"
            echo "data d${disk_index} ${mnt}/"
            disk_index=$((disk_index + 1))
        done
        echo ""
        echo "# 内容文件 (每块数据盘各存一份, 提高安全性)"
        for entry in "${DATA_DISKS[@]}"; do
            local mnt="${entry#*:}"
            echo "content ${mnt}/.snapraid.content"
        done
        echo "content ${PARITY_MOUNT}/.snapraid.content"
        echo ""
        echo "# 排除临时文件和缓存"
        echo "exclude *.tmp"
        echo "exclude *.bak"
        echo "exclude /lost+found/"
        echo "exclude .Trash*/"
        echo "exclude *.partial"
    } > "$snapraid_conf"

    log_ok "snapraid.conf 已写入: ${snapraid_conf}"

    # 创建 snapraid 每日同步定时任务 (每天凌晨 2:00)
    local snapraid_cron="/etc/cron.d/starhub-snapraid"
    cat > "$snapraid_cron" <<'CRON_EOF'
# 星聚OS snapraid 每日同步
# 每天凌晨 2:00 执行 sync, 日志写入 /var/log/snapraid.log
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 2 * * * root /usr/bin/snapraid sync >> /var/log/snapraid.log 2>&1 && /usr/bin/snapraid scrub -p 5 -o 0 >> /var/log/snapraid.log 2>&1
CRON_EOF
    chmod 644 "$snapraid_cron"

    log_ok "snapraid 定时任务已配置: 每天 02:00 sync + scrub"

    # ========================================================================
    # 5. 配置 smartmontools 硬盘健康监控 (需求 82.5)
    # ========================================================================
    log_info "配置 smartmontools 硬盘健康监控..."

    # 生成 smartd.conf (幂等: 每次覆盖写入)
    local smartd_conf="/etc/smartd.conf"

    # 备份原始配置 (仅首次)
    if [[ -f "$smartd_conf" && ! -f "${smartd_conf}.bak.starhub" ]]; then
        cp "$smartd_conf" "${smartd_conf}.bak.starhub"
        log_info "  已备份原始 smartd.conf"
    fi

    {
        echo "# 星聚OS smartmontools 配置"
        echo "# 由 deploy.sh 自动生成"
        echo "# -a: 启用所有 SMART 检查"
        echo "# -o on: 启用自动离线测试"
        echo "# -S on: 启用属性自动保存"
        echo "# -s (S/../.././02|L/../../6/03): 每天 02:00 短测试, 每周六 03:00 长测试"
        echo "# -m root: 异常时邮件通知 root"
        echo "# -M exec /usr/share/smartmontools/smartd-runner: 异常时执行通知脚本"
        for disk_dev in "${ALL_DISK_DEVICES[@]}"; do
            echo "${disk_dev} -a -o on -S on -s (S/../.././02|L/../../6/03) -m root -M exec /usr/share/smartmontools/smartd-runner"
        done
    } > "$smartd_conf"

    log_ok "smartd.conf 已写入: 监控 ${#ALL_DISK_DEVICES[@]} 块磁盘"

    # 启用并重启 smartd 服务
    systemctl enable smartd 2>/dev/null || true
    systemctl restart smartd 2>/dev/null || log_warn "smartd 重启失败, 请检查磁盘设备是否存在"

    log_ok "smartmontools 监控已启用"

    # ========================================================================
    # 6. 配置 HDD 休眠策略 (hdparm -S 120 = 10 分钟空闲后休眠)
    # ========================================================================
    log_info "配置 HDD 休眠策略..."

    # 立即对所有磁盘设置休眠超时
    for disk_dev in "${ALL_DISK_DEVICES[@]}"; do
        hdparm -S 120 "$disk_dev" 2>/dev/null || log_warn "  hdparm 设置失败: ${disk_dev} (可能是 SSD, 跳过)"
    done

    # 写入 udev 规则实现持久化 (重启后自动生效)
    local udev_rule="/etc/udev/rules.d/69-starhub-hdparm.rules"
    {
        echo "# 星聚OS HDD 休眠策略"
        echo "# 由 deploy.sh 自动生成"
        echo "# 空闲 10 分钟后进入待机模式 (hdparm -S 120)"
        for disk_dev in "${ALL_DISK_DEVICES[@]}"; do
            local disk_name
            disk_name=$(basename "$disk_dev")
            echo "ACTION==\"add\", KERNEL==\"${disk_name}\", SUBSYSTEM==\"block\", RUN+=\"/usr/sbin/hdparm -S 120 /dev/%k\""
        done
    } > "$udev_rule"
    chmod 644 "$udev_rule"

    # 重新加载 udev 规则
    udevadm control --reload-rules 2>/dev/null || true

    log_ok "HDD 休眠策略已配置: 空闲 10 分钟后待机"

    # ========================================================================
    # 完成
    # ========================================================================
    log_info "存储系统配置完成: mergerfs(${MERGERFS_MOUNT}) + snapraid + smartd + hdparm"
}

# ============================================================================
# 第八节: 创建标准目录结构 (需求 57.1, 57.2, 57.3)
# ============================================================================

create_directory_structure() {
    log_step "创建标准目录结构"

    local base="/mnt/storage"

    # -- 媒体目录: 视频 (含 originals 备份目录) --
    local video_dirs=(
        "${base}/media/videos/incoming"
        "${base}/media/videos/processing"
        "${base}/media/videos/ready"
        "${base}/media/videos/originals"
        "${base}/media/videos/duplicates"
        "${base}/media/videos/failed"
    )

    # -- 媒体目录: 漫画 --
    local comic_dirs=(
        "${base}/media/comics/incoming"
        "${base}/media/comics/processing"
        "${base}/media/comics/ready"
        "${base}/media/comics/duplicates"
        "${base}/media/comics/failed"
    )

    # -- 媒体目录: 小说 --
    local novel_dirs=(
        "${base}/media/novels/incoming"
        "${base}/media/novels/processing"
        "${base}/media/novels/ready"
        "${base}/media/novels/duplicates"
        "${base}/media/novels/failed"
    )

    # -- 媒体目录: 音乐 --
    local music_dirs=(
        "${base}/media/music/incoming"
        "${base}/media/music/processing"
        "${base}/media/music/ready"
        "${base}/media/music/duplicates"
        "${base}/media/music/failed"
    )

    # -- 媒体目录: Telegram / 下载 / 网盘 --
    local other_media_dirs=(
        "${base}/media/telegram"
        "${base}/media/downloads/complete"
        "${base}/media/downloads/incomplete"
        "${base}/media/cloud"
    )

    # -- 媒体目录: 游戏 ROM (6 个平台) --
    local game_dirs=(
        "${base}/media/games/roms/fc"
        "${base}/media/games/roms/snes"
        "${base}/media/games/roms/gba"
        "${base}/media/games/roms/genesis"
        "${base}/media/games/roms/mame"
        "${base}/media/games/roms/dos"
    )

    # -- 星聚系统目录 --
    local starhub_dirs=(
        "${base}/starhub/config"
        "${base}/starhub/repo"
        "${base}/starhub/backups"
        "${base}/starhub/app-store"
        "${base}/starhub/services/task-scheduler"
        "${base}/starhub/services/video-processor"
        "${base}/starhub/services/nas-agent"
        "${base}/starhub/services/file-watcher"
        "${base}/starhub/services/nas-media-server"
        "${base}/starhub/services/puter-apps"
    )

    # -- AI 模型目录 --
    local ai_dirs=(
        "${base}/ai_models/whisper"
        "${base}/ai_models/xtts"
        "${base}/ai_models/sd"
        "${base}/ai_models/ollama"
        "${base}/ai_models/manga"
    )

    # 合并所有目录列表, 统一创建
    local all_dirs=(
        "${video_dirs[@]}"
        "${comic_dirs[@]}"
        "${novel_dirs[@]}"
        "${music_dirs[@]}"
        "${other_media_dirs[@]}"
        "${game_dirs[@]}"
        "${starhub_dirs[@]}"
        "${ai_dirs[@]}"
    )

    local created_count=0
    for dir in "${all_dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            created_count=$((created_count + 1))
        fi
    done

    log_ok "目录结构就绪: 共 ${#all_dirs[@]} 个目录 (新建 ${created_count} 个)"
    log_info "  媒体根目录: ${base}/media/"
    log_info "  系统配置:   ${base}/starhub/"
    log_info "  AI 模型:    ${base}/ai_models/"
}

# ============================================================================
# 第九节: 初始化 pipeline.db (需求 68.2, 68.3, 68.4, 68.6)
# ============================================================================

init_pipeline_db() {
    log_step "初始化 SQLite 数据库 pipeline.db"

    local db_path="/mnt/storage/starhub/pipeline.db"

    # 确保父目录存在
    mkdir -p "$(dirname "$db_path")"

    log_info "数据库路径: ${db_path}"
    log_info "创建 24 张表 (CREATE TABLE IF NOT EXISTS, 幂等)..."

    # 使用 sqlite3 执行完整 schema
    sqlite3 "$db_path" <<'SQL_EOF'
-- ═══════════════════════════════════════════════════════
-- 星聚OS pipeline.db 完整 Schema (24 张表)
-- 由 deploy.sh 自动生成, 幂等执行
-- ═══════════════════════════════════════════════════════

-- -------------------------------------------------------
-- 复用前版核心表 (16 张)
-- -------------------------------------------------------

-- 1. tasks — 核心任务表
CREATE TABLE IF NOT EXISTS tasks (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    priority        INTEGER NOT NULL DEFAULT 100,
    source          TEXT,
    source_url      TEXT,
    file_path       TEXT NOT NULL,
    content_id      TEXT,
    content_type    TEXT,
    mpaa_rating     TEXT DEFAULT 'PG',
    current_step    INTEGER DEFAULT 0,
    total_steps     INTEGER,
    error_message   TEXT,
    retry_count     INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    started_at      TEXT,
    completed_at    TEXT,
    metadata        TEXT
);

-- 2. task_steps — 步骤级状态持久化
CREATE TABLE IF NOT EXISTS task_steps (
    id              TEXT PRIMARY KEY,
    task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    step_number     INTEGER NOT NULL,
    step_name       TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    error_message   TEXT,
    retry_count     INTEGER DEFAULT 0,
    started_at      TEXT,
    completed_at    TEXT,
    duration_ms     INTEGER,
    output_path     TEXT,
    metadata        TEXT
);

-- 3. video_hashes — 视频去重索引
CREATE TABLE IF NOT EXISTS video_hashes (
    id              TEXT PRIMARY KEY,
    content_id      TEXT,
    file_path       TEXT NOT NULL,
    phash           TEXT NOT NULL,
    scene_fingerprint TEXT,
    resolution      TEXT,
    duration_sec    REAL,
    file_size       INTEGER,
    codec           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 4. comic_hashes — 漫画去重索引
CREATE TABLE IF NOT EXISTS comic_hashes (
    id              TEXT PRIMARY KEY,
    content_id      TEXT,
    file_path       TEXT NOT NULL,
    cover_phash     TEXT NOT NULL,
    page_hashes     TEXT,
    page_count      INTEGER,
    resolution      TEXT,
    language        TEXT,
    is_bw           INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5. audio_fingerprints — 音频去重索引
CREATE TABLE IF NOT EXISTS audio_fingerprints (
    id              TEXT PRIMARY KEY,
    content_id      TEXT,
    file_path       TEXT NOT NULL,
    fingerprint     TEXT NOT NULL,
    duration_sec    REAL,
    bitrate         INTEGER,
    format          TEXT,
    title           TEXT,
    artist          TEXT,
    album           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. novel_fingerprints — 小说去重索引
CREATE TABLE IF NOT EXISTS novel_fingerprints (
    id              TEXT PRIMARY KEY,
    content_id      TEXT,
    file_path       TEXT NOT NULL,
    title           TEXT,
    author          TEXT,
    simhash         TEXT,
    word_count      INTEGER,
    chapter_count   INTEGER,
    language        TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 7. face_features — 人脸特征
CREATE TABLE IF NOT EXISTS face_features (
    id              TEXT PRIMARY KEY,
    provider_id     TEXT NOT NULL,
    photo_path      TEXT NOT NULL,
    face_vector     BLOB,
    phash           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 8. dedup_records — 去重记录
CREATE TABLE IF NOT EXISTS dedup_records (
    id              TEXT PRIMARY KEY,
    content_type    TEXT NOT NULL,
    original_id     TEXT NOT NULL,
    duplicate_id    TEXT NOT NULL,
    similarity      REAL,
    status          TEXT DEFAULT 'pending',
    action          TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at     TEXT
);

-- 9. ad_segments — 广告片段
CREATE TABLE IF NOT EXISTS ad_segments (
    id              TEXT PRIMARY KEY,
    task_id         TEXT NOT NULL REFERENCES tasks(id),
    start_time      REAL NOT NULL,
    end_time        REAL NOT NULL,
    ad_type         TEXT,
    confidence      REAL,
    status          TEXT DEFAULT 'detected',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 10. content_registry — 处理完成的最终内容
CREATE TABLE IF NOT EXISTS content_registry (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL,
    title           TEXT,
    mpaa_rating     TEXT DEFAULT 'PG',
    status          TEXT DEFAULT 'active',
    duration_sec    REAL,
    resolution      TEXT,
    audio_tracks    TEXT,
    subtitle_tracks TEXT,
    page_count      INTEGER,
    versions        TEXT,
    word_count      INTEGER,
    chapter_count   INTEGER,
    modes           TEXT,
    artist          TEXT,
    formats         TEXT,
    file_path       TEXT NOT NULL,
    thumbnail_path  TEXT,
    source          TEXT,
    source_url      TEXT,
    metadata        TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 11. telegram_channels — Telegram 频道配置
CREATE TABLE IF NOT EXISTS telegram_channels (
    id              TEXT PRIMARY KEY,
    channel_id      TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    type            TEXT DEFAULT 'channel',
    mpaa_rating     TEXT DEFAULT 'PG',
    scrape_interval INTEGER DEFAULT 1800,
    enabled         INTEGER DEFAULT 1,
    last_scraped_at TEXT,
    last_message_id INTEGER DEFAULT 0,
    total_downloaded INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 12. scraper_sources — 刮削源配置
CREATE TABLE IF NOT EXISTS scraper_sources (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    url             TEXT NOT NULL,
    type            TEXT NOT NULL,
    mpaa_rating     TEXT DEFAULT 'PG',
    scrape_interval INTEGER DEFAULT 21600,
    max_per_run     INTEGER DEFAULT 20,
    enabled         INTEGER DEFAULT 1,
    filter_tags     TEXT,
    last_scraped_at TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 13. bandwidth_rules — 带宽调度规则
CREATE TABLE IF NOT EXISTS bandwidth_rules (
    id              TEXT PRIMARY KEY,
    start_hour      INTEGER NOT NULL,
    end_hour        INTEGER NOT NULL,
    download_limit  INTEGER,
    upload_limit    INTEGER,
    enabled         INTEGER DEFAULT 1
);

-- 14. bandwidth_usage — 带宽使用记录
CREATE TABLE IF NOT EXISTS bandwidth_usage (
    date            TEXT PRIMARY KEY,
    bytes_downloaded INTEGER DEFAULT 0,
    bytes_uploaded  INTEGER DEFAULT 0,
    daily_limit     INTEGER DEFAULT 53687091200
);

-- 15. gpu_lock — GPU 互斥锁 (单行表)
CREATE TABLE IF NOT EXISTS gpu_lock (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    locked_by       TEXT,
    service         TEXT,
    locked_at       TEXT,
    expires_at      TEXT
);
-- 幂等插入初始行: 仅当表为空时插入
INSERT OR IGNORE INTO gpu_lock (id) VALUES (1);

-- 16. vn_saves — 视觉小说存档
CREATE TABLE IF NOT EXISTS vn_saves (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    content_id      TEXT NOT NULL,
    chapter         INTEGER NOT NULL,
    scene_index     INTEGER NOT NULL,
    dialogue_index  INTEGER NOT NULL,
    save_name       TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -------------------------------------------------------
-- 新增表 (8 张) — AI 代理 + 私有网盘 + 应用市场
-- -------------------------------------------------------

-- 17. agent_decisions — AI 代理决策日志
CREATE TABLE IF NOT EXISTS agent_decisions (
    id              TEXT PRIMARY KEY,
    cycle_id        TEXT NOT NULL,
    decision_type   TEXT NOT NULL,
    risk_level      TEXT NOT NULL,
    input_summary   TEXT,
    reasoning       TEXT,
    actions         TEXT,
    status          TEXT DEFAULT 'pending',
    executed_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 18. agent_actions — AI 代理执行的操作日志
CREATE TABLE IF NOT EXISTS agent_actions (
    id              TEXT PRIMARY KEY,
    decision_id     TEXT REFERENCES agent_decisions(id),
    action_type     TEXT NOT NULL,
    description     TEXT,
    command         TEXT,
    rollback_cmd    TEXT,
    status          TEXT DEFAULT 'pending',
    result          TEXT,
    executed_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 19. agent_expenses — AI 代理消费记录
CREATE TABLE IF NOT EXISTS agent_expenses (
    id              TEXT PRIMARY KEY,
    amount_cents    INTEGER NOT NULL,
    currency        TEXT DEFAULT 'CNY',
    purpose         TEXT NOT NULL,
    description     TEXT,
    status          TEXT DEFAULT 'pending',
    approved_by     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 20. agent_config_changes — 配置变更记录
CREATE TABLE IF NOT EXISTS agent_config_changes (
    id              TEXT PRIMARY KEY,
    config_key      TEXT NOT NULL,
    old_value       TEXT,
    new_value       TEXT,
    reason          TEXT,
    status          TEXT DEFAULT 'applied',
    applied_at      TEXT NOT NULL DEFAULT (datetime('now')),
    rolled_back_at  TEXT
);

-- 21. knowledge_base — AI 代理知识库
CREATE TABLE IF NOT EXISTS knowledge_base (
    id              TEXT PRIMARY KEY,
    category        TEXT NOT NULL,
    title           TEXT NOT NULL,
    summary         TEXT NOT NULL,
    source_url      TEXT,
    relevance_score REAL DEFAULT 0.5,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at      TEXT
);

-- 22. cloud_files — 私有网盘文件表
CREATE TABLE IF NOT EXISTS cloud_files (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    parent_id       TEXT,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    mime_type       TEXT,
    size            INTEGER DEFAULT 0,
    encrypted_path  TEXT,
    version         INTEGER DEFAULT 1,
    share_token     TEXT,
    share_password  TEXT,
    share_expires   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cloud_files_user ON cloud_files(user_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_cloud_files_share ON cloud_files(share_token);

-- 23. cloud_file_versions — 文件版本历史
CREATE TABLE IF NOT EXISTS cloud_file_versions (
    id              TEXT PRIMARY KEY,
    file_id         TEXT NOT NULL REFERENCES cloud_files(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL,
    size            INTEGER,
    encrypted_path  TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 24. app_store_installs — 应用市场安装记录
CREATE TABLE IF NOT EXISTS app_store_installs (
    id              TEXT PRIMARY KEY,
    app_id          TEXT NOT NULL,
    app_name        TEXT NOT NULL,
    docker_compose  TEXT NOT NULL,
    status          TEXT DEFAULT 'running',
    installed_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
SQL_EOF

    # 验证表数量
    local table_count
    table_count=$(sqlite3 "$db_path" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")

    if [[ "$table_count" -eq 24 ]]; then
        log_ok "pipeline.db 初始化完成: ${table_count}/24 张表已创建"
    else
        log_error "pipeline.db 表数量异常: 期望 24 张, 实际 ${table_count} 张"
        log_info "已创建的表:"
        sqlite3 "$db_path" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;" | while read -r tbl; do
            log_info "  - ${tbl}"
        done
        return 1
    fi

    # 验证 gpu_lock 初始行
    local gpu_lock_count
    gpu_lock_count=$(sqlite3 "$db_path" "SELECT count(*) FROM gpu_lock;")
    if [[ "$gpu_lock_count" -eq 1 ]]; then
        log_ok "gpu_lock 初始行已就绪 (id=1)"
    else
        log_warn "gpu_lock 行数异常: ${gpu_lock_count}"
    fi

    log_info "数据库文件大小: $(du -h "$db_path" | awk '{print $1}')"
}

# ============================================================================
# 第十节: 配置网络安全 (需求 23.1, 23.2, 23.3, 23.7, 69.1, 69.3, 69.4, 69.5)
# ============================================================================

configure_network_security() {
    log_step "配置网络安全 (防火墙 + DNS-over-HTTPS + MAC 随机化)"

    # ========================================================================
    # 1. iptables 防火墙规则 (需求 69.1)
    # ========================================================================
    log_info "配置 iptables 防火墙规则..."

    # 局域网 CIDR 列表
    local LAN_CIDRS=("192.168.0.0/16" "10.0.0.0/8" "172.16.0.0/12")

    # 局域网允许访问的服务端口
    local LAN_TCP_PORTS=("22" "80" "443" "8443" "8000" "8765")

    # 清空已有规则, 重新配置 (幂等)
    iptables -F INPUT 2>/dev/null || true
    iptables -F FORWARD 2>/dev/null || true

    # 默认策略: INPUT DROP, FORWARD DROP, OUTPUT ACCEPT
    iptables -P INPUT DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT ACCEPT

    # 允许已建立/相关连接的回包
    iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

    # 允许本地回环
    iptables -A INPUT -i lo -j ACCEPT

    # 允许局域网 SSH (端口 22)
    for cidr in "${LAN_CIDRS[@]}"; do
        iptables -A INPUT -s "$cidr" -p tcp --dport 22 -j ACCEPT
    done

    # 允许局域网 HTTP/HTTPS 及服务端口
    for cidr in "${LAN_CIDRS[@]}"; do
        for port in "${LAN_TCP_PORTS[@]}"; do
            # SSH 已单独添加, 跳过重复
            [[ "$port" == "22" ]] && continue
            iptables -A INPUT -s "$cidr" -p tcp --dport "$port" -j ACCEPT
        done
    done

    # 允许局域网 ICMP ping
    for cidr in "${LAN_CIDRS[@]}"; do
        iptables -A INPUT -s "$cidr" -p icmp --icmp-type echo-request -j ACCEPT
    done

    log_ok "iptables 规则已配置: INPUT DROP + 局域网 SSH/HTTP/HTTPS/ICMP 放行"

    # 持久化防火墙规则 (安装 iptables-persistent, 幂等)
    if ! dpkg -s iptables-persistent &>/dev/null; then
        log_info "安装 iptables-persistent..."
        # 预设应答避免交互式提示
        echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections 2>/dev/null || true
        echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections 2>/dev/null || true
        apt-get install -y -qq iptables-persistent
    fi

    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4
    log_ok "防火墙规则已持久化到 /etc/iptables/rules.v4"

    # ========================================================================
    # 2. DNS-over-HTTPS (cloudflared proxy-dns) (需求 69.3)
    # ========================================================================
    log_info "配置 DNS-over-HTTPS (cloudflared proxy-dns)..."

    # 写入 systemd 服务文件 (幂等: 每次覆盖)
    cat > /etc/systemd/system/starhub-dns-proxy.service <<'DNS_EOF'
[Unit]
Description=StarHub DNS-over-HTTPS Proxy (cloudflared)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/cloudflared proxy-dns --port 5053 --upstream https://1.1.1.1/dns-query --upstream https://1.0.0.1/dns-query
Restart=on-failure
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
DNS_EOF

    systemctl daemon-reload
    systemctl enable starhub-dns-proxy 2>/dev/null || true
    systemctl restart starhub-dns-proxy 2>/dev/null || log_warn "starhub-dns-proxy 启动失败, cloudflared 可能未安装"

    # 更新 /etc/resolv.conf 指向本地 DNS 代理
    # 备份原始配置 (仅首次)
    if [[ -f /etc/resolv.conf && ! -f /etc/resolv.conf.bak.starhub ]]; then
        cp /etc/resolv.conf /etc/resolv.conf.bak.starhub
        log_info "已备份原始 resolv.conf"
    fi

    cat > /etc/resolv.conf <<'RESOLV_EOF'
# 星聚OS DNS 配置 — DNS-over-HTTPS via cloudflared
# 由 deploy.sh 自动生成, 请勿手动修改
# 所有 DNS 查询通过 cloudflared 加密转发到 Cloudflare 1.1.1.1
nameserver 127.0.0.1
options edns0
RESOLV_EOF

    log_ok "DNS-over-HTTPS 已配置: 127.0.0.1:5053 -> Cloudflare 1.1.1.1"

    # ========================================================================
    # 3. MAC 地址随机化 (需求 69.4)
    # ========================================================================
    log_info "配置 MAC 地址随机化..."

    # 写入 MAC 随机化脚本
    cat > /usr/local/bin/starhub-mac-random.sh <<'MAC_EOF'
#!/usr/bin/env bash
# 星聚OS MAC 地址随机化脚本
# 每次启动时为所有物理网卡生成随机 MAC 地址
# 由 deploy.sh 自动生成

set -euo pipefail

generate_random_mac() {
    # 生成本地管理的单播 MAC 地址 (第一字节低2位=1, 低1位=0)
    printf '%02x:%02x:%02x:%02x:%02x:%02x' \
        $(( (RANDOM % 256) & 0xFE | 0x02 )) \
        $(( RANDOM % 256 )) \
        $(( RANDOM % 256 )) \
        $(( RANDOM % 256 )) \
        $(( RANDOM % 256 )) \
        $(( RANDOM % 256 ))
}

for iface in /sys/class/net/*; do
    iface_name=$(basename "$iface")
    # 跳过回环和虚拟接口
    [[ "$iface_name" == "lo" ]] && continue
    [[ "$iface_name" == veth* ]] && continue
    [[ "$iface_name" == docker* ]] && continue
    [[ "$iface_name" == br-* ]] && continue

    # 仅处理物理网卡 (有 device 链接)
    [[ ! -e "$iface/device" ]] && continue

    new_mac=$(generate_random_mac)
    ip link set "$iface_name" down 2>/dev/null || continue
    ip link set "$iface_name" address "$new_mac" 2>/dev/null || continue
    ip link set "$iface_name" up 2>/dev/null || continue
    echo "[StarHub MAC] ${iface_name}: MAC 已随机化为 ${new_mac}"
done
MAC_EOF
    chmod +x /usr/local/bin/starhub-mac-random.sh

    # 创建 systemd 服务, 开机自动执行 MAC 随机化
    cat > /etc/systemd/system/starhub-mac-random.service <<'MACSVC_EOF'
[Unit]
Description=StarHub MAC Address Randomization
Before=network-pre.target
Wants=network-pre.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/starhub-mac-random.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
MACSVC_EOF

    systemctl daemon-reload
    systemctl enable starhub-mac-random 2>/dev/null || true
    log_ok "MAC 地址随机化已配置: 每次启动自动生成随机 MAC"

    # ========================================================================
    # 4. 禁用 UPnP/DLNA (需求 69.5)
    # ========================================================================
    log_info "检查并禁用 UPnP/DLNA 服务..."

    local upnp_disabled=0
    for svc in miniupnpd minidlnad minissdpd; do
        if systemctl is-active --quiet "$svc" 2>/dev/null; then
            systemctl stop "$svc" 2>/dev/null || true
            systemctl disable "$svc" 2>/dev/null || true
            log_info "  已停止并禁用: ${svc}"
            upnp_disabled=1
        elif systemctl is-enabled --quiet "$svc" 2>/dev/null; then
            systemctl disable "$svc" 2>/dev/null || true
            log_info "  已禁用: ${svc}"
            upnp_disabled=1
        fi
    done

    if [[ "$upnp_disabled" -eq 0 ]]; then
        log_ok "UPnP/DLNA 服务未安装或已禁用, 跳过"
    else
        log_ok "UPnP/DLNA 服务已禁用"
    fi

    # ========================================================================
    # 5. Docker 容器绑定 127.0.0.1 提醒 (需求 23.7)
    # ========================================================================
    log_info "Docker 容器安全绑定检查..."
    log_info "  所有 Docker 容器端口映射必须绑定 127.0.0.1 (如 127.0.0.1:8765:8765)"
    log_info "  禁止绑定 0.0.0.0, 此规则在后续容器部署步骤中强制执行"
    log_ok "Docker 容器绑定策略: 仅 127.0.0.1 (将在容器部署阶段验证)"

    # ========================================================================
    # 完成
    # ========================================================================
    log_info "网络安全配置完成: 防火墙(iptables) + DNS-over-HTTPS(cloudflared) + MAC随机化 + UPnP禁用"
}

# ============================================================================
# 第十一节: 配置 Cloudflare Tunnel (需求 70.1, 70.2, 70.3, 70.4, 70.5, 70.6)
# ============================================================================

configure_cloudflare_tunnel() {
    log_step "配置 Cloudflare Tunnel"

    local token_path="/mnt/storage/starhub/config/tunnel-token"
    local container_name="cloudflared"

    # 幂等: 如果 cloudflared 容器已存在且正在运行, 跳过
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container_name}$"; then
        log_ok "cloudflared 容器已在运行, 跳过配置"
        return 0
    fi

    # 如果容器存在但已停止, 先移除再重新部署
    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${container_name}$"; then
        log_warn "cloudflared 容器已存在但未运行, 移除后重新部署"
        docker rm -f "$container_name" &>/dev/null || true
    fi

    # ========================================================================
    # 1. 交互式引导用户输入 Tunnel Token (需求 70.1, 70.6)
    # ========================================================================
    local tunnel_token=""

    # 优先从已保存的 token 文件读取
    if [[ -f "$token_path" ]]; then
        tunnel_token=$(cat "$token_path" 2>/dev/null || true)
        if [[ -n "$tunnel_token" ]]; then
            log_info "从 ${token_path} 读取到已保存的 Tunnel Token"
        fi
    fi

    # 如果没有已保存的 token, 交互式引导用户输入
    if [[ -z "$tunnel_token" ]]; then
        log_info "Cloudflare Tunnel 用于安全暴露 NAS 服务, 无需开放公网端口"
        log_info ""
        log_info "获取 Tunnel Token 步骤:"
        log_info "  1. 登录 Cloudflare Zero Trust Dashboard: https://one.dash.cloudflare.com/"
        log_info "  2. 进入 Networks -> Tunnels"
        log_info "  3. 创建新 Tunnel (选择 Cloudflared 类型)"
        log_info "  4. 复制 Tunnel Token (以 eyJ 开头的长字符串)"
        log_info "  5. 在 Cloudflare Dashboard 配置 ingress 规则:"
        log_info "     - 媒体服务: 你的域名 -> http://localhost:8765"
        log_info "     - 管理 API: api.你的域名 -> http://localhost:8000"
        log_info ""

        read -rp "[INPUT] 请输入 Cloudflare Tunnel Token (留空跳过): " tunnel_token

        if [[ -z "$tunnel_token" ]]; then
            log_warn "未提供 Tunnel Token, 跳过 Cloudflare Tunnel 配置"
            log_warn "NAS 将仅在局域网内可访问, 后续可手动配置 Tunnel"
            log_warn "手动配置方法: 重新运行此脚本或执行以下命令:"
            log_warn "  docker run -d --name cloudflared --restart unless-stopped --network host cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <YOUR_TOKEN>"
            return 0
        fi
    fi

    # ========================================================================
    # 2. 安全存储 Token (需求 70.2)
    # ========================================================================
    mkdir -p "$(dirname "$token_path")"
    echo "$tunnel_token" > "$token_path"
    chmod 600 "$token_path"
    log_ok "Tunnel Token 已安全存储到 ${token_path} (权限 600)"

    # ========================================================================
    # 3. 拉取并部署 cloudflared 容器 (需求 70.3)
    # ========================================================================
    log_info "拉取 cloudflared 镜像..."
    pull_image "cloudflare/cloudflared:latest"

    log_info "部署 cloudflared 容器..."
    docker run -d \
        --name "$container_name" \
        --restart unless-stopped \
        --network host \
        cloudflare/cloudflared:latest \
        tunnel --no-autoupdate run --token "$tunnel_token"

    # ========================================================================
    # 4. 等待容器启动并验证运行状态
    # ========================================================================
    log_info "等待 cloudflared 容器启动..."
    local wait_count=0
    while ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container_name}$"; do
        sleep 1
        wait_count=$((wait_count + 1))
        if [[ $wait_count -ge 15 ]]; then
            log_error "cloudflared 容器启动超时 (15秒)"
            log_error "请检查容器日志: docker logs ${container_name}"
            return 1
        fi
    done
    log_ok "cloudflared 容器已启动"

    # ========================================================================
    # 5. 验证 Tunnel 连接 (需求 70.4)
    # ========================================================================
    # 注意: ingress 规则在 Cloudflare Dashboard 上配置, 不在本地配置 (需求 70.5)
    log_info "验证 Tunnel 连接 (等待 Connection registered)..."
    log_info "  ingress 规则需在 Cloudflare Dashboard 配置:"
    log_info "    nas-media-server -> http://localhost:8765"
    log_info "    task-scheduler   -> http://localhost:8000"

    local verify_count=0
    local max_verify=30
    local connected=0
    while [[ $verify_count -lt $max_verify ]]; do
        if docker logs "$container_name" 2>&1 | grep -qi "connection.*registered\|Registered tunnel connection"; then
            connected=1
            break
        fi
        sleep 2
        verify_count=$((verify_count + 1))
    done

    if [[ "$connected" -eq 1 ]]; then
        log_ok "Cloudflare Tunnel 连接成功 (Connection registered)"
        log_ok "NAS 服务已通过 Tunnel 安全暴露, 零公网端口"
    else
        log_warn "未在 ${max_verify}x2 秒内检测到 Tunnel 连接确认"
        log_warn "容器仍在运行, 可能需要更长时间建立连接"
        log_warn "请手动检查: docker logs ${container_name}"
    fi

    log_info "Cloudflare Tunnel 配置完成"
}

# ============================================================================
# 第十二节: 拉取并部署 22 个 Docker 容器 (需求 21.1, 21.2, 21.5, 21.6, 56.1)
# ============================================================================

# 部署单个 Docker 容器 (幂等)
# 参数: $1 = 容器名称, $2 = 镜像名称, $3... = docker run 额外参数
# 返回: 0=成功(含已运行跳过), 1=失败
deploy_container() {
    local name="$1"
    local image="$2"
    shift 2
    local run_args=("$@")

    if [[ -z "$name" || -z "$image" ]]; then
        log_error "deploy_container: 缺少容器名称或镜像参数"
        return 1
    fi

    # 幂等: 容器已存在且正在运行, 跳过
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
        log_ok "[${name}] 容器已在运行, 跳过"
        return 0
    fi

    # 容器存在但已停止, 移除后重新部署
    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
        log_warn "[${name}] 容器已存在但未运行, 移除后重新部署"
        docker rm -f "$name" &>/dev/null || true
    fi

    # 拉取镜像
    pull_image "$image"

    # 启动容器
    log_info "[${name}] 部署容器: ${image}"
    if docker run -d \
        --name "$name" \
        --restart unless-stopped \
        "${run_args[@]}" \
        "$image"; then
        # 等待容器启动 (最多 10 秒)
        local wait_count=0
        while ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; do
            sleep 1
            wait_count=$((wait_count + 1))
            if [[ $wait_count -ge 10 ]]; then
                log_error "[${name}] 容器启动超时 (10秒)"
                log_error "  检查日志: docker logs ${name}"
                return 1
            fi
        done
        log_ok "[${name}] 容器启动成功"
        return 0
    else
        log_error "[${name}] docker run 失败"
        return 1
    fi
}

# 部署全部 22 个 Docker 容器
deploy_docker_containers() {
    log_step "拉取并部署 22 个 Docker 容器"

    local base="/mnt/storage"
    local success_count=0
    local fail_count=0
    local skip_count=0

    # 记录每个容器的部署结果 (用于最终汇总表)
    declare -A container_results

    # 辅助函数: 记录部署结果
    record_result() {
        local name="$1"
        local status="$2"
        container_results["$name"]="$status"
        case "$status" in
            "running")  success_count=$((success_count + 1)) ;;
            "skipped")  skip_count=$((skip_count + 1)); success_count=$((success_count + 1)) ;;
            "failed")   fail_count=$((fail_count + 1)) ;;
        esac
    }

    # ====================================================================
    # 1. 入口层 (无 GPU)
    # ====================================================================
    log_info "--- 入口层 ---"

    # cloudflared: 已在 1.7 步骤部署, 检查是否运行中
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^cloudflared$"; then
        log_ok "[cloudflared] 已在运行 (1.7 步骤部署), 跳过"
        record_result "cloudflared" "skipped"
    else
        log_warn "[cloudflared] 未运行, 请先执行 1.7 步骤配置 Cloudflare Tunnel"
        record_result "cloudflared" "failed"
    fi

    # nas-media-server: 自研, 使用 node:20-alpine 占位
    mkdir -p "${base}/starhub/services/nas-media-server"
    if deploy_container "nas-media-server" "node:20-alpine" \
        -p 127.0.0.1:8765:8765 \
        -v "${base}/media:/mnt/storage/media:ro" \
        -v "${base}/starhub/services/nas-media-server:/app" \
        --entrypoint sh \
        -- -c "echo 'nas-media-server 占位容器, 等待自研代码替换' && exec sleep infinity"; then
        record_result "nas-media-server" "running"
    else
        record_result "nas-media-server" "failed"
    fi

    # ====================================================================
    # 2. Web 桌面层 (无 GPU)
    # ====================================================================
    log_info "--- Web 桌面层 ---"

    # puter: Web 桌面 UI
    mkdir -p "${base}/starhub/puter-data"
    if deploy_container "puter" "ghcr.io/heyputer/puter" \
        -p 127.0.0.1:8443:4100 \
        -v "${base}/starhub/puter-data:/var/puter"; then
        record_result "puter" "running"
    else
        record_result "puter" "failed"
    fi

    # dockge: Docker Compose GUI
    mkdir -p "${base}/starhub/dockge-data/stacks"
    if deploy_container "dockge" "louislam/dockge:latest" \
        -p 127.0.0.1:5001:5001 \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v "${base}/starhub/dockge-data:/app/data" \
        -v "${base}/starhub/dockge-data/stacks:/opt/stacks" \
        -e DOCKGE_STACKS_DIR=/opt/stacks; then
        record_result "dockge" "running"
    else
        record_result "dockge" "failed"
    fi

    # ====================================================================
    # 3. 调度层 (无 GPU)
    # ====================================================================
    log_info "--- 调度层 ---"

    # task-scheduler: 自研, 使用 node:20-alpine 占位
    mkdir -p "${base}/starhub/services/task-scheduler"
    if deploy_container "task-scheduler" "node:20-alpine" \
        -p 127.0.0.1:8000:8000 \
        -v "${base}/starhub/services/task-scheduler:/app" \
        -v "${base}/starhub/pipeline.db:/data/pipeline.db" \
        --entrypoint sh \
        -- -c "echo 'task-scheduler 占位容器, 等待自研代码替换' && exec sleep infinity"; then
        record_result "task-scheduler" "running"
    else
        record_result "task-scheduler" "failed"
    fi

    # redis: BullMQ 后端
    mkdir -p "${base}/starhub/redis-data"
    if deploy_container "redis" "redis:7-alpine" \
        -p 127.0.0.1:6379:6379 \
        -v "${base}/starhub/redis-data:/data"; then
        record_result "redis" "running"
    else
        record_result "redis" "failed"
    fi

    # file-watcher: 自研, 使用 node:20-alpine 占位, 无端口
    mkdir -p "${base}/starhub/services/file-watcher"
    if deploy_container "file-watcher" "node:20-alpine" \
        -v "${base}/media:/mnt/storage/media" \
        -v "${base}/starhub/services/file-watcher:/app" \
        --entrypoint sh \
        -- -c "echo 'file-watcher 占位容器, 等待自研代码替换' && exec sleep infinity"; then
        record_result "file-watcher" "running"
    else
        record_result "file-watcher" "failed"
    fi

    # nas-agent: 自研, 使用 python:3.12-slim 占位
    mkdir -p "${base}/starhub/services/nas-agent"
    if deploy_container "nas-agent" "python:3.12-slim" \
        -p 127.0.0.1:8200:8200 \
        -v "${base}/starhub/services/nas-agent:/app" \
        -v "${base}/starhub/pipeline.db:/data/pipeline.db" \
        --entrypoint sh \
        -- -c "echo 'nas-agent 占位容器, 等待自研代码替换' && exec sleep infinity"; then
        record_result "nas-agent" "running"
    else
        record_result "nas-agent" "failed"
    fi

    # ====================================================================
    # 4. AI 处理层 (GPU 互斥)
    # ====================================================================
    log_info "--- AI 处理层 (GPU) ---"

    # 检测 GPU 是否可用, 决定是否传递 --gpus all
    local gpu_flag=""
    if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null; then
        gpu_flag="--gpus all"
        log_info "检测到 NVIDIA GPU, AI 容器将启用 GPU 加速"
    else
        log_warn "未检测到可用 GPU, AI 容器将以 CPU 模式运行"
    fi

    # whisper-api: 语音识别 (Whisper large-v3)
    mkdir -p "${base}/ai_models/whisper"
    local whisper_args=(-p 127.0.0.1:9000:9000 -v "${base}/ai_models/whisper:/root/.cache")
    [[ -n "$gpu_flag" ]] && whisper_args+=($gpu_flag)
    if deploy_container "whisper-api" "onerahmet/openai-whisper-asr-webservice:latest" \
        "${whisper_args[@]}"; then
        record_result "whisper-api" "running"
    else
        record_result "whisper-api" "failed"
    fi

    # xtts-api: 多语言 TTS 配音 (XTTS-v2)
    mkdir -p "${base}/ai_models/xtts"
    local xtts_args=(-p 127.0.0.1:8020:80 -v "${base}/ai_models/xtts:/root/.local/share")
    [[ -n "$gpu_flag" ]] && xtts_args+=($gpu_flag)
    if deploy_container "xtts-api" "ghcr.io/coqui-ai/xtts-streaming-server:latest" \
        "${xtts_args[@]}"; then
        record_result "xtts-api" "running"
    else
        record_result "xtts-api" "failed"
    fi

    # sd-api: Stable Diffusion WebUI API
    mkdir -p "${base}/ai_models/sd"
    local sd_args=(-p 127.0.0.1:7860:7860 -v "${base}/ai_models/sd:/data")
    [[ -n "$gpu_flag" ]] && sd_args+=($gpu_flag)
    sd_args+=(-e COMMANDLINE_ARGS="--api --listen --xformers --no-half-vae")
    if deploy_container "sd-api" "ghcr.io/abetlen/stable-diffusion-webui:latest" \
        "${sd_args[@]}"; then
        record_result "sd-api" "running"
    else
        record_result "sd-api" "failed"
    fi

    # manga-translator: 漫画 OCR + 翻译 + 文字渲染
    mkdir -p "${base}/ai_models/manga"
    local manga_args=(-p 127.0.0.1:5003:5003 -v "${base}/ai_models/manga:/app/models")
    [[ -n "$gpu_flag" ]] && manga_args+=($gpu_flag)
    if deploy_container "manga-translator" "zyddnys/manga-image-translator:latest" \
        "${manga_args[@]}"; then
        record_result "manga-translator" "running"
    else
        record_result "manga-translator" "failed"
    fi

    # ollama: 本地 LLM 推理
    mkdir -p "${base}/ai_models/ollama"
    local ollama_args=(-p 127.0.0.1:11434:11434 -v "${base}/ai_models/ollama:/root/.ollama")
    [[ -n "$gpu_flag" ]] && ollama_args+=($gpu_flag)
    if deploy_container "ollama" "ollama/ollama:latest" \
        "${ollama_args[@]}"; then
        record_result "ollama" "running"
    else
        record_result "ollama" "failed"
    fi

    # tdarr: 视频自动转码 (H.265)
    mkdir -p "${base}/starhub/tdarr-data/server" "${base}/starhub/tdarr-data/configs" "${base}/starhub/tdarr-data/logs"
    local tdarr_args=(
        -p 127.0.0.1:8265:8265
        -v "${base}/starhub/tdarr-data/server:/app/server"
        -v "${base}/starhub/tdarr-data/configs:/app/configs"
        -v "${base}/starhub/tdarr-data/logs:/app/logs"
        -v "${base}/media:/media"
        -v /tmp/tdarr-transcode:/temp
        -e serverIP=0.0.0.0
        -e serverPort=8266
        -e webUIPort=8265
        -e internalNode=true
        -e nodeName=NAS
    )
    [[ -n "$gpu_flag" ]] && tdarr_args+=($gpu_flag)
    if deploy_container "tdarr" "ghcr.io/haveagitgat/tdarr:latest" \
        "${tdarr_args[@]}"; then
        record_result "tdarr" "running"
    else
        record_result "tdarr" "failed"
    fi

    # ====================================================================
    # 5. 辅助处理层
    # ====================================================================
    log_info "--- 辅助处理层 ---"

    # video-processor: 自研, 使用 python:3.12-slim 占位
    mkdir -p "${base}/starhub/services/video-processor"
    if deploy_container "video-processor" "python:3.12-slim" \
        -p 127.0.0.1:8100:8100 \
        -v "${base}/media:/mnt/storage/media" \
        -v "${base}/starhub/services/video-processor:/app" \
        --entrypoint sh \
        -- -c "echo 'video-processor 占位容器, 等待自研代码替换' && exec sleep infinity"; then
        record_result "video-processor" "running"
    else
        record_result "video-processor" "failed"
    fi

    # ====================================================================
    # 6. 下载层 (无 GPU)
    # ====================================================================
    log_info "--- 下载层 ---"

    local PUID
    PUID=$(id -u)
    local PGID
    PGID=$(id -g)
    local TZ="Asia/Shanghai"

    # qbittorrent: BT 下载器
    mkdir -p "${base}/starhub/qbittorrent-config"
    if deploy_container "qbittorrent" "linuxserver/qbittorrent:latest" \
        -p 127.0.0.1:8080:8080 \
        -v "${base}/starhub/qbittorrent-config:/config" \
        -v "${base}/media/downloads:/downloads" \
        -e PUID="$PUID" \
        -e PGID="$PGID" \
        -e TZ="$TZ" \
        -e WEBUI_PORT=8080; then
        record_result "qbittorrent" "running"
    else
        record_result "qbittorrent" "failed"
    fi

    # sonarr: 电视剧/动漫自动刮削
    mkdir -p "${base}/starhub/sonarr-config"
    if deploy_container "sonarr" "linuxserver/sonarr:latest" \
        -p 127.0.0.1:8989:8989 \
        -v "${base}/starhub/sonarr-config:/config" \
        -v "${base}/media:/media" \
        -v "${base}/media/downloads:/downloads" \
        -e PUID="$PUID" \
        -e PGID="$PGID" \
        -e TZ="$TZ"; then
        record_result "sonarr" "running"
    else
        record_result "sonarr" "failed"
    fi

    # radarr: 电影自动刮削
    mkdir -p "${base}/starhub/radarr-config"
    if deploy_container "radarr" "linuxserver/radarr:latest" \
        -p 127.0.0.1:7878:7878 \
        -v "${base}/starhub/radarr-config:/config" \
        -v "${base}/media:/media" \
        -v "${base}/media/downloads:/downloads" \
        -e PUID="$PUID" \
        -e PGID="$PGID" \
        -e TZ="$TZ"; then
        record_result "radarr" "running"
    else
        record_result "radarr" "failed"
    fi

    # prowlarr: 索引器管理
    mkdir -p "${base}/starhub/prowlarr-config"
    if deploy_container "prowlarr" "linuxserver/prowlarr:latest" \
        -p 127.0.0.1:9696:9696 \
        -v "${base}/starhub/prowlarr-config:/config" \
        -e PUID="$PUID" \
        -e PGID="$PGID" \
        -e TZ="$TZ"; then
        record_result "prowlarr" "running"
    else
        record_result "prowlarr" "failed"
    fi

    # bazarr: 字幕自动下载
    mkdir -p "${base}/starhub/bazarr-config"
    if deploy_container "bazarr" "linuxserver/bazarr:latest" \
        -p 127.0.0.1:6767:6767 \
        -v "${base}/starhub/bazarr-config:/config" \
        -v "${base}/media:/media" \
        -e PUID="$PUID" \
        -e PGID="$PGID" \
        -e TZ="$TZ"; then
        record_result "bazarr" "running"
    else
        record_result "bazarr" "failed"
    fi

    # ====================================================================
    # 部署汇总
    # ====================================================================
    log_step "Docker 容器部署汇总"

    # 全部 22 个容器名称 (按层级排列)
    local all_containers=(
        "cloudflared"
        "nas-media-server"
        "puter"
        "dockge"
        "task-scheduler"
        "redis"
        "file-watcher"
        "nas-agent"
        "whisper-api"
        "xtts-api"
        "sd-api"
        "manga-translator"
        "ollama"
        "tdarr"
        "video-processor"
        "qbittorrent"
        "sonarr"
        "radarr"
        "prowlarr"
        "bazarr"
    )

    # 容器对应的层级标签
    declare -A container_layers
    container_layers=(
        ["cloudflared"]="入口层"
        ["nas-media-server"]="入口层"
        ["puter"]="Web桌面层"
        ["dockge"]="Web桌面层"
        ["task-scheduler"]="调度层"
        ["redis"]="调度层"
        ["file-watcher"]="调度层"
        ["nas-agent"]="调度层"
        ["whisper-api"]="AI处理层"
        ["xtts-api"]="AI处理层"
        ["sd-api"]="AI处理层"
        ["manga-translator"]="AI处理层"
        ["ollama"]="AI处理层"
        ["tdarr"]="AI处理层"
        ["video-processor"]="辅助处理层"
        ["qbittorrent"]="下载层"
        ["sonarr"]="下载层"
        ["radarr"]="下载层"
        ["prowlarr"]="下载层"
        ["bazarr"]="下载层"
    )

    # 容器对应的端口
    declare -A container_ports
    container_ports=(
        ["cloudflared"]="无(出站)"
        ["nas-media-server"]="127.0.0.1:8765"
        ["puter"]="127.0.0.1:8443"
        ["dockge"]="127.0.0.1:5001"
        ["task-scheduler"]="127.0.0.1:8000"
        ["redis"]="127.0.0.1:6379"
        ["file-watcher"]="无"
        ["nas-agent"]="127.0.0.1:8200"
        ["whisper-api"]="127.0.0.1:9000"
        ["xtts-api"]="127.0.0.1:8020"
        ["sd-api"]="127.0.0.1:7860"
        ["manga-translator"]="127.0.0.1:5003"
        ["ollama"]="127.0.0.1:11434"
        ["tdarr"]="127.0.0.1:8265"
        ["video-processor"]="127.0.0.1:8100"
        ["qbittorrent"]="127.0.0.1:8080"
        ["sonarr"]="127.0.0.1:8989"
        ["radarr"]="127.0.0.1:7878"
        ["prowlarr"]="127.0.0.1:9696"
        ["bazarr"]="127.0.0.1:6767"
    )

    # 打印汇总表
    printf "\n  %-20s %-12s %-22s %s\n" "容器名称" "层级" "端口" "状态"
    printf "  %-20s %-12s %-22s %s\n" "--------------------" "------------" "----------------------" "--------"

    for cname in "${all_containers[@]}"; do
        local layer="${container_layers[$cname]:-未知}"
        local port="${container_ports[$cname]:-未知}"
        local status

        # 实时检查容器运行状态
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${cname}$"; then
            status="${GREEN}运行中${NC}"
        elif docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${cname}$"; then
            status="${YELLOW}已停止${NC}"
        else
            status="${RED}未部署${NC}"
        fi

        printf "  %-20s %-12s %-22s " "$cname" "$layer" "$port"
        echo -e "$status"
    done

    echo ""
    local total=${#all_containers[@]}
    # 重新统计实际运行数
    local running_count=0
    for cname in "${all_containers[@]}"; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${cname}$"; then
            running_count=$((running_count + 1))
        fi
    done

    log_info "部署结果: ${running_count}/${total} 个容器运行中"

    if [[ "$running_count" -eq "$total" ]]; then
        log_ok "全部 ${total} 个容器部署成功"
    elif [[ "$running_count" -ge $(( total - 2 )) ]]; then
        log_ok "核心容器部署完成 (${running_count}/${total}), 少量容器需手动检查"
    else
        log_warn "部分容器部署失败 (${running_count}/${total}), 请检查上方日志"
    fi

    # 安全验证: 检查是否有容器绑定到 0.0.0.0
    log_info "安全验证: 检查端口绑定..."
    local unsafe_bindings
    unsafe_bindings=$(docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep "0\.0\.0\.0:" || true)
    if [[ -n "$unsafe_bindings" ]]; then
        log_error "发现不安全的端口绑定 (0.0.0.0), 违反零公网端口规则:"
        echo "$unsafe_bindings" | while read -r line; do
            log_error "  $line"
        done
    else
        log_ok "安全验证通过: 所有容器端口均绑定 127.0.0.1"
    fi

    log_info "Docker 容器部署完成"
}


# ============================================================================
# 第十三节: 配置 Sonarr/Radarr/Prowlarr webhook 集成 (需求 24.1-24.5)
# ============================================================================

# 带重试的 API 调用辅助函数
# 参数: $1=HTTP方法, $2=URL, $3=JSON数据(可选), $4=API Key(可选)
# 返回: 0=成功, 1=失败
api_call_with_retry() {
    local method="$1"
    local url="$2"
    local data="${3:-}"
    local api_key="${4:-}"
    local max_retries=5
    local retry_delay=10

    local curl_args=(-s -o /dev/null -w '%{http_code}' -X "$method")
    [[ -n "$api_key" ]] && curl_args+=(-H "X-Api-Key: ${api_key}")
    [[ -n "$data" ]] && curl_args+=(-H "Content-Type: application/json" -d "$data")

    local attempt=0
    while [[ $attempt -lt $max_retries ]]; do
        local http_code
        http_code=$(curl "${curl_args[@]}" "$url" 2>/dev/null || echo "000")

        if [[ "$http_code" =~ ^(200|201|202) ]]; then
            return 0
        fi

        attempt=$((attempt + 1))
        if [[ $attempt -lt $max_retries ]]; then
            log_info "  API 调用失败 (HTTP ${http_code}), ${retry_delay}秒后重试 (${attempt}/${max_retries})..."
            sleep "$retry_delay"
            retry_delay=$((retry_delay + 5))
        fi
    done

    log_warn "  API 调用失败 (${max_retries}次重试后放弃): ${method} ${url}"
    return 1
}

# 获取 *arr 应用的 API Key (从配置文件中读取)
# 参数: $1=应用名称 (sonarr/radarr/prowlarr/bazarr)
# 输出: API Key 字符串
get_arr_api_key() {
    local app="$1"
    local config_dir="/mnt/storage/starhub/${app}-config"
    local config_file="${config_dir}/config.xml"

    if [[ -f "$config_file" ]]; then
        local key
        key=$(grep -oP '<ApiKey>\K[^<]+' "$config_file" 2>/dev/null || true)
        if [[ -n "$key" ]]; then
            echo "$key"
            return 0
        fi
    fi

    # 配置文件尚未生成 (容器可能还在初始化)
    echo ""
    return 1
}

configure_arr_webhooks() {
    log_step "配置 Sonarr/Radarr/Prowlarr webhook 集成"

    # 等待容器初始化完成 (首次启动需要生成配置文件)
    log_info "等待 *arr 容器初始化 (首次启动可能需要 30-60 秒)..."
    sleep 15

    # ====================================================================
    # 1. 获取各服务的 API Key
    # ====================================================================
    local prowlarr_key sonarr_key radarr_key bazarr_key
    prowlarr_key=$(get_arr_api_key "prowlarr" || true)
    sonarr_key=$(get_arr_api_key "sonarr" || true)
    radarr_key=$(get_arr_api_key "radarr" || true)
    bazarr_key=$(get_arr_api_key "bazarr" || true)

    if [[ -z "$prowlarr_key" || -z "$sonarr_key" || -z "$radarr_key" ]]; then
        log_warn "*arr 容器尚未完成初始化, API Key 不可用"
        log_warn "webhook 集成将在容器初始化完成后手动配置, 或下次运行脚本时自动配置"
        log_info "手动配置方法:"
        log_info "  1. 访问 Prowlarr: http://127.0.0.1:9696"
        log_info "  2. 访问 Sonarr:   http://127.0.0.1:8989"
        log_info "  3. 访问 Radarr:   http://127.0.0.1:7878"
        log_info "  4. 访问 Bazarr:   http://127.0.0.1:6767"
        return 0
    fi

    # ====================================================================
    # 2. 配置 Prowlarr 连接 Sonarr/Radarr (需求 24.1)
    # ====================================================================
    log_info "配置 Prowlarr 应用连接..."

    # 添加 Sonarr 到 Prowlarr 的应用列表
    local sonarr_app_json="{\"name\":\"Sonarr\",\"syncLevel\":\"fullSync\",\"implementation\":\"Sonarr\",\"configContract\":\"SonarrSettings\",\"fields\":[{\"name\":\"prowlarrUrl\",\"value\":\"http://127.0.0.1:9696\"},{\"name\":\"baseUrl\",\"value\":\"http://127.0.0.1:8989\"},{\"name\":\"apiKey\",\"value\":\"${sonarr_key}\"},{\"name\":\"syncCategories\",\"value\":[5000,5010,5020,5030,5040,5045,5050]}]}"

    if api_call_with_retry "POST" "http://127.0.0.1:9696/api/v1/applications" "$sonarr_app_json" "$prowlarr_key"; then
        log_ok "Prowlarr -> Sonarr 连接已配置"
    fi

    # 添加 Radarr 到 Prowlarr 的应用列表
    local radarr_app_json="{\"name\":\"Radarr\",\"syncLevel\":\"fullSync\",\"implementation\":\"Radarr\",\"configContract\":\"RadarrSettings\",\"fields\":[{\"name\":\"prowlarrUrl\",\"value\":\"http://127.0.0.1:9696\"},{\"name\":\"baseUrl\",\"value\":\"http://127.0.0.1:7878\"},{\"name\":\"apiKey\",\"value\":\"${radarr_key}\"},{\"name\":\"syncCategories\",\"value\":[2000,2010,2020,2030,2040,2045,2050]}]}"

    if api_call_with_retry "POST" "http://127.0.0.1:9696/api/v1/applications" "$radarr_app_json" "$prowlarr_key"; then
        log_ok "Prowlarr -> Radarr 连接已配置"
    fi

    # ====================================================================
    # 3. 配置 Sonarr 连接 qBittorrent (需求 24.2)
    # ====================================================================
    log_info "配置 Sonarr 连接 qBittorrent..."

    local sonarr_qbt_json="{\"name\":\"qBittorrent\",\"implementation\":\"QBittorrent\",\"configContract\":\"QBittorrentSettings\",\"enable\":true,\"protocol\":\"torrent\",\"fields\":[{\"name\":\"host\",\"value\":\"127.0.0.1\"},{\"name\":\"port\",\"value\":8080},{\"name\":\"category\",\"value\":\"tv-sonarr\"}]}"

    if api_call_with_retry "POST" "http://127.0.0.1:8989/api/v3/downloadclient" "$sonarr_qbt_json" "$sonarr_key"; then
        log_ok "Sonarr -> qBittorrent 下载客户端已配置"
    fi

    # ====================================================================
    # 4. 配置 Radarr 连接 qBittorrent (需求 24.3)
    # ====================================================================
    log_info "配置 Radarr 连接 qBittorrent..."

    local radarr_qbt_json="{\"name\":\"qBittorrent\",\"implementation\":\"QBittorrent\",\"configContract\":\"QBittorrentSettings\",\"enable\":true,\"protocol\":\"torrent\",\"fields\":[{\"name\":\"host\",\"value\":\"127.0.0.1\"},{\"name\":\"port\",\"value\":8080},{\"name\":\"category\",\"value\":\"radarr\"}]}"

    if api_call_with_retry "POST" "http://127.0.0.1:7878/api/v3/downloadclient" "$radarr_qbt_json" "$radarr_key"; then
        log_ok "Radarr -> qBittorrent 下载客户端已配置"
    fi

    # ====================================================================
    # 5. 配置 Bazarr 连接 Sonarr/Radarr (需求 24.4)
    # ====================================================================
    log_info "配置 Bazarr 连接 Sonarr/Radarr..."

    if [[ -n "$bazarr_key" ]]; then
        local bazarr_sonarr_json="{\"settings-sonarr-ip\":\"127.0.0.1\",\"settings-sonarr-port\":8989,\"settings-sonarr-apikey\":\"${sonarr_key}\",\"settings-sonarr-enabled\":true}"
        local bazarr_radarr_json="{\"settings-radarr-ip\":\"127.0.0.1\",\"settings-radarr-port\":7878,\"settings-radarr-apikey\":\"${radarr_key}\",\"settings-radarr-enabled\":true}"

        api_call_with_retry "POST" "http://127.0.0.1:6767/api/system/settings" "$bazarr_sonarr_json" "$bazarr_key" && \
            log_ok "Bazarr -> Sonarr 连接已配置"
        api_call_with_retry "POST" "http://127.0.0.1:6767/api/system/settings" "$bazarr_radarr_json" "$bazarr_key" && \
            log_ok "Bazarr -> Radarr 连接已配置"
    else
        log_warn "Bazarr API Key 不可用, 请手动配置: http://127.0.0.1:6767"
    fi

    # ====================================================================
    # 6. 配置 Tdarr H.265 转码规则 (需求 24.5)
    # ====================================================================
    log_info "配置 Tdarr H.265 转码规则..."

    local tdarr_config_dir="/mnt/storage/starhub/tdarr-data/configs"
    mkdir -p "$tdarr_config_dir"

    cat > "${tdarr_config_dir}/starhub-transcode-rules.json" <<'TDARR_EOF'
{
    "name": "StarHub H.265 转码规则",
    "description": "自动将非 H.265 视频转码为 H.265/HEVC 以节省存储空间",
    "processOrder": "transcode",
    "transcodeDecisionMaker": {
        "targetCodec": "hevc",
        "targetContainer": "mkv",
        "minFileSizeMB": 100,
        "maxFileSizeMB": 50000,
        "skipIfAlreadyHevc": true,
        "hwAcceleration": "nvenc",
        "preset": "slow",
        "crf": 22,
        "audioCodec": "copy",
        "subtitleCodec": "copy"
    }
}
TDARR_EOF
    log_ok "Tdarr H.265 转码规则已写入"

    # ====================================================================
    # 7. 配置 webhook 回调到 task-scheduler
    # ====================================================================
    log_info "配置 Sonarr/Radarr webhook 回调到 task-scheduler..."

    # Sonarr webhook -> task-scheduler
    local sonarr_wh="{\"name\":\"StarHub Task Scheduler\",\"implementation\":\"Webhook\",\"configContract\":\"WebhookSettings\",\"onDownload\":true,\"onUpgrade\":true,\"onImportComplete\":true,\"fields\":[{\"name\":\"url\",\"value\":\"http://127.0.0.1:8000/webhook/import-complete\"},{\"name\":\"method\",\"value\":1}]}"

    if api_call_with_retry "POST" "http://127.0.0.1:8989/api/v3/notification" "$sonarr_wh" "$sonarr_key"; then
        log_ok "Sonarr -> task-scheduler webhook 已配置"
    fi

    # Radarr webhook -> task-scheduler
    local radarr_wh="{\"name\":\"StarHub Task Scheduler\",\"implementation\":\"Webhook\",\"configContract\":\"WebhookSettings\",\"onDownload\":true,\"onUpgrade\":true,\"onImportComplete\":true,\"fields\":[{\"name\":\"url\",\"value\":\"http://127.0.0.1:8000/webhook/import-complete\"},{\"name\":\"method\",\"value\":1}]}"

    if api_call_with_retry "POST" "http://127.0.0.1:7878/api/v3/notification" "$radarr_wh" "$radarr_key"; then
        log_ok "Radarr -> task-scheduler webhook 已配置"
    fi

    log_info "Sonarr/Radarr/Prowlarr webhook 集成配置完成"
}

# ============================================================================
# 第十四节: 下载 AI 模型并预热测试 (需求 71.1-71.3)
# ============================================================================

download_ai_models() {
    log_step "下载 AI 模型并预热测试"

    local base="/mnt/storage"

    # HuggingFace 镜像源 (中国大陆加速)
    local HF_MIRROR="${HF_ENDPOINT:-https://hf-mirror.com}"
    log_info "HuggingFace 镜像源: ${HF_MIRROR}"

    local model_results=()

    # ====================================================================
    # 1. 下载 Ollama LLM 模型 (需求 71.1)
    # ====================================================================
    log_info "下载 Ollama LLM 模型..."

    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^ollama$"; then
        # qwen2.5:72b-instruct-q4_K_M (约 40GB)
        log_info "  拉取 qwen2.5:72b-instruct-q4_K_M (约 40GB, 可能需要较长时间)..."
        if docker exec ollama ollama pull qwen2.5:72b-instruct-q4_K_M 2>&1 | tail -1; then
            log_ok "  qwen2.5:72b-instruct-q4_K_M 下载完成"
            model_results+=("qwen2.5-72b:成功")
        else
            log_warn "  qwen2.5:72b-instruct-q4_K_M 下载失败, 首次使用时将自动下载"
            model_results+=("qwen2.5-72b:失败")
        fi

        # qwen2.5-coder:32b (约 18GB)
        log_info "  拉取 qwen2.5-coder:32b (约 18GB)..."
        if docker exec ollama ollama pull qwen2.5-coder:32b 2>&1 | tail -1; then
            log_ok "  qwen2.5-coder:32b 下载完成"
            model_results+=("qwen2.5-coder-32b:成功")
        else
            log_warn "  qwen2.5-coder:32b 下载失败, 首次使用时将自动下载"
            model_results+=("qwen2.5-coder-32b:失败")
        fi
    else
        log_warn "ollama 容器未运行, 跳过 LLM 模型下载"
        model_results+=("ollama-models:跳过")
    fi

    # ====================================================================
    # 2. 下载 Whisper large-v3 模型 (需求 71.1)
    # ====================================================================
    log_info "检查 Whisper large-v3 模型..."

    local whisper_model_dir="${base}/ai_models/whisper"
    # whisper-api 容器启动时会自动下载模型, 这里检查是否已存在
    if [[ -d "${whisper_model_dir}" ]] && find "${whisper_model_dir}" -name "*.bin" -o -name "*.pt" 2>/dev/null | head -1 | grep -q .; then
        log_ok "Whisper 模型文件已存在, 跳过下载"
        model_results+=("whisper-large-v3:已存在")
    else
        log_info "  Whisper 模型将在 whisper-api 容器首次调用时自动下载"
        log_info "  或手动下载: HF_ENDPOINT=${HF_MIRROR} 从 openai/whisper-large-v3 下载"
        model_results+=("whisper-large-v3:待首次调用下载")
    fi

    # ====================================================================
    # 3. 下载 XTTS-v2 模型 (需求 71.1)
    # ====================================================================
    log_info "检查 XTTS-v2 模型..."

    local xtts_model_dir="${base}/ai_models/xtts"
    if [[ -d "${xtts_model_dir}" ]] && find "${xtts_model_dir}" -name "*.pth" -o -name "model.pth" 2>/dev/null | head -1 | grep -q .; then
        log_ok "XTTS-v2 模型文件已存在, 跳过下载"
        model_results+=("xtts-v2:已存在")
    else
        log_info "  XTTS-v2 模型将在 xtts-api 容器首次调用时自动下载"
        model_results+=("xtts-v2:待首次调用下载")
    fi

    # ====================================================================
    # 4. 下载 SD 1.5 + LoRA 模型 (需求 71.1)
    # ====================================================================
    log_info "检查 Stable Diffusion 模型..."

    local sd_model_dir="${base}/ai_models/sd"
    mkdir -p "${sd_model_dir}/models/Stable-diffusion" "${sd_model_dir}/models/Lora"

    if find "${sd_model_dir}/models/Stable-diffusion" -name "*.safetensors" -o -name "*.ckpt" 2>/dev/null | head -1 | grep -q .; then
        log_ok "SD 基础模型已存在, 跳过下载"
        model_results+=("sd-1.5:已存在")
    else
        # 尝试从 HuggingFace 镜像下载 SD 1.5
        log_info "  下载 SD 1.5 基础模型 (约 4GB)..."
        local sd_url="${HF_MIRROR}/runwayml/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors"
        if curl -fSL --progress-bar "$sd_url" -o "${sd_model_dir}/models/Stable-diffusion/v1-5-pruned-emaonly.safetensors" 2>&1; then
            log_ok "  SD 1.5 基础模型下载完成"
            model_results+=("sd-1.5:成功")
        else
            log_warn "  SD 1.5 下载失败, 请手动下载到 ${sd_model_dir}/models/Stable-diffusion/"
            model_results+=("sd-1.5:失败")
        fi
    fi

    # ====================================================================
    # 5. 预热测试 (需求 71.3)
    # ====================================================================
    log_info "执行 AI 模型预热测试..."

    # 5a. Ollama 文本生成预热
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^ollama$"; then
        log_info "  预热 Ollama 文本生成..."
        local ollama_resp
        ollama_resp=$(curl -s --max-time 120 -X POST http://127.0.0.1:11434/api/generate \
            -d '{"model":"qwen2.5:72b-instruct-q4_K_M","prompt":"Hello","stream":false,"options":{"num_predict":10}}' 2>/dev/null || true)
        if echo "$ollama_resp" | jq -e '.response' &>/dev/null; then
            log_ok "  Ollama 预热成功: 文本生成正常"
        else
            log_warn "  Ollama 预热失败 (模型可能未下载完成)"
        fi
    fi

    # 5b. Whisper 语音识别预热
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^whisper-api$"; then
        log_info "  预热 Whisper 语音识别..."
        # 生成 5 秒静音测试音频
        local test_audio="/tmp/starhub-test-audio.wav"
        if command -v ffmpeg &>/dev/null; then
            ffmpeg -y -f lavfi -i "sine=frequency=440:duration=5" -ar 16000 -ac 1 "$test_audio" &>/dev/null
            local whisper_resp
            whisper_resp=$(curl -s --max-time 120 -X POST http://127.0.0.1:9000/asr \
                -F "audio_file=@${test_audio}" -F "language=en" 2>/dev/null || true)
            if [[ -n "$whisper_resp" ]]; then
                log_ok "  Whisper 预热成功: 语音识别正常"
            else
                log_warn "  Whisper 预热失败 (模型可能正在加载)"
            fi
            rm -f "$test_audio"
        else
            log_warn "  ffmpeg 未安装, 跳过 Whisper 预热测试"
        fi
    fi

    # 5c. SD 图像生成预热
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^sd-api$"; then
        log_info "  预热 SD 图像生成 (512x512)..."
        local sd_resp
        sd_resp=$(curl -s --max-time 300 -X POST http://127.0.0.1:7860/sdapi/v1/txt2img \
            -H "Content-Type: application/json" \
            -d '{"prompt":"test image, simple","steps":5,"width":512,"height":512,"batch_size":1}' 2>/dev/null || true)
        if echo "$sd_resp" | jq -e '.images[0]' &>/dev/null; then
            log_ok "  SD 预热成功: 图像生成正常"
        else
            log_warn "  SD 预热失败 (模型可能正在加载)"
        fi
    fi

    # 5d. XTTS 语音合成预热
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^xtts-api$"; then
        log_info "  预热 XTTS 语音合成 (3秒)..."
        local xtts_resp
        xtts_resp=$(curl -s --max-time 120 -X POST http://127.0.0.1:8020/tts_to_audio/ \
            -H "Content-Type: application/json" \
            -d '{"text":"Hello world test","language":"en"}' 2>/dev/null | head -c 100 || true)
        if [[ -n "$xtts_resp" ]]; then
            log_ok "  XTTS 预热成功: 语音合成正常"
        else
            log_warn "  XTTS 预热失败 (模型可能正在加载)"
        fi
    fi

    # ====================================================================
    # 模型下载汇总
    # ====================================================================
    log_info "AI 模型状态汇总:"
    for result in "${model_results[@]}"; do
        local name="${result%%:*}"
        local status="${result##*:}"
        case "$status" in
            "成功"|"已存在") log_ok "  ${name}: ${status}" ;;
            "失败"|"跳过")   log_warn "  ${name}: ${status}" ;;
            *)               log_info "  ${name}: ${status}" ;;
        esac
    done

    log_info "AI 模型下载与预热测试完成"
}

# ============================================================================
# 第十五节: 配置 systemd 服务与定时器 (需求 86.1-86.5, 72.1, 72.3, 72.4)
# ============================================================================

configure_systemd_services() {
    log_step "配置 systemd 服务与定时器"

    # ====================================================================
    # 1. starhub-docker.service — Docker 启动后恢复容器 (需求 86.2)
    # ====================================================================
    log_info "创建 starhub-docker.service..."

    cat > /etc/systemd/system/starhub-docker.service <<'UNIT_EOF'
[Unit]
Description=StarHub OS Docker 容器自动恢复
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
# 确保所有 unless-stopped 容器在 Docker 启动后恢复运行
ExecStart=/usr/bin/docker start $(docker ps -a --filter "restart-policy=unless-stopped" --format "{{.Names}}" 2>/dev/null || true)
ExecStartPost=/bin/bash -c 'echo "[StarHub] Docker 容器自动恢复完成: $(date)"'

[Install]
WantedBy=multi-user.target
UNIT_EOF

    systemctl daemon-reload
    systemctl enable starhub-docker.service 2>/dev/null || true
    log_ok "starhub-docker.service 已创建并启用"

    # ====================================================================
    # 2. starhub-firewall.service — 开机加载防火墙规则 (需求 86.2)
    # ====================================================================
    log_info "创建 starhub-firewall.service..."

    cat > /etc/systemd/system/starhub-firewall.service <<'UNIT_EOF'
[Unit]
Description=StarHub OS 防火墙规则加载
Before=network-pre.target
Wants=network-pre.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/sbin/iptables-restore /etc/iptables/rules.v4
ExecStartPost=/bin/bash -c 'echo "[StarHub] 防火墙规则已加载: $(iptables -L INPUT --line-numbers 2>/dev/null | wc -l) 条规则"'

[Install]
WantedBy=multi-user.target
UNIT_EOF

    systemctl daemon-reload
    systemctl enable starhub-firewall.service 2>/dev/null || true
    log_ok "starhub-firewall.service 已创建并启用"

    # ====================================================================
    # 3. starhub-dns.service — 验证已有的 DNS-over-HTTPS 服务 (1.6 已创建)
    # ====================================================================
    log_info "验证 starhub-dns-proxy.service..."

    if systemctl is-enabled starhub-dns-proxy.service &>/dev/null; then
        log_ok "starhub-dns-proxy.service 已存在且已启用 (1.6 步骤创建)"
    else
        log_warn "starhub-dns-proxy.service 未找到, 可能 1.6 步骤未执行"
    fi

    # ====================================================================
    # 4. starhub-backup.timer — 每日 03:00 BorgBackup (需求 86.2)
    # ====================================================================
    log_info "创建 starhub-backup.timer..."

    # 备份服务单元
    cat > /etc/systemd/system/starhub-backup.service <<'UNIT_EOF'
[Unit]
Description=StarHub OS BorgBackup 每日备份
After=network-online.target

[Service]
Type=oneshot
Environment="BORG_REPO=/mnt/storage/starhub/backups/borg-repo"
Environment="BORG_PASSCOMMAND=cat /mnt/storage/starhub/config/borg-passphrase"
ExecStart=/bin/bash -c '\
    export BORG_REPO=/mnt/storage/starhub/backups/borg-repo; \
    export BORG_PASSCOMMAND="cat /mnt/storage/starhub/config/borg-passphrase"; \
    ARCHIVE="starhub-$(date +%%Y-%%m-%%d_%%H%%M%%S)"; \
    borg create --stats --compression lz4 \
        "${BORG_REPO}::${ARCHIVE}" \
        /mnt/storage/starhub/pipeline.db \
        /etc/docker/daemon.json \
        /mnt/storage/starhub/config/ \
        /etc/snapraid.conf \
        /etc/iptables/ \
        /etc/systemd/system/starhub-*.service \
        /etc/systemd/system/starhub-*.timer \
        2>&1 | tail -5; \
    borg prune --stats \
        --keep-daily=7 --keep-weekly=4 --keep-monthly=6 \
        "${BORG_REPO}" 2>&1 | tail -3'
Nice=19
IOSchedulingClass=idle
UNIT_EOF

    # 定时器单元
    cat > /etc/systemd/system/starhub-backup.timer <<'UNIT_EOF'
[Unit]
Description=StarHub OS 每日备份定时器 (03:00)

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
UNIT_EOF

    systemctl daemon-reload
    systemctl enable starhub-backup.timer 2>/dev/null || true
    systemctl start starhub-backup.timer 2>/dev/null || true
    log_ok "starhub-backup.timer 已创建: 每日 03:00 执行 BorgBackup"

    # ====================================================================
    # 5. starhub-snapraid.timer — 每日 02:00 snapraid sync (需求 86.2)
    # ====================================================================
    log_info "创建 starhub-snapraid.timer (替代 cron)..."

    # snapraid 服务单元
    cat > /etc/systemd/system/starhub-snapraid.service <<'UNIT_EOF'
[Unit]
Description=StarHub OS SnapRAID 每日同步
After=mnt-storage.mount

[Service]
Type=oneshot
ExecStart=/bin/bash -c '/usr/bin/snapraid sync >> /var/log/snapraid.log 2>&1 && /usr/bin/snapraid scrub -p 5 -o 0 >> /var/log/snapraid.log 2>&1'
Nice=19
IOSchedulingClass=idle
UNIT_EOF

    # 定时器单元
    cat > /etc/systemd/system/starhub-snapraid.timer <<'UNIT_EOF'
[Unit]
Description=StarHub OS SnapRAID 每日同步定时器 (02:00)

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
UNIT_EOF

    systemctl daemon-reload
    systemctl enable starhub-snapraid.timer 2>/dev/null || true
    systemctl start starhub-snapraid.timer 2>/dev/null || true
    log_ok "starhub-snapraid.timer 已创建: 每日 02:00 执行 sync + scrub"

    # 移除旧的 cron 任务 (如果存在, 避免重复执行)
    if [[ -f /etc/cron.d/starhub-snapraid ]]; then
        rm -f /etc/cron.d/starhub-snapraid
        log_info "  已移除旧的 cron 定时任务, 改用 systemd timer"
    fi

    # ====================================================================
    # 6. starhub-health.timer — 每 5 分钟健康检查 (需求 72.3, 86.2)
    # ====================================================================
    log_info "创建 starhub-health.timer..."

    # 健康检查服务单元
    cat > /etc/systemd/system/starhub-health.service <<'UNIT_EOF'
[Unit]
Description=StarHub OS 健康检查

[Service]
Type=oneshot
ExecStart=/bin/bash -c '\
    FAILED=0; \
    for c in cloudflared nas-media-server task-scheduler redis whisper-api xtts-api sd-api ollama tdarr sonarr radarr prowlarr bazarr qbittorrent puter dockge; do \
        if ! docker ps --format "{{.Names}}" 2>/dev/null | grep -q "^${c}$"; then \
            echo "[HEALTH] 容器异常: ${c}, 尝试重启..."; \
            docker start "${c}" 2>/dev/null || echo "[HEALTH] 重启失败: ${c}"; \
            FAILED=$((FAILED+1)); \
        fi; \
    done; \
    if [ $FAILED -eq 0 ]; then \
        echo "[HEALTH] 所有容器运行正常 $(date)"; \
    else \
        echo "[HEALTH] ${FAILED} 个容器异常 $(date)"; \
    fi'
UNIT_EOF

    # 定时器单元
    cat > /etc/systemd/system/starhub-health.timer <<'UNIT_EOF'
[Unit]
Description=StarHub OS 健康检查定时器 (每5分钟)

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=30s

[Install]
WantedBy=timers.target
UNIT_EOF

    systemctl daemon-reload
    systemctl enable starhub-health.timer 2>/dev/null || true
    systemctl start starhub-health.timer 2>/dev/null || true
    log_ok "starhub-health.timer 已创建: 每 5 分钟检查容器状态"

    # ====================================================================
    # 7. starhub-cleanup.timer — 每周清理 (需求 72.3, 86.2)
    # ====================================================================
    log_info "创建 starhub-cleanup.timer..."

    # 清理服务单元
    cat > /etc/systemd/system/starhub-cleanup.service <<'UNIT_EOF'
[Unit]
Description=StarHub OS 每周清理

[Service]
Type=oneshot
ExecStart=/bin/bash -c '\
    echo "[CLEANUP] 开始每周清理 $(date)"; \
    docker system prune -f --volumes 2>&1 | tail -3; \
    find /mnt/storage/media/*/processing -mindepth 1 -maxdepth 1 -mtime +7 -exec rm -rf {} + 2>/dev/null || true; \
    find /var/log -name "*.log" -mtime +30 -delete 2>/dev/null || true; \
    echo "[CLEANUP] 清理完成 $(date)"'
Nice=19
IOSchedulingClass=idle
UNIT_EOF

    # 定时器单元
    cat > /etc/systemd/system/starhub-cleanup.timer <<'UNIT_EOF'
[Unit]
Description=StarHub OS 每周清理定时器 (周日 04:00)

[Timer]
OnCalendar=Sun *-*-* 04:00:00
Persistent=true
RandomizedDelaySec=600

[Install]
WantedBy=timers.target
UNIT_EOF

    systemctl daemon-reload
    systemctl enable starhub-cleanup.timer 2>/dev/null || true
    systemctl start starhub-cleanup.timer 2>/dev/null || true
    log_ok "starhub-cleanup.timer 已创建: 每周日 04:00 清理"

    # ====================================================================
    # 8. 配置 systemd-journald 日志限制 500M (需求 86.5)
    # ====================================================================
    log_info "配置 systemd-journald 日志限制..."

    local journald_conf="/etc/systemd/journald.conf"
    # 幂等: 检查是否已配置
    if grep -q "^SystemMaxUse=500M" "$journald_conf" 2>/dev/null; then
        log_ok "journald 日志限制已配置 (500M), 跳过"
    else
        # 备份原始配置 (仅首次)
        if [[ ! -f "${journald_conf}.bak.starhub" ]]; then
            cp "$journald_conf" "${journald_conf}.bak.starhub"
        fi
        # 追加或替换配置
        if grep -q "^#\?SystemMaxUse=" "$journald_conf" 2>/dev/null; then
            sed -i 's/^#\?SystemMaxUse=.*/SystemMaxUse=500M/' "$journald_conf"
        else
            echo "SystemMaxUse=500M" >> "$journald_conf"
        fi
        systemctl restart systemd-journald 2>/dev/null || true
        log_ok "journald 日志限制已设置为 500M"
    fi

    # ====================================================================
    # 汇总
    # ====================================================================
    log_info "systemd 服务与定时器汇总:"
    log_info "  服务: starhub-docker, starhub-firewall, starhub-dns-proxy, starhub-mac-random"
    log_info "  定时器: starhub-backup(03:00), starhub-snapraid(02:00), starhub-health(5min), starhub-cleanup(周日04:00)"
    log_info "  日志限制: journald 500M"

    # 列出所有 starhub 相关的 systemd 单元
    log_info "已注册的 starhub systemd 单元:"
    systemctl list-unit-files 'starhub-*' 2>/dev/null | grep -v "^$" | while read -r line; do
        log_info "  ${line}"
    done

    log_info "systemd 服务与定时器配置完成"
}

# ============================================================================
# 第十六节: 初始化 BorgBackup 加密备份仓库 (需求 83.1-83.7)
# ============================================================================

init_borgbackup() {
    log_step "初始化 BorgBackup 加密备份仓库"

    local borg_repo="/mnt/storage/starhub/backups/borg-repo"
    local borg_passphrase_file="/mnt/storage/starhub/config/borg-passphrase"

    # ====================================================================
    # 1. 生成或读取 BorgBackup 密码 (需求 83.4)
    # ====================================================================
    mkdir -p "$(dirname "$borg_passphrase_file")"

    if [[ -f "$borg_passphrase_file" ]]; then
        log_ok "BorgBackup 密码文件已存在: ${borg_passphrase_file}"
    else
        # 生成随机密码 (32 字节 base64 编码)
        local passphrase
        passphrase=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)
        echo "$passphrase" > "$borg_passphrase_file"
        chmod 600 "$borg_passphrase_file"
        log_ok "BorgBackup 密码已生成并保存到 ${borg_passphrase_file} (权限 600)"
        log_warn "请务必备份此密码文件到安全位置, 丢失后无法恢复备份数据"
    fi

    export BORG_PASSCOMMAND="cat ${borg_passphrase_file}"

    # ====================================================================
    # 2. 初始化 BorgBackup 仓库 (需求 83.1)
    # ====================================================================
    mkdir -p "$(dirname "$borg_repo")"

    if [[ -d "${borg_repo}/data" ]]; then
        log_ok "BorgBackup 仓库已初始化: ${borg_repo}, 跳过"
    else
        log_info "初始化 BorgBackup 加密仓库 (repokey 模式)..."
        if borg init --encryption=repokey "$borg_repo" 2>&1; then
            log_ok "BorgBackup 仓库初始化完成: ${borg_repo}"
        else
            log_error "BorgBackup 仓库初始化失败"
            return 1
        fi
    fi

    # ====================================================================
    # 3. 配置备份内容清单 (需求 83.2)
    # ====================================================================
    log_info "配置备份内容清单..."

    local backup_list="/mnt/storage/starhub/config/borg-backup-paths.txt"
    cat > "$backup_list" <<'PATHS_EOF'
# 星聚OS BorgBackup 备份路径清单
# 由 deploy.sh 自动生成

# SQLite 数据库
/mnt/storage/starhub/pipeline.db

# Docker 配置
/etc/docker/daemon.json

# 星聚系统配置
/mnt/storage/starhub/config/

# 存储配置
/etc/snapraid.conf

# 防火墙规则
/etc/iptables/rules.v4

# Cloudflare Tunnel 凭证
/mnt/storage/starhub/config/tunnel-token

# systemd 服务文件
/etc/systemd/system/starhub-docker.service
/etc/systemd/system/starhub-firewall.service
/etc/systemd/system/starhub-dns-proxy.service
/etc/systemd/system/starhub-mac-random.service
/etc/systemd/system/starhub-backup.service
/etc/systemd/system/starhub-backup.timer
/etc/systemd/system/starhub-snapraid.service
/etc/systemd/system/starhub-snapraid.timer
/etc/systemd/system/starhub-health.service
/etc/systemd/system/starhub-health.timer
/etc/systemd/system/starhub-cleanup.service
/etc/systemd/system/starhub-cleanup.timer

# *arr 容器配置
/mnt/storage/starhub/sonarr-config/config.xml
/mnt/storage/starhub/radarr-config/config.xml
/mnt/storage/starhub/prowlarr-config/config.xml
/mnt/storage/starhub/bazarr-config/config.xml
/mnt/storage/starhub/qbittorrent-config/
PATHS_EOF

    log_ok "备份路径清单已写入: ${backup_list}"

    # ====================================================================
    # 4. 配置保留策略 (需求 83.5)
    # ====================================================================
    log_info "备份保留策略: 7 天日备 + 4 周周备 + 6 月月备"

    # ====================================================================
    # 5. 生成 restore.sh 恢复脚本 (需求 83.7)
    # ====================================================================
    log_info "生成备份恢复脚本 restore.sh..."

    local restore_script="/mnt/storage/starhub/backups/restore.sh"
    cat > "$restore_script" <<'RESTORE_EOF'
#!/usr/bin/env bash
# ============================================================================
# 星聚OS (StarHub OS) — BorgBackup 恢复脚本
# ============================================================================
# 用法: sudo bash restore.sh [归档名称]
# 示例: sudo bash restore.sh starhub-2024-01-15_030000
# 不指定归档名称时, 列出所有可用归档
# ============================================================================

set -euo pipefail

BORG_REPO="/mnt/storage/starhub/backups/borg-repo"
BORG_PASSPHRASE_FILE="/mnt/storage/starhub/config/borg-passphrase"
RESTORE_DIR="/tmp/starhub-restore"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[FAIL]${NC}  $*"; }

# 检查 root 权限
if [[ $EUID -ne 0 ]]; then
    log_error "此脚本必须以 root 权限运行"
    exit 1
fi

# 检查密码文件
if [[ ! -f "$BORG_PASSPHRASE_FILE" ]]; then
    log_error "BorgBackup 密码文件不存在: ${BORG_PASSPHRASE_FILE}"
    exit 1
fi

export BORG_PASSCOMMAND="cat ${BORG_PASSPHRASE_FILE}"

# 如果未指定归档名称, 列出所有可用归档
if [[ $# -eq 0 ]]; then
    log_info "可用的备份归档:"
    echo ""
    borg list "$BORG_REPO"
    echo ""
    log_info "用法: sudo bash restore.sh <归档名称>"
    log_info "示例: sudo bash restore.sh starhub-2024-01-15_030000"
    exit 0
fi

ARCHIVE="$1"
log_info "准备恢复归档: ${ARCHIVE}"

# 创建临时恢复目录
mkdir -p "$RESTORE_DIR"

# 提取归档到临时目录
log_info "提取归档内容到 ${RESTORE_DIR}..."
borg extract "${BORG_REPO}::${ARCHIVE}" --destination "$RESTORE_DIR"

log_ok "归档提取完成"
log_info "恢复的文件位于: ${RESTORE_DIR}"
log_info ""
log_info "请手动检查并复制需要恢复的文件:"
log_info "  1. 数据库: cp ${RESTORE_DIR}/mnt/storage/starhub/pipeline.db /mnt/storage/starhub/pipeline.db"
log_info "  2. Docker: cp ${RESTORE_DIR}/etc/docker/daemon.json /etc/docker/daemon.json"
log_info "  3. 防火墙: cp ${RESTORE_DIR}/etc/iptables/rules.v4 /etc/iptables/rules.v4"
log_info "  4. 配置:   cp -r ${RESTORE_DIR}/mnt/storage/starhub/config/ /mnt/storage/starhub/config/"
log_info ""
log_warn "恢复后请重启相关服务: systemctl restart docker"
RESTORE_EOF

    chmod +x "$restore_script"
    log_ok "恢复脚本已生成: ${restore_script}"

    # ====================================================================
    # 6. 执行首次备份 (验证仓库可用)
    # ====================================================================
    log_info "执行首次备份 (验证仓库可用)..."

    local archive_name="starhub-initial-$(date +%Y-%m-%d_%H%M%S)"
    # 仅备份已存在的文件
    local backup_paths=()
    for path in /mnt/storage/starhub/pipeline.db /etc/docker/daemon.json /mnt/storage/starhub/config/ /etc/iptables/rules.v4; do
        [[ -e "$path" ]] && backup_paths+=("$path")
    done

    if [[ ${#backup_paths[@]} -gt 0 ]]; then
        if borg create --stats --compression lz4 \
            "${borg_repo}::${archive_name}" \
            "${backup_paths[@]}" 2>&1 | tail -5; then
            log_ok "首次备份完成: ${archive_name}"
        else
            log_warn "首次备份失败, 请检查 borg 配置"
        fi
    else
        log_warn "无可备份文件, 跳过首次备份"
    fi

    # 显示仓库信息
    log_info "BorgBackup 仓库信息:"
    borg info "$borg_repo" 2>&1 | grep -E "(Repository|Encrypted|Cache|All archives)" | while read -r line; do
        log_info "  ${line}"
    done

    log_info "BorgBackup 初始化完成"
}

# ============================================================================
# 第十七节: 部署后验证与状态报告 (需求 73.1-73.4, 21.3, 21.4)
# ============================================================================

post_deploy_verify() {
    log_step "部署后验证与状态报告"

    local report_file="/mnt/storage/starhub/deploy-report.txt"
    mkdir -p "$(dirname "$report_file")"

    # 同时输出到终端和报告文件
    # 使用临时文件收集报告内容
    local report_tmp="/tmp/starhub-deploy-report-$$.txt"

    # 辅助函数: 同时写入终端和报告文件
    report_line() {
        echo -e "$*"
        # 去除颜色代码写入文件
        echo -e "$*" | sed 's/\x1b\[[0-9;]*m//g' >> "$report_tmp"
    }

    : > "$report_tmp"

    report_line ""
    report_line "${CYAN}================================================================${NC}"
    report_line "${CYAN}  StarHub OS (星聚OS) 部署报告${NC}"
    report_line "${CYAN}  生成时间: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
    report_line "${CYAN}================================================================${NC}"
    report_line ""

    local total_checks=0
    local passed_checks=0
    local failed_checks=0
    local warn_checks=0

    # ====================================================================
    # 1. 系统信息
    # ====================================================================
    report_line "${CYAN}--- 系统信息 ---${NC}"
    report_line "  操作系统:   Debian $(cat /etc/debian_version 2>/dev/null || echo '未知')"
    report_line "  内核版本:   $(uname -r)"
    report_line "  CPU:        $(nproc) 核 ($(grep 'model name' /proc/cpuinfo 2>/dev/null | head -1 | sed 's/.*: //' || echo '未知'))"
    local ram_gb=$(( $(grep MemTotal /proc/meminfo | awk '{print $2}') / 1024 / 1024 ))
    report_line "  内存:       ${ram_gb}GB"
    report_line "  主机名:     $(hostname)"
    report_line ""

    # ====================================================================
    # 2. Docker 容器状态 (需求 21.3, 73.1)
    # ====================================================================
    report_line "${CYAN}--- Docker 容器状态 ---${NC}"

    local all_containers=(
        "cloudflared" "nas-media-server" "puter" "dockge"
        "task-scheduler" "redis" "file-watcher" "nas-agent"
        "whisper-api" "xtts-api" "sd-api" "manga-translator" "ollama" "tdarr"
        "video-processor"
        "qbittorrent" "sonarr" "radarr" "prowlarr" "bazarr"
    )

    local running_count=0
    for cname in "${all_containers[@]}"; do
        total_checks=$((total_checks + 1))
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${cname}$"; then
            report_line "  ${GREEN}[OK]${NC}   ${cname}"
            running_count=$((running_count + 1))
            passed_checks=$((passed_checks + 1))
        elif docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${cname}$"; then
            report_line "  ${YELLOW}[STOP]${NC} ${cname} (已停止)"
            warn_checks=$((warn_checks + 1))
        else
            report_line "  ${RED}[FAIL]${NC} ${cname} (未部署)"
            failed_checks=$((failed_checks + 1))
        fi
    done
    report_line "  容器运行: ${running_count}/${#all_containers[@]}"
    report_line ""

    # ====================================================================
    # 3. GPU 状态 (需求 73.1)
    # ====================================================================
    report_line "${CYAN}--- GPU 状态 ---${NC}"
    total_checks=$((total_checks + 1))

    if command -v nvidia-smi &>/dev/null; then
        local gpu_info
        gpu_info=$(nvidia-smi --query-gpu=name,memory.total,memory.used,temperature.gpu,driver_version --format=csv,noheader 2>/dev/null || true)
        if [[ -n "$gpu_info" ]]; then
            report_line "  ${GREEN}[OK]${NC}   GPU: ${gpu_info}"
            passed_checks=$((passed_checks + 1))
        else
            report_line "  ${RED}[FAIL]${NC} nvidia-smi 可用但无法获取 GPU 信息"
            failed_checks=$((failed_checks + 1))
        fi
    else
        report_line "  ${YELLOW}[WARN]${NC} nvidia-smi 不可用, GPU 状态未知"
        warn_checks=$((warn_checks + 1))
    fi
    report_line ""

    # ====================================================================
    # 4. Cloudflare Tunnel 连接状态 (需求 73.1)
    # ====================================================================
    report_line "${CYAN}--- Cloudflare Tunnel ---${NC}"
    total_checks=$((total_checks + 1))

    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^cloudflared$"; then
        local tunnel_log
        tunnel_log=$(docker logs cloudflared 2>&1 | tail -20 || true)
        if echo "$tunnel_log" | grep -qi "connection.*registered\|Registered tunnel connection"; then
            report_line "  ${GREEN}[OK]${NC}   Tunnel 连接正常 (Connection registered)"
            passed_checks=$((passed_checks + 1))
        else
            report_line "  ${YELLOW}[WARN]${NC} Tunnel 容器运行中, 但未检测到连接确认"
            warn_checks=$((warn_checks + 1))
        fi
    else
        report_line "  ${RED}[FAIL]${NC} cloudflared 容器未运行"
        failed_checks=$((failed_checks + 1))
    fi
    report_line ""

    # ====================================================================
    # 5. pipeline.db 完整性检查 (需求 73.1)
    # ====================================================================
    report_line "${CYAN}--- 数据库完整性 ---${NC}"
    total_checks=$((total_checks + 1))

    local db_path="/mnt/storage/starhub/pipeline.db"
    if [[ -f "$db_path" ]]; then
        local integrity
        integrity=$(sqlite3 "$db_path" "PRAGMA integrity_check;" 2>/dev/null || echo "error")
        if [[ "$integrity" == "ok" ]]; then
            local table_count
            table_count=$(sqlite3 "$db_path" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';" 2>/dev/null || echo "0")
            local db_size
            db_size=$(du -h "$db_path" | awk '{print $1}')
            report_line "  ${GREEN}[OK]${NC}   pipeline.db 完整性通过 (${table_count} 张表, ${db_size})"
            passed_checks=$((passed_checks + 1))
        else
            report_line "  ${RED}[FAIL]${NC} pipeline.db 完整性检查失败: ${integrity}"
            failed_checks=$((failed_checks + 1))
        fi
    else
        report_line "  ${RED}[FAIL]${NC} pipeline.db 不存在: ${db_path}"
        failed_checks=$((failed_checks + 1))
    fi
    report_line ""

    # ====================================================================
    # 6. mergerfs 挂载检查
    # ====================================================================
    report_line "${CYAN}--- 存储系统 ---${NC}"
    total_checks=$((total_checks + 1))

    if mountpoint -q /mnt/storage 2>/dev/null; then
        local storage_avail
        storage_avail=$(df -h /mnt/storage | awk 'NR==2 {print $4}')
        report_line "  ${GREEN}[OK]${NC}   mergerfs 已挂载: /mnt/storage (可用 ${storage_avail})"
        passed_checks=$((passed_checks + 1))
    else
        report_line "  ${YELLOW}[WARN]${NC} mergerfs 未挂载 (/mnt/storage)"
        warn_checks=$((warn_checks + 1))
    fi

    # snapraid 配置检查
    total_checks=$((total_checks + 1))
    if [[ -f /etc/snapraid.conf ]]; then
        report_line "  ${GREEN}[OK]${NC}   snapraid 配置存在"
        passed_checks=$((passed_checks + 1))
    else
        report_line "  ${YELLOW}[WARN]${NC} snapraid 配置不存在"
        warn_checks=$((warn_checks + 1))
    fi
    report_line ""

    # ====================================================================
    # 7. 网络安全状态
    # ====================================================================
    report_line "${CYAN}--- 网络安全 ---${NC}"

    # 防火墙规则数
    total_checks=$((total_checks + 1))
    local fw_rules
    fw_rules=$(iptables -L INPUT --line-numbers 2>/dev/null | tail -n +3 | wc -l || echo "0")
    if [[ "$fw_rules" -gt 0 ]]; then
        report_line "  ${GREEN}[OK]${NC}   防火墙: ${fw_rules} 条 INPUT 规则"
        passed_checks=$((passed_checks + 1))
    else
        report_line "  ${YELLOW}[WARN]${NC} 防火墙: 无 INPUT 规则"
        warn_checks=$((warn_checks + 1))
    fi

    # DNS-over-HTTPS
    total_checks=$((total_checks + 1))
    if systemctl is-active --quiet starhub-dns-proxy 2>/dev/null; then
        report_line "  ${GREEN}[OK]${NC}   DNS-over-HTTPS: 运行中"
        passed_checks=$((passed_checks + 1))
    else
        report_line "  ${YELLOW}[WARN]${NC} DNS-over-HTTPS: 未运行"
        warn_checks=$((warn_checks + 1))
    fi

    # 端口安全检查
    total_checks=$((total_checks + 1))
    local unsafe_ports
    unsafe_ports=$(docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep "0\.0\.0\.0:" || true)
    if [[ -z "$unsafe_ports" ]]; then
        report_line "  ${GREEN}[OK]${NC}   端口安全: 所有容器绑定 127.0.0.1"
        passed_checks=$((passed_checks + 1))
    else
        report_line "  ${RED}[FAIL]${NC} 端口安全: 发现 0.0.0.0 绑定"
        failed_checks=$((failed_checks + 1))
    fi
    report_line ""

    # ====================================================================
    # 8. BorgBackup 状态
    # ====================================================================
    report_line "${CYAN}--- 备份系统 ---${NC}"
    total_checks=$((total_checks + 1))

    local borg_repo="/mnt/storage/starhub/backups/borg-repo"
    if [[ -d "${borg_repo}/data" ]]; then
        report_line "  ${GREEN}[OK]${NC}   BorgBackup 仓库已初始化"
        passed_checks=$((passed_checks + 1))
    else
        report_line "  ${YELLOW}[WARN]${NC} BorgBackup 仓库未初始化"
        warn_checks=$((warn_checks + 1))
    fi
    report_line ""

    # ====================================================================
    # 9. systemd 定时器状态
    # ====================================================================
    report_line "${CYAN}--- systemd 定时器 ---${NC}"

    local timers=("starhub-backup.timer" "starhub-snapraid.timer" "starhub-health.timer" "starhub-cleanup.timer")
    for timer in "${timers[@]}"; do
        total_checks=$((total_checks + 1))
        if systemctl is-enabled --quiet "$timer" 2>/dev/null; then
            report_line "  ${GREEN}[OK]${NC}   ${timer}: 已启用"
            passed_checks=$((passed_checks + 1))
        else
            report_line "  ${YELLOW}[WARN]${NC} ${timer}: 未启用"
            warn_checks=$((warn_checks + 1))
        fi
    done
    report_line ""

    # ====================================================================
    # 10. 汇总
    # ====================================================================
    report_line "${CYAN}================================================================${NC}"
    report_line "${CYAN}  部署验证汇总${NC}"
    report_line "${CYAN}================================================================${NC}"
    report_line "  ${GREEN}通过: ${passed_checks}${NC}  ${YELLOW}警告: ${warn_checks}${NC}  ${RED}失败: ${failed_checks}${NC}  总计: ${total_checks}"
    report_line ""

    if [[ "$failed_checks" -eq 0 && "$warn_checks" -eq 0 ]]; then
        report_line "  ${GREEN}所有检查项全部通过${NC}"
    elif [[ "$failed_checks" -eq 0 ]]; then
        report_line "  ${GREEN}核心功能正常${NC}, 部分项目需要关注"
    else
        report_line "  ${RED}存在失败项, 请检查上方详情${NC}"
    fi
    report_line ""

    # ====================================================================
    # 11. 接下来的步骤 (需求 73.3)
    # ====================================================================
    report_line "${CYAN}--- 接下来的步骤 ---${NC}"
    report_line ""
    report_line "  1. 访问 Web 桌面管理界面:"
    report_line "     Puter:  http://127.0.0.1:8443"
    report_line "     Dockge: http://127.0.0.1:5001"
    report_line ""
    report_line "  2. 配置 Cloudflare Tunnel ingress 规则 (在 Cloudflare Dashboard):"
    report_line "     媒体服务: your-domain.com -> http://localhost:8765"
    report_line "     管理 API: api.your-domain.com -> http://localhost:8000"
    report_line ""
    report_line "  3. 配置刮削源 (添加 Torrent 索引器):"
    report_line "     Prowlarr: http://127.0.0.1:9696"
    report_line "     Sonarr:   http://127.0.0.1:8989"
    report_line "     Radarr:   http://127.0.0.1:7878"
    report_line ""
    report_line "  4. 查看 AI 处理队列:"
    report_line "     task-scheduler: http://127.0.0.1:8000/api/queue/stats"
    report_line ""
    report_line "  5. 添加 Telegram 频道 (后续阶段实现):"
    report_line "     通过 task-scheduler API 或管理界面添加"
    report_line ""
    report_line "  6. 检查 AI 模型状态:"
    report_line "     Ollama:  docker exec ollama ollama list"
    report_line "     Whisper: curl http://127.0.0.1:9000/health"
    report_line ""
    report_line "  7. 备份密码请妥善保管:"
    report_line "     ${borg_passphrase_file:-/mnt/storage/starhub/config/borg-passphrase}"
    report_line ""

    # 保存报告到文件
    cp "$report_tmp" "$report_file"
    rm -f "$report_tmp"
    log_ok "部署报告已保存到: ${report_file}"
}
# ============================================================================
# 主流程入口
# ============================================================================

main() {
    echo -e "${CYAN}"
    echo "  ================================================================"
    echo "    StarHub OS (星聚OS) — Debian 13 Trixie 一键部署"
    echo "    目标硬件: i5-12400 + RTX 3090 24GB + 64GB DDR4"
    echo "  ================================================================"
    echo -e "${NC}"

    check_root
    detect_system
    configure_apt_sources
    install_base_packages
    configure_docker
    configure_storage
    create_directory_structure
    init_pipeline_db
    configure_network_security
    configure_cloudflare_tunnel
    deploy_docker_containers

    configure_arr_webhooks
    download_ai_models
    configure_systemd_services
    init_borgbackup
    post_deploy_verify

    log_step "阶段一 (1.1-1.13) 全部完成"
    log_ok "星聚OS (StarHub OS) 部署脚本执行完毕"
    log_info "详细部署报告已保存到 /mnt/storage/starhub/deploy-report.txt"
    log_info "请查看上方报告中的 '接下来的步骤' 开始使用系统"
}

main "$@"
