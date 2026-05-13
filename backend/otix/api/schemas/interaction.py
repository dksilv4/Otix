from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class UserInteractionState(BaseModel):
    liked: bool = False
    watchlisted: bool = False
    watched: bool = False
    played: bool = False
    started: bool = False
    listened: bool = False


class InteractionCounts(BaseModel):
    like_count: int = 0
    watchlist_count: int = 0
    watched_count: int = 0
    played_count: int = 0
    started_count: int = 0
    listened_count: int = 0


class InteractionOut(BaseModel):
    user_id: str
    media_item_id: str
    interaction_type: str
    extra_data: dict = {}
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InteractionToggleResponse(BaseModel):
    interaction: InteractionOut
    counts: InteractionCounts


class InteractionCreate(BaseModel):
    extra_data: dict = {}
