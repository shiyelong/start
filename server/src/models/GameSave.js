const mongoose = require("mongoose");

const gameSaveSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  gameId: { type: String, required: true },
  saveData: { type: mongoose.Schema.Types.Mixed, default: {} },
  slot: { type: Number, default: 0, min: 0, max: 2 },
}, { timestamps: true });

// 唯一约束：每个用户每个游戏每个存档槽只有一条记录
gameSaveSchema.index({ user: 1, gameId: 1, slot: 1 }, { unique: true });

module.exports = mongoose.model("GameSave", gameSaveSchema);
