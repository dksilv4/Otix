from __future__ import annotations

from pydantic import BaseModel, Field


class OnboardingRequest(BaseModel):
    preferred_media_types: list[str] = Field(default_factory=lambda: ["movie", "show", "game", "music"])
    preferred_genres: list[str] = Field(default_factory=list)
    preferred_languages: list[str] = Field(default_factory=list)


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
