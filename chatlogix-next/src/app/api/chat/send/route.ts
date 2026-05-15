import { NextRequest } from 'next/server';
import db, { ensureDBReady } from '@/lib/db';
import { getRoleById } from '@/lib/roles';
import { ApiError, ok, parseJson, requireUser, withApi } from '@/lib/api';

export const POST = withApi(async (request: NextRequest) => {
  const user = requireUser(request);
  const body = await parseJson(request);
  const message = typeof body?.message === 'string' ? body.message : '';
  const conversationId = body?.conversationId;
  const roleId = typeof body?.roleId === 'string' ? body.roleId : 'assistant';
  const userId = user.userId;

  if (!message) {
    throw new ApiError(400, 'VALIDATION_ERROR', '消息不能为空');
  }

  await ensureDBReady();
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
    throw new ApiError(502, 'MODEL_ERROR', data.error?.message || 'DeepSeek API 调用失败');
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

  return ok(request, { reply, conversationId: convId });
});
