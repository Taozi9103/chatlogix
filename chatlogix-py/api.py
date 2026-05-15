import json
import uuid
from dataclasses import dataclass
from datetime import datetime, date
from decimal import Decimal
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse


class _CustomEncoder(json.JSONEncoder):
    def default(self, o: Any) -> Any:
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)


class _CustomJSONResponse(JSONResponse):
    def render(self, content: Any) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
            cls=_CustomEncoder,
        ).encode("utf-8")


def request_id(req: Request) -> str:
    rid = req.headers.get("x-request-id")
    return rid or str(uuid.uuid4())


def ok(req: Request, data: Any, status_code: int = 200) -> _CustomJSONResponse:
    return _CustomJSONResponse(
        status_code=status_code,
        content={"success": True, "data": data, "requestId": request_id(req)},
    )


def fail(req: Request, code: str, message: str, status_code: int, detail: Any = None) -> _CustomJSONResponse:
    err: dict[str, Any] = {"code": code, "message": message}
    if detail is not None:
        err["detail"] = detail
    return _CustomJSONResponse(
        status_code=status_code,
        content={"success": False, "error": err, "requestId": request_id(req)},
    )


@dataclass(frozen=True)
class ApiError(Exception):
    status_code: int
    code: str
    message: str
    detail: Any = None


async def parse_json(req: Request) -> dict[str, Any]:
    try:
        body = await req.json()
    except Exception:
        raise ApiError(400, "BAD_JSON", "请求体不是合法 JSON")
    if not isinstance(body, dict):
        raise ApiError(400, "BAD_JSON", "请求体必须是 JSON 对象")
    return body
