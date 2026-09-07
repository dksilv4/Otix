# TODO: Review this file
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from otix.schemas.media_rating import MediaRatingOut


class ReviewCreate(BaseModel):
    title: str | None = Field(None, max_length=200)
    content: str | None = Field(None, max_length=5000)
    is_spoiler: bool = False
    is_private: bool = False

    @model_validator(mode="after")
    def require_content_or_title(self) -> ReviewCreate:
        if not self.content:
            raise ValueError("Review content must not be empty")
        return self


class ReviewUpdate(BaseModel):
    title: str | None = Field(None, max_length=200)
    content: str | None = Field(None, max_length=5000)
    is_spoiler: bool | None = None
    is_private: bool | None = None


class ReviewOut(BaseModel):
    user_id: str
    media_item_id: str
    title: str | None = None
    content: str | None = None
    is_spoiler: bool = False
    is_private: bool = False
    cooldown_until: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReviewUserOut(BaseModel):
    id: str
    username: str
    is_admin: bool = False

    model_config = {"from_attributes": True}


class ReviewWithUserOut(BaseModel):
    user_id: str
    media_item_id: str
    title: str | None = None
    content: str | None = None
    is_spoiler: bool = False
    is_private: bool = False
    created_at: datetime
    updated_at: datetime
    cooldown_until: datetime | None = None
    user: ReviewUserOut
    rating: MediaRatingOut | None = None

    model_config = {"from_attributes": True}
