require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const verifyRoutes = require("./routes/verify");
const communityRoutes = require("./routes/community");

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static("uploads"));

// 限流
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: "请求太频繁，请稍后再试" } });
app.use("/api/", limiter);

// 路由
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/verify", verifyRoutes);
app.use("/api/community", communityRoutes);

// 健康检查
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), version: "1.0.0" });
});

// 连接数据库并启动
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB 连接成功");
    app.listen(PORT, () => console.log(`🚀 星聚后端运行在 http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("❌ MongoDB 连接失败:", err.message);
    process.exit(1);
  });
