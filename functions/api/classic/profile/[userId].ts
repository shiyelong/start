/**
 * /api/classic/profile/:userId — Get player profile
 *
 * GET /api/classic/profile/:userId
 * Returns profile stats + recent sessions (last 20)
 */

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const userId = (context.params as { userId?: string }).userId;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: { code: 'INVALID_INPUT', message: '缺少用户ID' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Check KV cache
    const cached = await context.env.KV.get(`profile:${userId}`);
    if (cached) {
      return new Response(cached, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const profile = await context.env.DB.prepare(
      'SELECT user_id, display_name, total_games_played, total_time_seconds, multiplayer_wins, created_at, updated_at FROM player_profile WHERE user_id = ?',
    ).bind(userId).first();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: { code: 'NOT_FOUND', message: '未找到玩家资料' } }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const sessions = await context.env.DB.prepare(
      'SELECT id, user_id, rom_hash, platform, duration_seconds, mode, result, created_at FROM game_session WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    ).bind(userId).all();

    const result = {
      profile: {
        userId: profile.user_id,
        displayName: profile.display_name,
        totalGamesPlayed: profile.total_games_played,
        totalTimeSeconds: profile.total_time_seconds,
        multiplayerWins: profile.multiplayer_wins,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      },
      recentSessions: (sessions.results ?? []).map((s: Record<string, unknown>) => ({
        id: s.id,
        userId: s.user_id,
        romHash: s.rom_hash,
        platform: s.platform,
        durationSeconds: s.duration_seconds,
        mode: s.mode,
        result: s.result,
        createdAt: s.created_at,
      })),
    };

    // Cache for 120s
    await context.env.KV.put(`profile:${userId}`, JSON.stringify(result), { expirationTtl: 120 });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { code: 'INTERNAL', message: String(err) } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
