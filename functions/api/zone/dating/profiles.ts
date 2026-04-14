/**
 * /api/zone/dating/profiles — Dating profile CRUD
 *
 * GET  /api/zone/dating/profiles — Browse dating profiles with filters
 * POST /api/zone/dating/profiles — Create/update own dating profile (auth required)
 */

import { requireAuth } from '../../_lib/auth';
import { paginate, execute, queryOne, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

// ── GET /api/zone/dating/profiles ─────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { DB } = context.env;
    const url = new URL(context.request.url);

    const gender = url.searchParams.get('gender');
    const ageRange = url.searchParams.get('ageRange');
    const region = url.searchParams.get('region');
    const interest = url.searchParams.get('interest');
    const sort = url.searchParams.get('sort') || 'latest';
    const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10) || 20;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (gender) {
      conditions.push('gender = ?');
      params.push(gender);
    }
    if (region) {
      conditions.push('region = ?');
      params.push(region);
    }
    if (interest) {
      conditions.push('interest = ?');
      params.push(interest);
    }
    if (ageRange) {
      const [minStr, maxStr] = ageRange.split('-');
      const min = parseInt(minStr, 10);
      const max = maxStr === '+' ? 999 : parseInt(maxStr, 10);
      if (!isNaN(min)) {
        conditions.push('age >= ?');
        params.push(min);
      }
      if (!isNaN(max)) {
        conditions.push('age <= ?');
        params.push(max);
      }
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    let orderBy = 'created_at DESC';
    switch (sort) {
      case 'online': orderBy = 'is_online DESC, last_active DESC'; break;
      case 'distance': orderBy = 'created_at DESC'; break;
      case 'random': orderBy = 'RANDOM()'; break;
      default: orderBy = 'created_at DESC'; break;
    }

    const sql = `SELECT id, name, age, gender, region, interest, bio, avatar, is_online, verified, created_at FROM dating_profiles${where} ORDER BY ${orderBy}`;
    const countSql = `SELECT COUNT(*) FROM dating_profiles${where}`;

    const result = await paginate(DB, sql, countSql, params, page, pageSize);
    return jsonResponse(result);
  } catch (err) {
    return handleError(err);
  }
};

// ── POST /api/zone/dating/profiles ────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { DB } = context.env;
    const user = requireAuth(context);
    if (user instanceof Response) return user;

    let body: Record<string, unknown>;
    try {
      body = await context.request.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const bio = typeof body.bio === 'string' ? body.bio.trim() : '';
    const age = typeof body.age === 'number' ? body.age : 0;
    const gender = typeof body.gender === 'string' ? body.gender : '';
    const region = typeof body.region === 'string' ? body.region : '';
    const interest = typeof body.interest === 'string' ? body.interest : 'casual';
    const avatar = typeof body.avatar === 'string' ? body.avatar : '';

    if (!name || !bio || age < 18) {
      return errorResponse('Missing required fields or age must be 18+', 400);
    }

    const now = new Date().toISOString();

    // Check if profile exists
    const existing = await queryOne(DB, 'SELECT id FROM dating_profiles WHERE user_id = ?', [user.id]);

    if (existing) {
      // Update
      await execute(
        DB,
        `UPDATE dating_profiles SET name = ?, bio = ?, age = ?, gender = ?, region = ?, interest = ?, avatar = ?, updated_at = ? WHERE user_id = ?`,
        [name, bio, age, gender, region, interest, avatar, now, user.id],
      );
      const updated = await queryOne(DB, 'SELECT * FROM dating_profiles WHERE user_id = ?', [user.id]);
      return jsonResponse(updated);
    } else {
      // Create
      const { lastRowId } = await execute(
        DB,
        `INSERT INTO dating_profiles (user_id, name, bio, age, gender, region, interest, avatar, is_online, verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
        [user.id, name, bio, age, gender, region, interest, avatar, now, now],
      );
      const created = await queryOne(DB, 'SELECT * FROM dating_profiles WHERE id = ?', [lastRowId]);
      return jsonResponse(created, 201);
    }
  } catch (err) {
    return handleError(err);
  }
};
