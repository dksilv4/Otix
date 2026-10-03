"""GOG library reads: matched grid, status, and unmatched games.

DB-backed queries over ``UserGOGGame``. Cursors are the integer row
``id`` after ``order_by("title", "id")``. Invalid cursors are ignored.
"""

from django.contrib.auth.models import AbstractBaseUser
from django.db.models import Count, Max

from apps.integrations.models import UserGOGGame
from apps.library.services.summaries import enrich_media_items
from apps.media.models import MediaItem

_MEDIA_SUBTYPE_SELECT = (
    "media_item",
    "media_item__movie",
    "media_item__show",
    "media_item__game",
)


def _iso_ts(value) -> str | None:
    return value.isoformat() if value is not None else None


def _id_cursor(cursor: str | None) -> int | None:
    if not cursor:
        return None
    try:
        return int(cursor)
    except (TypeError, ValueError):
        return None


def get_gog_status(user: AbstractBaseUser) -> dict:
    """Return GOG sync status from Django rows: game count and last-scanned."""
    aggregate = UserGOGGame.objects.filter(user=user).aggregate(
        count=Count("id"), last_scanned=Max("updated_at")
    )
    return {
        "game_count": aggregate["count"] or 0,
        "last_scanned_at": _iso_ts(aggregate["last_scanned"]),
    }


def get_gog_library(
    user: AbstractBaseUser,
    *,
    cursor: str | None = None,
    limit: int = 48,
) -> tuple[list[MediaItem], bool, str | None]:
    """Return matched GOG games as media summaries."""
    queryset = (
        UserGOGGame.objects.filter(user=user, media_item__isnull=False)
        .select_related(*_MEDIA_SUBTYPE_SELECT)
        .order_by("title", "id")
    )
    cursor_id = _id_cursor(cursor)
    if cursor_id is not None:
        queryset = queryset.filter(id__gt=cursor_id)

    rows = list(queryset[: limit + 1])
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    media_items = [game.media_item for game in rows]
    enrich_media_items(media_items)
    next_cursor = str(rows[-1].id) if has_more and rows else None
    return media_items, has_more, next_cursor


def get_unmatched_gog_games(
    user: AbstractBaseUser,
    *,
    cursor: str | None = None,
    limit: int = 48,
) -> tuple[list[UserGOGGame], bool, str | None]:
    """Return GOG rows with no Otix match (``media_item`` is null)."""
    queryset = UserGOGGame.objects.filter(user=user, media_item__isnull=True).order_by(
        "title", "id"
    )
    cursor_id = _id_cursor(cursor)
    if cursor_id is not None:
        queryset = queryset.filter(id__gt=cursor_id)

    rows = list(queryset[: limit + 1])
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]
    next_cursor = str(rows[-1].id) if has_more and rows else None
    return rows, has_more, next_cursor
