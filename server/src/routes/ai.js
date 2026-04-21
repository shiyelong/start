const express = require("express");
const AiConversation = require("../models/AiConversation");
const AiUsage = require("../models/AiUsage");
const { requireAuth } = require("../middleware/auth");
const { rateLimit: redisRateLimit } = require("../lib/redis");

const router = express.Router();

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 3600; // 1 小时

const SAFETY_SYSTEM_PROMPT =
  "你是星聚平台的AI助手。请确保回复内容安全、友好，不包含暴力、色情或其他不当内容。用中文回答。";

// ============================================================
// POST /api/ai/chat — AI 对话（SSE 流式）
// ============================================================
router.post("/chat", requireAuth, async (req, res) => {
  try {
    const { messages, model = "deepseek/deepseek-chat", conversationId, adultMode } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages 必填且不能为空" });
    }

    // 频率限制
    const allowed = await redisRateLimit(`ai_rate:${req.user._id}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW);
    if (!allowed) {
      return res.status(429).json({ error: "请求太频繁，请稍后再试" });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "AI 服务未配置" });
    }

    // 构建消息（非成人模式添加安全提示）
    const systemMessages = adultMode === true
      ? messages
      : [{ role: "system", content: SAFETY_SYSTEM_PROMPT }, ...messages];

    // 转发到 OpenRouter
    const llmResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://starhub.app",
        "X-Title": "StarHub AI",
      },
      body: JSON.stringify({ model, messages: systemMessages, stream: true }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text().catch(() => "Unknown error");
      const safeError = errorText.replace(/sk-[a-zA-Z0-9]+/g, "[REDACTED]");
      return res.status(llmResponse.status).json({ error: `AI 服务错误: ${safeError}` });
    }

    // 记录使用量（非阻塞）
    AiUsage.create({
      user: req.user._id, provider: "openrouter", model, tokensUsed: 0,
    }).catch(() => {});

    // 更新会话时间（非阻塞）
    if (conversationId) {
      AiConversation.findOneAndUpdate(
        { _id: conversationId, user: req.user._id },
        { updatedAt: new Date() },
      ).catch(() => {});
    }

    // SSE 流式响应
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // 管道转发
    const reader = llmResponse.body.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } catch {}
      res.end();
    };
    pump();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// ============================================================
// GET /api/ai/chat/history — 会话列表
// ============================================================
router.get("/chat/history", requireAuth, async (req, res) => {
  try {
    const conversations = await AiConversation.find({ user: req.user._id })
      .select("title model createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .limit(50);

    res.json({ conversations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/ai/chat/history/:conversationId — 单个会话详情
// ============================================================
router.get("/chat/history/:conversationId", requireAuth, async (req, res) => {
  try {
    const conversation = await AiConversation.findOne({
      _id: req.params.conversationId,
      user: req.user._id,
    });

    if (!conversation) return res.status(404).json({ error: "会话不存在" });

    res.json({ conversation, messages: conversation.messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DELETE /api/ai/chat/history/:conversationId — 删除单个会话
// ============================================================
router.delete("/chat/history/:conversationId", requireAuth, async (req, res) => {
  try {
    const result = await AiConversation.findOneAndDelete({
      _id: req.params.conversationId,
      user: req.user._id,
    });

    if (!result) return res.status(404).json({ error: "会话不存在" });

    res.json({ deleted: true, conversationId: req.params.conversationId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DELETE /api/ai/chat/history — 清空所有会话
// ============================================================
router.delete("/chat/history", requireAuth, async (req, res) => {
  try {
    const result = await AiConversation.deleteMany({ user: req.user._id });
    res.json({ deleted: true, conversationsRemoved: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
