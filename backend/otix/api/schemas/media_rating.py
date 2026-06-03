from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class MediaRatingCreate(BaseModel):
    score: int = Field(..., ge=1, le=10)


class MediaRatingOut(BaseModel):
    user_id: str
    media_item_id: str
    score: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MediaRatingAggregateOut(BaseModel):
    score: int
    avg_rating: float | None = None
    rating_count: int = 0
