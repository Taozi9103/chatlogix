import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { generateIdempotencyKey } from './idempotency';
import { getGlobalQueue } from './requestQueue';

// 默认 axios 实例
const http: AxiosInstance = axios.create();

http.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers = config.headers || {};
      if (!('Authorization' in config.headers)) {
        (config.headers as any).Authorization = `Bearer ${token}`;
      }
    }
  }
  return config;
});

/**
 * 发送请求时自动带上幂等键
 */
export async function requestWithIdempotency<T = any>(
  config: AxiosRequestConfig & { idempotencyKey?: string; skipIdempotency?: boolean }
): Promise<AxiosResponse<T>> {
  // 只对写操作加幂等键
  const method = (config.method || 'get').toLowerCase();
  if (!config.skipIdempotency && ['post', 'put', 'patch', 'delete'].includes(method)) {
    config.headers = {
      ...config.headers,
      'X-Idempotency-Key': config.idempotencyKey || generateIdempotencyKey(),
    };
  }
  return http.request<T>(config);
}

/**
 * 通过请求队列发送（仅用于写操作，如发送消息）
 * 自动处理去重：相同 conversationId + 相同内容的请求会被去重
 */
export function enqueueRequest<T = any>(
  config: AxiosRequestConfig & {
    dedupKey?: string;
    priority?: number;
    signal?: AbortSignal;
  }
): Promise<AxiosResponse<T>> {
  const queue = getGlobalQueue();
  const method = (config.method || 'get').toLowerCase();
  const isWrite = ['post', 'put', 'patch', 'delete'].includes(method);

  // 生成去重键
  const dedupKey = config.dedupKey || (
    isWrite
      ? `req_${config.url}_${JSON.stringify(config.data || {})}`
      : undefined
  );

  const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  return queue.enqueue<AxiosResponse<T>>({
    id: taskId,
    dedupKey,
    priority: config.priority ?? 5,
    signal: config.signal,
    timeout: config.timeout ?? 60000,
    execute: async () => {
      const finalConfig: AxiosRequestConfig = { ...config };

      // 写操作自动加幂等键
      if (isWrite) {
        finalConfig.headers = {
          ...finalConfig.headers,
          'X-Idempotency-Key': generateIdempotencyKey(),
        };
      }

      // 加 token
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) {
          finalConfig.headers = {
            ...finalConfig.headers,
            Authorization: `Bearer ${token}`,
          };
        }
      }

      return http.request<T>(finalConfig);
    },
  });
}

export default http;
