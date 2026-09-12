"""Canonical hydration-completeness flags + score for a media item.

Single source of truth for what makes a ``MediaItem`` "fully processed" — the
legacy ``services/completeness.py`` port that the ingest pipeline and the admin
hydration-status panel share (increment 51). The stored ``completeness_score``
is the fraction of satisfied flags for the item's media type (1.0 = every flag
for the type is present). Each catalog-ingest seed/hydration tail recomputes +
persists the score via ``recompute_completeness`` after adding enrichment, so a
seeded row reads its truthful score rather than the arbitrary ``0.15`` base the
create path stamps; the admin panel scores live from the same functions so the
two can never drift.

Embeddings are deferred from the schema, so ``has_embedding`` is always False.
Game ingest has produced screenshot/backdrop assets, videos and age-rating
``MediaRelease`` rows since increment 55, so those flags now read True for a fully
hydrated game. Flags for a media type's inapplicable subtype columns (e.g.
``has_runtime`` on a game) are returned as ``None`` to keep the admin payload
shape stable.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from django.core.exceptions import ObjectDoesNotExist

if TYPE_CHECKING:
    from apps.media.models import MediaItem

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

TYPE_FLAG_GROUPS = {
    "movie": [
        "has_original_language",
        "has_runtime",
        "has_budget",
        "has_revenue",
        "has_collection",
    ],
    "show": ["has_original_language", "has_show_status", "has_episodes"],
    "game": ["has_platforms", "has_game_modes", "has_age_ratings"],
}


def required_flags(media_type: str) -> list[str]:
    """The flag names that count toward a media type's completeness score."""
    group = TYPE_FLAG_GROUPS.get(media_type)
    if group:
        return CORE_FLAGS + RELATION_FLAGS + group
    return CORE_FLAGS + RELATION_FLAGS


def score_from_flags(media_type: str, flags: dict[str, Any]) -> float:
    """Compute the 0..1 completeness score from the flag booleans."""
    required = required_flags(media_type)
    if not required:
        return 0.0
    hits = sum(1 for flag in required if flags.get(flag))
    return round(hits / len(required), 3)


def completeness_flags(media_item: MediaItem) -> dict[str, bool | None]:
    """Evaluate the full hydration flag set for one media item."""
    has_assets_poster = media_item.assets.filter(
        asset_type__in=("poster", "textless_poster")
    ).exists()
    has: dict[str, bool | None] = {
        "has_overview": bool(media_item.overview),
        "has_poster": has_assets_poster,
        "has_backdrop": bool(media_item.assets.filter(asset_type="backdrop").exists()),
        "has_logo": bool(media_item.assets.filter(asset_type="logo").exists()),
        "has_textless_poster": bool(
            media_item.assets.filter(asset_type="textless_poster").exists()
        ),
        "has_release_date": media_item.release_date is not None,
        "has_embedding": False,  # embedding vector deferred from the schema
        "has_original_language": media_item.original_language is not None,
        "has_genres": media_item.media_genres.exists(),
        "has_credits": media_item.credits.exists(),
        "has_external_ids": media_item.external_ids.exists(),
        "has_external_ratings": media_item.external_ratings.exists(),
        "has_videos": media_item.videos.exists(),
        "has_assets": media_item.assets.exists(),
        "has_releases": media_item.releases.exists(),
        "has_keywords": media_item.media_keywords.exists(),
        "has_companies": media_item.involved_companies.exists(),
        "has_watch_providers": media_item.watch_providers.exists(),
    }
    media_type = media_item.media_type
    has["has_runtime"] = has["has_budget"] = has["has_revenue"] = has["has_collection"] = None
    has["has_show_status"] = has["has_episodes"] = None
    has["has_platforms"] = has["has_game_modes"] = has["has_age_ratings"] = None
    if media_type == "movie":
        has["has_runtime"] = _subtype_bool(media_item, "movie", "runtime")
        has["has_budget"] = _subtype_bool(media_item, "movie", "budget")
        has["has_revenue"] = _subtype_bool(media_item, "movie", "revenue")
        has["has_collection"] = _subtype_bool(media_item, "movie", "collection")
    elif media_type == "show":
        has["has_show_status"] = _subtype_bool(media_item, "show", "status")
        has["has_episodes"] = _subtype_bool(media_item, "show", "number_of_episodes")
    elif media_type == "game":
        has["has_platforms"] = media_item.platforms.exists()
        has["has_game_modes"] = media_item.game_modes.exists()
        has["has_age_ratings"] = media_item.releases.filter(certification__isnull=False).exists()
    return has


def _subtype_bool(media_item: MediaItem, accessor: str, field: str) -> bool:
    try:
        subtype = getattr(media_item, accessor)
    except (AttributeError, ObjectDoesNotExist):
        return False
    return bool(getattr(subtype, field, None))


def recompute_completeness(media_item: MediaItem) -> float:
    """Score ``media_item`` from its current graph and persist the result."""
    score = score_from_flags(media_item.media_type, completeness_flags(media_item))
    if media_item.completeness_score != score:
        media_item.completeness_score = score
        media_item.save(update_fields=("completeness_score", "updated_at"))
    return score
