const mongoose = require("mongoose");

const liveMessageSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: "LiveRoom", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  username: { type: String, required: true },
  content: { type: String, required: true, maxlength: 500 },
}, { timestamps: true });

liveMessageSchema.index({ room: 1, createdAt: 1 });

module.exports = mongoose.model("LiveMessage", liveMessageSchema);
