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
    req.user = {
      ...decoded,
      userId: decoded.userId ?? decoded.id,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'token 无效或已过期' });
  }
};

// 获取会话列表
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const db = req.app.locals.db;

  if (userId == null || Number.isNaN(Number(userId))) {
    return res.status(401).json({ error: 'token 中缺少有效用户 id' });
  }

  try {
    const [conversations] = await db.query(
      'SELECT id, title, role_id as roleId, created_at as createdAt, updated_at as updatedAt FROM conversations WHERE user_id = ? ORDER BY COALESCE(updated_at, created_at) DESC, id DESC',
      [userId]
    );
    res.json({ success: true, conversations });
  } catch (err) {
    console.error('获取会话列表失败:', err);
    res.status(500).json({
      error: '获取会话列表失败',
      detail: err.message,
      code: err.code,
    });
  }
});

// 创建新会话
router.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const db = req.app.locals.db;
  const { title = '新对话', roleId = 'assistant' } = req.body;
  
  try {
    const [result] = await db.query(
      'INSERT INTO conversations (user_id, title, role_id) VALUES (?, ?, ?)',
      [userId, title, roleId]
    );
    
    res.status(201).json({
      success: true,
      conversation: {
        id: result.insertId,
        title,
        roleId,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('创建会话失败:', err);
    res.status(500).json({ error: '创建会话失败' });
  }
});

// 获取会话详情（带分页消息）
router.get('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const db = req.app.locals.db;
  const conversationId = parseInt(req.params.id);
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const offset = (page - 1) * pageSize;
  
  if (isNaN(conversationId)) {
    return res.status(400).json({ error: '无效的会话ID' });
  }
  
  try {
    const [conversationResult] = await db.query(
      'SELECT id, title, role_id as roleId, created_at as createdAt FROM conversations WHERE id = ? AND user_id = ?',
      [conversationId, userId]
    );
    
    const conversation = conversationResult[0];
    if (!conversation) {
      return res.status(404).json({ error: '会话不存在' });
    }
    
    const [messages] = await db.query(
      'SELECT id, role, content, created_at as createdAt FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [conversationId, pageSize, offset]
    );
    
    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM messages WHERE conversation_id = ?',
      [conversationId]
    );
    
    const total = countResult[0].total;
    
    res.json({
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
  } catch (err) {
    console.error('获取会话详情失败:', err);
    res.status(500).json({ error: '获取会话详情失败' });
  }
});

// 更新会话标题
router.put('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const db = req.app.locals.db;
  const conversationId = parseInt(req.params.id);
  const { title } = req.body;
  
  if (isNaN(conversationId)) {
    return res.status(400).json({ error: '无效的会话ID' });
  }
  
  if (!title) {
    return res.status(400).json({ error: '标题不能为空' });
  }
  
  try {
    await db.query(
      'UPDATE conversations SET title = ? WHERE id = ? AND user_id = ?',
      [title, conversationId, userId]
    );
    
    res.json({ success: true, message: '会话标题更新成功' });
  } catch (err) {
    console.error('更新会话失败:', err);
    res.status(500).json({ error: '更新会话失败' });
  }
});

// 删除会话
router.delete('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const db = req.app.locals.db;
  const conversationId = parseInt(req.params.id);
  
  if (isNaN(conversationId)) {
    return res.status(400).json({ error: '无效的会话ID' });
  }
  
  try {
    await db.query(
      'DELETE FROM conversations WHERE id = ? AND user_id = ?',
      [conversationId, userId]
    );
    
    res.json({ success: true, message: '会话删除成功' });
  } catch (err) {
    console.error('删除会话失败:', err);
    res.status(500).json({ error: '删除会话失败' });
  }
});

module.exports = router;