/**
 * 数据库初始化脚本
 * 运行: node src/seed.js
 * 会创建管理员账号和一些初始验证数据
 */
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const VerifyItem = require("./models/VerifyItem");

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ 数据库连接成功");

  // 创建管理员
  const adminExists = await User.findOne({ role: "admin" });
  if (!adminExists) {
    await User.create({
      username: "admin", email: "admin@starhub.cc", password: "admin123456",
      nickname: "管理员", role: "admin",
    });
    console.log("✅ 管理员账号已创建 (admin@starhub.cc / admin123456)");
  }

  // 创建一些初始验证数据
  const count = await VerifyItem.countDocuments();
  if (count === 0) {
    const items = [
      { type: "person", subType: "freelance", name: "林小雨", info: { gender: "女", age: 22, height: 168, weight: 48, location: "上海", skills: ["Web前端", "UI设计"], advantages: "3年前端经验" }, tags: [{ label: "前端工程师", color: "bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/30" }] },
      { type: "person", subType: "freelance", name: "张大力", info: { gender: "男", age: 28, height: 180, weight: 75, location: "北京", skills: ["Java后端", "微服务"], advantages: "5年Java开发" }, tags: [{ label: "后端大佬", color: "bg-[#3ea6ff]/15 text-[#3ea6ff] border-[#3ea6ff]/30" }] },
      { type: "person", subType: "contractor", name: "老赵", info: { gender: "男", age: 42, location: "重庆", skills: ["装修施工", "水电安装"], advantages: "带队20人" }, tags: [{ label: "包工头", color: "bg-[#f97316]/15 text-[#f97316] border-[#f97316]/30" }] },
      { type: "company", subType: "medium", name: "星辰科技有限公司", info: { industry: "互联网/软件", scale: "100-500人", location: "深圳南山", legalPerson: "李明", regCapital: "1000万" }, tags: [{ label: "高新企业", color: "bg-[#2ba640]/15 text-[#2ba640] border-[#2ba640]/30" }] },
      { type: "restaurant", subType: "hotpot", name: "老四川火锅", info: { cuisine: "川菜/火锅", location: "成都锦江区", priceRange: "人均80-120", hygiene: "A级" }, tags: [{ label: "网红店", color: "bg-[#ec4899]/15 text-[#ec4899] border-[#ec4899]/30" }] },
      { type: "hotel", subType: "5star", name: "璀璨国际大酒店", info: { starLevel: "五星级", location: "北京朝阳", priceRange: "800-2000/晚" }, tags: [{ label: "五星豪华", color: "bg-[#f0b90b]/15 text-[#f0b90b] border-[#f0b90b]/30" }] },
    ];
    await VerifyItem.insertMany(items);
    console.log(`✅ 已导入 ${items.length} 条初始验证数据`);
  }

  console.log("🎉 初始化完成！");
  process.exit(0);
}

seed().catch((err) => { console.error("❌ 初始化失败:", err); process.exit(1); });
