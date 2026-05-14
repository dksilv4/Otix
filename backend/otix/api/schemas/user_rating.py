from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class UserRatingCreate(BaseModel):
    score: int = Field(..., ge=1, le=10)


class UserRatingOut(BaseModel):
    rater_id: str
    rated_user_id: str
    score: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserReputationOut(BaseModel):
    avg_user_rating: float | None = None
    user_rating_count: int = 0
    composite_score: float | None = None
    activity_score: float | None = None
    direct_rating: float | None = None
    components: dict = Field(default_factory=dict)
