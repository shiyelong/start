/**
 * /api/zone/jobs — Job listings
 *
 * GET  /api/zone/jobs — Paginated job list with filters
 * POST /api/zone/jobs — Post a new job listing (auth required)
 */

import { requireAuth } from '../../_lib/auth';
import { paginate, execute, queryOne, jsonResponse, errorResponse } from '../../_lib/db';
import { handleError } from '../../_lib/errors';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
}

const VALID_JOB_TYPES = [
  'performer', 'model', 'massage', 'companion', 'dancer',
  'host', 'manager', 'security', 'other',
];

// ── GET /api/zone/jobs ────────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { DB } = context.env;
    const url = new URL(context.request.url);

    const jobType = url.searchParams.get('jobType');
    const region = url.searchParams.get('region');
    const salary = url.searchParams.get('salary');
    const sort = url.searchParams.get('sort') || 'latest';
    const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10) || 20;
    const q = url.searchParams.get('q');

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (jobType && VALID_JOB_TYPES.includes(jobType)) {
      conditions.push('job_type = ?');
      params.push(jobType);
    }
    if (region) {
      conditions.push('region = ?');
      params.push(region);
    }
    if (salary) {
      conditions.push('salary_category = ?');
      params.push(salary);
    }
    if (q) {
      conditions.push('(title LIKE ? OR company LIKE ? OR description LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    let orderBy = 'created_at DESC';
    switch (sort) {
      case 'salary': orderBy = 'salary_max DESC'; break;
      case 'hot': orderBy = 'views DESC'; break;
      default: orderBy = 'created_at DESC'; break;
    }

    const sql = `SELECT * FROM job_listings${where} ORDER BY ${orderBy}`;
    const countSql = `SELECT COUNT(*) FROM job_listings${where}`;

    const result = await paginate(DB, sql, countSql, params, page, pageSize);
    return jsonResponse(result);
  } catch (err) {
    return handleError(err);
  }
};

// ── POST /api/zone/jobs ───────────────────────────────────────

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

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const company = typeof body.company === 'string' ? body.company.trim() : '';

    if (!title || !description) {
      return errorResponse('Missing required fields: title, description', 400);
    }

    const jobType = typeof body.jobType === 'string' && VALID_JOB_TYPES.includes(body.jobType) ? body.jobType : 'other';
    const region = typeof body.region === 'string' ? body.region : '';
    const salary = typeof body.salary === 'string' ? body.salary : '面议';
    const requirements = typeof body.requirements === 'string' ? body.requirements : '';
    const now = new Date().toISOString();

    const { lastRowId } = await execute(
      DB,
      `INSERT INTO job_listings (user_id, title, company, description, requirements, job_type, region, salary, salary_category, views, applicants, verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'negotiable', 0, 0, 0, ?, ?)`,
      [user.id, title, company, description, requirements, jobType, region, salary, now, now],
    );

    const created = await queryOne(DB, 'SELECT * FROM job_listings WHERE id = ?', [lastRowId]);
    return jsonResponse(created, 201);
  } catch (err) {
    return handleError(err);
  }
};
