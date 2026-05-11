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
    like_count: int = 0
    is_liked: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserListDetailOut(UserListOut):
    items: list[MediaItemSummary] = []
    collaborators: list[CollaboratorOut] = []


class ListItemAdd(BaseModel):
    media_item_id: str


class ListItemReorder(BaseModel):
    media_item_ids: list[str]


# ── Collaborators ──────────────────────────────────────────────────

class CollaboratorInvite(BaseModel):
    user_id: str
    permission: str = "VIEW"


class CollaboratorUpdate(BaseModel):
    permission: str


class CollaboratorOut(BaseModel):
    id: str
    user_id: str
    permission: str
    status: str
    created_at: datetime
    user: UserRef | None = None

    model_config = {"from_attributes": True}


class UserRef(BaseModel):
    id: str
    username: str
    avatar_url: str | None = None

    model_config = {"from_attributes": True}


# ── Likes ──────────────────────────────────────────────────────────

class ListLikeStatus(BaseModel):
    like_count: int
    is_liked: bool


# ── Rank history ───────────────────────────────────────────────────

class RankHistoryOut(BaseModel):
    id: str
    media_item_id: str
    user_id: str | None = None
    old_sort_order: int
    new_sort_order: int
    changed_at: datetime
    media_item: MediaItemSummary | None = None

    model_config = {"from_attributes": True}


# ── Export ─────────────────────────────────────────────────────────

class ListExportRequest(BaseModel):
    format: str = "json"
