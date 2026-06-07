# TODO: Review this file
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    body: str | None = None
    metadata_json: dict
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UnreadCountOut(BaseModel):
    count: int


class NotificationListResponse(BaseModel):
    items: list[NotificationOut]
    has_more: bool
    next_cursor: str | None = None
