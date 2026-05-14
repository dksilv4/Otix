from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TrackRatingCreate(BaseModel):
    score: int = Field(..., ge=1, le=10)


class TrackRatingOut(BaseModel):
    user_id: str
    track_id: str
    score: int
    avg_rating: float | None = None
    rating_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
