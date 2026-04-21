# ---- 构建阶段 ----
FROM node:20-alpine AS builder

WORKDIR /app

# 先复制依赖清单，利用 Docker 缓存层
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# 复制源码并编译 TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- 运行阶段 ----
FROM node:20-alpine AS runtime

# 安装 p7zip 用于 7z 压缩包解压
RUN apk add --no-cache p7zip

WORKDIR /app

# 仅安装生产依赖
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# 从构建阶段复制编译产物
COPY --from=builder /app/dist ./dist

# 非 root 用户运行
RUN addgroup -S starhub && adduser -S watcher -G starhub
USER watcher

CMD ["node", "dist/index.js"]
