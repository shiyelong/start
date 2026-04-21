const mongoose = require("mongoose");

const aiUsageSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  provider: { type: String, required: true },
  model: { type: String, required: true },
  tokensUsed: { type: Number, default: 0 },
}, { timestamps: true });

aiUsageSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("AiUsage", aiUsageSchema);
