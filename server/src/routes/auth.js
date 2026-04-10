const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// 注册
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, nickname } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: "用户名、邮箱和密码必填" });
    if (password.length < 6) return res.status(400).json({ error: "密码至少6位" });

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(400).json({ error: "用户名或邮箱已被注册" });

    const user = await User.create({ username, email, password, nickname: nickname || username });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });

    res.status(201).json({ token, user: user.toSafeJSON() });
  } catch (err) {
    res.status(500).json({ error: "注册失败：" + err.message });
  }
});

// 登录
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "邮箱和密码必填" });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "邮箱或密码错误" });

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ error: "邮箱或密码错误" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user: user.toSafeJSON() });
  } catch (err) {
    res.status(500).json({ error: "登录失败：" + err.message });
  }
});

// 获取当前用户信息
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

module.exports = router;
