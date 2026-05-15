import { NextResponse } from 'next/server';
import { initDB } from '@/lib/db';

export async function GET() {
  try {
    await initDB();
    return NextResponse.json({ success: true, message: '数据库初始化成功' });
  } catch (err: any) {
    console.error('数据库初始化失败:', err);
    return NextResponse.json(
      { success: false, error: err.message || '数据库初始化失败' },
      { status: 500 }
    );
  }
}
