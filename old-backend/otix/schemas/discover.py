# TODO: Review this file
from __future__ import annotations

from pydantic import BaseModel


class PersonalizedSection(BaseModel):
    id: str
    title: str
    media_type: str | None = None
    list_type: str
    genre: str | None = None
    language: str | None = None
    is_anime: bool | None = None
    is_personalized: bool = False
    reason: str | None = None


class PersonalizedSectionsResponse(BaseModel):
    sections: list[PersonalizedSection]
