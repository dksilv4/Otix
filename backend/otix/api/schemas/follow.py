from __future__ import annotations

from pydantic import BaseModel


class FollowUserOut(BaseModel):
    id: str
    username: str
    avatar_url: str | None = None

    model_config = {"from_attributes": True}


class FollowCountsOut(BaseModel):
    followers: int = 0
    following: int = 0


class FollowStatusOut(BaseModel):
    is_following: bool = False
