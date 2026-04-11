/**
 * /api/classic/profile/achievements — Get achievements
 *
 * GET /api/classic/profile/achievements?userId=xxx
 * Returns all achievement definitions and which ones the user has earned.
 */

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const userId = url.searchParams.get('userId');

    // Get all definitions
    const definitions = await context.env.DB.prepare(
      'SELECT id, name, description, icon_url, condition_type, condition_value FROM achievement_definition',
    ).all();

    let earned: Record<string, unknown>[] = [];
    if (userId) {
      const result = await context.env.DB.prepare(
        'SELECT user_id, achievement_id, earned_at FROM player_achievement WHERE user_id = ?',
      ).bind(userId).all();
      earned = (result.results ?? []) as Record<string, unknown>[];
    }

    return new Response(
      JSON.stringify({
        definitions: (definitions.results ?? []).map((d: Record<string, unknown>) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          iconUrl: d.icon_url,
          conditionType: d.condition_type,
          conditionValue: d.condition_value,
        })),
        achievements: earned.map((a) => ({
          userId: a.user_id,
          achievementId: a.achievement_id,
          earnedAt: a.earned_at,
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { code: 'INTERNAL', message: String(err) } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
