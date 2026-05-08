from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from otix.api.schemas.media import MediaItemSummary


class UserListCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    is_public: bool = False


class UserListUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    is_public: bool | None = None


class UserListOut(BaseModel):
    id: str
    user_id: str
    name: str
    description: str | None = None
    is_public: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserListDetailOut(UserListOut):
    items: list[MediaItemSummary] = []


class ListItemAdd(BaseModel):
    media_item_id: str


class ListItemReorder(BaseModel):
    media_item_ids: list[str]
