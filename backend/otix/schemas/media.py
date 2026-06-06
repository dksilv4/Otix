# TODO: Review this file
from __future__ import annotations

from datetime import date, datetime
from typing import Self

from pydantic import BaseModel, Field, model_validator

from otix.schemas.common import PaginatedResponse
from otix.schemas.interaction import UserInteractionState


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
    person: MediaCreditPersonOut | None = None
    role: str
    character_name: str | None = None
    sort_order: int

    model_config = {"from_attributes": True}


class EpisodeOut(BaseModel):
    id: str
    episode_number: int
    name: str | None = None
    overview: str | None = None
    runtime: int | None = None
    air_date: date | None = None
    still_url: str | None = None
    external_ratings: list[ExternalRatingOut] = []

    model_config = {"from_attributes": True}


class SeasonOut(BaseModel):
    id: str
    season_number: int
    name: str | None = None
    overview: str | None = None
    poster_url: str | None = None
    episode_count: int = 0
    episodes: list[EpisodeOut] = []

    model_config = {"from_attributes": True}


# ── Media summary (list items) ───────────────────────────────────


class MediaItemSummary(BaseModel):
    id: str
    media_type: str
    title: str
    slug: str
    poster_url: str | None = None
    textless_poster_url: str | None = None
    backdrop_url: str | None = None
    logo_url: str | None = None
    icon_url: str | None = None
    release_date: date | None = None
    popularity: float
    avg_rating: float | None = None
    rating_count: int = 0
    like_count: int = 0
    watchlist_count: int = 0
    watched_count: int = 0
    played_count: int = 0
    started_count: int = 0
    listened_count: int = 0
    view_count: int = 0
    is_adult: bool = False
    user_interactions: UserInteractionState | None = None
    steam_playtime_forever: int | None = None
    steam_playtime_2weeks: int | None = None
    steam_rtime_last_played: int | None = None
    plex_view_count: int | None = None
    plex_last_viewed_at: datetime | None = None
    album_artist_name: str | None = None
    album_track_count: int | None = None
    album_musicbrainz_release_group_id: str | None = None
    revenue: int | None = None
    budget: int | None = None
    model_config = {"from_attributes": True}

    model_config = {"from_attributes": True}


class TrackSearchResult(BaseModel):
    id: str
    title: str
    track_number: int
    disc_number: int = 1
    duration_ms: int | None = None
    preview_url: str | None = None
    spotify_id: str | None = None
    avg_rating: float | None = None
    rating_count: int = 0
    album_id: str
    album_title: str
    album_poster_url: str | None = None
    album_artist_name: str | None = None
    album_slug: str

    model_config = {"from_attributes": True}


class MediaItemListResponse(PaginatedResponse):
    items: list[MediaItemSummary]
    tracks: list[TrackSearchResult] = Field(default_factory=list)
    total: int | None = None
    backfill_pending: bool = False


class ExternalGameResult(BaseModel):
    """A game found via external API (IGDB/SteamGridDB) — not in the Otix database.

    If the game was previously imported, otix_media_id and otix_slug are populated
    so the frontend can link directly without re-importing.
    """

    title: str
    release_date: date | None = None
    poster_url: str | None = None
    publisher: str | None = None
    source: str  # "igdb" or "steamgrid"
    source_id: str  # provider-specific ID
    otix_media_id: str | None = None
    otix_slug: str | None = None


class ExternalGameSearchResponse(BaseModel):
    items: list[ExternalGameResult]


class ImportGameResponse(BaseModel):
    """Response after importing a game from an external source into Otix."""

    media_id: str
    title: str
    slug: str


class SteamGridSearchRequest(BaseModel):
    query: str


class SteamGridGame(BaseModel):
    """A game found on SteamGridDB."""

    sgdb_id: int
    name: str
    grid_url: str | None = None
    logo_url: str | None = None
    hero_url: str | None = None
    icon_url: str | None = None


class SteamGridSearchResponse(BaseModel):
    items: list[SteamGridGame]


