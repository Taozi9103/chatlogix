/**
 * 请求队列 - 支持 FIFO、并发控制、取消、超时、去重
 */

export interface QueueTask<T = any> {
  id: string;
  execute: () => Promise<T>;
  priority?: number;          // 数字越小优先级越高
  timeout?: number;           // 超时时间(ms)
  dedupKey?: string;          // 去重键，相同键的任务会被合并或拒绝
  onResolve?: (result: T) => void;
  onReject?: (error: Error) => void;
  signal?: AbortSignal;       // 用于取消
  createdAt: number;
}

interface QueueOptions {
  maxConcurrency?: number;     // 最大并发数
  retryCount?: number;         // 失败重试次数
  retryDelay?: number;         // 重试间隔(ms)
  timeout?: number;            // 默认超时(ms)
}

type QueueEvent = 'enqueue' | 'dequeue' | 'start' | 'complete' | 'error' | 'cancel' | 'drain';

type QueueListener = (event: QueueEvent, task?: QueueTask, error?: Error) => void;

export class RequestQueue {
  private tasks: QueueTask[] = [];
  private running = 0;
  private maxConcurrency: number;
  private retryCount: number;
  private retryDelay: number;
  private defaultTimeout: number;
  private dedupMap = new Map<string, string>();  // dedupKey -> taskId
  private completedCount = 0;
  private totalCount = 0;
  private listeners = new Map<QueueEvent, Set<QueueListener>>();
  private paused = false;

  constructor(options: QueueOptions = {}) {
    this.maxConcurrency = options.maxConcurrency ?? 1;
    this.retryCount = options.retryCount ?? 0;
    this.retryDelay = options.retryDelay ?? 1000;
    this.defaultTimeout = options.timeout ?? 30000;
  }

  // ==================== 事件系统 ====================

  on(event: QueueEvent, listener: QueueListener): () => void {
    const set = this.listeners.get(event);
    if (!set) {
      const newSet = new Set<QueueListener>();
      this.listeners.set(event, newSet);
      newSet.add(listener);
    } else {
      set.add(listener);
    }
    return () => {
      const s = this.listeners.get(event);
      if (s) s.delete(listener);
    };
  }

