import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PY_BASE = process.env.PY_SERVICE_URL || 'http://127.0.0.1:8002';

export async function POST(request: NextRequest) {
  const url = new URL('/v1/chat/stream', PY_BASE);
  const q = request.nextUrl.search;
  if (q) url.search = q;

  const auth = request.headers.get('authorization');
  const rid = request.headers.get('x-request-id');

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'accept': 'text/event-stream',
  };
  if (auth) headers['authorization'] = auth;
  if (rid) headers['x-request-id'] = rid;

  try {
    const upstream = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: await request.text(),
    });

    if (!upstream.body) {
      return new Response('No body', { status: 502 });
    }

    // 使用 ReadableStream 逐块传递，避免 Next.js 缓冲
    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });

    return new Response(stream, {
      status: upstream.status,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
        'connection': 'keep-alive',
      },
    });
  } catch (e: any) {
    const requestId = rid || '';
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'PY_UNAVAILABLE',
          message: 'Python 服务不可用',
          detail: { baseUrl: PY_BASE, cause: e?.cause?.code || e?.code || String(e) },
        },
        requestId,
      }),
      {
        status: 502,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          ...(requestId ? { 'x-request-id': requestId } : {}),
        },
      }
    );
  }
}
