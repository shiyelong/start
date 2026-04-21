// tagger.ts — AI 自动标签与分级引擎
// 提取内容特征，调用 ollama LLM 生成结构化标签，判定 MPAA 分级
// 置信度 < 50% 标记"待人工审核"
//
// 需求: 59.1-59.7, 60.1, 60.5, 61.1, 61.5, 62.1, 62.5, 64.1, 64.5-64.7

import { extname } from 'node:path';

// ── 接口定义 ──────────────────────────────────────────

/** AI 标签结果 */
export interface TagResult {
  tags: string[];
  genre: string[];
  rating: string;
  confidence: number;
  reviewNeeded: boolean;
}

// ── MPAA 分级体系 ────────────────────────────────────

/** MPAA 分级层级（索引越大越严格） */
export const MPAA_HIERARCHY: readonly string[] = [
  'G', 'PG', 'PG-13', 'R', 'NC-17',
] as const;

/** 分级 → 层级索引映射 */
const MPAA_INDEX: Record<string, number> = {};
for (let i = 0; i < MPAA_HIERARCHY.length; i++) {
  MPAA_INDEX[MPAA_HIERARCHY[i]] = i;
}

// ── 内容分类映射 ──────────────────────────────────────

/** 文件扩展名 → 内容类别映射 */
const EXT_CATEGORY_MAP: Record<string, string> = {
  // 视频
  '.mp4': 'video', '.mkv': 'video', '.avi': 'video',
  '.mov': 'video', '.wmv': 'video', '.flv': 'video',
  '.webm': 'video', '.ts': 'video', '.m4v': 'video',
  // 漫画/图片
  '.jpg': 'comic', '.jpeg': 'comic', '.png': 'comic',
  '.gif': 'comic', '.webp': 'comic', '.bmp': 'comic',
  '.cbz': 'comic', '.cbr': 'comic',
  // 小说/文档
  '.txt': 'novel', '.epub': 'novel', '.mobi': 'novel',
  '.pdf': 'novel',
  // 音频
  '.mp3': 'audio', '.flac': 'audio', '.aac': 'audio',
  '.ogg': 'audio', '.wav': 'audio', '.m4a': 'audio',
  '.opus': 'audio', '.wma': 'audio',
};

/** 路径关键词 → 内容类别映射 */
const PATH_CATEGORY_MAP: Record<string, string> = {
  videos: 'video', movies: 'video', tv: 'video',
  comics: 'comic', manga: 'comic',
  novels: 'novel', books: 'novel',
  music: 'audio', audio: 'audio', asmr: 'audio',
};

// ── 纯函数：MPAA 分级取严格值 ────────────────────────

/**
 * 取两个 MPAA 分级中更严格的一个
 * 分级层级：G < PG < PG-13 < R < NC-17
 * 该函数满足交换律和幂等性
 *
 * @param aiRating AI 判定的分级
 * @param sourceRating 来源预设的分级
 * @returns 更严格的分级
 */
export function determineRating(aiRating: string, sourceRating: string): string {
  const aiIndex = MPAA_INDEX[aiRating] ?? 0;
  const sourceIndex = MPAA_INDEX[sourceRating] ?? 0;
  const stricterIndex = Math.max(aiIndex, sourceIndex);
  return MPAA_HIERARCHY[stricterIndex];
}

// ── 纯函数：内容分类 ─────────────────────────────────

/**
 * 根据文件路径和扩展名分类内容，并继承频道的 MPAA 分级
 * 分类优先级：路径关键词 > 文件扩展名 > 默认(video)
 *
 * @param filePath 文件路径
 * @param channelRating 频道预设的 MPAA 分级
 * @returns 分类结果（类别 + 继承的分级）
 */
export function classifyContent(
  filePath: string,
  channelRating: string,
): { category: string; rating: string } {
  const lower = filePath.toLowerCase();

  // 优先按路径关键词分类
  for (const [keyword, category] of Object.entries(PATH_CATEGORY_MAP)) {
    if (lower.includes(`/${keyword}/`) || lower.includes(`\\${keyword}\\`)) {
      return { category, rating: channelRating };
    }
  }

  // 按文件扩展名分类
  const ext = extname(lower);
  if (ext && EXT_CATEGORY_MAP[ext]) {
    return { category: EXT_CATEGORY_MAP[ext], rating: channelRating };
  }

  // 默认归类为视频
  return { category: 'video', rating: channelRating };
}

// ── AI 标签引擎 ──────────────────────────────────────

/**
 * AI 内容标签与分级引擎
 * 提取内容特征，调用 ollama LLM 生成标签，判定 MPAA 分级
 */
export class ContentTagger {
  private ollamaUrl: string;
  private model: string;

  constructor(ollamaUrl?: string, model?: string) {
    this.ollamaUrl = ollamaUrl ?? (process.env.OLLAMA_URL || 'http://127.0.0.1:11434');
    this.model = model ?? (process.env.TAGGER_MODEL || 'qwen2.5:72b-instruct-q4_K_M');
  }

  // ── 主入口 ──────────────────────────────────────────

