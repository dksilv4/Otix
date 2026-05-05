from __future__ import annotations

from datetime import date, datetime
from pydantic import BaseModel, model_validator

from otix.api.schemas.common import PaginatedResponse


# ── Nested relation schemas ──────────────────────────────────────


class GenreOut(BaseModel):
    id: str
    name: str
    slug: str

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def unwrap_media_genre(cls, data: object) -> object:
        """Accept either a Genre or a MediaGenre (join table) object."""
        if hasattr(data, "genre"):
            return data.genre
        return data


class ExternalRatingOut(BaseModel):
    id: str
    provider: str
    score: float
    max_score: float
    vote_count: int | None = None

    model_config = {"from_attributes": True}


class MediaCreditPersonOut(BaseModel):
    id: str
    name: str
    photo_url: str | None = None

    model_config = {"from_attributes": True}


class MediaCreditOut(BaseModel):
    id: str
    person: MediaCreditPersonOut
    role: str
    character_name: str | None = None
    sort_order: int

    model_config = {"from_attributes": True}


class SeasonOut(BaseModel):
    id: str
    season_number: int
    name: str | None = None
    overview: str | None = None
    poster_url: str | None = None
    episode_count: int = 0

    model_config = {"from_attributes": True}


# ── Media summary (list items) ───────────────────────────────────


class MediaItemSummary(BaseModel):
    id: str
    media_type: str
    title: str
    slug: str
    poster_url: str | None = None
    textless_poster_url: str | None = None
    logo_url: str | None = None
    release_date: date | None = None
    popularity: float

    model_config = {"from_attributes": True}


class MediaItemListResponse(PaginatedResponse):
    items: list[MediaItemSummary]


# ── Media detail (full) ──────────────────────────────────────────


class MovieDetail(BaseModel):
    runtime: int | None = None
    budget: int | None = None
    revenue: int | None = None
    tagline: str | None = None
    is_anime: bool = False

    model_config = {"from_attributes": True}


class ShowDetail(BaseModel):
    status: str | None = None
    first_air_date: date | None = None
    last_air_date: date | None = None
    number_of_seasons: int | None = None
    number_of_episodes: int | None = None
    seasons: list[SeasonOut] = []

    model_config = {"from_attributes": True}


class CompanyOut(BaseModel):
    id: str
    name: str
    slug: str

    model_config = {"from_attributes": True}


class InvolvedCompanyOut(BaseModel):
    id: str
    company: CompanyOut
    developer: bool
    publisher: bool
    porting: bool
    supporting: bool

    model_config = {"from_attributes": True}


class PlatformOut(BaseModel):
    id: str
    name: str
    slug: str
    logo_image_id: str | None = None

    model_config = {"from_attributes": True}


class GameModeOut(BaseModel):
    id: str
    name: str
    slug: str

    model_config = {"from_attributes": True}


class MediaPlatformOut(BaseModel):
    id: str
    platform: PlatformOut

    model_config = {"from_attributes": True}


class MediaGameModeOut(BaseModel):
    id: str
    game_mode: GameModeOut

    model_config = {"from_attributes": True}


class GameDetail(BaseModel):
    release_status: str | None = None
    website: str | None = None
    steam_app_id: int | None = None
    store_ids: dict | None = None
    current_players: int | None = None
    price_json: dict | None = None
    recommendations: int | None = None
    review_summary: str | None = None
    is_free: bool = False
    has_multiplayer: bool = False

    model_config = {"from_attributes": True}


class MediaItemDetail(BaseModel):
    id: str
    media_type: str
    title: str
    slug: str
    overview: str | None = None
    poster_url: str | None = None
    textless_poster_url: str | None = None
    backdrop_url: str | None = None
    logo_url: str | None = None
    release_date: date | None = None
    popularity: float
    original_language: str | None = None
    completeness_score: float
    created_at: datetime
    updated_at: datetime

    genres: list[GenreOut] = []
    external_ratings: list[ExternalRatingOut] = []
    credits: list[MediaCreditOut] = []
    involved_companies: list[InvolvedCompanyOut] = []
    platforms: list[MediaPlatformOut] = []
    game_modes: list[MediaGameModeOut] = []

    movie: MovieDetail | None = None
    show: ShowDetail | None = None
    game: GameDetail | None = None

    model_config = {"from_attributes": True}
