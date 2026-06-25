from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class BlueprintCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    blueprint_string: str = Field(min_length=1)
    parsed_data: dict | None = None
    tags: list[str] | None = None


class BlueprintUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    blueprint_string: str | None = None
    parsed_data: dict | None = None
    tags: list[str] | None = None


class BlueprintOut(BaseModel):
    id: str
    user_id: str
    author_name: str = ""
    title: str
    description: str | None = None
    parsed_data: dict | None = None
    tags: list[str] | None = None
    downloads: int = 0
    likes_count: int = 0
    has_liked: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class BlueprintListOut(BlueprintOut):
    pass


class BlueprintDetailOut(BlueprintOut):
    blueprint_string: str
    updated_at: datetime
