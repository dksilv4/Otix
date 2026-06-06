# TODO: Review this file
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class FollowUserOut(BaseModel):
    id: str
    username: str
    avatar_url: str | None = None
    is_private: bool = False

    model_config = {"from_attributes": True}


class FollowCountsOut(BaseModel):
    followers: int = 0
    following: int = 0


class FollowStatusOut(BaseModel):
    is_following: bool = False
    has_pending_request: bool = False
    is_private: bool = False


# ── Follow requests ──────────────────────────────────────

class FollowRequestRequesterOut(BaseModel):
    id: str
    username: str
    avatar_url: str | None = None

    model_config = {"from_attributes": True}


class FollowRequestOut(BaseModel):
    id: str
    requester_id: str
    target_id: str
    status: str
    created_at: datetime
    requester: FollowRequestRequesterOut | None = None

    model_config = {"from_attributes": True}


class FollowRequestListOut(BaseModel):
    requests: list[FollowRequestOut]
    total: int


class FollowRequestResponse(BaseModel):
    message: str
    request_id: str
