import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import db from '@/lib/db';

export async function GET(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const userId = user.userId;

  if (userId == null || Number.isNaN(Number(userId))) {
    return NextResponse.json({ error: 'token 中缺少有效用户 id' }, { status: 401 });
  }

  try {
    const [conversations]: any = await db.query(
      'SELECT id, title, role_id as roleId, created_at as createdAt, updated_at as updatedAt FROM conversations WHERE user_id = ? ORDER BY COALESCE(updated_at, created_at) DESC, id DESC',
      [userId]
    );
    return NextResponse.json({ success: true, conversations });
  } catch (err: any) {
    console.error('获取会话列表失败:', err);
    return NextResponse.json({
      error: '获取会话列表失败',
      detail: err.message,
      code: err.code,
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const userId = user.userId;
  const { title = '新对话', roleId = 'assistant' } = await request.json();

  try {
    const [result]: any = await db.query(
      'INSERT INTO conversations (user_id, title, role_id) VALUES (?, ?, ?)',
      [userId, title, roleId]
    );

    return NextResponse.json({
      success: true,
      conversation: {
        id: result.insertId,
        title,
        roleId,
        createdAt: new Date().toISOString(),
      },
    }, { status: 201 });
  } catch (err: any) {
    console.error('创建会话失败:', err);
    return NextResponse.json({ error: '创建会话失败' }, { status: 500 });
  }
}
