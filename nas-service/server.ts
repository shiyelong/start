/**
 * NAS Media Server — Lightweight HTTP service for Cloudflare Tunnel
 *
 * Runs on NAS, listens ONLY on 127.0.0.1:8765 (never exposed to network).
 * Cloudflare Tunnel (cloudflared) forwards requests from CF Workers to here.
 *
 * Endpoints:
 *   GET  /health       — Health check + disk usage
 *   GET  /media/*      — Read media file (supports Range)
 *   PUT  /media/*      — Write cache file
 *   DELETE /media/*     — Delete cache file
 *   GET  /list/*       — List directory contents
 *   GET  /info/*       — Get file metadata
 *
 * Security:
 *   - All requests must include X-NAS-Signature header (HMAC-SHA256)
 *   - Signature format: "timestamp:hmac_hex"
 *   - Timestamp must be within 5 minutes of server time
 *   - Signing key matches NAS_SIGNING_KEY in Workers Secrets
 *
 * Usage:
 *   NAS_SIGNING_KEY=<hex_key> NAS_MEDIA_ROOT=/data/media npx tsx nas-service/server.ts
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, createWriteStream, statSync, readdirSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve, relative, extname, dirname } from 'node:path';
import { createHmac } from 'node:crypto';
import { execSync } from 'node:child_process';

// ── Config ────────────────────────────────────────────────────

const PORT = parseInt(process.env.NAS_PORT || '8765', 10);
const HOST = '127.0.0.1'; // NEVER bind to 0.0.0.0
const SIGNING_KEY = process.env.NAS_SIGNING_KEY || '';
const MEDIA_ROOT = resolve(process.env.NAS_MEDIA_ROOT || '/data/media');
const MAX_TIMESTAMP_DRIFT = 300; // 5 minutes

if (!SIGNING_KEY) {
  console.error('NAS_SIGNING_KEY environment variable is required');
  process.exit(1);
}

// ── Signature verification ────────────────────────────────────

function verifySignature(signature: string, path: string): boolean {
  try {
    const [timestampStr, hmacHex] = signature.split(':');
    const timestamp = parseInt(timestampStr, 10);
    const now = Math.floor(Date.now() / 1000);

    // Check timestamp drift
    if (Math.abs(now - timestamp) > MAX_TIMESTAMP_DRIFT) {
      return false;
    }

    // Verify HMAC
    const message = `${timestampStr}:${path}`;
    const expected = createHmac('sha256', SIGNING_KEY)
      .update(message)
      .digest('hex');

    // Constant-time comparison
    if (expected.length !== hmacHex.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ hmacHex.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

// ── Path safety ───────────────────────────────────────────────

function safePath(requestPath: string): string | null {
  const resolved = resolve(MEDIA_ROOT, requestPath.replace(/^\/+/, ''));
  // Prevent directory traversal
  if (!resolved.startsWith(MEDIA_ROOT)) return null;
  return resolved;
}

// ── MIME types ────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.flv': 'video/x-flv',
  '.ts': 'video/mp2t', '.mp3': 'audio/mpeg', '.flac': 'audio/flac',
  '.wav': 'audio/wav', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.txt': 'text/plain', '.epub': 'application/epub+zip', '.pdf': 'application/pdf',
  '.enc': 'application/octet-stream',
};

function getMime(filePath: string): string {
  return MIME_MAP[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

// ── Disk usage ────────────────────────────────────────────────

function getDiskUsage(): { totalBytes: number; usedBytes: number; freeBytes: number } {
  try {
    const output = execSync(`df -B1 "${MEDIA_ROOT}" | tail -1`).toString().trim();
    const parts = output.split(/\s+/);
    return {
      totalBytes: parseInt(parts[1], 10) || 0,
      usedBytes: parseInt(parts[2], 10) || 0,
      freeBytes: parseInt(parts[3], 10) || 0,
    };
  } catch {
    return { totalBytes: 0, usedBytes: 0, freeBytes: 0 };
  }
}

// ── Request handlers ──────────────────────────────────────────

function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  const disk = getDiskUsage();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    uptime: process.uptime(),
    disk,
    mediaRoot: MEDIA_ROOT,
    timestamp: new Date().toISOString(),
  }));
}

function handleMediaRead(req: IncomingMessage, res: ServerResponse, filePath: string): void {
  const fullPath = safePath(filePath);
  if (!fullPath) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid path' }));
    return;
  }

  try {
    const stat = statSync(fullPath);
    if (!stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not a file' }));
      return;
    }

    const mime = getMime(fullPath);
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      // Range request for streaming
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
        const chunkSize = end - start + 1;

        res.writeHead(206, {
          'Content-Type': mime,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': chunkSize,
          'Accept-Ranges': 'bytes',
        });

        createReadStream(fullPath, { start, end }).pipe(res);
      } else {
        res.writeHead(416, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid range' }));
      }
    } else {
      // Full file
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
      });
      createReadStream(fullPath).pipe(res);
    }
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found' }));
  }
}

function handleMediaWrite(req: IncomingMessage, res: ServerResponse, filePath: string): void {
  const fullPath = safePath(filePath);
  if (!fullPath) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid path' }));
    return;
  }

  try {
    // Ensure directory exists
    mkdirSync(dirname(fullPath), { recursive: true });

    const writeStream = createWriteStream(fullPath);
    req.pipe(writeStream);

    writeStream.on('finish', () => {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: filePath }));
    });

    writeStream.on('error', () => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Write failed' }));
    });
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Write failed' }));
  }
}

function handleMediaDelete(_req: IncomingMessage, res: ServerResponse, filePath: string): void {
  const fullPath = safePath(filePath);
  if (!fullPath) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid path' }));
    return;
  }

  try {
    unlinkSync(fullPath);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found' }));
  }
}

function handleList(_req: IncomingMessage, res: ServerResponse, dirPath: string, query: URLSearchParams): void {
  const fullPath = safePath(dirPath);
  if (!fullPath) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid path' }));
    return;
  }

  try {
    const recursive = query.get('recursive') === '1';
    const extFilter = query.get('ext')?.split(',').map(e => `.${e.toLowerCase()}`) || [];
    const page = parseInt(query.get('page') || '1', 10);
    const pageSize = parseInt(query.get('pageSize') || '1000', 10);

    const files: Array<{ path: string; size: number; mimeType: string; modifiedAt: string }> = [];

    function scanDir(dir: string): void {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const entryPath = join(dir, entry.name);
          if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            if (extFilter.length === 0 || extFilter.includes(ext)) {
              const stat = statSync(entryPath);
              files.push({
                path: '/' + relative(MEDIA_ROOT, entryPath),
                size: stat.size,
                mimeType: getMime(entryPath),
                modifiedAt: stat.mtime.toISOString(),
              });
            }
          } else if (entry.isDirectory() && recursive) {
            scanDir(entryPath);
          }
        }
      } catch { /* skip inaccessible dirs */ }
    }

    scanDir(fullPath);

    // Paginate
    const start = (page - 1) * pageSize;
    const paged = files.slice(start, start + pageSize);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ files: paged, total: files.length }));
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Directory not found' }));
  }
}

