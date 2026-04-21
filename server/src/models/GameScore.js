const mongoose = require("mongoose");

const gameScoreSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  gameId: { type: String, required: true, index: true },
  score: { type: Number, required: true },
  playedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// 复合索引：排行榜查询
gameScoreSchema.index({ gameId: 1, score: -1 });
gameScoreSchema.index({ user: 1, gameId: 1 });

module.exports = mongoose.model("GameScore", gameScoreSchema);