class SteamUnmatchedGameSummary(BaseModel):
    id: str
    steam_app_id: int
    steam_name: str
    steam_playtime_forever: int = 0
    steam_playtime_2weeks: int = 0
    steam_img_icon_url: str | None = None
    steam_rtime_last_played: int | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def map_from_usg(cls, data: object) -> object:
        """Map UserSteamGame fields to steam_ prefixed schema fields."""
        if isinstance(data, dict):
            return data
        return {
            "id": getattr(data, "id", None),
            "steam_app_id": getattr(data, "steam_app_id", None),
            "steam_name": getattr(data, "name", None),
            "steam_playtime_forever": getattr(data, "playtime_forever", 0),
            "steam_playtime_2weeks": getattr(data, "playtime_2weeks", 0),
            "steam_img_icon_url": getattr(data, "img_icon_url", None),
            "steam_rtime_last_played": getattr(data, "rtime_last_played", None),
        }


class SteamUnmatchedListResponse(PaginatedResponse):
    items: list[SteamUnmatchedGameSummary]
    total: int | None = None


class SteamWishlistItemSummary(BaseModel):
    id: str
    media_type: str
    title: str
    slug: str
    poster_url: str | None = None
    logo_url: str | None = None
    textless_poster_url: str | None = None
    release_date: date | None = None
    steam_priority: int = 0

    model_config = {"from_attributes": True}


class SteamWishlistListResponse(PaginatedResponse):
    items: list[SteamWishlistItemSummary]
    total: int | None = None


# ── Local game matching ───────────────────────────────────────────


class MatchGameEntry(BaseModel):
    """A single game from the desktop scanner, with optional context for matching."""
    title: str
    platform: str | None = None
    steam_app_id: int | None = None


class LocalGameMatchRequest(BaseModel):
    games: list[MatchGameEntry]


class LocalGameMatch(BaseModel):
    query_title: str
    matched_media: MediaItemSummary | None = None
    confidence: float = 0.0  # trigram similarity 0–1

    model_config = {"from_attributes": True}


class LocalGameMatchResponse(BaseModel):
    matches: list[LocalGameMatch]


# ── Seed game titles from desktop scan ──────────────────────────


class SeedGameEntry(BaseModel):
    """A single game from the desktop scanner, with optional context for IGDB seeding."""
    title: str
    platform: str | None = None
    steam_app_id: int | None = None


class SeedFromTitlesRequest(BaseModel):
    games: list[SeedGameEntry]


class SeedFromTitlesResponse(BaseModel):
    accepted: bool = True
    total_titles: int = 0
    task_id: str | None = None


# ── Media detail (full) ──────────────────────────────────────────


class MovieDetail(BaseModel):
    runtime: int | None = None
    budget: int | None = None
    revenue: int | None = None
    revenue_rank: int | None = None
    profit_pct: float | None = None
    profit_rank: int | None = None
    loss_rank: int | None = None
    tagline: str | None = None
    is_anime: bool = False

    model_config = {"from_attributes": True}


class CollectionMovieOut(BaseModel):
    id: str
    title: str
    poster_url: str | None = None
    release_date: date | None = None
    slug: str

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def unwrap_media_item(cls, data: object) -> object:
        if hasattr(data, "media_item"):
            return data.media_item
        return data


class CollectionOut(BaseModel):
    id: str
    name: str
    overview: str | None = None
    poster_url: str | None = None
    backdrop_url: str | None = None
    movies: list[CollectionMovieOut] = []

    model_config = {"from_attributes": True}


class ShowDetail(BaseModel):
    status: str | None = None
    first_air_date: date | None = None
    last_air_date: date | None = None
    number_of_seasons: int | None = None
    number_of_episodes: int | None = None
    is_anime: bool = False
    seasons: list[SeasonOut] = []

    model_config = {"from_attributes": True}


class CompanyOut(BaseModel):
    id: str
    name: str
    slug: str
    logo_url: str | None = None
    origin_country: str | None = None
    follower_count: int = 0
    is_followed: bool | None = None
    avg_rating: float | None = None
    user_rating: int | None = None

    model_config = {"from_attributes": True}


class CompanyRatingBody(BaseModel):
    """Request body for rating a company."""

    score: int = Field(..., ge=1, le=5)


class InvolvedCompanyOut(BaseModel):
    id: str
    company: CompanyOut
    developer: bool
    publisher: bool
    porting: bool
    supporting: bool
    production: bool

    model_config = {"from_attributes": True}


class MediaReleaseOut(BaseModel):
    country_code: str
    release_date: date | None = None
    certification: str | None = None

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


