/**
 * /api/classic/room/create — Create a multiplayer room
 *
 * POST /api/classic/room/create — Create room (returns room code + DO URL)
 *
 * Validates: Requirements 6.1, 16.2, 16.4
 */

import { requireAuth } from '../../_lib/auth';
import { jsonResponse, errorResponse } from '../../_lib/db';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
  GAME_ROOM: DurableObjectNamespace;
}

const VALID_MODES = ['multiplayer', 'race', 'spectator'] as const;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const user = requireAuth(context);
  if (user instanceof Response) return user;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const romHash = typeof body.romHash === 'string' ? body.romHash.trim() : '';
  const romTitle = typeof body.romTitle === 'string' ? body.romTitle.trim() : '';
  const platform = typeof body.platform === 'string' ? body.platform.trim() : '';
  const maxPlayers = typeof body.maxPlayers === 'number' ? Math.min(Math.max(body.maxPlayers, 1), 4) : 2;
  const hostId = typeof body.hostId === 'string' ? body.hostId.trim() : String(user.id);
  const isPublic = typeof body.isPublic === 'boolean' ? body.isPublic : true;
  const mode = typeof body.mode === 'string' && VALID_MODES.includes(body.mode as typeof VALID_MODES[number])
    ? body.mode as typeof VALID_MODES[number]
    : 'multiplayer';
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === 'string').slice(0, 10) : [];
  const description = typeof body.description === 'string' ? body.description.slice(0, 500) : '';

  if (!romHash) {
    return errorResponse('Missing required field: romHash', 400);
  }
  if (!romTitle) {
    return errorResponse('Missing required field: romTitle', 400);
  }

  // Create a new Durable Object instance
  const doId = context.env.GAME_ROOM.newUniqueId();
  const stub = context.env.GAME_ROOM.get(doId);

  // Configure the room via the DO's /configure endpoint
  const configPayload = {
    romHash,
    romTitle,
    maxPlayers,
    mode,
    isPublic,
    tags,
    description,
    hostId,
  };

  const configResponse = await stub.fetch('https://do/configure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(configPayload),
  });

  if (!configResponse.ok) {
    return errorResponse('Failed to configure room', 500);
  }

  const configResult = await configResponse.json() as { roomCode: string };
  const roomCode = configResult.roomCode;

  // Build the WebSocket URL for the room
  const url = new URL(context.request.url);
  const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${url.host}/api/classic/room/${roomCode}/ws`;

  // Store DO ID mapping so room can be looked up by code
  // Use a generous TTL (1 hour) — room cleanup will handle stale entries
  await context.env.KV.put(`room:${roomCode}:doId`, doId.toString(), { expirationTtl: 3600 });

  // Invalidate room list cache so new room appears
  await context.env.KV.delete('room:list');

  return jsonResponse({
    roomCode,
    wsUrl,
    doId: doId.toString(),
    platform,
    romTitle,
    maxPlayers,
    mode,
    isPublic,
  }, 201);
};
