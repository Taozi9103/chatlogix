import os
from dataclasses import dataclass

import jwt


@dataclass(frozen=True)
class User:
    user_id: int
    username: str | None = None


class AuthError(Exception):
    pass


def _secret() -> str:
    value = os.getenv("JWT_SECRET")
    if not value:
        raise RuntimeError("Missing required env: JWT_SECRET")
    return value


def verify_bearer_token(auth_header: str | None) -> User:
    if not auth_header:
        raise AuthError("未授权")
    parts = auth_header.split(" ")
    if len(parts) != 2 or parts[0] != "Bearer" or not parts[1]:
        raise AuthError("未授权")

    token = parts[1]
    try:
        payload = jwt.decode(token, _secret(), algorithms=["HS256"])
    except Exception:
        raise AuthError("token 无效或已过期")

    user_id = payload.get("userId") or payload.get("id")
    if user_id is None:
        raise AuthError("token 中缺少有效用户 id")
    return User(user_id=int(user_id), username=payload.get("username"))

