import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import db from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const userId = user.userId;
  const conversationId = parseInt(params.id);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
  const offset = (page - 1) * pageSize;

  if (isNaN(conversationId)) {
    return NextResponse.json({ error: '无效的会话ID' }, { status: 400 });
  }

  try {
    const [conversationResult]: any = await db.query(
      'SELECT id, title, role_id as roleId, created_at as createdAt FROM conversations WHERE id = ? AND user_id = ?',
      [conversationId, userId]
    );

    const conversation = conversationResult[0];
    if (!conversation) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 });
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

    return NextResponse.json({
      success: true,
      conversation,
      messages: messages.reverse(),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err: any) {
    console.error('获取会话详情失败:', err);
    return NextResponse.json({ error: '获取会话详情失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const userId = user.userId;
  const conversationId = parseInt(params.id);
  const { title } = await request.json();

  if (isNaN(conversationId)) {
    return NextResponse.json({ error: '无效的会话ID' }, { status: 400 });
  }

  if (!title) {
    return NextResponse.json({ error: '标题不能为空' }, { status: 400 });
  }

  try {
    await db.query(
      'UPDATE conversations SET title = ? WHERE id = ? AND user_id = ?',
      [title, conversationId, userId]
    );

    return NextResponse.json({ success: true, message: '会话标题更新成功' });
  } catch (err: any) {
    console.error('更新会话失败:', err);
    return NextResponse.json({ error: '更新会话失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const userId = user.userId;
  const conversationId = parseInt(params.id);

  if (isNaN(conversationId)) {
    return NextResponse.json({ error: '无效的会话ID' }, { status: 400 });
  }

  try {
    await db.query(
      'DELETE FROM conversations WHERE id = ? AND user_id = ?',
      [conversationId, userId]
    );

    return NextResponse.json({ success: true, message: '会话删除成功' });
  } catch (err: any) {
    console.error('删除会话失败:', err);
    return NextResponse.json({ error: '删除会话失败' }, { status: 500 });
  }
}
