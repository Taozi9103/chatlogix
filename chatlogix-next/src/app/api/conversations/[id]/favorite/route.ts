import { NextRequest } from 'next/server';
import db, { ensureDBReady } from '@/lib/db';
import { ApiError, ok, requireUser, withApi } from '@/lib/api';

async function ensureOwnedConversation(conversationId: number, userId: number) {
  const [rows]: any = await db.query(
    'SELECT id FROM conversations WHERE id = ? AND user_id = ?',
    [conversationId, userId]
  );
  return Boolean(rows?.[0]);
}

export const POST = withApi(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = requireUser(_request);
  const { id } = await params;
  const conversationId = Number.parseInt(id, 10);
  if (!Number.isFinite(conversationId)) {
    throw new ApiError(400, 'VALIDATION_ERROR', '无效的会话ID');
  }

  try {
    await ensureDBReady();
    const owned = await ensureOwnedConversation(conversationId, user.userId);
    if (!owned) {
      throw new ApiError(404, 'NOT_FOUND', '会话不存在');
    }

    await db.query(
      'INSERT IGNORE INTO conversation_favorites (user_id, conversation_id) VALUES (?, ?)',
      [user.userId, conversationId]
    );

    return ok(_request, { conversationId, isFavorite: true });
  } catch (err: any) {
    console.error('收藏会话失败:', err);
    throw err;
  }
});

export const DELETE = withApi(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = requireUser(_request);
  const { id } = await params;
  const conversationId = Number.parseInt(id, 10);
  if (!Number.isFinite(conversationId)) {
    throw new ApiError(400, 'VALIDATION_ERROR', '无效的会话ID');
  }

  try {
    await ensureDBReady();
    const owned = await ensureOwnedConversation(conversationId, user.userId);
    if (!owned) {
      throw new ApiError(404, 'NOT_FOUND', '会话不存在');
    }

    await db.query(
      'DELETE FROM conversation_favorites WHERE user_id = ? AND conversation_id = ?',
      [user.userId, conversationId]
    );

    return ok(_request, { conversationId, isFavorite: false });
  } catch (err: any) {
    console.error('取消收藏失败:', err);
    throw err;
  }
});
