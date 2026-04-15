/**
 * Telegram Bot API proxy adapter.
 *
 * All requests to Telegram API are proxied through Cloudflare Workers
 * to avoid direct connections being blocked.
 *
 * Bot Token stored in Workers Secrets (TELEGRAM_BOT_TOKEN).
 *
 * Validates: Requirements 51.1, 51.2, 51.3, 51.4
 */

// ── Types ─────────────────────────────────────────────────────

export interface TelegramChannel {
  id: string;
  channelId: string;
  name: string;
  type: string;
  rating: string;
  fetchInterval: number;
  enabled: boolean;
  lastFetched: string | null;
  messageCount: number;
}

export interface TelegramMessage {
  messageId: number;
  channelId: string;
  type: 'text' | 'photo' | 'video' | 'animation' | 'document';
  text?: string;
  mediaUrl?: string;
  date: number;
}

// ── Bot API proxy ─────────────────────────────────────────────

const TELEGRAM_API_BASE = 'https://api.telegram.org';

/**
 * Make a request to the Telegram Bot API via Cloudflare Workers proxy.
 */
export async function callTelegramApi(
  botToken: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/${method}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: params ? JSON.stringify(params) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Telegram API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description || 'Unknown error'}`);
  }

  return data.result;
}

/**
 * Get channel info.
 */
export async function getChannelInfo(
  botToken: string,
  channelId: string,
): Promise<{ title: string; type: string; memberCount: number }> {
  const result = (await callTelegramApi(botToken, 'getChat', {
    chat_id: channelId,
  })) as { title?: string; type?: string };

  const memberResult = (await callTelegramApi(botToken, 'getChatMemberCount', {
    chat_id: channelId,
  }).catch(() => 0)) as number;

  return {
    title: result?.title || 'Unknown',
    type: result?.type || 'channel',
    memberCount: typeof memberResult === 'number' ? memberResult : 0,
  };
}

/**
 * Fetch recent messages from a channel.
 * Stub: In production, would use getUpdates or webhook.
 */
export async function fetchChannelMessages(
  botToken: string,
  channelId: string,
  _limit: number = 50,
): Promise<TelegramMessage[]> {
  // Stub: Telegram Bot API doesn't directly support getChatHistory
  // In production, the bot would receive messages via webhook
  // and store them in D1 as they arrive.
  return [];
}

/**
 * Classify content type from message keywords.
 */
export function classifyContent(text: string): string {
  const lower = text.toLowerCase();
  if (/电影|movie|film/.test(lower)) return 'video';
  if (/动漫|anime|番/.test(lower)) return 'anime';
  if (/音乐|music|歌/.test(lower)) return 'music';
  if (/漫画|manga|comic/.test(lower)) return 'comic';
  if (/小说|novel/.test(lower)) return 'novel';
  return 'other';
}
