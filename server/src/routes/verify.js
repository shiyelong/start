const express = require("express");
const VerifyItem = require("../models/VerifyItem");
const User = require("../models/User");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

// 获取验证列表（支持分类、子分类、状态、搜索筛选）
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { type = "person", subType, status, search, page = 1, limit = 20 } = req.query;
    const filter = { type };
    if (subType && subType !== "all") filter.subType = subType;
    if (status && status !== "all") filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { "tags.label": { $regex: search, $options: "i" } },
        { "info.location": { $regex: search, $options: "i" } },
      ];
    }

    const items = await VerifyItem.find(filter)
      .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit));
    const total = await VerifyItem.countDocuments(filter);

    // 统计
    const totalUnverified = await VerifyItem.countDocuments({ type, status: "unverified" });
    const totalVerified = await VerifyItem.countDocuments({ type, status: "verified" });

    res.json({ items, total, totalUnverified, totalVerified, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取单个验证条目详情
router.get("/:id", async (req, res) => {
  try {
    const item = await VerifyItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "条目不存在" });
    res.json({ item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 提交新的验证条目（后端批量导入或用户提交）
router.post("/", requireAuth, async (req, res) => {
  try {
    const { type, subType, name, info, tags } = req.body;
    if (!type || !name) return res.status(400).json({ error: "类型和名称必填" });

    const item = await VerifyItem.create({
      type, subType: subType || "all", name, info: info || {},
      tags: tags || [], submittedBy: req.user._id,
    });
    res.status(201).json({ item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 提交验证记录（核心功能：任何人都可以验证，已验证的也可以再次验证）
router.post("/:id/verify", requireAuth, async (req, res) => {
  try {
    const { field, oldValue, newValue, reason } = req.body;
    if (!field || !newValue || !reason) {
      return res.status(400).json({ error: "修改字段、新值和原因必填" });
    }

    const item = await VerifyItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "条目不存在" });

    // 添加验证记录
    item.verifyRecords.push({
      verifier: req.user._id,
      verifierName: req.user.nickname || req.user.username,
      field,
      oldValue: oldValue || "未填写",
      newValue,
      reason,
    });

    // 重新计算共识字段
    item.resolveFields();

    // 更新状态：有验证记录就标记为已验证
    if (item.verifyRecords.length > 0) {
      item.status = "verified";
    }
    item.verifyCount = item.verifyRecords.length;

    await item.save();

    // 更新用户验证次数和信誉
    await User.findByIdAndUpdate(req.user._id, { $inc: { verifyCount: 1, reputation: 1 } });

    res.json({ item, message: "验证记录已提交" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 对验证记录点赞/踩
router.post("/:id/records/:recordId/vote", requireAuth, async (req, res) => {
  try {
    const { vote } = req.body; // "like" or "dislike"
    if (!["like", "dislike"].includes(vote)) return res.status(400).json({ error: "vote 必须是 like 或 dislike" });

    const item = await VerifyItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "条目不存在" });

    const record = item.verifyRecords.id(req.params.recordId);
    if (!record) return res.status(404).json({ error: "记录不存在" });

    const userId = req.user._id.toString();

    // 防止重复投票
    const alreadyLiked = record.likedBy.some((id) => id.toString() === userId);
    const alreadyDisliked = record.dislikedBy.some((id) => id.toString() === userId);

    if (vote === "like") {
      if (alreadyLiked) {
        // 取消点赞
        record.likedBy = record.likedBy.filter((id) => id.toString() !== userId);
        record.likes--;
      } else {
        // 点赞（如果之前踩了就取消踩）
        if (alreadyDisliked) {
          record.dislikedBy = record.dislikedBy.filter((id) => id.toString() !== userId);
          record.dislikes--;
        }
        record.likedBy.push(req.user._id);
        record.likes++;
      }
    } else {
      if (alreadyDisliked) {
        record.dislikedBy = record.dislikedBy.filter((id) => id.toString() !== userId);
        record.dislikes--;
      } else {
        if (alreadyLiked) {
          record.likedBy = record.likedBy.filter((id) => id.toString() !== userId);
          record.likes--;
        }
        record.dislikedBy.push(req.user._id);
        record.dislikes++;
      }
    }

    // 重新计算共识（点赞变化可能影响结果）
    item.resolveFields();
    await item.save();

    // 更新被投票用户的信誉
    if (vote === "like" && !alreadyLiked) {
      await User.findByIdAndUpdate(record.verifier, { $inc: { likeCount: 1, reputation: 1 } });
    }

    res.json({ record, resolvedFields: item.resolvedFields });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 批量导入验证条目（管理员/后端用）
router.post("/batch", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "需要管理员权限" });
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "items 必须是非空数组" });

    const created = await VerifyItem.insertMany(
      items.map((item) => ({ ...item, submittedBy: req.user._id, status: "unverified" }))
    );
    res.status(201).json({ count: created.length, message: `成功导入 ${created.length} 条` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
