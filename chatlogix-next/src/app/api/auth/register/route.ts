import bcrypt from 'bcryptjs';
import db, { ensureDBReady } from '@/lib/db';
import { ApiError, ok, parseJson, withApi } from '@/lib/api';

export const POST = withApi(async (request) => {
  const body = await parseJson(request);
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!username || !password) {
    throw new ApiError(400, 'VALIDATION_ERROR', '用户名和密码不能为空');
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  try {
    await ensureDBReady();
    const [result]: any = await db.query(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, hashedPassword]
    );
    return ok(request, { userId: result.insertId, username });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, 'DUPLICATE', '用户名已存在');
    }
    throw err;
  }
});
