const mongoose = require("mongoose");

// 验证记录
const verifyRecordSchema = new mongoose.Schema({
  verifier: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  verifierName: { type: String, required: true },
  field: { type: String, required: true },       // 修改的字段名
  oldValue: { type: String, required: true },     // 原始值
  newValue: { type: String, required: true },     // 验证后的值
  reason: { type: String, required: true },       // 修改原因
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  dislikedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true });

// 主验证条目
const verifyItemSchema = new mongoose.Schema({
  // 基础信息
  type: { type: String, required: true, enum: ["person", "company", "restaurant", "hotel", "shop", "school", "hospital"] },
  subType: { type: String, default: "all" },
  name: { type: String, required: true },
  status: { type: String, enum: ["unverified", "verified"], default: "unverified" },

  // 通用字段（自报信息）
  info: { type: mongoose.Schema.Types.Mixed, default: {} },

  // 标签
  tags: [{ label: String, color: String }],

  // 验证记录
  verifyRecords: [verifyRecordSchema],

  // 计算后的验证结果（根据投票规则自动计算）
  resolvedFields: { type: mongoose.Schema.Types.Mixed, default: {} },

  // 发布者
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  publishTime: { type: Date, default: Date.now },

  // 验证统计
  verifyCount: { type: Number, default: 0 },
}, { timestamps: true });

// 根据验证记录计算共识值
verifyItemSchema.methods.resolveFields = function () {
  const resolved = {};
  const fieldRecords = {};

  // 按字段分组
  this.verifyRecords.forEach((r) => {
    if (!fieldRecords[r.field]) fieldRecords[r.field] = [];
    fieldRecords[r.field].push(r);
  });

  // 对每个字段计算共识
  Object.entries(fieldRecords).forEach(([field, records]) => {
    if (records.length === 1) {
      resolved[field] = records[0].newValue;
      return;
    }

    // 统计每个值
    const valueCounts = {};
    records.forEach((r) => {
      if (!valueCounts[r.newValue]) valueCounts[r.newValue] = { count: 0, totalLikes: 0 };
      valueCounts[r.newValue].count++;
      valueCounts[r.newValue].totalLikes += r.likes;
    });

    // 排序：数量优先，同数量看点赞
    const sorted = Object.entries(valueCounts).sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count;
      return b[1].totalLikes - a[1].totalLikes;
    });

    resolved[field] = sorted[0][0];
  });

  this.resolvedFields = resolved;
  return resolved;
};

module.exports = mongoose.model("VerifyItem", verifyItemSchema);
