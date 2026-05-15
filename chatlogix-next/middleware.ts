import { NextRequest, NextResponse } from 'next/server';

function jsonError(requestId: string, status: number, code: string, message: string) {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
      requestId,
    },
    { status }
  );
}

function needsAuth(pathname: string) {
  if (!pathname.startsWith('/api/')) return false;
  if (pathname === '/api/auth/login') return false;
  if (pathname === '/api/auth/register') return false;
  if (pathname === '/api/chat/roles') return false;
  if (pathname === '/api/init-db') return false;
  return true;
}

export function middleware(req: NextRequest) {
  const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const headers = new Headers(req.headers);
  headers.set('x-request-id', requestId);

  if (needsAuth(req.nextUrl.pathname)) {
    const auth = req.headers.get('authorization') || '';
    const parts = auth.split(' ');
    const ok = parts.length === 2 && parts[0] === 'Bearer' && Boolean(parts[1]);
    if (!ok) {
      return jsonError(requestId, 401, 'UNAUTHORIZED', '未授权');
    }
  }

  return NextResponse.next({
    request: {
      headers,
    },
  });
}

export const config = {
  matcher: ['/api/:path*'],
};

