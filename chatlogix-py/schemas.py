"""
Pydantic 请求/响应模型
用于参数校验和序列化
"""
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


# ==================== 认证 ====================

class RegisterRequest(BaseModel):
    username: str = Field(
        ..., min_length=2, max_length=50,
        description="用户名，2-50个字符，支持字母、数字、下划线、中文"
    )
    password: str = Field(
        ..., min_length=6, max_length=100,
        description="密码，6-100个字符"
    )

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        import re
        if not re.match(r'^[a-zA-Z0-9_\u4e00-\u9fa5]+$', v):
            raise ValueError('用户名只能包含字母、数字、下划线和中文')
        return v.strip()


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, description="用户名")
    password: str = Field(..., min_length=1, description="密码")


# ==================== 聊天 ====================

class SendMessageRequest(BaseModel):
    message: str = Field(
        ..., min_length=1, max_length=10000,
        description="消息内容，1-10000个字符"
    )
    conversationId: Optional[int] = Field(
        None, ge=1, description="会话ID"
    )
    roleId: str = Field(
        default='assistant', max_length=50,
        description="角色ID"
    )

    @field_validator('message')
    @classmethod
    def trim_message(cls, v: str) -> str:
        return v.strip()


class StreamMessageRequest(BaseModel):
    message: str = Field(
        ..., min_length=1, max_length=10000,
        description="消息内容，1-10000个字符"
    )
    conversationId: Optional[int] = Field(
        None, ge=1, description="会话ID"
    )
    roleId: str = Field(
        default='assistant', max_length=50,
        description="角色ID"
    )

    @field_validator('message')
    @classmethod
    def trim_message(cls, v: str) -> str:
        return v.strip()


# ==================== 会话 ====================

class CreateConversationRequest(BaseModel):
    title: str = Field(
        default='新对话', max_length=100,
        description="会话标题"
    )
    roleId: str = Field(
        default='assistant', max_length=50,
        description="角色ID"
    )

    @field_validator('title')
    @classmethod
    def trim_title(cls, v: str) -> str:
        return v.strip() or '新对话'


class UpdateConversationRequest(BaseModel):
    title: str = Field(
        ..., min_length=1, max_length=100,
        description="会话标题"
    )

    @field_validator('title')
    @classmethod
    def trim_title(cls, v: str) -> str:
        t = v.strip()
        if not t:
            raise ValueError('标题不能为空')
        return t


# ==================== 标签 ====================

class CreateTagRequest(BaseModel):
    name: str = Field(
        ..., min_length=1, max_length=50,
        description="标签名"
    )

    @field_validator('name')
    @classmethod
    def trim_name(cls, v: str) -> str:
        return v.strip()


class SetTagsRequest(BaseModel):
    tagIds: list[int] = Field(
        ..., min_length=1, max_length=20,
        description="标签ID列表"
    )

    @field_validator('tagIds')
    @classmethod
    def validate_tag_ids(cls, v: list[int]) -> list[int]:
        for tid in v:
            if tid <= 0:
                raise ValueError('标签 ID 必须是正整数')
        return sorted(set(v))


# ==================== 通用 ====================

class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1, description="页码")
    pageSize: int = Field(default=20, ge=1, le=100, description="每页条数")

    @field_validator('pageSize')
    @classmethod
    def clamp_page_size(cls, v: int) -> int:
        return min(100, max(1, v))
