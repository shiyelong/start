const mongoose = require("mongoose");

const liveRoomSchema = new mongoose.Schema({
  title: { type: String, required: true },
  streamer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  streamerName: { type: String, required: true },
  category: { type: String, default: "" },
  description: { type: String, default: "" },
  tags: [{ type: String }],
  status: { type: String, enum: ["live", "offline", "ended"], default: "live" },
  viewerCount: { type: Number, default: 0 },
}, { timestamps: true });

liveRoomSchema.index({ status: 1, viewerCount: -1 });
liveRoomSchema.index({ streamer: 1 });
liveRoomSchema.index({ category: 1 });

module.exports = mongoose.model("LiveRoom", liveRoomSchema);
