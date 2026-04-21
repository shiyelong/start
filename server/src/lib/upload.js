/**
 * 文件上传工具（multer 配置）
 * 替代 Cloudflare R2，使用本地 NAS 存储
 */
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";

// 生成唯一文件名
const generateFilename = (originalname) => {
  const ext = path.extname(originalname);
  const hash = crypto.randomBytes(16).toString("hex");
  return `${Date.now()}-${hash}${ext}`;
};

// 通用存储配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, generateFilename(file.originalname));
  },
});

// 文件过滤器
const imageFilter = (req, file, cb) => {
  const allowed = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
  if (allowed.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error("只允许上传图片文件"), false);
  }
};

// 上传实例
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: imageFilter,
});

// 通用上传（不限文件类型，50MB）
const uploadAny = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

module.exports = { upload, uploadAny, UPLOAD_DIR };
