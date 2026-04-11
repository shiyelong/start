/**
 * /api/classic/profile/session — Record game session
 *
 * POST /api/classic/profile/session
 * Body: { userId, romHash, platform, durationSeconds, mode, result? }
 *
 * Updates player stats and checks achievement thresholds.
 */

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as {
      userId?: string;
      romHash?: string;
      platform?: string;
      durationSeconds?: number;
      mode?: string;
      result?: string;
    };

    if (!body.userId || !body.romHash || !body.platform || body.durationSeconds == null || !body.mode) {
      return new Response(
        JSON.stringify({ error: { code: 'INVALID_INPUT', message: '缺少必填字段' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const sessionId = crypto.randomUUID();

    // Insert game session
    await context.env.DB.prepare(
      'INSERT INTO game_session (id, user_id, rom_hash, platform, duration_seconds, mode, result) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(sessionId, body.userId, body.romHash, body.platform, body.durationSeconds, body.mode, body.result ?? null).run();

    // Update profile stats
    const isWin = body.result === 'win' && (body.mode === 'multiplayer' || body.mode === 'race');
    await context.env.DB.prepare(
      `UPDATE player_profile SET
        total_games_played = total_games_played + 1,
        total_time_seconds = total_time_seconds + ?,
        multiplayer_wins = multiplayer_wins + ?,
        updated_at = datetime('now')
      WHERE user_id = ?`,
    ).bind(body.durationSeconds, isWin ? 1 : 0, body.userId).run();

    // Check achievements
    const profile = await context.env.DB.prepare(
      'SELECT total_games_played, total_time_seconds, multiplayer_wins FROM player_profile WHERE user_id = ?',
    ).bind(body.userId).first();

    if (profile) {
      const definitions = await context.env.DB.prepare(
        'SELECT id, condition_type, condition_value FROM achievement_definition',
      ).all();

      const earned = await context.env.DB.prepare(
        'SELECT achievement_id FROM player_achievement WHERE user_id = ?',
      ).bind(body.userId).all();

      const earnedIds = new Set((earned.results ?? []).map((r: Record<string, unknown>) => r.achievement_id));

      for (const def of (definitions.results ?? []) as Record<string, unknown>[]) {
        if (earnedIds.has(def.id as string)) continue;
        let met = false;
        const val = def.condition_value as number;
        switch (def.condition_type) {
          case 'games_played':
            met = (profile.total_games_played as number) >= val;
            break;
          case 'time_played':
            met = (profile.total_time_seconds as number) >= val;
            break;
          case 'multiplayer_wins':
            met = (profile.multiplayer_wins as number) >= val;
            break;
        }
        if (met) {
          await context.env.DB.prepare(
            'INSERT OR IGNORE INTO player_achievement (user_id, achievement_id) VALUES (?, ?)',
          ).bind(body.userId, def.id).run();
        }
      }
    }

    // Invalidate cache
    await context.env.KV.delete(`profile:${body.userId}`);

    return new Response(JSON.stringify({ ok: true, sessionId }), {
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
