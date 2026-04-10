const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 20 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  nickname: { type: String, default: "" },
  avatar: { type: String, default: "" },
  bio: { type: String, default: "", maxlength: 200 },
  role: { type: String, enum: ["user", "verifier", "admin"], default: "user" },
  // 统计
  verifyCount: { type: Number, default: 0 },   // 参与验证次数
  reputation: { type: Number, default: 0 },     // 信誉分
  likeCount: { type: Number, default: 0 },      // 被点赞次数
}, { timestamps: true });

// 密码加密
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// 验证密码
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// 返回安全的用户信息（不含密码）
userSchema.methods.toSafeJSON = function () {
  const { password, ...user } = this.toObject();
  return user;
};

module.exports = mongoose.model("User", userSchema);
