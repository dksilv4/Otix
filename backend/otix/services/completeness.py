"""Completeness scoring for media items.

Single source of truth for what makes an item "fully processed". Used by the
hydration pipeline (the persisted ``media_items.completeness_score`` gate).

A score of 1.0 means every flag for the item's media type is satisfied.
"""

from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy import case, select
from sqlalchemy import exists as sa_exists

from otix.domain.asset import ExternalRating, MediaAsset, MediaRelease, MediaVideo
from otix.domain.company import InvolvedCompany
from otix.domain.genre import MediaGenre, MediaKeyword
from otix.domain.media import (
    ExternalID,
    Game,
    MediaGameMode,
    MediaItem,
    MediaPlatform,
    Movie,
    Show,
)
from otix.domain.people import MediaCredit
from otix.domain.watch_provider import MediaWatchProvider

CORE_FLAG_COUNT = 7
RELATION_FLAG_COUNT = 10
TYPE_FLAG_COUNTS = {"movie": 5, "show": 3, "game": 3, "music": 0}

_ALL_TYPE_FLAGS = [
    "has_original_language",
    "has_runtime",
    "has_budget",
    "has_revenue",
    "has_collection",
    "has_show_status",
    "has_episodes",
    "has_platforms",
    "has_game_modes",
    "has_age_ratings",
]

CORE_FLAGS = [
    "has_overview",
    "has_poster",
    "has_backdrop",
    "has_logo",
    "has_textless_poster",
    "has_release_date",
    "has_embedding",
]

RELATION_FLAGS = [
    "has_genres",
    "has_credits",
    "has_external_ids",
    "has_external_ratings",
    "has_videos",
    "has_assets",
    "has_releases",
    "has_keywords",
    "has_companies",
    "has_watch_providers",
]


def _flags_for(media_type: str) -> list[str]:
    if media_type == "movie":
        return CORE_FLAGS + RELATION_FLAGS + [
            "has_original_language", "has_runtime", "has_budget", "has_revenue", "has_collection",
        ]
    if media_type == "show":
        return CORE_FLAGS + RELATION_FLAGS + ["has_original_language", "has_show_status", "has_episodes"]
    if media_type == "game":
        return CORE_FLAGS + RELATION_FLAGS + ["has_platforms", "has_game_modes", "has_age_ratings"]
    return CORE_FLAGS + RELATION_FLAGS


def completeness_select():
    """Return the list of boolean flag columns for per-flag completeness.

    Includes ``id`` and ``media_type`` plus one boolean label per flag. Callers
    select from ``media_items`` (outer-joining the type tables) and apply their
    own filters.
    """
    has_genres = sa_exists(MediaGenre.media_item_id == MediaItem.id).label("has_genres")
    has_credits = sa_exists(MediaCredit.media_item_id == MediaItem.id).label("has_credits")
    has_external_ids = sa_exists().where(
        ExternalID.entity_type == "media_item", ExternalID.entity_id == MediaItem.id
    ).label("has_external_ids")
    has_external_ratings = sa_exists(ExternalRating.media_item_id == MediaItem.id).label("has_external_ratings")
    has_videos = sa_exists(MediaVideo.media_item_id == MediaItem.id).label("has_videos")
    has_assets = sa_exists(MediaAsset.media_item_id == MediaItem.id).label("has_assets")
    has_releases = sa_exists(MediaRelease.media_item_id == MediaItem.id).label("has_releases")
    has_keywords = sa_exists(MediaKeyword.media_item_id == MediaItem.id).label("has_keywords")
    has_companies = sa_exists(InvolvedCompany.media_item_id == MediaItem.id).label("has_companies")
    has_watch_providers = sa_exists(MediaWatchProvider.media_item_id == MediaItem.id).label("has_watch_providers")

    has_poster = sa_exists().where(
        MediaAsset.media_item_id == MediaItem.id,
        MediaAsset.asset_type.in_(["poster", "textless_poster"]),
    ).label("has_poster")
    has_backdrop = sa_exists().where(
        MediaAsset.media_item_id == MediaItem.id,
        MediaAsset.asset_type == "backdrop",
    ).label("has_backdrop")
    has_logo = sa_exists().where(
        MediaAsset.media_item_id == MediaItem.id,
        MediaAsset.asset_type == "logo",
    ).label("has_logo")
    has_textless_poster = sa_exists().where(
        MediaAsset.media_item_id == MediaItem.id,
        MediaAsset.asset_type == "textless_poster",
    ).label("has_textless_poster")

    flags = [
        MediaItem.id.label("id"),
        MediaItem.media_type.label("media_type"),
        (MediaItem.overview.is_not(None)).label("has_overview"),
        has_poster,
        has_backdrop,
        has_logo,
        has_textless_poster,
        (MediaItem.release_date.is_not(None)).label("has_release_date"),
        (MediaItem.embedding.is_not(None)).label("has_embedding"),
        (MediaItem.original_language.is_not(None)).label("has_original_language"),
        has_genres,
        has_credits,
        has_external_ids,
        has_external_ratings,
        has_videos,
        has_assets,
        has_releases,
        has_keywords,
        has_companies,
        has_watch_providers,
        case((MediaItem.media_type == "movie", Movie.runtime.is_not(None))).label("has_runtime"),
        case((MediaItem.media_type == "movie", Movie.budget.is_not(None))).label("has_budget"),
        case((MediaItem.media_type == "movie", Movie.revenue.is_not(None))).label("has_revenue"),
        case((MediaItem.media_type == "movie", Movie.collection_id.is_not(None))).label("has_collection"),
        case((MediaItem.media_type == "show", Show.status.is_not(None))).label("has_show_status"),
        case((MediaItem.media_type == "show", Show.number_of_episodes.is_not(None))).label("has_episodes"),
        case((MediaItem.media_type == "game", sa_exists(MediaPlatform.media_item_id == MediaItem.id))).label("has_platforms"),
        case((MediaItem.media_type == "game", sa_exists(MediaGameMode.media_item_id == MediaItem.id))).label("has_game_modes"),
        case(
            (MediaItem.media_type == "game", sa_exists().where(
                MediaRelease.media_item_id == MediaItem.id, MediaRelease.certification.is_not(None)
            ))
        ).label("has_age_ratings"),
    ]
    return flags


def score_from_flags(media_type: str, flags: Mapping[str, bool]) -> float:
    """Compute 0..1 score from the flag booleans for a media type."""
    required = _flags_for(media_type)
    if not required:
        return 0.0
    hits = sum(1 for f in required if flags.get(f))
    return round(hits / len(required), 3)


async def compute_completeness(session, media_item_id: str) -> float:
    """Compute the completeness score for one media item."""
    cols = completeness_select()
    stmt = (
        select(*cols)
        .outerjoin(Movie, Movie.media_item_id == MediaItem.id)
        .outerjoin(Show, Show.media_item_id == MediaItem.id)
        .outerjoin(Game, Game.media_item_id == MediaItem.id)
        .where(MediaItem.id == media_item_id)
    )
    row = (await session.execute(stmt)).one_or_none()
    if row is None:
        return 0.0
    flags = {name: bool(getattr(row, name)) for name in _ALL_TYPE_FLAGS + CORE_FLAGS + RELATION_FLAGS}
    return score_from_flags(row.media_type, flags)


async def set_completeness(session, media_item_id: str) -> float:
    """Compute and persist the completeness score for a media item."""
    score = await compute_completeness(session, media_item_id)
    item = await session.get(MediaItem, media_item_id)
    if item is not None:
        item.completeness_score = score
    return score
