from __future__ import annotations

from pydantic import BaseModel


class PaginationParams(BaseModel):
    cursor: str | None = None
    limit: int = 50


class PaginatedResponse(BaseModel):
    items: list
    next_cursor: str | None = None
    has_more: bool = False


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None
