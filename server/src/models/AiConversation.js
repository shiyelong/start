const mongoose = require("mongoose");

const aiMessageSchema = new mongoose.Schema({
  role: { type: String, required: true, enum: ["user", "assistant", "system"] },
  content: { type: String, required: true },
}, { timestamps: true });

const aiConversationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, default: "" },
  model: { type: String, default: "deepseek/deepseek-chat" },
  messages: [aiMessageSchema],
}, { timestamps: true });

aiConversationSchema.index({ user: 1, updatedAt: -1 });

module.exports = mongoose.model("AiConversation", aiConversationSchema);
