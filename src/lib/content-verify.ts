/**
 * 内容验证系统 — 小说/漫画通用
 *
 * 核心概念：
 * - 用户上传内容 → 状态为 "unverified"
 * - 其他用户验证 → 需要到对应地址1km内实拍 + 评论
 * - PC端出二维码 → 手机扫描后在APP内完成拍照验证
 * - 验证通过后 → 状态变为 "verified"，验证者留下评论
 */

export type ContentType = "novel" | "comic";
export type VerifyStatus = "unverified" | "pending" | "verified" | "rejected";

export interface ContentVerifyComment {
  id: number;
  userId: number;
  userName: string;
  avatar?: string;
  content: string;
  rating: number; // 1-5
  photos?: string[]; // 验证实拍照片
  isVerifier: boolean; // 是否是验证者的评论
  geoVerified: boolean; // 是否通过了地理位置验证
  createdAt: string;
  likes: number;
}

export interface GeoLocation {
  lat: number;
  lng: number;
  address: string;
  accuracy?: number;
}

export interface VerifyRecord {
  id: number;
  verifierId: number;
  verifierName: string;
  verifierAvatar?: string;
  status: "approved" | "rejected";
  comment: string;
  photos: string[]; // 实拍照片
  cameraPhotos?: string[]; // 平台摄像头拍摄
  location: GeoLocation;
  distance: number; // 距离目标地址的距离(米)
  createdAt: string;
}

export interface ContentItem {
  id: number;
  type: ContentType;
  title: string;
  author: string;
  cover?: string;
  description: string;
  tags: string[];
  uploaderId: number;
  uploaderName: string;
  verifyStatus: VerifyStatus;
  targetLocation?: GeoLocation; // 需要验证的目标地址
  verifyRecords: VerifyRecord[];
  comments: ContentVerifyComment[];
  verifyCount: number;
  rating: number;
  views: number;
  createdAt: string;
}

// 计算两个经纬度之间的距离（米）— Haversine公式
export function calcDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // 地球半径（米）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 检查是否在1km范围内
export function isWithinRange(
  userLat: number, userLng: number,
  targetLat: number, targetLng: number,
  maxDistance: number = 1000 // 默认1km
): boolean {
  return calcDistance(userLat, userLng, targetLat, targetLng) <= maxDistance;
}

// 生成验证二维码数据
export function generateVerifyQRData(contentId: number, contentType: ContentType): string {
  const payload = {
    action: "verify",
    type: contentType,
    id: contentId,
    ts: Date.now(),
    // 实际项目中这里会加签名
  };
  return `starhub://verify?data=${btoa(JSON.stringify(payload))}`;
}

// 解析验证二维码数据
export function parseVerifyQRData(qrData: string): {
  action: string;
  type: ContentType;
  id: number;
  ts: number;
} | null {
  try {
    const url = new URL(qrData);
    const data = url.searchParams.get("data");
    if (!data) return null;
    return JSON.parse(atob(data));
  } catch {
    return null;
  }
}

// 格式化距离
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

// 格式化数字
export function fmtNum(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + "亿";
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  return String(n);
}

// 检测是否为移动端
export function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 检测是否在APP内（Capacitor）
export function isInApp(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as unknown as { Capacitor?: unknown }).Capacitor;
}
