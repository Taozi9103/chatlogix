require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

// 路由
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const conversationRoutes = require('./routes/conversation');

const app = express();

// 中间件
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// MySQL 连接池（全局可用）
const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

// 初始化数据库和表
async function initDB() {
  try {
    // 创建数据库
    await db.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
    await db.query(`USE ${process.env.DB_NAME}`);
    
    // 创建用户表
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(100) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 创建会话表
    await db.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(100) DEFAULT '新对话',
        role_id VARCHAR(50) DEFAULT 'assistant',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 旧库可能缺列，补全后列表接口的 SELECT / ORDER BY 才能执行
    const isDupColumn = (e) => e.errno === 1060 || e.code === 'ER_DUP_FIELDNAME';
    try {
      await db.query(
        "ALTER TABLE conversations ADD COLUMN role_id VARCHAR(50) DEFAULT 'assistant'"
      );
    } catch (e) {
      if (!isDupColumn(e)) throw e;
    }
    try {
      await db.query(
        'ALTER TABLE conversations ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
      );
    } catch (e) {
      if (!isDupColumn(e)) throw e;
    }
    
    // 创建消息表
    await db.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT,
        user_id INT NOT NULL,
        role ENUM('user', 'assistant') NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `);
    
    // 如果没有会话，创建一个默认会话
    const [convResult] = await db.query(`SELECT COUNT(*) as count FROM conversations`);
    if (convResult[0].count === 0) {
      await db.query(`
        INSERT INTO conversations (user_id, title) 
        SELECT id, '默认会话' FROM users LIMIT 1
      `);
    }
    
    // 将没有 conversation_id 的消息关联到第一个会话
    await db.query(`
      UPDATE messages 
      SET conversation_id = (SELECT id FROM conversations LIMIT 1) 
      WHERE conversation_id IS NULL
    `);
    
    console.log('✅ 数据库初始化成功');
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err);
    process.exit(1);
  }
}

// 将 db 挂载到 app，方便路由使用
app.locals.db = db;

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/conversations', conversationRoutes);

// 先完成库表迁移再监听，避免首包请求打到未就绪的表结构
const PORT = process.env.PORT || 5001;
(async () => {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`🚀 后端服务运行在 http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error('服务启动失败:', e);
    process.exit(1);
  }
})();