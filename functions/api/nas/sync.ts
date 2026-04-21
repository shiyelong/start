/**
 * POST /api/nas/sync — Trigger NAS content metadata sync
 *
 * Scans NAS media directories via Cloudflare Tunnel, discovers new files,
 * and upserts metadata into D1 tables (nas_videos, nas_comics, nas_novels, nas_music).
 *
 * Admin-only. Runs incrementally — only processes files not yet in the index.
 *
 * NAS directory structure expected:
 *   /videos/   — video files (.mp4, .mkv, .avi, .webm)
 *   /comics/   — comic folders (each folder = one comic, contains images)
 *   /novels/   — novel files (.txt, .epub, .pdf)
 *   /music/    — audio files (.mp3, .flac, .wav, .aac, .ogg)
 *
 * Validates: Requirement 52.2, Project Constitution Ch.2
 */

import { requireAuth } from '../_lib/auth';
import { jsonResponse, errorResponse, execute, query, queryOne } from '../_lib/db';
import { handleError } from '../_lib/errors';
import { buildNasConfig, nasListFiles } from '../_lib/nas-proxy';
import type { NasFileInfo } from '../_lib/nas-proxy';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
  NAS_BASE_URL: string;
  NAS_SIGNING_KEY: string;
  NAS_ENCRYPTION_KEY: string;
}

// ── File extension mappings ───────────────────────────────────

const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'avi', 'webm', 'mov', 'flv', 'wmv', 'ts'];
const COMIC_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
const NOVEL_EXTENSIONS = ['txt', 'epub', 'pdf', 'mobi'];
const MUSIC_EXTENSIONS = ['mp3', 'flac', 'wav', 'aac', 'ogg', 'wma', 'm4a'];

// ── Sync helpers ──────────────────────────────────────────────

function getExtension(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function extractTitle(path: string): string {
  // Extract filename without extension from path
  const parts = path.split('/');
  const filename = parts[parts.length - 1];
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 ? filename.substring(0, dotIndex) : filename;
}

async function syncVideos(
  db: D1Database,
  files: NasFileInfo[],
): Promise<number> {
  let synced = 0;

  for (const file of files) {
    const ext = getExtension(file.path);
    if (!VIDEO_EXTENSIONS.includes(ext)) continue;

    // Check if already indexed
    const existing = await queryOne(
      db,
      'SELECT id FROM nas_videos WHERE file_path = ?',
      [file.path],
    );
    if (existing) continue;

    const id = crypto.randomUUID();
    const title = extractTitle(file.path);

    await execute(
      db,
      `INSERT INTO nas_videos (id, title, file_path, file_size, rating, added_at, updated_at)
       VALUES (?, ?, ?, ?, 'NC-17', datetime('now'), datetime('now'))`,
      [id, title, file.path, file.size],
    );
    synced++;
  }

  return synced;
}

async function syncComics(
  db: D1Database,
  files: NasFileInfo[],
): Promise<number> {
  let synced = 0;

  // Group images by parent folder (each folder = one comic)
  const folders = new Map<string, NasFileInfo[]>();
  for (const file of files) {
    const ext = getExtension(file.path);
    if (!COMIC_EXTENSIONS.includes(ext)) continue;

    const parts = file.path.split('/');
    parts.pop(); // Remove filename
    const folder = parts.join('/');
    if (!folders.has(folder)) folders.set(folder, []);
    folders.get(folder)!.push(file);
  }

  for (const [folder, images] of folders) {
    const existing = await queryOne(
      db,
      'SELECT id FROM nas_comics WHERE folder_path = ?',
      [folder],
    );
    if (existing) continue;

    const id = crypto.randomUUID();
    const parts = folder.split('/');
    const title = parts[parts.length - 1] || folder;

    await execute(
      db,
      `INSERT INTO nas_comics (id, title, folder_path, page_count, rating, added_at)
       VALUES (?, ?, ?, ?, 'NC-17', datetime('now'))`,
      [id, title, folder, images.length],
    );
    synced++;
  }

  return synced;
}

async function syncNovels(
  db: D1Database,
  files: NasFileInfo[],
): Promise<number> {
  let synced = 0;

  for (const file of files) {
    const ext = getExtension(file.path);
    if (!NOVEL_EXTENSIONS.includes(ext)) continue;

    const existing = await queryOne(
      db,
      'SELECT id FROM nas_novels WHERE file_path = ?',
      [file.path],
    );
    if (existing) continue;

    const id = crypto.randomUUID();
    const title = extractTitle(file.path);

    await execute(
      db,
      `INSERT INTO nas_novels (id, title, file_path, rating, added_at)
       VALUES (?, ?, ?, 'NC-17', datetime('now'))`,
      [id, title, file.path],
    );
    synced++;
  }

  return synced;
}

async function syncMusic(
  db: D1Database,
  files: NasFileInfo[],
): Promise<number> {
  let synced = 0;

  for (const file of files) {
    const ext = getExtension(file.path);
    if (!MUSIC_EXTENSIONS.includes(ext)) continue;

    const existing = await queryOne(
      db,
      'SELECT id FROM nas_music WHERE file_path = ?',
      [file.path],
    );
    if (existing) continue;

    const id = crypto.randomUUID();
    const title = extractTitle(file.path);

    await execute(
      db,
      `INSERT INTO nas_music (id, title, file_path, rating, added_at)
       VALUES (?, ?, ?, 'NC-17', datetime('now'))`,
      [id, title, file.path],
    );
    synced++;
  }

  return synced;
}

// ── Main handler ──────────────────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    const nasConfig = buildNasConfig(context.env);
    if (!nasConfig) {
      return errorResponse('NAS 配置缺失', 503);
    }

    // Parse optional body for selective sync
    let syncTypes = ['videos', 'comics', 'novels', 'music'];
    try {
      const body = await context.request.json() as Record<string, unknown>;
      if (Array.isArray(body.types)) {
        syncTypes = body.types.filter((t): t is string => typeof t === 'string');
      }
    } catch { /* no body = sync all */ }

    const results: Record<string, number> = {};

    // Scan each media directory
    for (const type of syncTypes) {
      const files = await nasListFiles(nasConfig, `/${type}`, {
        recursive: true,
        pageSize: 1000,
      });

      switch (type) {
        case 'videos':
          results.videos = await syncVideos(context.env.DB, files);
          break;
        case 'comics':
          results.comics = await syncComics(context.env.DB, files);
          break;
        case 'novels':
          results.novels = await syncNovels(context.env.DB, files);
          break;
        case 'music':
          results.music = await syncMusic(context.env.DB, files);
          break;
      }
    }

    return jsonResponse({
      synced: true,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return handleError(error);
  }
};
