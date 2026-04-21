const express = require("express");
const LiveRoom = require("../models/LiveRoom");
const LiveMessage = require("../models/LiveMessage");
const { requireAuth, optionalAuth } = require("../middleware/auth");
const { cacheGet, cacheSet } = require("../lib/redis");

const router = express.Router();

const VALID_CATEGORIES = ["gaming", "music", "chat", "study", "outdoor", "food", "tech", "art", "entertainment"];

// ============================================================
// 直播间 (Rooms)
// ============================================================

// GET /api/live/rooms — 直播间列表
router.get("/rooms", async (req, res) => {
  try {
    const { category, page = 1, pageSize = 20 } = req.query;
    const p = Math.max(1, Number(page));
    const ps = Math.max(1, Math.min(100, Number(pageSize)));

    const filter = { status: "live" };
    if (category && VALID_CATEGORIES.includes(category)) {
      filter.category = category;
    }

    // 尝试缓存
    const cacheKey = `live:rooms:${category || "all"}:${p}:${ps}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const [items, total] = await Promise.all([
      LiveRoom.find(filter)
        .sort({ viewerCount: -1 })
        .skip((p - 1) * ps)
        .limit(ps)
        .populate("streamer", "username nickname avatar"),
      LiveRoom.countDocuments(filter),
    ]);

    const result = { items, total, page: p, pageSize: ps, totalPages: Math.ceil(total / ps) };

    // 缓存 30 秒
    await cacheSet(cacheKey, result, 30);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/live/rooms — 创建直播间
router.post("/rooms", requireAuth, async (req, res) => {
  try {
    const { title, category, description, tags } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: "标题必填" });

    let cat = "";
    if (category && VALID_CATEGORIES.includes(category)) {
      cat = category;
    }

    const room = await LiveRoom.create({
      title: title.trim(),
      streamer: req.user._id,
      streamerName: req.user.nickname || req.user.username,
      category: cat,
      description: description || "",
      tags: Array.isArray(tags) ? tags : [],
    });

    res.status(201).json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/live/rooms/:id — 直播间详情
router.get("/rooms/:id", async (req, res) => {
  try {
    const room = await LiveRoom.findById(req.params.id)
      .populate("streamer", "username nickname avatar");
    if (!room) return res.status(404).json({ error: "直播间不存在" });
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/live/rooms/:id — 更新直播间（仅主播）
router.put("/rooms/:id", requireAuth, async (req, res) => {
  try {
    const room = await LiveRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ error: "直播间不存在" });
    if (room.streamer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "只有主播可以修改直播间" });
    }

    const { title, category, description, tags, status } = req.body;
    if (title) room.title = title.trim();
    if (category && VALID_CATEGORIES.includes(category)) room.category = category;
    if (description !== undefined) room.description = description;
    if (Array.isArray(tags)) room.tags = tags;
    if (status && ["live", "offline", "ended"].includes(status)) room.status = status;

    await room.save();
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 直播间聊天 (Room Chat)
// ============================================================

// GET /api/live/rooms/:id/chat — 获取直播间最近 100 条消息
router.get("/rooms/:id/chat", async (req, res) => {
  try {
    const room = await LiveRoom.findById(req.params.id).select("_id");
    if (!room) return res.status(404).json({ error: "直播间不存在" });

    const messages = await LiveMessage.find({ room: room._id })
      .sort({ createdAt: 1 })
      .limit(100)
      .populate("user", "username nickname avatar");

    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/live/rooms/:id/chat — 发送直播间消息
router.post("/rooms/:id/chat", requireAuth, async (req, res) => {
  try {
    const room = await LiveRoom.findById(req.params.id).select("_id status");
    if (!room) return res.status(404).json({ error: "直播间不存在" });

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "消息内容不能为空" });
    }

    const message = await LiveMessage.create({
      room: room._id,
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
