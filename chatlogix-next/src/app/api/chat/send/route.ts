import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import db from '@/lib/db';
import { getRoleById } from '@/lib/roles';

export async function POST(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const { message, conversationId, roleId = 'assistant' } = await request.json();
  const userId = user.userId;

  if (!message) {
    return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
  }

  try {
    let convId = conversationId;

    if (!convId) {
      const [result]: any = await db.query(
        'INSERT INTO conversations (user_id, title, role_id) VALUES (?, ?, ?)',
        [userId, message.substring(0, 20) || '新对话', roleId]
      );
      convId = result.insertId;
    }

    await db.query(
      'INSERT INTO messages (conversation_id, user_id, role, content) VALUES (?, ?, ?, ?)',
      [convId, userId, 'user', message]
    );

    const [history]: any = await db.query(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10',
      [convId]
    );

    const chatHistory = history.reverse();
    const role = getRoleById(roleId);

    const apiMessages: any[] = [];
    if (role.systemPrompt) {
      apiMessages.push({ role: 'system', content: role.systemPrompt });
    }

    chatHistory.forEach((h: any) => {
      apiMessages.push({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content
      });
    });

    const response = await fetch(process.env.DEEPSEEK_API_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 2048,
        stream: false
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'DeepSeek API 调用失败');
    }

    const reply = data.choices[0].message.content;

    await db.query(
      'INSERT INTO messages (conversation_id, user_id, role, content) VALUES (?, ?, ?, ?)',
      [convId, userId, 'assistant', reply]
    );

    await db.query(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, role_id = ? WHERE id = ?',
      [roleId, convId]
    );

    return NextResponse.json({ success: true, reply, conversationId: convId });

  } catch (err: any) {
    console.error('发送消息失败:', err);
    return NextResponse.json({ error: err.message || '对话失败' }, { status: 500 });
  }
}
