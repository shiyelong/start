const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema({
  channelId: { type: String, required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  username: { type: String, required: true },
  content: { type: String, required: true, maxlength: 2000 },
}, { timestamps: true });

chatMessageSchema.index({ channelId: 1, createdAt: 1 });

module.exports = mongoose.model("ChatMessage", chatMessageSchema);
