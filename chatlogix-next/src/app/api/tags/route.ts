import { NextRequest } from 'next/server';
import db, { ensureDBReady } from '@/lib/db';
import { ApiError, ok, parseJson, requireUser, withApi } from '@/lib/api';

export const GET = withApi(async (request: NextRequest) => {
  const user = requireUser(request);

  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '50', 10) || 50)
  );
  const offset = (page - 1) * pageSize;

  await ensureDBReady();
  const [countRows]: any = await db.query(
    'SELECT COUNT(*) as total FROM tags WHERE user_id = ?',
    [user.userId]
  );
  const total = countRows?.[0]?.total ?? 0;

  const [rows]: any = await db.query(
    'SELECT id, name, created_at as createdAt FROM tags WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
    [user.userId, pageSize, offset]
  );

  return ok(request, {
    tags: rows || [],
    pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
    },
  });
});

export const POST = withApi(async (request: NextRequest) => {
  const user = requireUser(request);
  const body = await parseJson(request);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';

  if (!name) {
    throw new ApiError(400, 'VALIDATION_ERROR', '标签名不能为空');
  }
  if (name.length > 50) {
    throw new ApiError(400, 'VALIDATION_ERROR', '标签名不能超过 50 个字符');
  }

  await ensureDBReady();
  const [result]: any = await db.query(
    `
        INSERT INTO tags (user_id, name)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
      `,
    [user.userId, name]
  );

  const tagId = result.insertId;
  const [rows]: any = await db.query(
    'SELECT id, name, created_at as createdAt FROM tags WHERE id = ? AND user_id = ?',
    [tagId, user.userId]
  );
  const tag = rows?.[0];

  return ok(request, { tag });
});
