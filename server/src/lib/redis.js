/**
 * Redis 缓存工具
 * 用于排行榜、频率限制、会话缓存等
 */
const { createClient } = require("redis");

let client = null;
let isConnected = false;

const getClient = async () => {
  if (client && isConnected) return client;

  client = createClient({
    url: process.env.REDIS_URL || "redis://192.168.6.226:6379",
  });

  client.on("error", (err) => {
    console.error("Redis 连接错误:", err.message);
    isConnected = false;
  });

  client.on("connect", () => {
    isConnected = true;
  });

  if (!client.isOpen) {
    await client.connect();
  }

  return client;
};

// 缓存读取（带默认 TTL）
const cacheGet = async (key) => {
  try {
    const redis = await getClient();
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

// 缓存写入
const cacheSet = async (key, value, ttlSeconds = 300) => {
  try {
    const redis = await getClient();
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch {}
};

// 缓存删除
const cacheDel = async (key) => {
  try {
    const redis = await getClient();
    await redis.del(key);
  } catch {}
};

// 频率限制检查
const rateLimit = async (key, maxCount, windowSeconds) => {
  try {
    const redis = await getClient();
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
    return current <= maxCount;
  } catch {
    // Redis 不可用时放行
    return true;
  }
};

module.exports = { getClient, cacheGet, cacheSet, cacheDel, rateLimit };
