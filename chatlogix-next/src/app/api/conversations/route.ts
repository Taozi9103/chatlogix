import { NextRequest } from 'next/server';
import db, { ensureDBReady } from '@/lib/db';
import { ok, parseJson, requireUser, withApi } from '@/lib/api';

export const GET = withApi(async (request: NextRequest) => {
  const user = requireUser(request);
  const userId = user.userId;
  const url = new URL(request.url);
  const tagIdRaw = url.searchParams.get('tagId');
  const favoriteRaw = url.searchParams.get('favorite');
  const pageRaw = url.searchParams.get('page') || '1';
  const pageSizeRaw = url.searchParams.get('pageSize') || '20';
  const page = Math.max(1, Number.parseInt(pageRaw, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(pageSizeRaw, 10) || 20));
  const offset = (page - 1) * pageSize;

  const tagId = tagIdRaw != null && tagIdRaw !== '' ? Number.parseInt(tagIdRaw, 10) : null;
  const favorite =
    favoriteRaw == null
      ? null
      : favoriteRaw === '1' || favoriteRaw.toLowerCase() === 'true'
        ? true
        : favoriteRaw === '0' || favoriteRaw.toLowerCase() === 'false'
          ? false
          : null;

  await ensureDBReady();
  const whereParts: string[] = ['c.user_id = ?'];
  const params: any[] = [userId];

  if (Number.isFinite(tagId as any) && tagId != null) {
    whereParts.push(
      'EXISTS (SELECT 1 FROM conversation_tags ct WHERE ct.conversation_id = c.id AND ct.tag_id = ?)'
    );
    params.push(tagId);
  }

  if (favorite === true) {
    whereParts.push(
      'EXISTS (SELECT 1 FROM conversation_favorites cf WHERE cf.conversation_id = c.id AND cf.user_id = ?)'
    );
    params.push(userId);
  } else if (favorite === false) {
    whereParts.push(
      'NOT EXISTS (SELECT 1 FROM conversation_favorites cf WHERE cf.conversation_id = c.id AND cf.user_id = ?)'
    );
    params.push(userId);
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const [countRows]: any = await db.query(
    `SELECT COUNT(*) as total FROM conversations c ${whereSql}`,
    params
  );
  const total = countRows?.[0]?.total ?? 0;

  const [conversations]: any = await db.query(
    `
        SELECT
          c.id,
          c.title,
          c.role_id as roleId,
          c.created_at as createdAt,
          c.updated_at as updatedAt,
          (cf.conversation_id IS NOT NULL) as isFavorite,
          (
            SELECT GROUP_CONCAT(DISTINCT ct2.tag_id)
            FROM conversation_tags ct2
            WHERE ct2.conversation_id = c.id
          ) as tagIds
        FROM conversations c
        LEFT JOIN conversation_favorites cf
          ON cf.conversation_id = c.id AND cf.user_id = ?
        ${whereSql}
        ORDER BY
          (cf.conversation_id IS NOT NULL) DESC,
          COALESCE(c.updated_at, c.created_at) DESC,
          c.id DESC
        LIMIT ? OFFSET ?
      `,
    [userId, ...params, pageSize, offset]
  );

  const normalized = (conversations || []).map((c: any) => ({
    ...c,
    isFavorite: Boolean(c.isFavorite),
    tagIds:
      typeof c.tagIds === 'string' && c.tagIds.length
        ? c.tagIds
            .split(',')
            .map((x: string) => Number.parseInt(x, 10))
            .filter((n: number) => Number.isFinite(n))
        : [],
  }));

  return ok(request, {
    conversations: normalized,
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
  const userId = user.userId;
  const body = await parseJson(request);
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : '新对话';
  const roleId = typeof body?.roleId === 'string' && body.roleId ? body.roleId : 'assistant';

  await ensureDBReady();
  const [result]: any = await db.query(
    'INSERT INTO conversations (user_id, title, role_id) VALUES (?, ?, ?)',
    [userId, title, roleId]
  );

  return ok(
    request,
    {
      conversation: {
        id: result.insertId,
        title,
        roleId,
        createdAt: new Date().toISOString(),
      },
    },
    { status: 201 }
  );
});
