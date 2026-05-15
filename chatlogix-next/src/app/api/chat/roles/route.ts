import { NextResponse } from 'next/server';
import { getAllRoles } from '@/lib/roles';

export async function GET() {
  try {
    const roles = getAllRoles();
    return NextResponse.json({ roles });
  } catch (err: any) {
    console.error('获取角色列表失败:', err);
    return NextResponse.json({ error: '获取角色列表失败', detail: err.message }, { status: 500 });
  }
}
