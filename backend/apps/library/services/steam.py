"""Steam library reads: matched grid, status, unmatched games, and wishlist.

DB-backed ports of the legacy ``steam_library_service`` query helpers. Cursors
use the legacy ``{sort_value}__{steam_app_id}`` composite format so an existing
client's stored cursor keeps working.
"""

from django.contrib.auth.models import AbstractBaseUser
from django.db.models import Count, Max, Q

from apps.integrations.models import UserSteamGame, UserSteamWishlist
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


def _steam_cursor_parts(cursor: str | None) -> tuple[int, int] | None:
    if not cursor:
        return None
    parts = cursor.split("__", 1)
    if len(parts) != 2:
        return None
    try:
        return int(parts[0]), int(parts[1])
    except (TypeError, ValueError):
        return None


def get_steam_status(user: AbstractBaseUser) -> dict:
    """Return Steam sync status: game count and last-scanned timestamp."""
    if not user.steam_id:
        return {"game_count": 0, "last_scanned_at": None}
    aggregate = UserSteamGame.objects.filter(user=user).aggregate(
        count=Count("id"), last_scanned=Max("updated_at")
    )
    return {
        "game_count": aggregate["count"] or 0,
        "last_scanned_at": _iso_ts(aggregate["last_scanned"]),
    }


def get_steam_library(
    user: AbstractBaseUser,
    *,
    cursor: str | None = None,
    limit: int = 48,
) -> tuple[list[MediaItem], bool, str | None]:
    """Return matched Steam games as media summaries with playtime overlays.

    Rows are ordered by ``playtime_forever`` desc then ``steam_app_id`` asc,
    de-duplicated by media item (keeping the highest-playtime row).
    """
    queryset = (
        UserSteamGame.objects.filter(user=user, media_item__isnull=False)
        .select_related(*_MEDIA_SUBTYPE_SELECT)
        .order_by("-playtime_forever", "steam_app_id")
    )
    parts = _steam_cursor_parts(cursor)
    if parts is not None:
        cursor_playtime, cursor_appid = parts
        queryset = queryset.filter(
            Q(playtime_forever__lt=cursor_playtime)
            | (Q(playtime_forever=cursor_playtime) & Q(steam_app_id__gt=cursor_appid))
        )

    rows = list(queryset[: limit + 1])
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    media_items: list[MediaItem] = []
    overlays: dict[int, dict[str, object]] = {}
    seen: set[int] = set()
    for game in rows:
        item = game.media_item
        if item.id in seen:
            continue
        seen.add(item.id)
        overlays[item.id] = {
            "_steam_playtime_forever": game.playtime_forever,
            "_steam_playtime_2weeks": game.playtime_2weeks,
            "_steam_rtime_last_played": game.rtime_last_played,
        }
        media_items.append(item)

    enrich_media_items(media_items, overlays)
    next_cursor = None
    if has_more and rows:
        last_game = rows[-1]
        next_cursor = f"{last_game.playtime_forever}__{last_game.steam_app_id}"
    return media_items, has_more, next_cursor


def get_unmatched_steam_games(
    user: AbstractBaseUser,
    *,
    cursor: str | None = None,
    limit: int = 48,
) -> tuple[list[UserSteamGame], bool, str | None]:
    """Return Steam rows with no Otix match (``media_item`` is null)."""
    queryset = (
        UserSteamGame.objects.filter(user=user, media_item__isnull=True)
        .order_by("-playtime_forever", "steam_app_id")
    )
    parts = _steam_cursor_parts(cursor)
    if parts is not None:
        cursor_playtime, cursor_appid = parts
        queryset = queryset.filter(
            Q(playtime_forever__lt=cursor_playtime)
            | (Q(playtime_forever=cursor_playtime) & Q(steam_app_id__gt=cursor_appid))
        )

    rows = list(queryset[: limit + 1])
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]
    next_cursor = None
    if has_more and rows:
        last_game = rows[-1]
        next_cursor = f"{last_game.playtime_forever}__{last_game.steam_app_id}"
    return rows, has_more, next_cursor


def get_steam_wishlist(
    user: AbstractBaseUser,
    *,
    cursor: str | None = None,
    limit: int = 48,
) -> tuple[list[MediaItem], bool, str | None]:
    """Return matched Steam wishlist rows as media summaries with priority."""
    queryset = (
        UserSteamWishlist.objects.filter(user=user, media_item__isnull=False)
        .select_related(*_MEDIA_SUBTYPE_SELECT)
        .order_by("priority", "steam_app_id")
    )
    parts = _steam_cursor_parts(cursor)
    if parts is not None:
        cursor_priority, cursor_appid = parts
        queryset = queryset.filter(
            Q(priority__gt=cursor_priority)
            | (Q(priority=cursor_priority) & Q(steam_app_id__gt=cursor_appid))
        )

    rows = list(queryset[: limit + 1])
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    media_items: list[MediaItem] = []
    overlays: dict[int, dict[str, object]] = {}
    seen: set[int] = set()
    for wish in rows:
        item = wish.media_item
        if item.id in seen:
            continue
        seen.add(item.id)
        overlays[item.id] = {"_steam_priority": wish.priority}
        media_items.append(item)

    enrich_media_items(media_items, overlays)
    next_cursor = None
    if has_more and rows:
        last_wish = rows[-1]
        next_cursor = f"{last_wish.priority}__{last_wish.steam_app_id}"
    return media_items, has_more, next_cursor
