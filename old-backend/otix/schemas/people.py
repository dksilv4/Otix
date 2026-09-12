# TODO: Review this file
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

from otix.schemas.common import PaginatedResponse


class EpisodeOut(BaseModel):
    episode_number: int
    name: str | None = None
    air_date: date | None = None

    model_config = {"from_attributes": True}


class SeasonOut(BaseModel):
    season_number: int
    name: str | None = None
    first_air_date: date | None = None
    last_air_date: date | None = None
    episodes: list[EpisodeOut] = []

    model_config = {"from_attributes": True}


class PersonCreditMediaOut(BaseModel):
    id: str
    media_type: str
    title: str
    slug: str
    poster_url: str | None = None
    release_date: date | None = None
    seasons: list[SeasonOut] | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _from_orm(cls, data: object) -> object:
        if isinstance(data, dict):
            return data
        item = data
        seasons = None
        if item.media_type == "show" and item.show is not None and item.show.seasons:
            seasons = []
            for s in sorted(item.show.seasons, key=lambda s: s.season_number):
                first_air = None
                last_air = None
                episodes: list[EpisodeOut] = []
                if s.episodes:
                    air_dates = [e.air_date for e in s.episodes if e.air_date]
                    if air_dates:
                        first_air = min(air_dates)
                        last_air = max(air_dates)
                    episodes = [
                        EpisodeOut(episode_number=e.episode_number, name=e.name, air_date=e.air_date)
                        for e in sorted(s.episodes, key=lambda e: e.episode_number)
                        if e.air_date is not None
                    ]
                seasons.append(
                    SeasonOut(
                        season_number=s.season_number,
                        name=s.name,
                        first_air_date=first_air,
                        last_air_date=last_air,
                        episodes=episodes,
                    )
                )
        return {
            "id": item.id,
            "media_type": item.media_type,
            "title": item.title,
            "slug": item.slug,
            "poster_url": item.poster_url,
            "release_date": item.release_date,
            "seasons": seasons,
        }


class PersonCreditOut(BaseModel):
    id: str
    media_item: PersonCreditMediaOut | None = None
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
    follower_count: int = 0
    is_followed: bool | None = None
    avg_rating: float | None = None
    user_rating: int | None = None
    rating_count: int = 0

    credits: list[PersonCreditOut] = []

    model_config = {"from_attributes": True}


class PersonListResponse(PaginatedResponse):
    items: list[PersonSummary]


class PersonRatingBody(BaseModel):
    """Request body for rating a person."""

    score: int = Field(..., ge=1, le=5)


class PersonFollowResponse(BaseModel):
    """Response for follow/unfollow actions on a person."""

    followed: bool
    follower_count: int
