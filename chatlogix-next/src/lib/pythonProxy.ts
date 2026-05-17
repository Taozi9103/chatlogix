import { NextRequest } from 'next/server';

const PY_BASE = process.env.PY_SERVICE_URL || 'http://127.0.0.1:8002';

export function pythonUrl(path: string, req?: NextRequest) {
  const url = new URL(path, PY_BASE);
  if (req) {
    const q = req.nextUrl.search;
    if (q) url.search = q;
  }
  return url;
}

export async function forwardJson(req: NextRequest, path: string) {
  const url = pythonUrl(path, req);
  const headers = new Headers();
  const auth = req.headers.get('authorization');
  const rid = req.headers.get('x-request-id');
  if (auth) headers.set('authorization', auth);
  if (rid) headers.set('x-request-id', rid);
  headers.set('content-type', 'application/json');

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }

  try {
    const upstream = await fetch(url, init);
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'x-request-id': upstream.headers.get('x-request-id') || rid || '',
      },
    });
  } catch (e: any) {
    const causeCode = e?.cause?.code || e?.code;
    const requestId = rid || '';
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'PY_UNAVAILABLE',
          message: 'Python 服务不可用',
          detail: { baseUrl: PY_BASE, cause: causeCode || String(e) },
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

export async function forwardStream(req: NextRequest, path: string) {
  const url = pythonUrl(path, req);
  const headers = new Headers();
  const auth = req.headers.get('authorization');
  const rid = req.headers.get('x-request-id');
  if (auth) headers.set('authorization', auth);
  if (rid) headers.set('x-request-id', rid);
  headers.set('content-type', 'application/json');
  headers.set('accept', 'text/event-stream');

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: await req.text(),
    });

    // 使用 TransformStream 逐块传递数据，避免 Next.js 缓冲整个响应
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // 在后台异步读取上游流并写入 writer
    (async () => {
      try {
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(encoder.encode(decoder.decode(value, { stream: true })));
        }
        await writer.close();
      } catch (e) {
        try { await writer.close(); } catch (_) {}
      }
    })();

    return new Response(readable, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
      },
    });
  } catch (e: any) {
    const causeCode = e?.cause?.code || e?.code;
    const requestId = req.headers.get('x-request-id') || '';
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'PY_UNAVAILABLE',
          message: 'Python 服务不可用',
          detail: { baseUrl: PY_BASE, cause: causeCode || String(e) },
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