  private emit(event: QueueEvent, task?: QueueTask, error?: Error) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((fn) => fn(event, task, error));
    }
  }

  // ==================== 任务入队 ====================

  enqueue<T>(task: Omit<QueueTask<T>, 'createdAt'>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const fullTask: QueueTask<T> = {
        ...task,
        createdAt: Date.now(),
        onResolve: (result: any) => {
          resolve(result);
          task.onResolve?.(result);
        },
        onReject: (error: Error) => {
          reject(error);
          task.onReject?.(error);
        },
      };

      // 去重检查
      if (fullTask.dedupKey) {
        const existingId = this.dedupMap.get(fullTask.dedupKey);
        if (existingId) {
          // 存在相同任务，拒绝新任务
          const err = new Error(`重复请求已存在 (key: ${fullTask.dedupKey})`);
          if (fullTask.onReject) fullTask.onReject(err);
          return;
        }
        this.dedupMap.set(fullTask.dedupKey, fullTask.id);
      }

      // 按优先级插入
      const insertIndex = this.tasks.findIndex(
        (t) => (t.priority ?? 5) > (fullTask.priority ?? 5)
      );
      if (insertIndex === -1) {
        this.tasks.push(fullTask);
      } else {
        this.tasks.splice(insertIndex, 0, fullTask);
      }

      this.totalCount++;
      this.emit('enqueue', fullTask);
      this.processNext();
    });
  }

  // ==================== 任务处理 ====================

  private processNext(): void {
    if (this.paused) return;
    if (this.running >= this.maxConcurrency) return;
    if (this.tasks.length === 0) {
      if (this.running === 0) {
        this.emit('drain');
      }
      return;
    }

    // 检查是否有被取消的任务在队列头部
    while (this.tasks.length > 0) {
      const nextTask = this.tasks[0];
      if (nextTask.signal?.aborted) {
        this.tasks.shift();
        this.removeDedupKey(nextTask);
        this.emit('cancel', nextTask);
        nextTask.onReject?.(new Error('请求已取消'));
      } else {
        break;
      }
    }

    if (this.tasks.length === 0) {
      this.emit('drain');
      return;
    }

    const task = this.tasks.shift()!;
    this.running++;
    this.emit('start', task);

    this.runTask(task, 0);
  }

  private async runTask(task: QueueTask, attempt: number) {
    const timeout = task.timeout ?? this.defaultTimeout;
    const controller = new AbortController();
    const signal = task.signal;

    // 如果外部 signal 已中止，直接取消
    if (signal?.aborted) {
      this.finalizeTask(task, undefined, new Error('请求已取消'));
      return;
    }

    // 监听外部 signal
    const onAbort = () => {
      controller.abort();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const timeoutId = setTimeout(() => {
      controller.abort(new DOMException('请求超时', 'TimeoutError'));
    }, timeout);

    try {
      // 包装原始 execute 使之支持 AbortSignal
      const result = await Promise.race([
        task.execute(),
        new Promise<never>((_resolve, rejectFn) => {
          controller.signal.addEventListener('abort', () => {
            rejectFn(controller.signal.reason || new Error('请求已取消'));
          }, { once: true });
        }),
      ]);

      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      this.finalizeTask(task, result, undefined);
    } catch (error: any) {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);

      const shouldRetry =
        attempt < this.retryCount &&
        !(error instanceof DOMException && error.name === 'AbortError') &&
        !signal?.aborted;

      if (shouldRetry) {
        await new Promise((r) => setTimeout(r, this.retryDelay));
        this.runTask(task, attempt + 1);
      } else {
        this.finalizeTask(task, undefined, error);
      }
    }
  }

  private finalizeTask(task: QueueTask, result?: any, error?: Error) {
    this.running--;
    this.completedCount++;
    this.removeDedupKey(task);

    if (error) {
      this.emit('error', task, error);
      task.onReject?.(error);
    } else {
      this.emit('complete', task);
      task.onResolve?.(result);
    }

    this.processNext();
  }

  private removeDedupKey(task: QueueTask) {
    if (task.dedupKey) {
      this.dedupMap.delete(task.dedupKey);
    }
  }

  // ==================== 控制方法 ====================

  /** 暂停队列处理 */
  pause() {
    this.paused = true;
  }

  /** 恢复队列处理 */
  resume() {
    this.paused = false;
    this.processNext();
  }

  /** 取消指定任务 */
  cancel(taskId: string) {
    const index = this.tasks.findIndex((t) => t.id === taskId);
    if (index !== -1) {
      const task = this.tasks.splice(index, 1)[0];
      this.removeDedupKey(task);
      this.emit('cancel', task);
      task.onReject?.(new Error('请求已取消'));
    }
  }

  /** 取消所有等待中的任务 */
  cancelAll() {
    const pending = [...this.tasks];
    this.tasks = [];
    this.dedupMap.clear();
    pending.forEach((task) => {
      this.emit('cancel', task);
      task.onReject?.(new Error('请求已取消'));
    });
  }

  /** 取消特定 conversation 的所有任务 */
  cancelByConversation(conversationId: number | string) {
    const prefix = `conv_${conversationId}`;
    const toRemove = this.tasks.filter(
      (t) => t.dedupKey?.startsWith(prefix)
    );
    toRemove.forEach((t) => this.cancel(t.id));
  }

  /** 清空队列 */
  clear() {
    this.cancelAll();
  }

  // ==================== 状态查询 ====================

  get pendingCount() {
    return this.tasks.length;
  }

  get runningCount() {
    return this.running;
  }

  get isPaused() {
    return this.paused;
  }

  get stats() {
    return {
      pending: this.pendingCount,
      running: this.runningCount,
      completed: this.completedCount,
      total: this.totalCount,
      paused: this.paused,
    };
  }
}

// ==================== 全局单例 ====================

let globalQueue: RequestQueue | null = null;

export function getGlobalQueue(): RequestQueue {
  if (!globalQueue) {
    globalQueue = new RequestQueue({
      maxConcurrency: 1,      // 一次只发一个请求
      retryCount: 0,          // 不自动重试
      timeout: 60000,         // 60秒超时
    });
  }
  return globalQueue;
}

export function resetGlobalQueue() {
  if (globalQueue) {
    globalQueue.clear();
    globalQueue = null;
  }
}
