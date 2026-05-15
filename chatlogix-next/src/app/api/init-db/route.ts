import { NextRequest } from 'next/server';
import { initDB } from '@/lib/db';
import { ok, withApi } from '@/lib/api';

export const GET = withApi(async (request: NextRequest) => {
  await initDB();
  return ok(request, { message: '数据库初始化成功' });
});
