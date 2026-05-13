const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
  const { username, password } = req.body;
  const db = req.app.locals.db;
  
  if (!username || !password) {
    return res.json({ code: 400, msg: '用户名和密码不能为空' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  
  try {
    const [result] = await db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
    res.json({ code: 200, msg: '注册成功', data: { userId: result.insertId, username } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.json({ code: 409, msg: '用户名已存在' });
    }
    return res.json({ code: 500, msg: '注册失败', error: err.message });
  }
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  const db = req.app.locals.db;
  
  if (!username || !password) {
    return res.json({ code: 400, msg: '用户名和密码不能为空' });
  }

  try {
    const [results] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    
    if (results.length === 0) {
      return res.json({ code: 401, msg: '用户名或密码错误' });
    }
    
    const user = results[0];
    const isValidPassword = bcrypt.compareSync(password, user.password);
    
    if (!isValidPassword) {
      return res.json({ code: 401, msg: '用户名或密码错误' });
    }
    
    const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
    
    res.json({ code: 200, msg: '登录成功', data: { token, userId: user.id, username: user.username } });
  } catch (err) {
    return res.json({ code: 500, msg: '登录失败', error: err.message });
  }
};