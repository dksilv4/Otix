"""Plex library reads: item grid, sync status, and authenticated thumb URL.

All branches are DB-backed over the user's stored Plex servers/items. The only
"live" behaviour in the legacy surface (streaming a thumb from the Plex server)
never touches Plex here -- we just build the signed URL from the stored server
``base_url`` + ``access_token`` and redirect the client to it.
"""

from django.contrib.auth.models import AbstractBaseUser
from django.db.models import Count, Max

from apps.integrations.models import UserPlexItem
from apps.library.services.summaries import enrich_media_items
from apps.media.models import MediaItem

_MEDIA_SUBTYPE_SELECT = (
    "media_item",
    "media_item__movie",
    "media_item__show",
    "media_item__game",
)


class PlexThumbError(Exception):
    """Raised when a Plex thumbnail cannot be resolved; carries the legacy detail."""

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


def _plex_queryset(user: AbstractBaseUser, media_type: str | None, sort_by: str | None):
    queryset = UserPlexItem.objects.filter(user=user, media_item__isnull=False).select_related(
        *_MEDIA_SUBTYPE_SELECT
    )
    if media_type:
        queryset = queryset.filter(media_item__media_type=media_type)
    if sort_by == "title":
        return queryset.order_by("media_item__title", "id")
    if sort_by == "year":
        # Descending order puts NULL release dates last on sqlite.
        return queryset.order_by("-media_item__release_date", "id")
    # "artist" ordering requires a correlated artist-name subquery; approximate
    # with title ordering (noted divergence). Default/recent = last viewed first.
    return queryset.order_by("-last_viewed_at", "id")


def _iso_ts(value) -> str | None:
    return value.isoformat() if value is not None else None


def get_plex_library(
    user: AbstractBaseUser,
    *,
    cursor: str | None = None,
    limit: int = 48,
    media_type: str | None = None,
    sort_by: str | None = None,
) -> tuple[list[MediaItem], bool, str | None]:
    """Return ``(media_items, has_more, next_cursor)`` for the plex item grid.

    The legacy route treats ``cursor`` as a plain numeric offset. Media items are
    de-duplicated (a single title may exist under several Plex servers) and each
    carries ``_plex_view_count`` / ``_plex_last_viewed_at`` for the summary.
    """
    try:
        offset = max(int(cursor), 0) if cursor else 0
    except (TypeError, ValueError):
        offset = 0

    rows = list(_plex_queryset(user, media_type, sort_by)[offset : offset + limit + 1])
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    media_items: list[MediaItem] = []
    overlays: dict[int, dict[str, object]] = {}
    seen: set[int] = set()
    for plex_item in rows:
        item = plex_item.media_item
        if item.id in seen:
            continue
        seen.add(item.id)
        overlays[item.id] = {
            "_plex_view_count": plex_item.view_count,
            "_plex_last_viewed_at": plex_item.last_viewed_at,
        }
        media_items.append(item)

    enrich_media_items(media_items, overlays)
    next_cursor = str(offset + limit) if has_more else None
    return media_items, has_more, next_cursor


def get_plex_status(user: AbstractBaseUser) -> dict:
    """Return Plex sync status: item count and last-scanned timestamp."""
    if not user.plex_id:
        return {"item_count": 0, "last_scanned_at": None}
    aggregate = UserPlexItem.objects.filter(user=user).aggregate(
        count=Count("id"), last_scanned=Max("updated_at")
    )
    return {
        "item_count": aggregate["count"] or 0,
        "last_scanned_at": _iso_ts(aggregate["last_scanned"]),
    }


def get_plex_thumb_url(user: AbstractBaseUser, media_item_id: str) -> str:
    """Build the signed Plex thumbnail URL for a media item, or raise PlexThumbError.

    Mirrors the legacy router's three 404 states: no item/thumb, no server, and
    no auth token. Legacy fell back to ``user.plex_auth_token``; our user model
    has no such column, so the server ``access_token`` is the only token source.
    """
    try:
        item_id = int(media_item_id)
    except (TypeError, ValueError):
        raise PlexThumbError("No Plex thumbnail for this item") from None

    plex_item = (
        UserPlexItem.objects.filter(user=user, media_item_id=item_id)
        .select_related("server")
        .first()
    )
    if plex_item is None or not plex_item.thumb_url:
        raise PlexThumbError("No Plex thumbnail for this item")
    server = plex_item.server
    if server is None or not server.base_url:
        raise PlexThumbError("Plex server not found")
    token = server.access_token
    if not token:
        raise PlexThumbError("No Plex auth token")

    thumb = plex_item.thumb_url
    url = f"{server.base_url}{thumb}" if thumb.startswith("/") else thumb
    url = f"{url}{'&' if '?' in url else '?'}X-Plex-Token={token}"
    return url
