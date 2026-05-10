from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class FriendOut(BaseModel):
    id: str
    username: str
    avatar_url: str | None = None
    friends_since: datetime


class FriendshipStatusOut(BaseModel):
    status: str
    request_id: str | None = None


class FriendRequestOut(BaseModel):
    id: str
    sender_id: str
    receiver_id: str
    status: str
    created_at: datetime
    sender: FriendRequestUserOut | None = None
    receiver: FriendRequestUserOut | None = None

    model_config = {"from_attributes": True}


class FriendRequestUserOut(BaseModel):
    id: str
    username: str
    avatar_url: str | None = None
    steam_id: str | None = None
    plex_id: str | None = None

    model_config = {"from_attributes": True}
