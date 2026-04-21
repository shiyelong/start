// classifier.property.test.ts — 内容分类与分级继承属性测试
// Property 11: 内容分类与分级继承 — 文件归入正确类别并继承频道分级
//
// **Validates: Requirements 27.1, 27.2**

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { classifyContent, MPAA_HIERARCHY } from './tagger.js';

// ── 生成器 ────────────────────────────────────────────

// 合法的 MPAA 分级
const arbRating = fc.constantFrom(...MPAA_HIERARCHY);

// 视频扩展名
const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.ts', '.m4v'];
const arbVideoExt = fc.constantFrom(...VIDEO_EXTS);

// 漫画扩展名
const COMIC_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.cbz', '.cbr'];
const arbComicExt = fc.constantFrom(...COMIC_EXTS);

// 小说扩展名
const NOVEL_EXTS = ['.txt', '.epub', '.mobi', '.pdf'];
const arbNovelExt = fc.constantFrom(...NOVEL_EXTS);

// 音频扩展名
const AUDIO_EXTS = ['.mp3', '.flac', '.aac', '.ogg', '.wav', '.m4a', '.opus', '.wma'];
const arbAudioExt = fc.constantFrom(...AUDIO_EXTS);

// 生成随机文件名
const arbFileName = fc.stringMatching(/^[a-z0-9_-]{1,20}$/);

// 路径关键词 → 类别映射
const PATH_CATEGORIES: Array<{ keyword: string; category: string }> = [
  { keyword: 'videos', category: 'video' },
  { keyword: 'movies', category: 'video' },
  { keyword: 'tv', category: 'video' },
  { keyword: 'comics', category: 'comic' },
  { keyword: 'manga', category: 'comic' },
  { keyword: 'novels', category: 'novel' },
  { keyword: 'books', category: 'novel' },
  { keyword: 'music', category: 'audio' },
  { keyword: 'audio', category: 'audio' },
  { keyword: 'asmr', category: 'audio' },
];

// ── Property 11: 内容分类与分级继承 ──────────────────

describe('Property 11: 内容分类与分级继承', () => {
  // 属性 11.1: 视频扩展名的文件归类为 video
  it('视频扩展名的文件归类为 video', () => {
    fc.assert(
      fc.property(arbFileName, arbVideoExt, arbRating, (name, ext, rating) => {
        const filePath = `/incoming/${name}${ext}`;
        const result = classifyContent(filePath, rating);
        expect(result.category).toBe('video');
        expect(result.rating).toBe(rating);
      }),
      { numRuns: 200 },
    );
  });

  // 属性 11.2: 漫画扩展名的文件归类为 comic
  it('漫画扩展名的文件归类为 comic', () => {
    fc.assert(
      fc.property(arbFileName, arbComicExt, arbRating, (name, ext, rating) => {
        const filePath = `/incoming/${name}${ext}`;
        const result = classifyContent(filePath, rating);
        expect(result.category).toBe('comic');
        expect(result.rating).toBe(rating);
      }),
      { numRuns: 200 },
    );
  });

  // 属性 11.3: 小说扩展名的文件归类为 novel
  it('小说扩展名的文件归类为 novel', () => {
    fc.assert(
      fc.property(arbFileName, arbNovelExt, arbRating, (name, ext, rating) => {
        const filePath = `/incoming/${name}${ext}`;
        const result = classifyContent(filePath, rating);
        expect(result.category).toBe('novel');
        expect(result.rating).toBe(rating);
      }),
      { numRuns: 200 },
    );
  });

  // 属性 11.4: 音频扩展名的文件归类为 audio
  it('音频扩展名的文件归类为 audio', () => {
    fc.assert(
      fc.property(arbFileName, arbAudioExt, arbRating, (name, ext, rating) => {
        const filePath = `/incoming/${name}${ext}`;
        const result = classifyContent(filePath, rating);
        expect(result.category).toBe('audio');
        expect(result.rating).toBe(rating);
      }),
      { numRuns: 200 },
    );
  });

  // 属性 11.5: 分级始终继承频道的 MPAA 分级
  it('分级始终继承频道的 MPAA 分级', () => {
    const allExts = [...VIDEO_EXTS, ...COMIC_EXTS, ...NOVEL_EXTS, ...AUDIO_EXTS];
    const arbExt = fc.constantFrom(...allExts);

    fc.assert(
      fc.property(arbFileName, arbExt, arbRating, (name, ext, rating) => {
        const filePath = `/incoming/${name}${ext}`;
        const result = classifyContent(filePath, rating);
        // 分级必须等于频道分级
        expect(result.rating).toBe(rating);
      }),
      { numRuns: 200 },
    );
  });

  // 属性 11.6: 路径关键词优先于扩展名分类
  it('路径关键词优先于扩展名分类', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PATH_CATEGORIES),
        arbFileName,
        // 使用与路径类别不同的扩展名来验证路径优先
        fc.constantFrom('.mp4', '.jpg', '.txt', '.mp3'),
        arbRating,
        (pathCat, name, ext, rating) => {
          const filePath = `/mnt/storage/media/${pathCat.keyword}/${name}${ext}`;
          const result = classifyContent(filePath, rating);
          // 路径关键词决定类别
          expect(result.category).toBe(pathCat.category);
          expect(result.rating).toBe(rating);
        },
      ),
      { numRuns: 200 },
    );
  });

  // 属性 11.7: 分类结果的 category 始终是合法值
  it('分类结果的 category 始终是合法值', () => {
    const VALID_CATEGORIES = ['video', 'comic', 'novel', 'audio'];
    const allExts = [...VIDEO_EXTS, ...COMIC_EXTS, ...NOVEL_EXTS, ...AUDIO_EXTS];
    const arbExt = fc.constantFrom(...allExts);

    fc.assert(
      fc.property(arbFileName, arbExt, arbRating, (name, ext, rating) => {
        const filePath = `/incoming/${name}${ext}`;
        const result = classifyContent(filePath, rating);
        expect(VALID_CATEGORIES).toContain(result.category);
      }),
      { numRuns: 200 },
    );
  });

  // 属性 11.8: 分类结果的 rating 始终是合法的 MPAA 分级
  it('分类结果的 rating 始终是合法的 MPAA 分级', () => {
    const allExts = [...VIDEO_EXTS, ...COMIC_EXTS, ...NOVEL_EXTS, ...AUDIO_EXTS];
    const arbExt = fc.constantFrom(...allExts);

    fc.assert(
      fc.property(arbFileName, arbExt, arbRating, (name, ext, rating) => {
        const filePath = `/incoming/${name}${ext}`;
        const result = classifyContent(filePath, rating);
        expect(MPAA_HIERARCHY).toContain(result.rating);
      }),
      { numRuns: 200 },
    );
  });
});
