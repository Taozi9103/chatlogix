import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import db, { ensureDBReady } from '@/lib/db';
import { getRoleById } from '@/lib/roles';
import { fail } from '@/lib/api';

export async function POST(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return fail(request, { code: 'UNAUTHORIZED', message: '未授权' }, { status: 401 });
  }

  const { message, conversationId, roleId = 'assistant' } = await request.json();
  const userId = user.userId;

  if (!message) {
    return fail(request, { code: 'VALIDATION_ERROR', message: '消息不能为空' }, { status: 400 });
  }

  let convId = conversationId;

  try {
    await ensureDBReady();
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

    const upstream = await fetch(process.env.DEEPSEEK_API_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 2048,
        stream: true
      })
    });

    if (!upstream.ok) {
      let detail = '';
      try {
        detail = await upstream.text();
      } catch (_) {}
      return fail(
        request,
        {
          code: 'MODEL_ERROR',
          message: '模型服务错误',
          detail: { status: upstream.status, detail: detail.slice(0, 2000) },
        },
        { status: 502 }
      );
    }

    if (!upstream.body) {
      return fail(request, { code: 'MODEL_ERROR', message: '模型无流式响应体' }, { status: 500 });
    }

    const encoder = new TextEncoder();
    let fullResponse = '';
    let lineCarry = '';

    const finalizeAssistant = async () => {
      if (!fullResponse) return;
      await db.query(
        'INSERT INTO messages (conversation_id, user_id, role, content) VALUES (?, ?, ?, ?)',
        [convId, userId, 'assistant', fullResponse]
      );
      await db.query(
        'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, role_id = ? WHERE id = ?',
        [roleId, convId]
      );
    };

    const processUpstreamLine = (rawLine: string) => {
      const line = rawLine.replace(/\r$/, '').trim();
      if (!line.startsWith('data: ')) return 'continue';
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') return 'done';

      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        return 'continue';
      }

      if (json.error) {
        const msg =
          typeof json.error === 'string'
            ? json.error
            : json.error?.message || JSON.stringify(json.error);
        return { type: 'error', message: msg };
      }

      const content = json.choices?.[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        return { type: 'content', content, conversationId: convId };
      }
      return 'continue';
    };

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'meta', conversationId: convId })}\n\n`));

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            lineCarry += decoder.decode(value, { stream: true });
            const parts = lineCarry.split('\n');
            lineCarry = parts.pop() || '';

            for (const part of parts) {
              const r = processUpstreamLine(part);
              if (r === 'done') {
                await finalizeAssistant();
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
                return;
              }
              if (typeof r === 'object' && r.type === 'error') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: r.message })}\n\n`));
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
                return;
              }
              if (typeof r === 'object' && r.type === 'content') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(r)}\n\n`));
              }
            }
          }

          if (lineCarry.trim()) {
            const r = processUpstreamLine(lineCarry);
            if (r === 'done') {
              await finalizeAssistant();
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
              return;
            }
          }

          await finalizeAssistant();
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } finally {
          try {
            reader.releaseLock();
          } catch (_) {}
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no'
      }
    });

  } catch (err: any) {
    console.error('发送消息失败:', err);
    return new Response(JSON.stringify({ error: err.message || '对话失败' }), { status: 500 });
  }
}
