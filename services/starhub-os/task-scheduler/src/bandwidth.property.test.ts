// bandwidth.property.test.ts — 带宽调度属性测试
// Property 12: 带宽调度规则时段匹配 — 正确选择覆盖当前时刻的规则
// Property 13: 带宽超限暂停决策 — 超90%暂停，低于90%继续
//
// **Validates: Requirements 30.1, 30.3, 30.6**

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  BandwidthScheduler,
  DEFAULT_RULES,
  type BandwidthRule,
  type BandwidthUsage,
} from './bandwidth.js';

// ── 生成器 ────────────────────────────────────────────

// 生成合法小时 (0-23)
const arbHour = fc.integer({ min: 0, max: 23 });

// 生成合法的带宽规则（确保 startHour < endHour）
const arbRule: fc.Arbitrary<BandwidthRule> = fc.record({
  id: fc.stringMatching(/^rule-[a-z0-9]{1,6}$/),
  startHour: fc.integer({ min: 0, max: 23 }),
  endHour: fc.integer({ min: 1, max: 24 }),
  downloadLimit: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 100_000_000 })),
  uploadLimit: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 100_000_000 })),
  enabled: fc.boolean(),
}).filter((r) => r.startHour < r.endHour);

// 生成不重叠的规则列表（覆盖 0-24 的连续区间）
function arbNonOverlappingRules(): fc.Arbitrary<BandwidthRule[]> {
  // 生成 1-4 个分割点，将 0-24 分成若干区间
  return fc.array(fc.integer({ min: 1, max: 23 }), { minLength: 0, maxLength: 3 })
    .map((splits) => {
      const sorted = [...new Set(splits)].sort((a, b) => a - b);
      const boundaries = [0, ...sorted, 24];
      const rules: BandwidthRule[] = [];
      for (let i = 0; i < boundaries.length - 1; i++) {
        rules.push({
          id: `rule-${i}`,
          startHour: boundaries[i],
          endHour: boundaries[i + 1],
          downloadLimit: null,
          uploadLimit: null,
          enabled: true,
        });
      }
      return rules;
    });
}

// 生成每日使用量
const arbUsage = (dailyLimit: number): fc.Arbitrary<BandwidthUsage> =>
  fc.record({
    date: fc.constant('2025-01-01'),
    bytesDownloaded: fc.integer({ min: 0, max: dailyLimit * 2 }),
    bytesUploaded: fc.integer({ min: 0, max: dailyLimit }),
    dailyLimit: fc.constant(dailyLimit),
  });

// ── Property 12: 带宽调度规则时段匹配 ─────────────────

