import os
import json
import http.client
from typing import Any, AsyncGenerator

import httpx

from db import execute, query
from roles import get_role


def _deepseek_base_url() -> tuple[str, str]:
    url = os.getenv("DEEPSEEK_API_URL", "").strip()
    if not url:
        raise RuntimeError("Missing required env: DEEPSEEK_API_URL")
    
    if url.startswith("https://"):
        url = url[8:]
    elif url.startswith("http://"):
        url = url[7:]
    
    if url.endswith("/v1/chat/completions"):
        url = url[: -len("/v1/chat/completions")]
    elif url.endswith("/v1"):
        url = url[: -len("/v1")]
    
    parts = url.split("/", 1)
    host = parts[0]
    path = "/" + parts[1] if len(parts) > 1 else ""
    
    return host, path


def _ensure_conversation(user_id: int, title: str, role_id: str) -> int:
    conv_id = execute(
        "INSERT INTO conversations (user_id, title, role_id) VALUES (%s, %s, %s)",
        (user_id, title, role_id),
    )
    return int(conv_id)


def _save_message(conversation_id: int, user_id: int, role: str, content: str):
    execute(
        "INSERT INTO messages (conversation_id, user_id, role, content) VALUES (%s, %s, %s, %s)",
        (conversation_id, user_id, role, content),
    )


def _load_history(conversation_id: int) -> list[dict]:
    rows = query(
        "SELECT role, content FROM messages WHERE conversation_id = %s ORDER BY created_at DESC LIMIT 10",
        (conversation_id,),
    )
    return list(reversed(rows or []))


def _update_conversation(conversation_id: int, role_id: str):
    execute(
        "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, role_id = %s WHERE id = %s",
        (role_id, conversation_id),
    )


def build_chat_messages(role_id: str, history: list[dict]) -> list[dict]:
    role = get_role(role_id)
    msgs: list[dict] = []
    if role.system_prompt:
        msgs.append({"role": "system", "content": role.system_prompt})
    for h in history:
        if h["role"] == "assistant":
            msgs.append({"role": "assistant", "content": h["content"]})
        else:
            msgs.append({"role": "user", "content": h["content"]})
    return msgs


def send_message(*, user_id: int, message: str, conversation_id: int | None, role_id: str) -> dict:
    conv_id = conversation_id
    if not conv_id:
        conv_id = _ensure_conversation(user_id, (message[:20] or "新对话"), role_id)

    _save_message(conv_id, user_id, "user", message)
    history = _load_history(conv_id)
    prompt_messages = build_chat_messages(role_id, history)

    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Missing required env: DEEPSEEK_API_KEY")

    host, base_path = _deepseek_base_url()
    api_path = f"{base_path}/v1/chat/completions"

    body = json.dumps({
        "model": "deepseek-chat",
        "messages": prompt_messages,
        "temperature": 0.7,
        "max_tokens": 2048,
        "stream": False
    })

    conn = http.client.HTTPSConnection(host)
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "Content-Length": str(len(body))
    }

    try:
        conn.request("POST", api_path, body, headers)
        response = conn.getresponse()
        data = response.read().decode("utf-8")
        
        if response.status != 200:
            raise RuntimeError(f"API request failed with status {response.status}: {data}")
        
        result = json.loads(data)
        reply = result["choices"][0]["message"]["content"]
    finally:
        conn.close()

    _save_message(conv_id, user_id, "assistant", reply)
    _update_conversation(conv_id, role_id)

    return {"reply": reply, "conversationId": conv_id}


async def stream_reply_messages(*, role_id: str, history: list[dict]) -> AsyncGenerator[str, None]:
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Missing required env: DEEPSEEK_API_KEY")

    host, base_path = _deepseek_base_url()
    api_url = f"https://{host}{base_path}/v1/chat/completions"
    prompt_messages = build_chat_messages(role_id, history)

    payload = {
        "model": "deepseek-chat",
        "messages": prompt_messages,
        "temperature": 0.7,
        "max_tokens": 2048,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            api_url,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
        ) as response:
            if response.status_code != 200:
                body = await response.aread()
                raise RuntimeError(
                    f"API request failed with status {response.status_code}: {body.decode('utf-8', errors='replace')}"
                )

            buffer = ""
            async for chunk in response.aiter_bytes():
                buffer += chunk.decode("utf-8")
                lines = buffer.split("\n")
                buffer = lines[-1] if lines else ""

                for line in lines[:-1]:
                    line = line.strip()
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            return
                        try:
                            json_data = json.loads(data)
                            content = json_data["choices"][0]["delta"].get("content", "")
                            if content:
                                yield content
                        except (json.JSONDecodeError, KeyError):
                            continue
