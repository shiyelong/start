/**
 * GET /api/nas/stream/:type/:id — Stream NAS content via Cloudflare Tunnel
 *
 * Proxies media content from NAS through Cloudflare Tunnel.
 * Supports range requests for video/audio seeking.
 *
 * :type — content type: video, comic, novel, music
 * :id   — content ID from D1 (nas_videos, nas_comics, etc.)
 *
 * Flow: User → CF CDN → CF Workers → CF Tunnel → NAS → encrypted response
 *       → CF Workers (decrypt) → User
 *
 * NAS IP never exposed. Zero public ports.
 *
 * Validates: Project Constitution Ch.2, Requirements 52.1, 52.6
 */

import { jsonResponse, errorResponse, queryOne } from '../../../_lib/db';
import { APIError, handleError } from '../../../_lib/errors';
import { isRatingAllowed, type ContentRating } from '../../../_lib/rating';
import { buildNasConfig, nasReadFile, checkNasHealth } from '../../../_lib/nas-proxy';
import { cacheGet, cachePut } from '../../../_lib/nas-cache';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
  NAS_BASE_URL: string;
  NAS_SIGNING_KEY: string;
  NAS_ENCRYPTION_KEY: string;
}

// ── Content type → table mapping ──────────────────────────────

const TYPE_TABLE_MAP: Record<string, { table: string; pathField: string }> = {
  video: { table: 'nas_videos', pathField: 'file_path' },
  comic: { table: 'nas_comics', pathField: 'folder_path' },
  novel: { table: 'nas_novels', pathField: 'file_path' },
  music: { table: 'nas_music', pathField: 'file_path' },
};

// ── MIME type detection ───────────────────────────────────────

function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    mp4: 'video/mp4',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    webm: 'video/webm',
    mov: 'video/quicktime',
    flv: 'video/x-flv',
    ts: 'video/mp2t',
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    wav: 'audio/wav',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    txt: 'text/plain; charset=utf-8',
    epub: 'application/epub+zip',
    pdf: 'application/pdf',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const params = context.params as Record<string, string>;
    const contentType = params.type;
    const contentId = params.id;

    if (!contentType || !contentId) {
      throw new APIError(400, '缺少内容类型或 ID');
    }

    const typeConfig = TYPE_TABLE_MAP[contentType];
    if (!typeConfig) {
      throw new APIError(400, `不支持的内容类型: ${contentType}`);
    }

    // Check rating permission — NAS content is NC-17
    const maxRating: ContentRating = (context.data as Record<string, unknown>).maxRating as ContentRating || 'PG';
    if (!isRatingAllowed(maxRating, 'NC-17')) {
      throw new APIError(403, '当前用户模式无权访问该分级内容');
    }

    // Look up file path from D1
    const record = await queryOne<{ file_path?: string; folder_path?: string }>(
      context.env.DB,
      `SELECT ${typeConfig.pathField} FROM ${typeConfig.table} WHERE id = ?`,
      [contentId],
    );

    if (!record) {
      throw new APIError(404, '内容不存在');
    }

    const filePath = record.file_path || record.folder_path;
    if (!filePath) {
      throw new APIError(404, '文件路径缺失');
    }

    // Build NAS config
    const nasConfig = buildNasConfig(context.env);
    if (!nasConfig) {
      throw new APIError(503, 'NAS 服务不可用');
    }

    // Parse range header for streaming
    const rangeHeader = context.request.headers.get('Range');
    let rangeStart: number | undefined;
    let rangeEnd: number | undefined;

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        rangeStart = parseInt(match[1], 10);
        rangeEnd = match[2] ? parseInt(match[2], 10) : undefined;
      }
    }

    // Read from NAS via Tunnel
    const result = await nasReadFile(nasConfig, filePath, {
      rangeStart,
      rangeEnd,
    });

    if (!result || !result.data) {
      // NAS unavailable — try cache fallback
      const cached = await cacheGet(
        context.env.DB,
        nasConfig.baseUrl,
        nasConfig.encryptionKey,
        filePath,
      );

      if (cached) {
        return new Response(cached.data, {
          status: 200,
          headers: {
            'Content-Type': cached.contentType,
            'Cache-Control': 'private, max-age=3600',
            'X-Source': 'nas-cache',
          },
        });
      }

      throw new APIError(503, 'NAS 不可达且无缓存');
    }

    const mime = getMimeType(filePath);
    const headers: Record<string, string> = {
      'Content-Type': result.contentType || mime,
      'Cache-Control': 'private, max-age=3600',
      'Accept-Ranges': 'bytes',
      'X-Source': 'nas-tunnel',
    };

    if (result.size > 0) {
      headers['Content-Length'] = String(result.size);
    }

    return new Response(result.data, {
      status: result.status,
      headers,
    });
  } catch (error) {
    return handleError(error);
  }
};
