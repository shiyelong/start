/**
 * /api/classic/profile — Create/update player profile
 *
 * POST /api/classic/profile
 * Body: { userId, displayName }
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
      displayName?: string;
    };

    if (!body.userId || !body.displayName) {
      return new Response(
        JSON.stringify({ error: { code: 'INVALID_INPUT', message: '缺少必填字段' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const existing = await context.env.DB.prepare(
      'SELECT user_id FROM player_profile WHERE user_id = ?',
    ).bind(body.userId).first();

    if (existing) {
      await context.env.DB.prepare(
        "UPDATE player_profile SET display_name = ?, updated_at = datetime('now') WHERE user_id = ?",
      ).bind(body.displayName, body.userId).run();
    } else {
      await context.env.DB.prepare(
        'INSERT INTO player_profile (user_id, display_name) VALUES (?, ?)',
      ).bind(body.userId, body.displayName).run();
    }

    // Invalidate cache
    await context.env.KV.delete(`profile:${body.userId}`);

    return new Response(JSON.stringify({ ok: true }), {
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
