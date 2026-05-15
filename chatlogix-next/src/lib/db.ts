import mysql from 'mysql2/promise';

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (value == null || value === '') {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

const DB_HOST = getRequiredEnv('DB_HOST');
const DB_USER = getRequiredEnv('DB_USER');
const DB_PASSWORD = getRequiredEnv('DB_PASSWORD');
const DB_NAME = getRequiredEnv('DB_NAME');
const DB_PORT = Number.parseInt(process.env.DB_PORT || '3306', 10);

const db = mysql.createPool({
  host: DB_HOST,
  port: Number.isFinite(DB_PORT) ? DB_PORT : 3306,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

export async function initDB() {
  try {
    await db.query(`CREATE DATABASE IF NOT EXISTS ${DB_NAME}`);
    await db.query(`USE ${DB_NAME}`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(100) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    const isDupColumn = (e: any) => e.errno === 1060 || e.code === 'ER_DUP_FIELDNAME';
    try {
      await db.query(
        "ALTER TABLE conversations ADD COLUMN role_id VARCHAR(50) DEFAULT 'assistant'"
      );
    } catch (e: any) {
      if (!isDupColumn(e)) throw e;
    }
    try {
      await db.query(
        'ALTER TABLE conversations ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
      );
    } catch (e: any) {
      if (!isDupColumn(e)) throw e;
    }

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

    const [convResult]: any = await db.query(`SELECT COUNT(*) as count FROM conversations`);
    if (convResult[0].count === 0) {
      await db.query(`
        INSERT INTO conversations (user_id, title) 
        SELECT id, '默认会话' FROM users LIMIT 1
      `);
    }

    await db.query(`
      UPDATE messages 
      SET conversation_id = (SELECT id FROM conversations LIMIT 1) 
      WHERE conversation_id IS NULL
    `);

    console.log('✅ 数据库初始化成功');
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err);
    throw err;
  }
}

export default db;
