# TODO: Review this file
from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Self

from pydantic import BaseModel, Field, model_validator

from otix.schemas.admin_edit import MediaAssetOut
from otix.schemas.common import PaginatedResponse
from otix.schemas.interaction import UserInteractionState
from otix.schemas.user import UserSearchResult
from otix.services.asset_selection import resolved_assets_view

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
    logo_color_guess: str | None = None
    icon_url: str | None = None
    release_date: date | None = None
    popularity: float
    avg_rating: float | None = None
    rating_count: int = 0
    overall_rating: float | None = None
    overall_rating_source: str | None = None
    like_count: int = 0
    watchlist_count: int = 0
    watched_count: int = 0
    played_count: int = 0
    started_count: int = 0
    listened_count: int = 0
    view_count: int = 0
    is_adult: bool = False
    new_season_released: bool = False
    new_season_release_date: date | None = None
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

    @model_validator(mode="before")
    @classmethod
    def _use_resolved_assets(cls, data: object) -> object:
        """Prefer query-time resolved asset URLs over legacy media_items columns."""
        if isinstance(data, dict):
            return data
        return resolved_assets_view(data, cls.model_fields)


class TrackSearchResult(BaseModel):
    id: str
    title: str
    track_number: int
    disc_number: int = 1
    duration_ms: int | None = None
    preview_url: str | None = None
    avg_rating: float | None = None
    rating_count: int = 0
    album_id: str
    album_title: str
    album_poster_url: str | None = None
    album_artist_name: str | None = None
    album_slug: str
    media_type: str = "track"

    model_config = {"from_attributes": True}


class MediaItemListResponse(PaginatedResponse):
    items: list[MediaItemSummary]
    tracks: list[TrackSearchResult] = Field(default_factory=list)
    total: int | None = None
    backfill_pending: bool = False


class PersonSearchResult(BaseModel):
    """Minimal person schema for grouped search results."""

    id: str
    name: str
    photo_url: str | None = None
    media_type: str = "person"

    model_config = {"from_attributes": True}


class StructuredSearchResponse(BaseModel):
    """Search results grouped by type, with tracks, people, and users."""

    best_results: list[MediaItemSummary | PersonSearchResult | UserSearchResult | TrackSearchResult] = Field(
        default_factory=list
    )
    movies: list[MediaItemSummary] = Field(default_factory=list)
    shows: list[MediaItemSummary] = Field(default_factory=list)
    games: list[MediaItemSummary] = Field(default_factory=list)
    music: list[MediaItemSummary] = Field(default_factory=list)
    tracks: list[TrackSearchResult] = Field(default_factory=list)
    people: list[PersonSearchResult] = Field(default_factory=list)
    users: list[UserSearchResult] = Field(default_factory=list)
    total: int = 0
    movies_count: int = 0
    shows_count: int = 0
    games_count: int = 0
    music_count: int = 0
    tracks_count: int = 0
    people_count: int = 0
    users_count: int = 0


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


class ProviderSearchRequest(BaseModel):
    """Unified search across Otix, IGDB, and SteamGrid."""

    query: str
    limit: int = Field(default=12, ge=1, le=50)


class ProviderSearchResult(BaseModel):
    """A single result from any provider."""

    provider: str  # "otix" | "igdb" | "steamgrid"
    id: str
    title: str
    poster_url: str | None = None
    slug: str | None = None
    confidence: float | None = None


class ProviderSearchResponse(BaseModel):
    items: list[ProviderSearchResult]
    backfill_pending: bool = False


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

    @model_validator(mode="before")
    @classmethod
    def _use_resolved_assets(cls, data: object) -> object:
        """Prefer query-time resolved asset URLs over legacy media_items columns."""
        if isinstance(data, dict):
            return data
        return resolved_assets_view(data, cls.model_fields)


class SteamWishlistListResponse(PaginatedResponse):
    items: list[SteamWishlistItemSummary]
    total: int | None = None


# ── Game matching (internal API / batch) ────────────────────────


