"""
幂等性中间件
通过 X-Idempotency-Key 防止重复请求
"""
import time
from threading import Lock
from typing import Any, Optional


class IdempotencyStore:
    """
    幂等性缓存
    生产环境建议替换为 Redis
    """

    def __init__(self, ttl: int = 1800, cleanup_interval: int = 300):
        self._store: dict[str, dict] = {}
        self._lock = Lock()
        self._ttl = ttl  # 缓存 TTL（秒）
        self._last_cleanup = time.time()
        self._cleanup_interval = cleanup_interval

    def get(self, key: str) -> Optional[dict]:
        self._maybe_cleanup()
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            if time.time() - entry['timestamp'] > self._ttl:
                self._store.pop(key, None)
                return None
            return entry

    def set(self, key: str, status_code: int, body: Any):
        with self._lock:
            self._store[key] = {
                'status_code': status_code,
                'body': body,
                'timestamp': time.time(),
            }

    def set_processing(self, key: str):
        with self._lock:
            self._store[key] = {
                'status_code': 202,
                'body': {'status': 'processing'},
                'timestamp': time.time(),
            }

    def delete(self, key: str):
        with self._lock:
            self._store.pop(key, None)

    def _maybe_cleanup(self):
        now = time.time()
        if now - self._last_cleanup < self._cleanup_interval:
            return
        with self._lock:
            to_delete = [
                k for k, v in self._store.items()
                if now - v['timestamp'] > self._ttl
            ]
            for k in to_delete:
                self._store.pop(k, None)
            self._last_cleanup = now


# 全局幂等性存储
_idempotency_store = IdempotencyStore()


def check_idempotency(
    idempotency_key: Optional[str],
    user_id: Optional[int] = None,
) -> Optional[dict]:
    """
    检查幂等键是否已处理过
    返回已缓存的响应，或 None
    """
    if not idempotency_key:
        return None

    # 校验格式
    if not isinstance(idempotency_key, str) or len(idempotency_key) > 128:
        return None

    cache_key = f"{user_id or 'anonymous'}:{idempotency_key}"
    entry = _idempotency_store.get(cache_key)
    if entry:
        return entry
    return None


def mark_idempotency_processing(
    idempotency_key: Optional[str],
    user_id: Optional[int] = None,
) -> bool:
    """标记幂等键为处理中"""
    if not idempotency_key:
        return False

    cache_key = f"{user_id or 'anonymous'}:{idempotency_key}"
    _idempotency_store.set_processing(cache_key)
    return True


def save_idempotency_response(
    idempotency_key: Optional[str],
    status_code: int,
    body: Any,
    user_id: Optional[int] = None,
):
    """保存幂等键的响应结果"""
    if not idempotency_key:
        return

    # 只缓存成功响应
    if 200 <= status_code < 300:
        cache_key = f"{user_id or 'anonymous'}:{idempotency_key}"
        _idempotency_store.set(cache_key, status_code, body)


def delete_idempotency_key(
    idempotency_key: Optional[str],
    user_id: Optional[int] = None,
):
    """删除幂等键（失败时清理）"""
    if not idempotency_key:
        return
    cache_key = f"{user_id or 'anonymous'}:{idempotency_key}"
    _idempotency_store.delete(cache_key)
