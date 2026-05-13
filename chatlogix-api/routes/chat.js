const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

// 验证 JWT 的中间件
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: '未授权' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'token 无效或已过期' });
  }
};

// 发送消息并调用 DeepSeek
router.post('/send', authMiddleware, async (req, res) => {
  const { message } = req.body;
  const userId = req.user.userId;
  const db = req.app.locals.db;
  
  if (!message) {
    return res.status(400).json({ error: '消息不能为空' });
  }
  
  try {
    // 1. 保存用户消息到数据库
    await db.query(
      'INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)',
      [userId, 'user', message]
    );
    
    // 2. 获取最近 10 条对话历史（作为上下文）
    const [history] = await db.query(
      `SELECT role, content FROM messages 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [userId]
    );
    
    // 反转顺序（时间从旧到新）
    const chatHistory = history.reverse();
    
    // 3. 构建 DeepSeek API 的消息格式
    const messages = chatHistory.map(h => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.content
    }));
    
    // 如果没有历史，至少要有当前消息
    if (messages.length === 0 || messages[messages.length-1].content !== message) {
      messages.push({ role: 'user', content: message });
    }
    
    // 4. 调用 DeepSeek API
    const response = await fetch(process.env.DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        stream: false
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'DeepSeek API 调用失败');
    }
    
    const reply = data.choices[0].message.content;
    
    // 5. 保存 AI 回复到数据库
    await db.query(
      'INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)',
      [userId, 'assistant', reply]
    );
    
    // 6. 返回回复给前端
    res.json({ reply });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || '对话失败' });
  }
});

// 获取对话历史
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
    console.error(err);
    res.status(500).json({ error: '获取历史失败' });
  }
});

module.exports = router;