class MatchType(StrEnum):
    """How a match candidate was found. Used for ranking and UI display."""

    DIRECT = "direct"  # external_ids table hit
    EXACT_TITLE = "exact_title"  # exact title match in Otix catalog
    ILIKE = "ilike"  # ILIKE pattern match in Otix
    TRIGRAM = "trigram"  # pg_trgm similarity fallback
    IGDB_CROSSREF = "igdb_crossref"  # IGDB external_games API (category 26)
    IGDB_SEARCH = "igdb_search"  # IGDB title search (exact)
    IGDB_FUZZY = "igdb_fuzzy"  # IGDB title search (fuzzy)
    NONE = "none"  # no match found


class ExternalIDRef(BaseModel):
    """A reference to an external ID from a provider (IGDB, Steam, etc.)."""

    source: str
    id: str


class GameMatchRequest(BaseModel):
    """A single game to match, sent from the frontend or external caller."""

    query_id: str = ""  # caller-provided correlation ID (e.g. "epic:AppName")
    title: str
    developer: str | None = None
    publisher: str | None = None
    platforms: list[str] | None = None
    release_year: int | None = None
    release_date: date | None = None
    external_ids: list[ExternalIDRef] | None = None
    media_type: str = "game"
    poster_url: str | None = None  # source store poster (Epic, GOG, etc.)
    is_dlc: bool = False
    dlc_of: str | None = None
    is_beta: bool = False
    beta_of: str | None = None
    is_demo: bool = False
    demo_of: str | None = None
    game_type: str | None = None
    parent_game_id: str | None = None
    parent_game_title: str | None = None


class GameMatchCandidate(BaseModel):
    """A single match candidate for a game query."""

    media_item_id: str | None = None
    title: str
    poster_url: str | None = None
    backdrop_url: str | None = None
    textless_poster_url: str | None = None
    logo_url: str | None = None
    icon_url: str | None = None
    release_year: int | None = None
    platforms: list[str] | None = None
    developer: str | None = None
    confidence: float
    match_type: MatchType
    needs_import: bool = False
    provider_id: str | None = None  # IGDB game ID for import reference
    provider: str | None = None  # "igdb", "steamgrid", etc.
    game_type: str | None = None
    is_dlc: bool = False
    is_beta: bool = False
    is_demo: bool = False
    parent_game_title: str | None = None


class GameMatchResponse(BaseModel):
    """Per-game match response. Contains ranked candidates and optional auto-match."""

    query_id: str = ""
    query_title: str
    candidates: list[GameMatchCandidate] = []  # ranked best first
    auto_match: GameMatchCandidate | None = None  # non-null when auto-matched


class GameMatchBatchRequest(BaseModel):
    """Batch request to match multiple games in one call."""

    games: list[GameMatchRequest]


class GameMatchBatchResponse(BaseModel):
    """Batch response with a result for each requested game."""

    matches: list[GameMatchResponse]


class ConfirmMatchRequest(BaseModel):
    """User confirms a match candidate (or rejects all)."""

    query_id: str  # "epic:AppName"
    media_item_id: str | None = None  # Otix media item to link
    igdb_id: int | None = None  # IGDB ID if game needs importing
    rejected: bool = False  # user explicitly rejected all
    rejected_permanently: bool = False  # never suggest again


class ConfirmMatchResponse(BaseModel):
    success: bool
    media_item_id: str | None = None
    error: str | None = None


# ── SSE stream events for batch match progress ────────────────────


class StreamMatchEvent(BaseModel):
    """Emitted per game during a batch match SSE stream."""

    game_index: int
    total_games: int
    query_id: str
    query_title: str
    status: str  # "matched" | "unmatched" | "error"
    candidates_count: int = 0
    auto_match: bool = False
    match: GameMatchCandidate | None = None
    candidates: list[GameMatchCandidate] | None = None
    hydrated: dict | None = None  # full MediaItem detail when auto-matched + hydrate=true
    proposal_status: str | None = None  # "approved" | "pending" — set when auto-matched
    error: str | None = None