  /**
   * 对指定内容执行 AI 标签和分级
   *
   * @param taskId 任务 ID
   * @param filePath 文件路径
   * @param contentType 内容类型 (video/comic/novel/audio)
   * @param sourceRating 来源预设分级（可选，默认 PG）
   * @returns 标签结果
   */
  async tagContent(
    taskId: string,
    filePath: string,
    contentType: string,
    sourceRating: string = 'PG',
  ): Promise<TagResult> {
    console.log(`[标签] 开始标签任务 ${taskId}: ${filePath} (${contentType})`);

    // 1. 提取特征
    const features = await this.extractFeatures(filePath, contentType);

    // 2. 构建 prompt 并调用 LLM
    const prompt = this.buildPrompt(features, contentType);
    const llmResponse = await this.callLlm(prompt);

    // 3. 解析 LLM 输出
    const result = this.parseTags(llmResponse);

    // 4. 取 AI 判定和来源预设中更严格的分级
    result.rating = determineRating(result.rating, sourceRating);

    // 5. 置信度 < 50% 标记待审核
    if (result.confidence < 50) {
      result.reviewNeeded = true;
    }

    console.log(
      `[标签] 任务 ${taskId} 完成: 标签=${result.tags.length}个, ` +
      `分级=${result.rating}, 置信度=${result.confidence}%, ` +
      `审核=${result.reviewNeeded ? '需要' : '不需要'}`,
    );

    return result;
  }

  // ── 特征提取 ────────────────────────────────────────

  /**
   * 根据内容类型提取特征用于 LLM 分析
   * - 视频：截图描述（模拟）
   * - 漫画：封面描述（模拟）
   * - 小说：前 3000 字
   * - 音频：ID3 标签信息
   */
  async extractFeatures(filePath: string, contentType: string): Promise<string> {
    switch (contentType) {
      case 'video':
        return this.extractVideoFeatures(filePath);
      case 'comic':
        return this.extractComicFeatures(filePath);
      case 'novel':
        return this.extractNovelFeatures(filePath);
      case 'audio':
        return this.extractAudioFeatures(filePath);
      default:
        return `文件路径: ${filePath}`;
    }
  }

  /**
   * 提取视频特征
   * 实际部署时调用 ffmpeg 截取关键帧并描述
   */
  private async extractVideoFeatures(filePath: string): Promise<string> {
    // 实际实现：ffmpeg 截取 5 帧关键帧，调用视觉模型描述
    // 此处返回文件路径信息作为特征
    return `视频文件: ${filePath}\n类型: 视频\n请根据文件名和路径推断内容标签和分级。`;
  }

  /**
   * 提取漫画特征
   * 实际部署时提取封面图并描述
   */
  private async extractComicFeatures(filePath: string): Promise<string> {
    return `漫画文件: ${filePath}\n类型: 漫画\n请根据文件名和路径推断内容标签和分级。`;
  }

  /**
   * 提取小说特征
   * 读取前 3000 字作为特征
   */
  private async extractNovelFeatures(filePath: string): Promise<string> {
    try {
      const { readFileSync } = await import('node:fs');
      const content = readFileSync(filePath, 'utf-8');
      const preview = content.slice(0, 3000);
      return `小说文件: ${filePath}\n类型: 小说\n前3000字:\n${preview}`;
    } catch {
      return `小说文件: ${filePath}\n类型: 小说\n无法读取内容，请根据文件名推断。`;
    }
  }

  /**
   * 提取音频特征
   * 实际部署时读取 ID3 标签
   */
  private async extractAudioFeatures(filePath: string): Promise<string> {
    return `音频文件: ${filePath}\n类型: 音频\n请根据文件名和路径推断内容标签和分级。`;
  }

  // ── LLM 调用 ───────────────────────────────────────

  /**
   * 构建标签生成 prompt
   */
  private buildPrompt(features: string, contentType: string): string {
    return `你是一个内容标签和分级分析助手。请分析以下${contentType}内容的特征，输出 JSON 格式的标签结果。

内容特征:
${features}

请输出以下 JSON 格式（不要输出其他内容）:
{
  "tags": ["标签1", "标签2", ...],
  "genre": ["类型1", "类型2", ...],
  "rating": "G|PG|PG-13|R|NC-17",
  "confidence": 0-100
}

分级标准:
- G: 适合所有年龄
- PG: 建议家长指导
- PG-13: 13岁以上
- R: 17岁以下需家长陪同
- NC-17: 仅限成人`;
  }

  /**
   * 调用 ollama API 生成标签
   */
  async callLlm(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 512,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`ollama API 请求失败: ${response.status}`);
      }

      const data = await response.json() as { response: string };
      return data.response;
    } catch (err) {
      console.error(`[标签] LLM 调用失败: ${(err as Error).message}`);
      // 返回默认结果
      return JSON.stringify({
        tags: [],
        genre: [],
        rating: 'PG',
        confidence: 0,
      });
    }
  }

  // ── 结果解析 ────────────────────────────────────────

  /**
   * 解析 LLM 输出的 JSON 标签结果
   * 容错处理：解析失败时返回默认值
   */
  parseTags(llmResponse: string): TagResult {
    try {
      // 尝试从响应中提取 JSON
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.defaultTagResult();
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        tags?: string[];
        genre?: string[];
        rating?: string;
        confidence?: number;
      };

      // 验证并规范化分级
      let rating = parsed.rating ?? 'PG';
      if (!MPAA_HIERARCHY.includes(rating)) {
        rating = 'PG';
      }

      // 验证置信度范围
      let confidence = parsed.confidence ?? 0;
      if (confidence < 0) confidence = 0;
      if (confidence > 100) confidence = 100;

      return {
        tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === 'string') : [],
        genre: Array.isArray(parsed.genre) ? parsed.genre.filter((g) => typeof g === 'string') : [],
        rating,
        confidence,
        reviewNeeded: confidence < 50,
      };
    } catch {
      return this.defaultTagResult();
    }
  }

  /**
   * 默认标签结果（解析失败时使用）
   */
  private defaultTagResult(): TagResult {
    return {
      tags: [],
      genre: [],
      rating: 'PG',
      confidence: 0,
      reviewNeeded: true,
    };
  }
}
