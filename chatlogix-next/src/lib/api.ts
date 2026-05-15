import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

export type ApiOk<T> = {
  success: true;
  data: T;
  requestId?: string;
};

export type ApiErr = {
  success: false;
  error: {
    code: string;
    message: string;
    detail?: unknown;
  };
  requestId?: string;
};

export class ApiError extends Error {
  status: number;
  code: string;
  detail?: unknown;

  constructor(status: number, code: string, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export function getRequestId(req: NextRequest) {
  return req.headers.get('x-request-id') || undefined;
}

export function ok<T>(req: NextRequest, data: T, init?: ResponseInit) {
  const body: ApiOk<T> = { success: true, data, requestId: getRequestId(req) };
  return NextResponse.json(body, init);
}

export function fail(req: NextRequest, error: ApiErr['error'], init?: ResponseInit) {
  const body: ApiErr = { success: false, error, requestId: getRequestId(req) };
  return NextResponse.json(body, init);
}

export async function parseJson(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, 'BAD_JSON', '请求体不是合法 JSON');
  }
}

export function requireUser(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) {
    throw new ApiError(401, 'UNAUTHORIZED', '未授权');
  }
  if (user.userId == null || Number.isNaN(Number(user.userId))) {
    throw new ApiError(401, 'UNAUTHORIZED', 'token 中缺少有效用户 id');
  }
  return user;
}

export function withApi<TContext extends Record<string, any> = any>(
  handler: (req: NextRequest, ctx: TContext) => Promise<Response> | Response
) {
  return async (req: NextRequest, ctx: TContext) => {
    try {
      return await handler(req, ctx);
    } catch (e: any) {
      if (e instanceof ApiError) {
        return fail(
          req,
          { code: e.code, message: e.message, detail: e.detail },
          { status: e.status }
        );
      }
      const message = typeof e?.message === 'string' ? e.message : '内部错误';
      return fail(req, { code: 'INTERNAL_ERROR', message }, { status: 500 });
    }
  };
}
