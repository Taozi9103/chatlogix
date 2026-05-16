/**
 * 生成幂等键 (Idempotency-Key)
 * 用于防止重复请求
 */
export function generateIdempotencyKey(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  const counter = (globalThis as any).__idempotency_counter || 0;
  (globalThis as any).__idempotency_counter = counter + 1;
  return `ik_${timestamp}_${random}_${counter}`;
}

/**
 * 基于请求内容生成哈希作为幂等键
 * 用于相同内容的去重
 */
export async function contentBasedIdempotencyKey(
  method: string,
  url: string,
  body?: unknown
): Promise<string> {
  const content = `${method}:${url}:${body ? JSON.stringify(body) : ''}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `ik_${hashHex.substring(0, 32)}`;
}
