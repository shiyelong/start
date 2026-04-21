import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 测试文件匹配模式
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    // 超时时间（毫秒）
    testTimeout: 30_000,
    // 启用全局 API（describe, it, expect 等）
    globals: true,
  },
});
