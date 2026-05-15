import { NextRequest } from 'next/server';
import db, { ensureDBReady } from '@/lib/db';
import { ApiError, ok, parseJson, requireUser, withApi } from '@/lib/api';

export const GET = withApi(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = requireUser(request);
  const userId = user.userId;
  const { id } = await params;
  const conversationId = parseInt(id);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
  const offset = (page - 1) * pageSize;

  if (isNaN(conversationId)) {
    throw new ApiError(400, 'VALIDATION_ERROR', '无效的会话ID');
  }

  await ensureDBReady();
  const [conversationResult]: any = await db.query(
    'SELECT id, title, role_id as roleId, created_at as createdAt FROM conversations WHERE id = ? AND user_id = ?',
    [conversationId, userId]
  );

  const conversation = conversationResult[0];
  if (!conversation) {
    throw new ApiError(404, 'NOT_FOUND', '会话不存在');
  }

  const [messages]: any = await db.query(
    'SELECT id, role, content, created_at as createdAt FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [conversationId, pageSize, offset]
  );

  const [countResult]: any = await db.query(
    'SELECT COUNT(*) as total FROM messages WHERE conversation_id = ?',
    [conversationId]
  );

  const total = countResult[0].total;

  return ok(request, {
    conversation,
    messages: messages.reverse(),
    pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
    },
  });
});

export const PUT = withApi(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = requireUser(request);
  const userId = user.userId;
  const { id } = await params;
  const conversationId = parseInt(id);
  const body = await parseJson(request);
  const title = typeof body?.title === 'string' ? body.title.trim() : '';

  if (isNaN(conversationId)) {
    throw new ApiError(400, 'VALIDATION_ERROR', '无效的会话ID');
  }

  if (!title) {
    throw new ApiError(400, 'VALIDATION_ERROR', '标题不能为空');
  }

  await ensureDBReady();
  await db.query(
    'UPDATE conversations SET title = ? WHERE id = ? AND user_id = ?',
    [title, conversationId, userId]
  );

  return ok(request, { message: '会话标题更新成功' });
});

export const DELETE = withApi(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = requireUser(request);
  const userId = user.userId;
  const { id } = await params;
  const conversationId = parseInt(id);

  if (isNaN(conversationId)) {
    throw new ApiError(400, 'VALIDATION_ERROR', '无效的会话ID');
  }

  await ensureDBReady();
  await db.query(
    'DELETE FROM conversations WHERE id = ? AND user_id = ?',
    [conversationId, userId]
  );

  return ok(request, { message: '会话删除成功' });
});
