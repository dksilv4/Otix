from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class AdminRecentUser(BaseModel):
    id: str
    username: str
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


class EnrichmentCounts(BaseModel):
    """Per-provider enrichment counts for a single media type."""

    total: int = 0
    fanart: int = 0
    omdb: int = 0
    igdb: int = 0
    steam: int = 0
    steamgrid: int = 0
    musicbrainz: int = 0
    lastfm: int = 0
    spotify: int = 0
    embedding: int = 0
    imdb: int = 0


class AdminStatsResponse(BaseModel):
    total_users: int
    media_counts: dict[str, int]
    enrichment: dict[str, EnrichmentCounts]
    deltas: dict[str, EnrichmentCounts]
    stub_counts: dict[str, int]
    people_count: int
    recent_users: list[AdminRecentUser]


class AdminMetricPoint(BaseModel):
    label: str
    value: int


class AdminMetricsResponse(BaseModel):
    metric: str
    hours: float
    data: list[AdminMetricPoint]


class TMDBDeletedIDItem(BaseModel):
    id: str
    tmdb_id: int
    media_type: str
    media_item_id: str | None
    title: str | None
    detection_date: datetime

    model_config = {"from_attributes": True}


class TMDBDeletedIDListResponse(BaseModel):
    items: list[TMDBDeletedIDItem]
    total: int
    page: int
    page_size: int


class MediaHydrationItem(BaseModel):
    id: str
    title: str
    media_type: str
    slug: str

    has_overview: bool
    has_poster: bool
    has_backdrop: bool
    has_logo: bool
    has_textless_poster: bool
    has_release_date: bool
    has_embedding: bool
    has_original_language: bool

    has_genres: bool
    has_credits: bool
    has_external_ids: bool
    has_external_ratings: bool
    has_videos: bool
    has_assets: bool
    has_releases: bool
    has_keywords: bool
    has_companies: bool
    has_watch_providers: bool

    has_runtime: bool | None = None
    has_collection: bool | None = None
    has_budget: bool | None = None
    has_show_status: bool | None = None
    has_episodes: bool | None = None
    has_platforms: bool | None = None
    has_game_modes: bool | None = None
    has_age_ratings: bool | None = None

    completeness_score: float
    synced_at: datetime | None
    next_sync_at: datetime | None


class MediaHydrationResponse(BaseModel):
    items: list[MediaHydrationItem]
    total: int
    page: int
    per_page: int