function handleInfo(_req: IncomingMessage, res: ServerResponse, filePath: string): void {
  const fullPath = safePath(filePath);
  if (!fullPath) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid path' }));
    return;
  }

  try {
    const stat = statSync(fullPath);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      path: filePath,
      size: stat.size,
      mimeType: getMime(fullPath),
      modifiedAt: stat.mtime.toISOString(),
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
    }));
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

// ── Server ────────────────────────────────────────────────────

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
  const method = req.method || 'GET';

  // Health check — no signature required (cloudflared internal)
  if (pathname === '/health' && method === 'GET') {
    handleHealth(req, res);
    return;
  }

  // Verify signature for all other endpoints
  const signature = req.headers['x-nas-signature'] as string;
  const sigPath = pathname.replace(/^\/(media|list|info)/, '');
  if (!signature || !verifySignature(signature, sigPath)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid signature' }));
    return;
  }

  // Route
  if (pathname.startsWith('/media/')) {
    const filePath = pathname.slice(6); // Remove "/media"
    if (method === 'GET') handleMediaRead(req, res, filePath);
    else if (method === 'PUT') handleMediaWrite(req, res, filePath);
    else if (method === 'DELETE') handleMediaDelete(req, res, filePath);
    else {
      res.writeHead(405);
      res.end();
    }
  } else if (pathname.startsWith('/list/')) {
    const dirPath = pathname.slice(5); // Remove "/list"
    handleList(req, res, dirPath, url.searchParams);
  } else if (pathname.startsWith('/info/')) {
    const filePath = pathname.slice(5); // Remove "/info"
    handleInfo(req, res, filePath);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`NAS Media Server listening on ${HOST}:${PORT}`);
  console.log(`Media root: ${MEDIA_ROOT}`);
  console.log(`Signature verification: enabled`);
});
