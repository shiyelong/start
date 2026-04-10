const jwt = require("jsonwebtoken");
const User = require("../models/User");

// 必须登录
const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "请先登录" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ error: "用户不存在" });

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "登录已过期，请重新登录" });
  }
};

// 可选登录（有token就解析，没有也放行）
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.userId);
    }
  } catch {}
  next();
};

// 需要管理员权限
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "需要管理员权限" });
  next();
};

module.exports = { requireAuth, optionalAuth, requireAdmin };
