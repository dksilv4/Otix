"""Shared enrichment for media-item summary cards in library reads.

Port of the legacy ``asset_selection`` service. ``media_assets`` is the single
source of truth for artwork; the best URL per type is picked at read time and
cached on each ORM object as ``_resolved_*`` attributes. Endpoint-specific
overlays (plex/steam play state, interaction state) are attached the same way so
the summary serializers stay free of query logic.
"""

from collections import defaultdict
from collections.abc import Iterable
from datetime import date, datetime

from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ObjectDoesNotExist

from apps.media.models import ExternalID, MediaAsset, MediaItem

# asset_type -> summary key suffix (legacy ``FIELD_SUFFIX``).
_ASSET_SUFFIX: dict[str, str] = {
    "poster": "poster_url",
    "backdrop": "backdrop_url",
    "logo": "logo_url",
    "textless_poster": "textless_poster_url",
    "icon": "icon_url",
}

# Lower index = preferred. Labels not listed rank last (999).
_LABEL_PREF: dict[str, dict[str, int]] = {
    "poster": {
        "textless": 0,
        "no_logo": 0,
        "material": 1,
        "clean": 1,
        "alternate": 2,
        "official": 3,
        "white_logo": 4,
        "white": 5,
    },
    "backdrop": {"material": 0, "clean": 1, "official": 2, "blurred": 3},
    "logo": {"multicolor": 0, "official": 0, "white": 1, "custom": 2, "black": 3},
    "textless_poster": {"textless": 0, "no_logo": 0},
    "icon": {"official": 0, "custom": 1},
}