describe('Property 12: 带宽调度规则时段匹配', () => {
  // 属性 12.1: 默认规则覆盖所有 24 小时
  it('默认规则覆盖所有 24 小时，任意小时都能匹配到规则', () => {
    fc.assert(
      fc.property(arbHour, (hour) => {
        const scheduler = new BandwidthScheduler(DEFAULT_RULES);
        const rule = scheduler.getActiveRule(hour);
        expect(rule).not.toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  // 属性 12.2: 匹配的规则区间确实包含给定小时
  it('匹配的规则区间 [startHour, endHour) 包含给定小时', () => {
    fc.assert(
      fc.property(
        arbNonOverlappingRules(),
        arbHour,
        (rules, hour) => {
          const scheduler = new BandwidthScheduler(rules);
          const rule = scheduler.getActiveRule(hour);

          if (rule) {
            // 匹配的规则区间必须包含该小时
            expect(hour).toBeGreaterThanOrEqual(rule.startHour);
            expect(hour).toBeLessThan(rule.endHour);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // 属性 12.3: 不重叠的完整覆盖规则集，任意小时都能匹配
  it('不重叠的完整覆盖规则集，任意小时都能匹配到唯一规则', () => {
    fc.assert(
      fc.property(
        arbNonOverlappingRules(),
        arbHour,
        (rules, hour) => {
          const scheduler = new BandwidthScheduler(rules);
          const rule = scheduler.getActiveRule(hour);

          // 完整覆盖的规则集，每个小时都应匹配到规则
          expect(rule).not.toBeNull();

          // 验证唯一性：只有一个规则覆盖该小时
          const matchingRules = rules.filter(
            (r) => r.enabled && hour >= r.startHour && hour < r.endHour,
          );
          expect(matchingRules).toHaveLength(1);
        },
      ),
      { numRuns: 200 },
    );
  });

  // 属性 12.4: 禁用的规则不会被匹配
  it('禁用的规则不会被匹配', () => {
    fc.assert(
      fc.property(arbHour, (hour) => {
        // 所有规则都禁用
        const disabledRules: BandwidthRule[] = DEFAULT_RULES.map((r) => ({
          ...r,
          enabled: false,
        }));
        const scheduler = new BandwidthScheduler(disabledRules);
        const rule = scheduler.getActiveRule(hour);
        expect(rule).toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  // 属性 12.5: 默认规则夜间(0-5)匹配 night，白天(6-23)匹配 day
  it('默认规则夜间匹配 night，白天匹配 day', () => {
    fc.assert(
      fc.property(arbHour, (hour) => {
        const scheduler = new BandwidthScheduler(DEFAULT_RULES);
        const rule = scheduler.getActiveRule(hour);
        expect(rule).not.toBeNull();

        if (hour >= 0 && hour < 6) {
          expect(rule!.id).toBe('night');
        } else {
          expect(rule!.id).toBe('day');
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ── Property 13: 带宽超限暂停决策 ────────────────────

describe('Property 13: 带宽超限暂停决策', () => {
  const DAILY_LIMIT = 53_687_091_200; // 50GB

  // 属性 13.1: 使用量超过 90% 时 shouldPauseDownloads 返回 true
  it('使用量超过 90% 时暂停下载', () => {
    fc.assert(
      fc.property(
        // 生成超过 90% 的使用量
        fc.integer({ min: Math.ceil(DAILY_LIMIT * 0.9) + 1, max: DAILY_LIMIT * 2 }),
        (bytesDownloaded) => {
          const usage: BandwidthUsage = {
            date: '2025-01-01',
            bytesDownloaded,
            bytesUploaded: 0,
            dailyLimit: DAILY_LIMIT,
          };
          const scheduler = new BandwidthScheduler(DEFAULT_RULES, usage);

          expect(scheduler.shouldPauseDownloads()).toBe(true);

          const check = scheduler.checkDailyLimit();
          expect(check.exceeded).toBe(true);
          expect(check.usagePercent).toBeGreaterThan(90);
        },
      ),
      { numRuns: 200 },
    );
  });

  // 属性 13.2: 使用量低于 90% 时 shouldPauseDownloads 返回 false
  it('使用量低于等于 90% 时继续下载', () => {
    fc.assert(
      fc.property(
        // 生成不超过 90% 的使用量
        fc.integer({ min: 0, max: Math.floor(DAILY_LIMIT * 0.9) }),
        (bytesDownloaded) => {
          const usage: BandwidthUsage = {
            date: '2025-01-01',
            bytesDownloaded,
            bytesUploaded: 0,
            dailyLimit: DAILY_LIMIT,
          };
          const scheduler = new BandwidthScheduler(DEFAULT_RULES, usage);

          expect(scheduler.shouldPauseDownloads()).toBe(false);

          const check = scheduler.checkDailyLimit();
          expect(check.exceeded).toBe(false);
          expect(check.usagePercent).toBeLessThanOrEqual(90);
        },
      ),
      { numRuns: 200 },
    );
  });

  // 属性 13.3: checkDailyLimit 的 usagePercent 计算正确
  it('usagePercent 计算正确', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: DAILY_LIMIT * 2 }),
        (bytesDownloaded) => {
          const usage: BandwidthUsage = {
            date: '2025-01-01',
            bytesDownloaded,
            bytesUploaded: 0,
            dailyLimit: DAILY_LIMIT,
          };
          const scheduler = new BandwidthScheduler(DEFAULT_RULES, usage);
          const check = scheduler.checkDailyLimit();

          const expectedPercent = (bytesDownloaded / DAILY_LIMIT) * 100;
          expect(check.usagePercent).toBeCloseTo(expectedPercent, 5);
        },
      ),
      { numRuns: 200 },
    );
  });

  // 属性 13.4: exceeded 与 usagePercent > 90 一致
  it('exceeded 标志与 usagePercent > 90 严格一致', () => {
    fc.assert(
      fc.property(
        arbUsage(DAILY_LIMIT),
        (usage) => {
          const scheduler = new BandwidthScheduler(DEFAULT_RULES, usage);
          const check = scheduler.checkDailyLimit();

          if (check.usagePercent > 90) {
            expect(check.exceeded).toBe(true);
          } else {
            expect(check.exceeded).toBe(false);
          }

          // shouldPauseDownloads 与 exceeded 一致
          expect(scheduler.shouldPauseDownloads()).toBe(check.exceeded);
        },
      ),
      { numRuns: 200 },
    );
  });
});