class WatchProviderOut(BaseModel):
    id: str
    name: str
    slug: str
    logo_url: str | None = None

    model_config = {"from_attributes": True}


class MediaWatchProviderOut(BaseModel):
    id: str
    watch_provider: WatchProviderOut
    country_code: str
    offering_type: str
    url: str | None = None
    display_priority: int = 0

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


class TrackOut(BaseModel):
    id: str
    track_number: int
    disc_number: int = 1
    title: str
    duration_ms: int | None = None
    preview_url: str | None = None
    spotify_id: str | None = None
    musicbrainz_recording_id: str | None = None
    audio_features: dict | None = None
    avg_rating: float | None = None
    rating_count: int = 0

    model_config = {"from_attributes": True}


class AlbumDetail(BaseModel):
    release_type: str = "album"
    format: str | None = None
    catalog_number: str | None = None
    barcode: str | None = None
    track_count: int = 0
    disc_count: int = 0
    duration_ms: int | None = None
    spotify_id: str | None = None
    musicbrainz_id: str | None = None
    musicbrainz_release_group_id: str | None = None
    spotify_url: str | None = None
    spotify_popularity: int | None = None
    preview_url: str | None = None
    audio_features: dict | None = None
    tracks: list[TrackOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def sort_tracks(self) -> Self:
        self.tracks = sorted(self.tracks, key=lambda t: (t.disc_number, t.track_number))
        return self


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

    avg_rating: float | None = None
    rating_count: int = 0
    like_count: int = 0
    watchlist_count: int = 0
    watched_count: int = 0
    played_count: int = 0
    started_count: int = 0
    listened_count: int = 0
    view_count: int = 0
    is_adult: bool = False
    user_interactions: UserInteractionState | None = None
    # Steam playtime (populated for authenticated users who own the game)
    steam_playtime_forever: int | None = None
    steam_playtime_2weeks: int | None = None
    steam_rtime_last_played: int | None = None

    # YouTube video (populated when user has a matched liked video for this media)
    youtube_video_id: str | None = None
    youtube_channel_title: str | None = None

    genres: list[GenreOut] = []
    external_ratings: list[ExternalRatingOut] = []
    credits: list[MediaCreditOut] = []
    involved_companies: list[InvolvedCompanyOut] = []
    releases: list[MediaReleaseOut] = []
    platforms: list[MediaPlatformOut] = []
    game_modes: list[MediaGameModeOut] = []
    watch_providers: list[MediaWatchProviderOut] = []

    movie: MovieDetail | None = None
    show: ShowDetail | None = None
    game: GameDetail | None = None
    album: AlbumDetail | None = None
    collection: CollectionOut | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def extract_collection(cls, data: object) -> object:
        """Extract collection from movie.collection — MediaItem doesn't have a direct collection attr."""
        if hasattr(data, "movie") and data.movie is not None:
            coll = getattr(data.movie, "collection", None)
            if coll is not None and coll.movies:
                coll.movies.sort(
                    key=lambda m: m.media_item.release_date or date.min, reverse=True,
                )
            data.collection = coll
        return data


# ── Local game sync (desktop → backend) ─────────────────────────────


class SyncedLocalGame(BaseModel):
    title: str
    platform: str
    otix_media_id: str | None = None
    match_suggestion_media_id: str | None = None


class SyncLocalGamesRequest(BaseModel):
    games: list[SyncedLocalGame]


class SyncLocalGamesResponse(BaseModel):
    upserted: int = 0
    deleted: int = 0


# ── Installed games response (for /library/installed) ───────────────


class InstalledGameSummary(BaseModel):
    """A game installed on the user's desktop, enriched with catalog data."""

    id: str  # UserLocalGame.id
    title: str
    platform: str
    media_item_id: str | None = None
    match_suggestion_media_id: str | None = None
    last_seen_at: str | None = None
    # Enriched catalog fields (null if unmatched)
    catalog_title: str | None = None
    catalog_slug: str | None = None
    catalog_poster_url: str | None = None
    catalog_textless_poster_url: str | None = None
    catalog_logo_url: str | None = None
    catalog_avg_rating: float | None = None

    model_config = {"from_attributes": True}


class InstalledGamesResponse(BaseModel):
    games: list[InstalledGameSummary]
    total: int = 0
