import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

import bcrypt
import jwt

from pydantic import ValidationError as PydanticValidationError

from api import ApiError, fail, ok, parse_json
from auth import AuthError, verify_bearer_token
from chat_service import send_message as graph_send_message, stream_reply_messages
from db import ensure_schema_once, execute, query
from roles import all_roles
from schemas import (
    RegisterRequest,
    LoginRequest,
    SendMessageRequest,
    StreamMessageRequest,
    CreateConversationRequest,
    UpdateConversationRequest,
    CreateTagRequest,
    SetTagsRequest,
    PaginationParams,
)
from idempotency import (
    check_idempotency,
    mark_idempotency_processing,
    save_idempotency_response,
    delete_idempotency_key,
)

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


def get_query(req: Request, key: str, default: str = "") -> str:
    return str(req.query_params.get(key) or default)


app = FastAPI(title="ChatLogix Python Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ApiError)
async def _api_error_handler(request: Request, exc: ApiError):
    return fail(request, exc.code, exc.message, exc.status_code, detail=exc.detail)


@app.exception_handler(AuthError)
async def _auth_error_handler(request: Request, exc: AuthError):
    return fail(request, "UNAUTHORIZED", str(exc), 401)


@app.exception_handler(PydanticValidationError)
async def _pydantic_validation_handler(request: Request, exc: PydanticValidationError):
    errors = []
    for e in exc.errors():
        field = ".".join(str(x) for x in e.get("loc", []))
        msg = e.get("msg", "参数错误")
        errors.append({"field": field, "message": msg})
    return fail(
        request,
        "VALIDATION_ERROR",
        "参数校验失败",
        status_code=422,
        detail=errors,
    )


@app.get("/health")
async def health(request: Request):
    return ok(request, {"status": "ok"})


@app.get("/v1/init-db")
async def init_db(request: Request):
    ensure_schema_once()
    return ok(request, {"message": "数据库初始化成功"})


@app.get("/v1/chat/roles")
async def chat_roles(request: Request):
    return ok(request, {"roles": all_roles()})


@app.post("/v1/auth/register")
async def auth_register(request: Request, body: RegisterRequest):
    username = body.username.strip()
    password = body.password

    ensure_schema_once()

    existing = query("SELECT id FROM users WHERE username = %s", (username,)) or []
    if existing:
        raise ApiError(409, "DUPLICATE", "用户名已存在")

    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user_id = int(execute("INSERT INTO users (username, password) VALUES (%s, %s)", (username, hashed)))
    return ok(request, {"userId": user_id, "username": username})


@app.post("/v1/auth/login")
async def auth_login(request: Request, body: LoginRequest):
    username = body.username.strip()
    password = body.password

    ensure_schema_once()

    rows = query("SELECT id, username, password FROM users WHERE username = %s", (username,)) or []
    if not rows:
        raise ApiError(401, "INVALID_CREDENTIALS", "用户名或密码错误")

    user = rows[0]
    stored = str(user.get("password") or "")
    try:
        ok_pwd = bcrypt.checkpw(password.encode("utf-8"), stored.encode("utf-8"))
    except Exception:
        ok_pwd = False
    if not ok_pwd:
        raise ApiError(401, "INVALID_CREDENTIALS", "用户名或密码错误")

    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise ApiError(500, "CONFIG_ERROR", "JWT_SECRET 未配置")

    import datetime as dt

    token = jwt.encode(
        {
            "userId": int(user["id"]),
            "username": user["username"],
            "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1),
        },
        secret,
        algorithm="HS256",
    )

    return ok(request, {"token": token, "user": {"userId": int(user["id"]), "username": user["username"]}})


@app.post("/v1/chat/send")
async def chat_send(request: Request, body: SendMessageRequest):
    user = verify_bearer_token(request.headers.get("authorization"))

    ensure_schema_once()
    result = graph_send_message(
        user_id=user.user_id,
        message=body.message,
        conversation_id=body.conversationId,
        role_id=body.roleId,
    )
    return ok(request, result)


@app.post("/v1/chat/stream")
async def chat_stream(request: Request, body: StreamMessageRequest):
    user = verify_bearer_token(request.headers.get("authorization"))

    conv_id: int
    if body.conversationId:
        conv_id = int(body.conversationId)
    else:
        conv_id = int(
            execute(
                "INSERT INTO conversations (user_id, title, role_id) VALUES (%s, %s, %s)",
                (user.user_id, (body.message[:20] or "新对话"), body.roleId),
            )
        )

    execute(
        "INSERT INTO messages (conversation_id, user_id, role, content) VALUES (%s, %s, %s, %s)",
        (conv_id, user.user_id, "user", body.message),
    )

    rows = query(
        "SELECT role, content FROM messages WHERE conversation_id = %s ORDER BY created_at DESC LIMIT 10",
        (conv_id,),
    )
    history = list(reversed(rows or []))

    async def gen():
        import asyncio
        yield f"data: {json_dumps({'type': 'meta', 'conversationId': conv_id})}\n\n"
        await asyncio.sleep(0)
        full = ""
        try:
            async for token in stream_reply_messages(role_id=body.roleId, history=history):
                full += token
                yield f"data: {json_dumps({'content': token, 'conversationId': conv_id})}\n\n"
                await asyncio.sleep(0)
        except Exception as e:
            yield f"data: {json_dumps({'error': str(e)})}\n\n"
            await asyncio.sleep(0)
        finally:
            if full:
                execute(
                    "INSERT INTO messages (conversation_id, user_id, role, content) VALUES (%s, %s, %s, %s)",
                    (conv_id, user.user_id, "assistant", full),
                )
                execute(
                    "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, role_id = %s WHERE id = %s",
                    (body.roleId, conv_id),
                )
            yield "data: [DONE]\n\n"
            await asyncio.sleep(0)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


def json_dumps(obj: Any) -> str:
    import json

    return json.dumps(obj, ensure_ascii=False)


@app.get("/v1/conversations")
async def conversations_list(request: Request):
    user = verify_bearer_token(request.headers.get("authorization"))
    ensure_schema_once()

    tag_id_raw = request.query_params.get("tagId")
    favorite_raw = request.query_params.get("favorite")
    page = int(request.query_params.get("page") or "1")
    page_size = int(request.query_params.get("pageSize") or "20")
    page = max(1, page)
    page_size = min(100, max(1, page_size))
    offset = (page - 1) * page_size

    tag_id = int(tag_id_raw) if (tag_id_raw or "").isdigit() else None
    favorite: bool | None
    if favorite_raw is None:
        favorite = None
    else:
        fr = favorite_raw.lower()
        if fr in ("1", "true"):
            favorite = True
        elif fr in ("0", "false"):
            favorite = False
        else:
            favorite = None

    where_parts: list[str] = ["c.user_id = %s"]
    params: list[Any] = [user.user_id]

    if tag_id is not None:
        where_parts.append(
            "EXISTS (SELECT 1 FROM conversation_tags ct WHERE ct.conversation_id = c.id AND ct.tag_id = %s)"
        )
        params.append(tag_id)

    if favorite is True:
        where_parts.append(
            "EXISTS (SELECT 1 FROM conversation_favorites cf WHERE cf.conversation_id = c.id AND cf.user_id = %s)"
        )
        params.append(user.user_id)
    elif favorite is False:
        where_parts.append(
            "NOT EXISTS (SELECT 1 FROM conversation_favorites cf WHERE cf.conversation_id = c.id AND cf.user_id = %s)"
        )
        params.append(user.user_id)

    where_sql = " AND ".join(where_parts)

    total_rows = query(f"SELECT COUNT(*) as total FROM conversations c WHERE {where_sql}", tuple(params)) or []
    total = int(total_rows[0]["total"]) if total_rows else 0

    rows = query(
        f"""
        SELECT
          c.id,
          c.title,
          c.role_id as roleId,
          c.created_at as createdAt,
          c.updated_at as updatedAt,
          (cf.conversation_id IS NOT NULL) as isFavorite,
          (
            SELECT GROUP_CONCAT(DISTINCT ct2.tag_id)
            FROM conversation_tags ct2
            WHERE ct2.conversation_id = c.id
          ) as tagIds
        FROM conversations c
        LEFT JOIN conversation_favorites cf
          ON cf.conversation_id = c.id AND cf.user_id = %s
        WHERE {where_sql}
        ORDER BY
          (cf.conversation_id IS NOT NULL) DESC,
          COALESCE(c.updated_at, c.created_at) DESC,
          c.id DESC
        LIMIT %s OFFSET %s
        """,
        tuple([user.user_id, *params, page_size, offset]),
    ) or []

    for r in rows:
        r["isFavorite"] = bool(r.get("isFavorite"))
        tag_ids = r.get("tagIds")
        if isinstance(tag_ids, str) and tag_ids:
            r["tagIds"] = [int(x) for x in tag_ids.split(",") if x.isdigit()]
        else:
            r["tagIds"] = []

    return ok(
        request,
        {
            "conversations": rows,
            "pagination": {
                "page": page,
                "pageSize": page_size,
                "total": total,
                "totalPages": (total + page_size - 1) // page_size,
            },
        },
    )


@app.post("/v1/conversations")
async def conversations_create(request: Request, body: CreateConversationRequest):
    user = verify_bearer_token(request.headers.get("authorization"))
    ensure_schema_once()

    conv_id = int(
        execute(
            "INSERT INTO conversations (user_id, title, role_id) VALUES (%s, %s, %s)",
            (user.user_id, body.title, body.roleId),
        )
    )
    return ok(
        request,
        {"conversation": {"id": conv_id, "title": body.title, "roleId": body.roleId}},
        status_code=201,
    )


@app.get("/v1/conversations/{conversation_id}")
async def conversations_detail(request: Request, conversation_id: int):
    user = verify_bearer_token(request.headers.get("authorization"))
    ensure_schema_once()

    page = int(get_query(request, "page", "1"))
    page_size = int(get_query(request, "pageSize", "20"))
    page = max(1, page)
    page_size = min(100, max(1, page_size))
    offset = (page - 1) * page_size

    conv_rows = query(
        "SELECT id, title, role_id as roleId, created_at as createdAt FROM conversations WHERE id = %s AND user_id = %s",
        (conversation_id, user.user_id),
    )
    if not conv_rows:
        raise ApiError(404, "NOT_FOUND", "会话不存在")
    conversation = conv_rows[0]

    msg_rows = query(
        "SELECT id, role, content, created_at as createdAt FROM messages WHERE conversation_id = %s ORDER BY created_at DESC LIMIT %s OFFSET %s",
        (conversation_id, page_size, offset),
    ) or []
    msg_rows.reverse()

    count_rows = query(
        "SELECT COUNT(*) as total FROM messages WHERE conversation_id = %s",
        (conversation_id,),
    ) or []
    total = int(count_rows[0]["total"]) if count_rows else 0

    return ok(
        request,
        {
            "conversation": conversation,
            "messages": msg_rows,
            "pagination": {
                "page": page,
                "pageSize": page_size,
                "total": total,
                "totalPages": (total + page_size - 1) // page_size,
            },
        },
    )


@app.put("/v1/conversations/{conversation_id}")
async def conversations_update(request: Request, conversation_id: int, body: UpdateConversationRequest):
    user = verify_bearer_token(request.headers.get("authorization"))
    ensure_schema_once()

    execute(
        "UPDATE conversations SET title = %s WHERE id = %s AND user_id = %s",
        (body.title, conversation_id, user.user_id),
    )
    return ok(request, {"message": "会话标题更新成功"})


@app.delete("/v1/conversations/{conversation_id}")
async def conversations_delete(request: Request, conversation_id: int):
    user = verify_bearer_token(request.headers.get("authorization"))
    ensure_schema_once()
    execute(
        "DELETE FROM conversations WHERE id = %s AND user_id = %s",
        (conversation_id, user.user_id),
    )
    return ok(request, {"message": "会话删除成功"})


@app.post("/v1/conversations/{conversation_id}/favorite")
async def favorite_add(request: Request, conversation_id: int):
    user = verify_bearer_token(request.headers.get("authorization"))
    ensure_schema_once()
    execute(
        "INSERT IGNORE INTO conversation_favorites (user_id, conversation_id) VALUES (%s, %s)",
        (user.user_id, conversation_id),
    )
    return ok(request, {"conversationId": conversation_id, "isFavorite": True})


@app.delete("/v1/conversations/{conversation_id}/favorite")
async def favorite_remove(request: Request, conversation_id: int):
    user = verify_bearer_token(request.headers.get("authorization"))
    ensure_schema_once()
    execute(
        "DELETE FROM conversation_favorites WHERE user_id = %s AND conversation_id = %s",
        (user.user_id, conversation_id),
    )
    return ok(request, {"conversationId": conversation_id, "isFavorite": False})


@app.post("/v1/conversations/{conversation_id}/tags")
async def conversation_set_tags(request: Request, conversation_id: int, body: SetTagsRequest):
    user = verify_bearer_token(request.headers.get("authorization"))

    ensure_schema_once()
    conv = query(
        "SELECT id FROM conversations WHERE id = %s AND user_id = %s",
        (conversation_id, user.user_id),
    )
    if not conv:
        raise ApiError(404, "NOT_FOUND", "会话不存在")

    tag_ids = body.tagIds
    placeholders = ",".join(["%s"] * len(tag_ids))
    allowed = query(
        f"SELECT id FROM tags WHERE user_id = %s AND id IN ({placeholders})",
        tuple([user.user_id, *tag_ids]),
    ) or []
    if len(allowed) != len(tag_ids):
        raise ApiError(400, "VALIDATION_ERROR", "包含不存在的标签或越权标签")

    values = ",".join(["(%s,%s)"] * len(tag_ids))
    params: list[Any] = []
    for tid in tag_ids:
        params.extend([conversation_id, tid])
    execute(f"INSERT IGNORE INTO conversation_tags (conversation_id, tag_id) VALUES {values}", tuple(params))

    current = query(
        "SELECT tag_id as tagId FROM conversation_tags WHERE conversation_id = %s ORDER BY created_at DESC",
        (conversation_id,),
    ) or []
    return ok(request, {"conversationId": conversation_id, "tagIds": [r["tagId"] for r in current]})


@app.get("/v1/tags")
async def tags_list(request: Request):
    user = verify_bearer_token(request.headers.get("authorization"))
    ensure_schema_once()
    page = int(get_query(request, "page", "1"))
    page_size = int(get_query(request, "pageSize", "50"))
    page = max(1, page)
    page_size = min(100, max(1, page_size))
    offset = (page - 1) * page_size

    total_rows = query("SELECT COUNT(*) as total FROM tags WHERE user_id = %s", (user.user_id,)) or []
    total = int(total_rows[0]["total"]) if total_rows else 0
    rows = query(
        "SELECT id, name, created_at as createdAt FROM tags WHERE user_id = %s ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s",
        (user.user_id, page_size, offset),
    ) or []
    return ok(
        request,
        {
            "tags": rows,
            "pagination": {
                "page": page,
                "pageSize": page_size,
                "total": total,
                "totalPages": (total + page_size - 1) // page_size,
            },
        },
    )


@app.post("/v1/tags")
async def tags_create(request: Request, body: CreateTagRequest):
    user = verify_bearer_token(request.headers.get("authorization"))

    ensure_schema_once()
    tag_id = int(
        execute(
            """
            INSERT INTO tags (user_id, name)
            VALUES (%s, %s)
            ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
            """,
            (user.user_id, body.name),
        )
    )
    rows = query(
        "SELECT id, name, created_at as createdAt FROM tags WHERE id = %s AND user_id = %s",
        (tag_id, user.user_id),
    )
    tag = rows[0] if rows else {"id": tag_id, "name": body.name}
    return ok(request, {"tag": tag})


@app.on_event("startup")
async def _startup():
    try:
        ensure_schema_once()
    except Exception:
        pass
