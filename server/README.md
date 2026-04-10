# 星聚后端服务

## 技术栈
- Node.js + Express
- MongoDB (Atlas 云版 / 本地)
- JWT 认证
- bcrypt 密码加密

## 快速开始

### 1. 安装依赖
```bash
cd server
npm install
```

### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env，填入 MongoDB 连接字符串和 JWT 密钥
```

### 3. MongoDB Atlas 免费注册
1. 访问 https://cloud.mongodb.com
2. 注册账号，创建免费集群（M0 Free Tier）
3. 创建数据库用户，获取连接字符串
4. 填入 .env 的 MONGODB_URI

### 4. 初始化数据
```bash
node src/seed.js
```

### 5. 启动服务
```bash
npm run dev    # 开发模式（热重载）
npm start      # 生产模式
```

## API 接口

### 认证
- `POST /api/auth/register` — 注册
- `POST /api/auth/login` — 登录
- `GET /api/auth/me` — 获取当前用户

### 用户
- `GET /api/users/:id` — 获取用户信息
- `PUT /api/users/me` — 更新个人信息

### 验证系统
- `GET /api/verify?type=person&subType=freelance&status=all&search=xxx` — 列表
- `GET /api/verify/:id` — 详情
- `POST /api/verify` — 提交新条目
- `POST /api/verify/:id/verify` — 提交验证记录
- `POST /api/verify/:id/records/:recordId/vote` — 点赞/踩验证记录
- `POST /api/verify/batch` — 批量导入（管理员）

### 社区
- `GET /api/community/posts` — 帖子列表
- `GET /api/community/posts/:id` — 帖子详情
- `POST /api/community/posts` — 发帖
- `POST /api/community/posts/:id/like` — 点赞
- `POST /api/community/posts/:id/comments` — 评论

### 健康检查
- `GET /api/health`

## 验证投票规则
- 1个验证记录：直接用该值
- 2个不同值：用点赞多的
- 3个以上：少数服从多数，同数量看点赞

## 后续迁移到本地服务器
1. 安装 MongoDB: `brew install mongodb-community` (Mac) 或 `apt install mongodb` (Linux)
2. 修改 .env 的 MONGODB_URI 为 `mongodb://localhost:27017/starhub`
3. 其他不用改
