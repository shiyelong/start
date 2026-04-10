const express = require("express");
const Post = require("../models/Post");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

// 获取帖子列表
router.get("/posts", optionalAuth, async (req, res) => {
  try {
    const { category, page = 1, limit = 20, sort = "new" } = req.query;
    const filter = {};
    if (category && category !== "all") filter.category = category;

    const sortBy = sort === "hot" ? { likes: -1 } : { createdAt: -1 };
    const posts = await Post.find(filter).sort(sortBy)
      .skip((page - 1) * limit).limit(Number(limit));
    const total = await Post.countDocuments(filter);

    res.json({ posts, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取单个帖子
router.get("/posts/:id", async (req, res) => {
  try {
    const post = await Post.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }, { new: true });
    if (!post) return res.status(404).json({ error: "帖子不存在" });
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 发帖
router.post("/posts", requireAuth, async (req, res) => {
  try {
    const { title, content, category } = req.body;
    if (!title || !content) return res.status(400).json({ error: "标题和内容必填" });

    const post = await Post.create({
      title, content, category: category || "discuss",
      author: req.user._id, authorName: req.user.nickname || req.user.username,
    });
    res.status(201).json({ post });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 点赞帖子
router.post("/posts/:id/like", requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "帖子不存在" });

    const userId = req.user._id.toString();
    const liked = post.likedBy.some((id) => id.toString() === userId);

    if (liked) {
      post.likedBy = post.likedBy.filter((id) => id.toString() !== userId);
      post.likes--;
    } else {
      post.likedBy.push(req.user._id);
      post.likes++;
    }
    await post.save();
    res.json({ likes: post.likes, liked: !liked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 评论
router.post("/posts/:id/comments", requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "评论内容必填" });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "帖子不存在" });

    post.comments.push({
      author: req.user._id,
      authorName: req.user.nickname || req.user.username,
      content,
    });
    await post.save();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
