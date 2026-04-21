require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");

// 路由
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const verifyRoutes = require("./routes/verify");
const communityRoutes = require("./routes/community");
const gamesRoutes = require("./routes/games");
const chatRoutes = require("./routes/chat");
const aiRoutes = require("./routes/ai");
const liveRoutes = require("./routes/live");

// Redis
const { getClient: getRedis } = require("./lib/redis");

const app = express();
const PORT = process.env.PORT || 3001;

// 确保上传目录存在
const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 中间件
app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));

// 限流
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: "请求太频繁，请稍后再试" } });
app.use("/api/", limiter);

// 注册路由
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/verify", verifyRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/games", gamesRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/live", liveRoutes);

// 健康检查
app.get("/api/health", async (req, res) => {
  let redisStatus = "disconnected";
  try {
    const redis = await getRedis();
    await redis.ping();
    redisStatus = "connected";
  } catch {}

  res.json({
    status: "ok",
    time: new Date().toISOString(),
    version: "1.1.0",
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    redis: redisStatus,
  });
});

// 连接数据库并启动
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB 连接成功");

    // 尝试连接 Redis（非阻塞，失败不影响启动）
    try {
      await getRedis();
      console.log("Redis 连接成功");
    } catch (err) {
      console.warn("Redis 连接失败（缓存功能不可用）:", err.message);
    }

    app.listen(PORT, () => console.log(`星聚后端运行在 http://localhost:${PORT}`));
  } catch (err) {
    console.error("启动失败:", err.message);
    process.exit(1);
  }
};

startServer();
