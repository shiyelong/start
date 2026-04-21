const express = require("express");
const GameScore = require("../models/GameScore");
const GameSave = require("../models/GameSave");
const GameAchievement = require("../models/GameAchievement");
const { requireAuth } = require("../middleware/auth");
const { cacheGet, cacheSet, cacheDel } = require("../lib/redis");

const router = express.Router();

// 合法游戏 ID 列表
const VALID_GAME_IDS = new Set([
  "2048", "snake", "memory", "tetris", "quiz", "reaction",
  "whackamole", "colormatch", "plusminus", "farm", "catchpet",
  "runner", "tower", "petbattle", "dungeon", "spaceshoot",
  "match3", "fishing", "typing", "stacktower", "sudoku",
  "minesweeper", "huarong", "sokoban", "nonogram", "lights",
  "logic", "laser", "hexchain", "quantum", "civilization",
  "survival", "tycoon",
]);

const MAX_SLOT = 2;

// ============================================================
// 分数 (Scores)
// ============================================================

// POST /api/games/scores — 提交分数
router.post("/scores", requireAuth, async (req, res) => {
  try {
    const { game_id, score } = req.body;
    if (!game_id) return res.status(400).json({ error: "game_id 必填" });
    if (!VALID_GAME_IDS.has(game_id)) return res.status(400).json({ error: `无效的 game_id: ${game_id}` });
    if (typeof score !== "number" || !Number.isFinite(score)) return res.status(400).json({ error: "分数无效" });

    const record = await GameScore.create({
      user: req.user._id,
      gameId: game_id,
      score: Math.floor(score),
    });

    // 清除排行榜缓存
    await cacheDel(`leaderboard:${game_id}:all`);
    await cacheDel(`leaderboard:${game_id}:daily`);
    await cacheDel(`leaderboard:${game_id}:weekly`);

    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/games/scores/:gameId — 排行榜
router.get("/scores/:gameId", async (req, res) => {
  try {
    const { gameId } = req.params;
    if (!VALID_GAME_IDS.has(gameId)) return res.status(400).json({ error: `无效的 game_id: ${gameId}` });

    const { period = "all", page = 1, pageSize = 20 } = req.query;
    const p = Math.max(1, Number(page));
    const ps = Math.max(1, Math.min(100, Number(pageSize)));

    // 尝试从缓存读取
    const cacheKey = `leaderboard:${gameId}:${period}:${p}:${ps}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const filter = { gameId };

    // 时间过滤
    if (period === "daily") {
      filter.playedAt = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
    } else if (period === "weekly") {
      filter.playedAt = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    }

    const [items, total] = await Promise.all([
      GameScore.find(filter)
        .sort({ score: -1 })
        .skip((p - 1) * ps)
        .limit(ps)
        .populate("user", "username nickname avatar"),
      GameScore.countDocuments(filter),
    ]);

    const result = { items, total, page: p, pageSize: ps, totalPages: Math.ceil(total / ps) };

    // 缓存 60 秒
    await cacheSet(cacheKey, result, 60);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 存档 (Saves)
// ============================================================

// POST /api/games/saves — 保存游戏状态
router.post("/saves", requireAuth, async (req, res) => {
  try {
    const { game_id, save_data, slot = 0 } = req.body;
    if (!game_id) return res.status(400).json({ error: "game_id 必填" });
    if (!VALID_GAME_IDS.has(game_id)) return res.status(400).json({ error: `无效的 game_id: ${game_id}` });
    if (save_data === undefined || save_data === null) return res.status(400).json({ error: "save_data 必填" });
    if (slot < 0 || slot > MAX_SLOT) return res.status(400).json({ error: `存档槽必须是 0-${MAX_SLOT}` });

    // UPSERT：存在则更新，不存在则创建
    const save = await GameSave.findOneAndUpdate(
      { user: req.user._id, gameId: game_id, slot: Math.floor(slot) },
      { saveData: save_data },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(201).json(save);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/games/saves — 读取存档
router.get("/saves", requireAuth, async (req, res) => {
  try {
    const { game_id, slot } = req.query;
    if (!game_id) return res.status(400).json({ error: "game_id 必填" });
    if (!VALID_GAME_IDS.has(game_id)) return res.status(400).json({ error: `无效的 game_id: ${game_id}` });

    // 指定存档槽
    if (slot !== undefined) {
      const s = Number(slot);
      if (isNaN(s) || s < 0 || s > MAX_SLOT) return res.status(400).json({ error: `存档槽必须是 0-${MAX_SLOT}` });

      const save = await GameSave.findOne({ user: req.user._id, gameId: game_id, slot: s });
      return res.json(save);
    }

    // 返回该游戏所有存档
    const saves = await GameSave.find({ user: req.user._id, gameId: game_id }).sort({ slot: 1 });
    res.json(saves);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 成就 (Achievements)
// ============================================================

// POST /api/games/achievements — 解锁成就
router.post("/achievements", requireAuth, async (req, res) => {
  try {
    const { game_id, achievement_id } = req.body;
    if (!game_id) return res.status(400).json({ error: "game_id 必填" });
    if (!achievement_id) return res.status(400).json({ error: "achievement_id 必填" });
    if (!VALID_GAME_IDS.has(game_id)) return res.status(400).json({ error: `无效的 game_id: ${game_id}` });

    // 幂等：已解锁则直接返回
    const existing = await GameAchievement.findOne({
      user: req.user._id, gameId: game_id, achievementId: achievement_id,
    });
    if (existing) return res.json(existing);

    const achievement = await GameAchievement.create({
      user: req.user._id,
      gameId: game_id,
      achievementId: achievement_id,
    });

    res.status(201).json(achievement);
  } catch (err) {
    // 处理唯一约束冲突（并发情况）
    if (err.code === 11000) {
      const existing = await GameAchievement.findOne({
        user: req.user._id, gameId: req.body.game_id, achievementId: req.body.achievement_id,
      });
      return res.json(existing);
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/games/achievements — 查询成就
router.get("/achievements", requireAuth, async (req, res) => {
  try {
    const { game_id } = req.query;

    // 指定游戏
    if (game_id) {
      if (!VALID_GAME_IDS.has(game_id)) return res.status(400).json({ error: `无效的 game_id: ${game_id}` });
      const achievements = await GameAchievement.find({ user: req.user._id, gameId: game_id })
        .sort({ unlockedAt: -1 });
      return res.json(achievements);
    }

    // 所有成就，按游戏分组
    const all = await GameAchievement.find({ user: req.user._id }).sort({ gameId: 1, unlockedAt: -1 });
    const grouped = {};
    for (const a of all) {
      if (!grouped[a.gameId]) grouped[a.gameId] = [];
      grouped[a.gameId].push(a);
    }
    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
