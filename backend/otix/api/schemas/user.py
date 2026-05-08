from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class UserProfileOut(BaseModel):
    id: str
    username: str
    avatar_url: str | None = None
    bio: str | None = None
    background_url: str | None = None
    created_at: datetime
    review_count: int = 0
