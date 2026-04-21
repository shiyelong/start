const express = require("express");
const ChatMessage = require("../models/ChatMessage");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

// 合法频道列表
const VALID_CHANNELS = ["lobby", "game", "music", "funny", "random"];

// GET /api/chat/:channel — 获取频道最近 100 条消息
router.get("/:channel", async (req, res) => {
  try {
    const { channel } = req.params;
    if (!VALID_CHANNELS.includes(channel)) {
      return res.status(400).json({ error: "无效的频道" });
    }

    const messages = await ChatMessage.find({ channelId: channel })
      .sort({ createdAt: 1 })
      .limit(100)
      .populate("user", "username nickname avatar");

    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat/:channel — 发送消息
router.post("/:channel", requireAuth, async (req, res) => {
  try {
    const { channel } = req.params;
    if (!VALID_CHANNELS.includes(channel)) {
      return res.status(400).json({ error: "无效的频道" });
    }

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "消息内容不能为空" });
    }

    const message = await ChatMessage.create({
      channelId: channel,
      user: req.user._id,
      username: req.user.nickname || req.user.username,
      content: content.trim(),
    });

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
