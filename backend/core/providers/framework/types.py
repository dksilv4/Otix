"""Canonical normalized entity schemas for provider integrations.

Every provider adapter transforms provider-specific API payloads into these
immutable, strongly typed dataclasses. Hydration pipelines consume these types
exclusively, decoupling database ingestion from raw upstream provider formats.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

# Shared typing alias for arbitrary raw provider API JSON values
JSONValue = str | int | float | bool | None | list[Any] | dict[str, Any]


@dataclass(slots=True, frozen=True)
class NormalizedAsset:
    """Normalized visual artwork asset (poster, backdrop, banner, logo, icon, etc.)."""

    asset_type: str
    url: str
    provider: str
    score: int = 0
    width: int | None = None
    height: int | None = None
    language: str | None = None
    style: str | None = None
    color_guess: str | None = None


@dataclass(slots=True, frozen=True)
class NormalizedCredit:
    """Normalized cast or crew credit."""

    person_id: str | None
    name: str
    role: str  # "cast" | "crew"
    character: str | None = None
    job: str | None = None
    order: int = 0
    photo_url: str | None = None


@dataclass(slots=True, frozen=True)
class NormalizedCompany:
    """Normalized production company, distributor, or network."""

    company_id: str | None
    name: str
    role: str  # "production" | "distributor" | "network"
    logo_url: str | None = None


@dataclass(slots=True, frozen=True)
class NormalizedRating:
    """Normalized audience or critic rating."""

    provider: str
    score: float
    max_score: float = 100.0
    votes: int | None = None
    type: str = "audience"


@dataclass(slots=True, frozen=True)
class NormalizedVideo:
    """Normalized video or trailer link."""

    video_id: str
    title: str
    site: str  # "youtube"
    video_type: str  # "trailer" | "teaser" | "clip"


@dataclass(slots=True, frozen=True)
class NormalizedEpisode:
    """Normalized episode within a television season."""

    season_number: int
    episode_number: int
    title: str
    air_date: date | None = None
    overview: str | None = None
    runtime_minutes: int | None = None


@dataclass(slots=True, frozen=True)
class NormalizedSeason:
    """Normalized season within a television series."""

    season_number: int
    name: str | None = None
    air_date: date | None = None
    episodes: tuple[NormalizedEpisode, ...] = ()

    def __post_init__(self) -> None:
        if not isinstance(self.episodes, tuple):
            object.__setattr__(self, "episodes", tuple(self.episodes))


@dataclass(slots=True, frozen=True)
class NormalizedMediaItem:
    """Canonical normalized representation of a movie, show, or game."""

    external_ids: dict[str, str]
    title: str
    media_type: str  # "movie" | "show" | "game"
    original_title: str | None = None
    overview: str | None = None
    release_date: date | None = None
    status: str | None = None
    runtime_minutes: int | None = None
    genres: tuple[str, ...] = ()
    assets: tuple[NormalizedAsset, ...] = ()
    credits: tuple[NormalizedCredit, ...] = ()
    companies: tuple[NormalizedCompany, ...] = ()
    ratings: tuple[NormalizedRating, ...] = ()
    videos: tuple[NormalizedVideo, ...] = ()
    seasons: tuple[NormalizedSeason, ...] = ()
    content_rating: str | None = None
    payload_hash: str = ""

    def __post_init__(self) -> None:
        if not isinstance(self.genres, tuple):
            object.__setattr__(self, "genres", tuple(self.genres))
        if not isinstance(self.assets, tuple):
            object.__setattr__(self, "assets", tuple(self.assets))
        if not isinstance(self.credits, tuple):
            object.__setattr__(self, "credits", tuple(self.credits))
        if not isinstance(self.companies, tuple):
            object.__setattr__(self, "companies", tuple(self.companies))
        if not isinstance(self.ratings, tuple):
            object.__setattr__(self, "ratings", tuple(self.ratings))
        if not isinstance(self.videos, tuple):
            object.__setattr__(self, "videos", tuple(self.videos))
        if not isinstance(self.seasons, tuple):
            object.__setattr__(self, "seasons", tuple(self.seasons))
        if not isinstance(self.external_ids, dict):
            object.__setattr__(self, "external_ids", dict(self.external_ids))
