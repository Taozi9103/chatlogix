const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { getRoleById, getAllRoles } = require('../config/roles');

// 验证 JWT 的中间件
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: '未授权' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      ...decoded,
      userId: decoded.userId ?? decoded.id,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'token 无效或已过期' });
  }
};

// 获取角色列表（仅返回 { roles }，字段与 config/roles 对齐）
router.get('/roles', async (req, res) => {
  try {
    const roles = getAllRoles();
    res.json({ roles });
  } catch (err) {
    console.error('获取角色列表失败:', err);
    res.status(500).json({ error: '获取角色列表失败', detail: err.message });
  }
});

// 发送消息（非流式）
router.post('/send', authMiddleware, async (req, res) => {
  const { message, conversationId, roleId = 'assistant' } = req.body;
  const userId = req.user.userId;
  const db = req.app.locals.db;
  
  if (!message) {
    return res.status(400).json({ error: '消息不能为空' });
  }
  
  try {
    let convId = conversationId;
    
    // 如果没有会话ID，创建新会话
    if (!convId) {
      const [result] = await db.query(
        'INSERT INTO conversations (user_id, title, role_id) VALUES (?, ?, ?)',
        [userId, message.substring(0, 20) || '新对话', roleId]
      );
      convId = result.insertId;
    }
    
    // 保存用户消息
    await db.query(
      'INSERT INTO messages (conversation_id, user_id, role, content) VALUES (?, ?, ?, ?)',
      [convId, userId, 'user', message]
    );
    
    // 获取最近10条对话历史
    const [history] = await db.query(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10',
      [convId]
    );
    
    const chatHistory = history.reverse();
    const role = getRoleById(roleId);
    
    // 构建消息格式（包含系统提示词）
    const apiMessages = [];
    if (role.systemPrompt) {
      apiMessages.push({ role: 'system', content: role.systemPrompt });
    }
    
    chatHistory.forEach(h => {
      apiMessages.push({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content
      });
    });
    
    // 调用 DeepSeek API
    const response = await fetch(process.env.DEEPSEEK_API_URL, {
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
    
    // 保存AI回复
    await db.query(
      'INSERT INTO messages (conversation_id, user_id, role, content) VALUES (?, ?, ?, ?)',
      [convId, userId, 'assistant', reply]
    );
    
    // 更新会话
    await db.query(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, role_id = ? WHERE id = ?',
      [roleId, convId]
    );
    
    res.json({ success: true, reply, conversationId: convId });
    
  } catch (err) {
    console.error('发送消息失败:', err);
    res.status(500).json({ error: err.message || '对话失败' });
  }
});

// 发送消息（流式 SSE，下行 data: JSON 或 data: [DONE]）
router.post('/stream', authMiddleware, async (req, res) => {
  const { message, conversationId, roleId = 'assistant' } = req.body;
  const userId = req.user.userId;
  const db = req.app.locals.db;

  if (!message) {
    return res.status(400).json({ error: '消息不能为空' });
  }

  let convId = conversationId;

  try {
    if (!convId) {
      const [result] = await db.query(
        'INSERT INTO conversations (user_id, title, role_id) VALUES (?, ?, ?)',
        [userId, message.substring(0, 20) || '新对话', roleId]
      );
      convId = result.insertId;
    }

    await db.query(
      'INSERT INTO messages (conversation_id, user_id, role, content) VALUES (?, ?, ?, ?)',
      [convId, userId, 'user', message]
    );

    const [history] = await db.query(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10',
      [convId]
    );

    const chatHistory = history.reverse();
    const role = getRoleById(roleId);

    const apiMessages = [];
    if (role.systemPrompt) {
      apiMessages.push({ role: 'system', content: role.systemPrompt });
    }

    chatHistory.forEach((h) => {
      apiMessages.push({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content
      });
    });

    const upstream = await fetch(process.env.DEEPSEEK_API_URL, {
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
      return res.status(502).json({
        error: '模型服务错误',
        status: upstream.status,
        detail: detail.slice(0, 2000)
      });
    }

    if (!upstream.body) {
      return res.status(500).json({ error: '模型无流式响应体' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    });

    let clientClosed = false;
    req.on('close', () => {
      clientClosed = true;
    });

    const sendSse = (obj) => {
      if (clientClosed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    sendSse({ type: 'meta', conversationId: convId });

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

    const processUpstreamLine = (rawLine) => {
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
        sendSse({ error: msg });
        return 'error';
      }

      const content = json.choices?.[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        sendSse({ content, conversationId: convId });
      }
      return 'continue';
    };

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

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
            if (!clientClosed && !res.writableEnded) {
              res.write('data: [DONE]\n\n');
              res.end();
            }
            return;
          }
          if (r === 'error') {
            if (!clientClosed && !res.writableEnded) {
              res.write('data: [DONE]\n\n');
              res.end();
            }
            return;
          }
        }
      }

      if (lineCarry.trim()) {
        const r = processUpstreamLine(lineCarry);
        if (r === 'done') {
          await finalizeAssistant();
          if (!clientClosed && !res.writableEnded) {
            res.write('data: [DONE]\n\n');
            res.end();
          }
          return;
        }
      }

      await finalizeAssistant();
      if (!clientClosed && !res.writableEnded) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } finally {
      try {
        reader.releaseLock();
      } catch (_) {}
    }
  } catch (err) {
    console.error('发送消息失败:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || '对话失败' });
    } else if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: err.message || '对话失败' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});

// 获取对话历史（旧接口，兼容）
router.get('/history', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const db = req.app.locals.db;
  
  try {
    const [messages] = await db.query(
      'SELECT role, content, created_at FROM messages WHERE user_id = ? ORDER BY created_at ASC',
      [userId]
    );
    res.json({ messages });
  } catch (err) {
    console.error('获取历史失败:', err);
    res.status(500).json({ error: '获取历史失败' });
  }
});

module.exports = router;