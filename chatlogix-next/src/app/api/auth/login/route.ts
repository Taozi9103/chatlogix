import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '@/lib/db';

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ code: 400, msg: '用户名和密码不能为空' });
  }

  try {
    const [results]: any = await db.query('SELECT * FROM users WHERE username = ?', [username]);

    if (results.length === 0) {
      return NextResponse.json({ code: 401, msg: '用户名或密码错误' });
    }

    const user = results[0];
    const isValidPassword = bcrypt.compareSync(password, user.password);

    if (!isValidPassword) {
      return NextResponse.json({ code: 401, msg: '用户名或密码错误' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET!, { expiresIn: '1h' });

    return NextResponse.json({ code: 200, msg: '登录成功', data: { token, userId: user.id, username: user.username } });
  } catch (err: any) {
    return NextResponse.json({ code: 500, msg: '登录失败', error: err.message });
  }
}
