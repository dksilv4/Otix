from __future__ import annotations

from datetime import date, datetime
from pydantic import BaseModel, model_validator

from otix.api.schemas.common import PaginatedResponse
from otix.api.schemas.interaction import UserInteractionState


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
    logo_url: str | None = None
    release_date: date | None = None
    popularity: float
    avg_rating: float | None = None
    rating_count: int = 0
    like_count: int = 0
    watchlist_count: int = 0
    watched_count: int = 0
    played_count: int = 0
    started_count: int = 0
    user_interactions: UserInteractionState | None = None
    steam_playtime_forever: int | None = None
    steam_playtime_2weeks: int | None = None
    steam_rtime_last_played: int | None = None
    plex_view_count: int | None = None
    plex_last_viewed_at: datetime | None = None

    model_config = {"from_attributes": True}


class MediaItemListResponse(PaginatedResponse):
    items: list[MediaItemSummary]
    total: int | None = None
    backfill_pending: bool = False


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

    avg_rating: float | None = None
    rating_count: int = 0
    like_count: int = 0
    watchlist_count: int = 0
    watched_count: int = 0
    played_count: int = 0
    started_count: int = 0
    user_interactions: UserInteractionState | None = None

    # Steam playtime (populated for authenticated users who own the game)
    steam_playtime_forever: int | None = None
    steam_playtime_2weeks: int | None = None
    steam_rtime_last_played: int | None = None

    genres: list[GenreOut] = []
    external_ratings: list[ExternalRatingOut] = []
    credits: list[MediaCreditOut] = []
    involved_companies: list[InvolvedCompanyOut] = []
    platforms: list[MediaPlatformOut] = []
    game_modes: list[MediaGameModeOut] = []

    movie: MovieDetail | None = None
    show: ShowDetail | None = None
    game: GameDetail | None = None
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
