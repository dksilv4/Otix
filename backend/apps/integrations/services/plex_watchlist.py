"""Plex watchlist sync — provider→catalog media-seeding engine.

Ports the legacy ``sync_plex_watchlist``: fetch the user's plex.tv watchlist,
keep only movie/show items, and for each resolve an existing catalog
``MediaItem`` (via the recorded plex guid, or the third-party imdb/tmdb/tvdb
guids) or seed a stub movie/show row, then upsert the user's ``watchlisted``
interaction. Returns ``{total, matched, seeded}``.

The first provider→catalog seeding route; its match/seed helpers are the ones
later sync routes (steam/tmdb) will share.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import UTC, date, datetime
from typing import Any

from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from django.utils.text import slugify

from apps.integrations.services import plex as _plex
from apps.media.models import ExternalID, MediaItem, Movie, Show
from apps.media.services.completeness import recompute_completeness
from apps.media.services.interaction import set_interaction

logger = logging.getLogger(__name__)

PLEX_WATCHLIST_URL = (
    "https://discover.provider.plex.tv/library/sections/watchlist/all?includeGuids=1"
)

_GUID_PATTERNS = (
    ("imdb", r"(tt\d+)"),
    ("tmdb", r"tmdb://(\d+)|themoviedb://(\d+)"),
    ("tvdb", r"tvdb://(\d+)"),
    ("musicbrainz", r"mbid://([a-f0-9-]{36})"),
)


def _parse_guid_id(value: str) -> tuple[str, str] | None:
    """Extract ``(provider, external_id)`` from a Plex guid string, if recognized."""
    lowered = value.lower()
    for provider, pattern in _GUID_PATTERNS:
        match = re.search(pattern, lowered)
        if match:
            external_id = next(group for group in match.groups() if group)
            return provider, external_id
    return None


def extract_guids(item: dict) -> dict[str, str]:
    """Map third-party guid references on a Plex item to ``{provider: id}``.

    The item's own ``guid`` and each ``Guid.id`` are scanned; the plex guid
    itself never matches (its scheme is not in the patterns).
    """
    result: dict[str, str] = {}
    values = [item.get("guid")]
    values.extend(guid.get("id") for guid in _plex._as_list(item.get("Guid")))
    for value in values:
        if not value:
            continue
        parsed = _parse_guid_id(str(value))
        if parsed:
            result.setdefault(parsed[0], parsed[1])
    return result


def _watchlist_media_type(item: dict) -> str | None:
    plex_type = item.get("type")
    if plex_type in ("movie", "show"):
        return plex_type
    return None


def _parse_plex_date(value: Any) -> date | None:
    """Parse a Plex date string (``YYYY-MM-DD``) into a Python date."""
    if value is None:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None


def _dt_from_plex(value: Any) -> datetime | None:
    """Parse a Plex unix-seconds string into a tz-aware datetime."""
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=UTC)
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def _media_content_type() -> ContentType:
    return ContentType.objects.get_for_model(MediaItem)


def _find_media_id(media_ct, provider: str, external_id: str, *, media_type: str) -> int | None:
    """Return the ``MediaItem`` id recorded for an ``ExternalID``, else None."""
    return (
        ExternalID.objects.filter(
            content_type=media_ct,
            provider=provider,
            external_id=external_id,
            media_type=media_type,
        )
        .values_list("object_id", flat=True)
        .first()
    )


def _upsert_external(
    media_ct, media_item_id: int, provider: str, external_id: str, media_type: str | None
) -> None:
    """Create-or-update one ``ExternalID`` row keyed by its natural key."""
    row, created = ExternalID.objects.get_or_create(
        content_type=media_ct,
        provider=provider,
        external_id=external_id,
        media_type=media_type,
        defaults={"object_id": media_item_id},
    )
    if not created and row.object_id != media_item_id:
        row.object_id = media_item_id
        row.save(update_fields=("object_id", "updated_at"))


def _find_or_seed_media(
    media_ct, item: dict, media_type: str, plex_guid: str | None, guids: dict[str, str]
) -> tuple[int, bool]:
    """Resolve a Plex movie/show to a ``MediaItem`` id, seeding a stub if new.

    Returns ``(media_item_id, was_matched)``: True when an existing catalog
    entry was resolved (via the recorded plex guid, then third-party guids),
    False when a stub was created.
    """
    if plex_guid:
        media_id = _find_media_id(media_ct, "plex", plex_guid, media_type=None)
        if media_id is not None:
            return media_id, True

    for provider, external_id in guids.items():
        media_id = _find_media_id(media_ct, provider, external_id, media_type=media_type)
        if media_id is not None:
            # Record the plex guid so later syncs resolve directly.
            if plex_guid:
                _upsert_external(media_ct, media_id, "plex", plex_guid, None)
            return media_id, True

    title = str(item.get("title") or "Untitled").strip()
    year = item.get("year")
    slug = slugify(f"{title}-{year}") if year else slugify(title)
    media = MediaItem.objects.create(
        media_type=media_type,
        title=title,
        slug=slug or slugify(media_type),
        overview=item.get("summary"),
        release_date=_parse_plex_date(item.get("originallyAvailableAt")),
        completeness_score=0.15,
        next_sync_at=timezone.now(),
    )
    if media_type == "movie":
        Movie.objects.create(media_item=media)
    else:
        Show.objects.create(media_item=media)
    if plex_guid:
        _upsert_external(media_ct, media.pk, "plex", plex_guid, None)
    for provider, external_id in guids.items():
        _upsert_external(media_ct, media.pk, provider, external_id, media_type)
    # The stub's 0.15 create-time base is a placeholder, not its graph truth.
    recompute_completeness(media)
    return media.pk, False


def sync_plex_watchlist(user) -> dict:
    """Fetch the user's Plex watchlist and seed/match + watchlist every movie/show.

    Mirrors the legacy response ``{total, matched, seeded}``; any failure (no
    linked token, fetch error, bad payload) yields zeros — never raises.
    """
    if not user.plex_auth_token:
        return {"total": 0, "matched": 0, "seeded": 0}

    url = _plex._with_token(PLEX_WATCHLIST_URL, user.plex_auth_token)
    try:
        status, raw = _plex._request(url, headers=_plex._plex_headers(), timeout=30.0)
    except Exception:
        logger.exception("failed to fetch plex watchlist user=%s", user.id)
        return {"total": 0, "matched": 0, "seeded": 0}
    if status != 200:
        logger.warning("plex watchlist fetch status=%s user=%s", status, user.id)
        return {"total": 0, "matched": 0, "seeded": 0}
    try:
        data = json.loads(raw)
    except Exception:
        logger.exception("plex watchlist returned non-json body user=%s", user.id)
        return {"total": 0, "matched": 0, "seeded": 0}

    items = _plex._container_items(data)
    items = [item for item in items if _watchlist_media_type(item) in ("movie", "show")]

    media_ct = _media_content_type()
    total = matched = seeded = 0
    for item in items:
        media_type = item.get("type")
        total += 1
        plex_guid = item.get("guid")
        if plex_guid is not None:
            plex_guid = str(plex_guid)
        guids = extract_guids(item)
        media_item_id, was_matched = _find_or_seed_media(
            media_ct, item, media_type, plex_guid, guids
        )
        if was_matched:
            matched += 1
        else:
            seeded += 1

        added_at = _dt_from_plex(item.get("addedAt"))
        extra_data: dict[str, Any] = {"source": "plex"}
        if added_at is not None:
            extra_data["added_at"] = added_at.isoformat()
        set_interaction(user, media_item_id, "watchlisted", extra_data)

    logger.info(
        "plex watchlist sync user=%s total=%s matched=%s seeded=%s",
        user.id,
        total,
        matched,
        seeded,
    )
    return {"total": total, "matched": matched, "seeded": seeded}