class StreamCompleteEvent(BaseModel):
    """Emitted when a batch match SSE stream completes."""

    total_games: int
    matched_count: int
    unmatched_count: int
    errored_count: int
    duration_ms: int


# ── Backward-compat alias (old code expects GameMatchResult) ─────
# Remove once all consumers updated to GameMatchResponse.
GameMatchResult = GameMatchResponse


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
    def _use_resolved_assets(cls, data: object) -> object:
        """Prefer query-time resolved asset URLs over legacy media_items columns."""
        if isinstance(data, dict):
            return data
        return resolved_assets_view(data, cls.model_fields)

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


class CompanySearchListResponse(BaseModel):
    items: list[CompanyOut]
    total: int | None = None
    has_more: bool


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
    time_to_beat: dict | None = None
    game_type: str | None = "main_game"
    parent_game_id: str | None = None
    parent_game_title: str | None = None
    is_dlc: bool = False
    is_beta: bool = False
    is_demo: bool = False

    model_config = {"from_attributes": True}


class TrackOut(BaseModel):
    id: str
    track_number: int
    disc_number: int = 1
    title: str
    duration_ms: int | None = None
    preview_url: str | None = None
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
    musicbrainz_id: str | None = None
    musicbrainz_release_group_id: str | None = None
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
    logo_color_guess: str | None = None
    release_date: date | None = None
    popularity: float
    original_language: str | None = None
    completeness_score: float
    created_at: datetime
    updated_at: datetime

    avg_rating: float | None = None
    rating_count: int = 0
    overall_rating: float | None = None
    overall_rating_source: str | None = None
    like_count: int = 0
    watchlist_count: int = 0
    watched_count: int = 0
    played_count: int = 0
    started_count: int = 0
    listened_count: int = 0
    view_count: int = 0
    is_adult: bool = False
    new_season_released: bool = False
    new_season_release_date: date | None = None
    user_interactions: UserInteractionState | None = None
    # Steam playtime (populated for authenticated users who own the game)
    steam_playtime_forever: int | None = None
    steam_playtime_2weeks: int | None = None
    steam_rtime_last_played: int | None = None

    # YouTube video (populated when user has a matched liked video for this media)
    youtube_video_id: str | None = None
    youtube_channel_title: str | None = None

    genres: list[GenreOut] = []
    credits: list[MediaCreditOut] = []
    involved_companies: list[InvolvedCompanyOut] = []
    releases: list[MediaReleaseOut] = []
    platforms: list[MediaPlatformOut] = []
    game_modes: list[MediaGameModeOut] = []
    watch_providers: list[MediaWatchProviderOut] = []
    screenshots: list[MediaAssetOut] = []

    movie: MovieDetail | None = None
    show: ShowDetail | None = None
    game: GameDetail | None = None
    album: AlbumDetail | None = None
    collection: CollectionOut | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _use_resolved_assets(cls, data: object) -> object:
        """Prefer query-time resolved asset URLs over legacy media_items columns."""
        if isinstance(data, dict):
            return data
        return resolved_assets_view(data, cls.model_fields)

    @model_validator(mode="before")
    @classmethod
    def extract_collection(cls, data: object) -> object:
        """Extract collection from movie.collection — MediaItem doesn't have a direct collection attr."""
        if hasattr(data, "movie") and data.movie is not None:
            coll = getattr(data.movie, "collection", None)
            if coll is not None and coll.movies:
                coll.movies.sort(
                    key=lambda m: m.media_item.release_date or date.min,
                    reverse=True,
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


# ── Installed game response (for /library/installed) ───────────────


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


class YoutubeLikedVideoOut(BaseModel):
    """A raw YouTube liked video, matched or unmatched to catalog."""

    video_id: str
    title: str
    channel_title: str
    channel_id: str
    thumbnail_url: str | None = None
    published_at: str = ""
    # Matched catalog item
    matched_media_item_id: str | None = None
    matched_title: str | None = None
    matched_artist: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class YoutubeLibraryResponse(BaseModel):
    items: list[YoutubeLikedVideoOut]
    next_cursor: str | None = None
    has_more: bool = False
