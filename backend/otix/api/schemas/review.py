from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class ReviewCreate(BaseModel):
    score: int | None = Field(None, ge=1, le=10, description="Rating 1-10, omit for text-only")
    title: str | None = Field(None, max_length=200)
    content: str | None = Field(None, max_length=5000)
    is_spoiler: bool = False
    is_private: bool = False

    @model_validator(mode="after")
    def require_content_or_score(self) -> ReviewCreate:
        if self.score is None and not self.content:
            raise ValueError("Either score or content must be provided")
        return self


class ReviewUpdate(BaseModel):
    score: int | None = Field(None, ge=1, le=10)
    title: str | None = Field(None, max_length=200)
    content: str | None = Field(None, max_length=5000)
    is_spoiler: bool | None = None
    is_private: bool | None = None


class ReviewOut(BaseModel):
    user_id: str
    media_item_id: str
    score: int | None = None
    title: str | None = None
    content: str | None = None
    is_spoiler: bool = False
    is_private: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReviewUserOut(BaseModel):
    id: str
    username: str

    model_config = {"from_attributes": True}


class ReviewWithUserOut(BaseModel):
    user_id: str
    media_item_id: str
    score: int | None = None
    title: str | None = None
    content: str | None = None
    is_spoiler: bool = False
    created_at: datetime
    updated_at: datetime
    user: ReviewUserOut

    model_config = {"from_attributes": True}


class ScoreOnlyOut(BaseModel):
    score: int
    avg_rating: float | None = None
    rating_count: int = 0
