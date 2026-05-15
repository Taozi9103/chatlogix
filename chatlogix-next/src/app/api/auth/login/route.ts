import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db, { ensureDBReady } from '@/lib/db';
import { ApiError, ok, parseJson, withApi } from '@/lib/api';

export const POST = withApi(async (request) => {
  const body = await parseJson(request);
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!username || !password) {
    throw new ApiError(400, 'VALIDATION_ERROR', '用户名和密码不能为空');
  }

  await ensureDBReady();
  const [results]: any = await db.query('SELECT * FROM users WHERE username = ?', [username]);
  if (!results?.length) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
  }

  const user = results[0];
  const isValidPassword = bcrypt.compareSync(password, user.password);
  if (!isValidPassword) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );

  return ok(request, {
    token,
    user: { userId: user.id, username: user.username },
  });
});
