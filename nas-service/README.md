# NAS 端服务部署指南

## 架构概览

```
用户 → Cloudflare CDN → Cloudflare Pages Functions
                              ↓
                    Cloudflare Tunnel (加密)
                              ↓
                    NAS (零公网端口)
                    ├── cloudflared (隧道守护进程)
                    ├── nas-media-server (本地 HTTP 服务)
                    └── 媒体文件 (加密存储)
```

## NAS 上需要安装的组件

### 1. cloudflared (Cloudflare Tunnel 客户端)

```bash
# 安装 cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# 登录 Cloudflare 账户
cloudflared tunnel login

# 创建命名隧道
cloudflared tunnel create starhub-nas

# 记录隧道 ID（输出中会显示）
```

### 2. 隧道配置文件

创建 `/etc/cloudflared/config.yml`（此文件不提交到 Git）：

```yaml
tunnel: <你的隧道ID>
credentials-file: /root/.cloudflared/<隧道ID>.json

ingress:
  # 媒体文件服务
  - hostname: nas.yourdomain.com
    service: http://localhost:8765
  # 健康检查
  - hostname: nas.yourdomain.com
    path: /health
    service: http://localhost:8765
  # 兜底
  - service: http_status:404
```

### 3. NAS 媒体服务 (nas-media-server)

NAS 上运行一个轻量 HTTP 服务，监听 `localhost:8765`（仅本地，不暴露端口）。

功能：
- `GET /health` — 健康检查，返回磁盘使用量
- `GET /media/*` — 读取媒体文件（支持 Range 请求）
- `PUT /media/*` — 写入缓存文件
- `DELETE /media/*` — 删除缓存文件
- `GET /list/*` — 列出目录文件
- `GET /info/*` — 获取文件元数据

安全：
- 验证 `X-NAS-Signature` 请求头（HMAC-SHA256 签名）
- 仅监听 127.0.0.1，不绑定外部接口
- 签名密钥与 Workers Secrets 中的 `NAS_SIGNING_KEY` 一致

### 4. 防火墙规则

```bash
# 拒绝所有入站连接
iptables -P INPUT DROP
iptables -P FORWARD DROP

# 允许已建立的连接（cloudflared 出站后的回包）
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# 允许本地回环
iptables -A INPUT -i lo -j ACCEPT

# 允许出站（cloudflared 需要连接 Cloudflare）
iptables -P OUTPUT ACCEPT

# 仅允许 cloudflared 进程的出站 443
# （更严格的方案，需要 owner 模块）
# iptables -A OUTPUT -p tcp --dport 443 -m owner --uid-owner cloudflared -j ACCEPT
# iptables -A OUTPUT -p tcp --dport 443 -j DROP
```

### 5. DNS 配置

```bash
# /etc/resolv.conf — 使用 Cloudflare DoH
# 运营商无法看到 DNS 查询内容
nameserver 127.0.0.1

# 安装 cloudflared 作为 DNS 代理
cloudflared proxy-dns --port 53 --upstream https://1.1.1.1/dns-query
```

### 6. MAC 地址随机化

```bash
# /etc/NetworkManager/conf.d/mac-random.conf
[connection]
wifi.cloned-mac-address=random
ethernet.cloned-mac-address=random
```

## 媒体目录结构

```
/data/media/
├── videos/          # 视频文件 (.mp4, .mkv, .avi, .webm)
├── comics/          # 漫画文件夹 (每个文件夹 = 一部漫画)
│   ├── comic-title-1/
│   │   ├── 001.jpg
│   │   ├── 002.jpg
│   │   └── ...
│   └── comic-title-2/
├── novels/          # 小说文件 (.txt, .epub, .pdf)
├── music/           # 音乐/ASMR (.mp3, .flac, .wav)
└── cache/           # 自动缓存目录 (加密文件)
    ├── ab/
    │   └── cd/
    │       └── abcdef...enc
    └── ...
```

## Cloudflare Workers Secrets 配置

在 Cloudflare Dashboard → Workers → Settings → Variables 中设置：

| Secret 名称 | 说明 |
|---|---|
| `NAS_BASE_URL` | 隧道域名，如 `https://nas.yourdomain.com` |
| `NAS_SIGNING_KEY` | HMAC 签名密钥（64 字符十六进制） |
| `NAS_ENCRYPTION_KEY` | AES-256 加密密钥（64 字符十六进制） |
| `JWT_SECRET` | JWT 签名密钥 |

生成密钥：
```bash
# 生成 256-bit 十六进制密钥
openssl rand -hex 32
```

## 启动服务

```bash
# 启动 cloudflared 隧道（systemd 服务）
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# 启动 NAS 媒体服务
# （使用你选择的方式：Node.js / Python / Go 等）
# 确保仅监听 127.0.0.1:8765
```

## 安全检查清单

- [ ] NAS 防火墙拒绝所有入站连接
- [ ] cloudflared 仅出站连接到 Cloudflare (443)
- [ ] 媒体服务仅监听 127.0.0.1
- [ ] DNS 使用 Cloudflare DoH
- [ ] MAC 地址随机化已启用
- [ ] 无 SSH/FTP/SMB 等可被扫描的服务
- [ ] 签名密钥已配置在 Workers Secrets
- [ ] config.yml 不在 Git 仓库中
- [ ] 运营商只能看到与 Cloudflare 的加密流量
