from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel

from otix.api.schemas.common import PaginatedResponse


class PersonCreditMediaOut(BaseModel):
    id: str
    media_type: str
    title: str
    slug: str
    poster_url: str | None = None
    release_date: date | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_credit(cls, credit) -> PersonCreditMediaOut:
        item = credit.media_item
        return cls(
            id=item.id,
            media_type=item.media_type,
            title=item.title,
            slug=item.slug,
            poster_url=item.poster_url,
            release_date=item.release_date,
        )


class PersonCreditOut(BaseModel):
    id: str
    media_item: PersonCreditMediaOut
    role: str
    character_name: str | None = None
    sort_order: int

    model_config = {"from_attributes": True}


class PersonSummary(BaseModel):
    id: str
    name: str
    photo_url: str | None = None
    birthday: date | None = None
    place_of_birth: str | None = None

    model_config = {"from_attributes": True}


class PersonDetail(BaseModel):
    id: str
    name: str
    tmdb_id: int | None = None
    imdb_id: str | None = None
    photo_url: str | None = None
    biography: str | None = None
    birthday: date | None = None
    deathday: date | None = None
    place_of_birth: str | None = None
    synced_at: datetime | None = None

    credits: list[PersonCreditOut] = []

    model_config = {"from_attributes": True}


class PersonListResponse(PaginatedResponse):
    items: list[PersonSummary]
