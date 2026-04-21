const mongoose = require("mongoose");

const gameAchievementSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  gameId: { type: String, required: true },
  achievementId: { type: String, required: true },
  unlockedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// 唯一约束：每个用户每个游戏每个成就只能解锁一次
gameAchievementSchema.index({ user: 1, gameId: 1, achievementId: 1 }, { unique: true });
gameAchievementSchema.index({ user: 1, gameId: 1 });

module.exports = mongoose.model("GameAchievement", gameAchievementSchema);
