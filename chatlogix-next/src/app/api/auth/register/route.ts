import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import db from '@/lib/db';

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ code: 400, msg: '用户名和密码不能为空' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  try {
    const [result]: any = await db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
    return NextResponse.json({ code: 200, msg: '注册成功', data: { userId: result.insertId, username } });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ code: 409, msg: '用户名已存在' });
    }
    return NextResponse.json({ code: 500, msg: '注册失败', error: err.message });
  }
}
