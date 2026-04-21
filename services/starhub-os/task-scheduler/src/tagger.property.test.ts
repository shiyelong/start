// tagger.property.test.ts — MPAA 分级取严格值属性测试
// Property 17: MPAA 分级取严格值 — 两个分级合并取更严格的
// 该函数满足交换律和幂等性
//
// **Validates: Requirements 64.5**

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { determineRating, MPAA_HIERARCHY } from './tagger.js';

// ── 生成器 ────────────────────────────────────────────

// 生成合法的 MPAA 分级
const arbRating = fc.constantFrom(...MPAA_HIERARCHY);

// 分级 → 严格度索引映射
const RATING_INDEX: Record<string, number> = {};
for (let i = 0; i < MPAA_HIERARCHY.length; i++) {
  RATING_INDEX[MPAA_HIERARCHY[i]] = i;
}

// ── Property 17: MPAA 分级取严格值 ───────────────────

describe('Property 17: MPAA 分级取严格值', () => {
  // 属性 17.1: 结果始终是两个输入中更严格的那个
  it('结果始终是两个输入中更严格（索引更大）的分级', () => {
    fc.assert(
      fc.property(arbRating, arbRating, (a, b) => {
        const result = determineRating(a, b);
        const aIndex = RATING_INDEX[a];
        const bIndex = RATING_INDEX[b];
        const resultIndex = RATING_INDEX[result];

        // 结果的严格度 >= 两个输入中的任一个
        expect(resultIndex).toBeGreaterThanOrEqual(aIndex);
        expect(resultIndex).toBeGreaterThanOrEqual(bIndex);

        // 结果等于两个输入中更严格的那个
        expect(resultIndex).toBe(Math.max(aIndex, bIndex));
      }),
      { numRuns: 200 },
    );
  });

  // 属性 17.2: 交换律 — determineRating(a, b) === determineRating(b, a)
  it('满足交换律', () => {
    fc.assert(
      fc.property(arbRating, arbRating, (a, b) => {
        expect(determineRating(a, b)).toBe(determineRating(b, a));
      }),
      { numRuns: 200 },
    );
  });

  // 属性 17.3: 幂等性 — determineRating(a, a) === a
  it('满足幂等性', () => {
    fc.assert(
      fc.property(arbRating, (a) => {
        expect(determineRating(a, a)).toBe(a);
      }),
      { numRuns: 200 },
    );
  });

  // 属性 17.4: 结合律 — determineRating(determineRating(a, b), c) === determineRating(a, determineRating(b, c))
  it('满足结合律', () => {
    fc.assert(
      fc.property(arbRating, arbRating, arbRating, (a, b, c) => {
        const left = determineRating(determineRating(a, b), c);
        const right = determineRating(a, determineRating(b, c));
        expect(left).toBe(right);
      }),
      { numRuns: 200 },
    );
  });

  // 属性 17.5: 结果始终是合法的 MPAA 分级
  it('结果始终是合法的 MPAA 分级', () => {
    fc.assert(
      fc.property(arbRating, arbRating, (a, b) => {
        const result = determineRating(a, b);
        expect(MPAA_HIERARCHY).toContain(result);
      }),
      { numRuns: 200 },
    );
  });

  // 属性 17.6: NC-17 是吸收元 — 与任何分级合并都返回 NC-17
  it('NC-17 是吸收元', () => {
    fc.assert(
      fc.property(arbRating, (a) => {
        expect(determineRating(a, 'NC-17')).toBe('NC-17');
        expect(determineRating('NC-17', a)).toBe('NC-17');
      }),
      { numRuns: 200 },
    );
  });

  // 属性 17.7: G 是单位元 — 与任何分级合并都返回另一个分级
  it('G 是单位元', () => {
    fc.assert(
      fc.property(arbRating, (a) => {
        expect(determineRating(a, 'G')).toBe(a);
        expect(determineRating('G', a)).toBe(a);
      }),
      { numRuns: 200 },
    );
  });

  // 属性 17.8: 严格度单调性 — 如果 a <= b，则 determineRating(a, c) <= determineRating(b, c)
  it('严格度单调性', () => {
    fc.assert(
      fc.property(arbRating, arbRating, arbRating, (a, b, c) => {
        const aIndex = RATING_INDEX[a];
        const bIndex = RATING_INDEX[b];

        if (aIndex <= bIndex) {
          const resultA = RATING_INDEX[determineRating(a, c)];
          const resultB = RATING_INDEX[determineRating(b, c)];
          expect(resultA).toBeLessThanOrEqual(resultB);
        }
      }),
      { numRuns: 200 },
    );
  });
});
