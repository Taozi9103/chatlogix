import { NextRequest } from 'next/server';
import db, { ensureDBReady } from '@/lib/db';
import { ApiError, ok, parseJson, requireUser, withApi } from '@/lib/api';

function parseTagIds(input: any): number[] {
  if (!Array.isArray(input)) return [];
  const ids = input
    .map((x) => (typeof x === 'string' ? Number.parseInt(x, 10) : Number(x)))
    .filter((n) => Number.isFinite(n) && n > 0);
  return Array.from(new Set(ids));
}

export const POST = withApi(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = requireUser(request);
  const { id } = await params;
  const conversationId = Number.parseInt(id, 10);
  if (!Number.isFinite(conversationId)) {
    throw new ApiError(400, 'VALIDATION_ERROR', '无效的会话ID');
  }

  const body = await parseJson(request);
  const tagIds = parseTagIds(body?.tagIds);
  if (tagIds.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'tagIds 不能为空');
  }

  try {
    await ensureDBReady();
    const [convRows]: any = await db.query(
      'SELECT id FROM conversations WHERE id = ? AND user_id = ?',
      [conversationId, user.userId]
    );
    if (!convRows?.[0]) {
      throw new ApiError(404, 'NOT_FOUND', '会话不存在');
    }

    const placeholders = tagIds.map(() => '?').join(',');
    const [tagRows]: any = await db.query(
      `SELECT id FROM tags WHERE user_id = ? AND id IN (${placeholders})`,
      [user.userId, ...tagIds]
    );
    if ((tagRows?.length || 0) !== tagIds.length) {
      throw new ApiError(400, 'VALIDATION_ERROR', '包含不存在的标签或越权标签');
    }

    const valuesSql = tagIds.map(() => '(?, ?)').join(',');
    const insertParams: any[] = [];
    for (const tagId of tagIds) {
      insertParams.push(conversationId, tagId);
    }
    await db.query(
      `INSERT IGNORE INTO conversation_tags (conversation_id, tag_id) VALUES ${valuesSql}`,
      insertParams
    );

    const [current]: any = await db.query(
      'SELECT tag_id as tagId FROM conversation_tags WHERE conversation_id = ? ORDER BY created_at DESC',
      [conversationId]
    );

    return ok(request, {
      conversationId,
      tagIds: (current || []).map((r: any) => r.tagId),
    });
  } catch (err: any) {
    console.error('会话打标签失败:', err);
    throw err;
  }
});