def _iso(value: date | datetime | None) -> str | None:
    """Render a date/datetime as the ISO string the legacy JSON API returned."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def _lang_rank(asset: MediaAsset, original_language: str | None = None) -> int:
    asset_type = (asset.asset_type or "").lower()
    if asset_type not in ("logo", "icon", "poster"):
        return 0
    lang = (asset.lang or "").lower().strip()
    if lang in ("en", "eng"):
        return 3
    if not lang or lang in ("00", "zxx", "xx"):
        return 2
    if original_language and lang == original_language.lower().strip():
        return 1
    return 0


def _pick_best(
    assets: list[MediaAsset],
    label_pref: dict[str, int],
    *,
    prefer_png: bool,
    original_language: str | None = None,
) -> MediaAsset | None:
    best: MediaAsset | None = None
    best_key: tuple | None = None
    for asset in assets:
        key = (
            -_lang_rank(asset, original_language),
            label_pref.get(asset.label or "", 999),
            -(asset.score or 0),
            -(asset.width or 0),
        )
        if prefer_png and asset.url.lower().endswith(".png"):
            key = (key[0], key[1] - 0.5, *key[2:])
        if best_key is None or key < best_key:
            best_key, best = key, asset
    return best


def _subtype(item: MediaItem, name: str):
    """Access a reverse one-to-one subtype row without raising when absent."""
    try:
        return getattr(item, name)
    except ObjectDoesNotExist:
        return None


def _attach_resolved_assets(items: list[MediaItem]) -> None:
    item_ids = [item.id for item in items]
    by_item: dict[tuple[int, str], list[MediaAsset]] = defaultdict(list)
    for asset in MediaAsset.objects.filter(media_item_id__in=item_ids):
        by_item[(asset.media_item_id, asset.asset_type)].append(asset)

    for item in items:
        orig_lang = getattr(item, "original_language", None)
        for asset_type, suffix in _ASSET_SUFFIX.items():
            if asset_type == "backdrop":
                # Textless backdrop is the family textless art; when one exists it
                # wins the served background over any texted backdrop row.
                best: MediaAsset | None = None
                for source_type in ("textless_backdrop", "backdrop"):
                    usable = [a for a in by_item[(item.id, source_type)] if a.url]
                    if not usable:
                        continue
                    best = _pick_best(
                        usable,
                        _LABEL_PREF.get(source_type, {}),
                        prefer_png=False,
                        original_language=orig_lang,
                    )
                    break
                item._resolved_backdrop_url = best.url if best is not None else None
                continue
            assets = by_item[(item.id, asset_type)]
            best = _pick_best(
                assets,
                _LABEL_PREF.get(asset_type, {}),
                prefer_png=asset_type == "icon",
                original_language=orig_lang,
            )
            setattr(item, f"_resolved_{suffix}", best.url if best is not None else None)
            if asset_type == "logo":
                item._resolved_logo_color_guess = best.color_guess if best is not None else None
        # No explicit textless poster -> fall back to the clean backdrop art.
        if getattr(item, "_resolved_textless_poster_url", None) is None and getattr(
            item, "_resolved_backdrop_url", None
        ):
            item._resolved_textless_poster_url = item._resolved_backdrop_url


def _attach_tmdb_ids(items: list[MediaItem]) -> None:
    if not items:
        return
    content_type = ContentType.objects.get_for_model(MediaItem)
    rows = ExternalID.objects.filter(
        content_type=content_type,
        object_id__in=[item.id for item in items],
        provider="tmdb",
    ).values_list("object_id", "external_id")
    mapping = {object_id: external_id for object_id, external_id in rows}
    for item in items:
        item._resolved_tmdb_id = mapping.get(item.id)


def _attach_movie_fields(item: MediaItem) -> None:
    if item.media_type == "movie":
        movie = _subtype(item, "movie")
        item._budget = movie.budget if movie is not None else None
        item._revenue = movie.revenue if movie is not None else None
    else:
        item._budget = None
        item._revenue = None


def _attach_album_fields(item: MediaItem) -> None:
    item._album_track_count = None
    item._album_musicbrainz_release_group_id = None
    item._album_artist_name = None


def enrich_media_items(
    items: Iterable[MediaItem],
    overlays: dict[int, dict[str, object]] | None = None,
) -> list[MediaItem]:
    """Attach resolved assets/tmdb ids/subtype fields and per-endpoint overlays.

    Mutates each MediaItem in place (``_resolved_*`` and overlay attributes) and
    returns the item list. ``overlays`` maps media item id to attribute dicts
    (e.g. ``{"_plex_view_count": 3}``) matching legacy ``enrich_items_with_assets``.
    """
    materialized = list(items)
    if not materialized:
        return []
    _attach_resolved_assets(materialized)
    _attach_tmdb_ids(materialized)
    for item in materialized:
        _attach_movie_fields(item)
        _attach_album_fields(item)
    if overlays:
        for item in materialized:
            overlay = overlays.get(item.id)
            if overlay:
                for attr, value in overlay.items():
                    setattr(item, attr, value)
    return materialized


def build_media_item_summary(item: MediaItem) -> dict:
    """Assemble the exact legacy ``MediaItemSummary`` payload for one item."""
    return {
        "id": item.id,
        "media_type": item.media_type,
        "title": item.title,
        "slug": item.slug,
        "tmdb_id": getattr(item, "_resolved_tmdb_id", None),
        "poster_url": getattr(item, "_resolved_poster_url", None),
        "textless_poster_url": getattr(item, "_resolved_textless_poster_url", None),
        "backdrop_url": getattr(item, "_resolved_backdrop_url", None),
        "logo_url": getattr(item, "_resolved_logo_url", None),
        "logo_color_guess": getattr(item, "_resolved_logo_color_guess", None),
        "icon_url": getattr(item, "_resolved_icon_url", None),
        "release_date": _iso(item.release_date),
        "popularity": item.popularity,
        "avg_rating": item.avg_rating,
        "rating_count": item.rating_count,
        "overall_rating": item.overall_rating,
        "overall_rating_source": item.overall_rating_source,
        "like_count": item.like_count,
        "watchlist_count": item.watchlist_count,
        "watched_count": item.watched_count,
        "played_count": item.played_count,
        "started_count": item.started_count,
        "listened_count": item.listened_count,
        "view_count": item.view_count,
        "is_adult": item.is_adult,
        "new_season_released": False,
        "new_season_release_date": None,
        "user_interactions": getattr(item, "_user_interactions", None),
        "steam_playtime_forever": getattr(item, "_steam_playtime_forever", None),
        "steam_playtime_2weeks": getattr(item, "_steam_playtime_2weeks", None),
        "steam_rtime_last_played": getattr(item, "_steam_rtime_last_played", None),
        "plex_view_count": getattr(item, "_plex_view_count", None),
        "plex_last_viewed_at": _iso(getattr(item, "_plex_last_viewed_at", None)),
        "album_artist_name": getattr(item, "_album_artist_name", None),
        "album_track_count": getattr(item, "_album_track_count", None),
        "album_musicbrainz_release_group_id": getattr(
            item, "_album_musicbrainz_release_group_id", None
        ),
        "revenue": getattr(item, "_revenue", None),
        "budget": getattr(item, "_budget", None),
    }
