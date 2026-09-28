"""Generic library tab reads (``GET /api/v1/library/{tab}``).

Tabs map to a user-media interaction type (watchlist/like/watched/played/
listened/owned) and return the distinct media items carrying that interaction,
newest interaction first. Cursor format matches the legacy interaction service:
``{created_at_iso}__{media_item_id}``.
"""

from datetime import datetime

from django.contrib.auth.models import AbstractBaseUser
from django.db.models import Q

from apps.library.services.summaries import enrich_media_items
from apps.media.models import MediaItem
from apps.social.models import UserMediaInteraction

# tab -> stored interaction_type (legacy ``_LIBRARY_TYPES``).
_LIBRARY_TYPES: dict[str, str] = {
    "watchlist": "watchlisted",
    "like": "liked",
    "watched": "watched",
    "played": "played",
    "listened": "listened",
    "owned": "owned",
}

_AUTO_STATE_KEYS = ("liked", "watchlisted", "watched", "played", "started", "listened", "owned")

_MEDIA_SUBTYPE_SELECT = (
    "media_item",
    "media_item__movie",
    "media_item__show",
    "media_item__game",
)

UNKNOWN_TAB_DETAIL = "Unknown library tab. Must be one of: " + ", ".join(sorted(_LIBRARY_TYPES))


def resolve_interaction_type(tab: str) -> str | None:
    """Map a tab slug to its stored interaction type; None when unknown."""
    return _LIBRARY_TYPES.get(tab)


def get_library_tab(
    user: AbstractBaseUser,
    tab: str,
    *,
    cursor: str | None = None,
    limit: int = 50,
    source: str | None = None,
) -> tuple[list[MediaItem], bool, str | None] | None:
    """Return ``(media_items, has_more, next_cursor)`` for a library tab.

    Returns None when the tab slug is not recognised so the view can 404 with
    the legacy detail message. Each item carries a ``_user_interactions`` overlay
    with only the active interaction type set true.
    """
    interaction_type = resolve_interaction_type(tab)
    if interaction_type is None:
        return None

    queryset = (
        UserMediaInteraction.objects.filter(user=user, interaction_type=interaction_type)
        .select_related(*_MEDIA_SUBTYPE_SELECT)
        .order_by("-created_at", "media_item_id")
    )
    if source:
        queryset = queryset.filter(extra_data__source=source)

    if cursor:
        parts = cursor.split("__", 1)
        if len(parts) == 2:
            created_at, media_item_id = parts
            try:
                cursor_dt = datetime.fromisoformat(created_at)
                queryset = queryset.filter(
                    Q(created_at__lt=cursor_dt)
                    | (Q(created_at=cursor_dt) & Q(media_item_id__gt=media_item_id))
                )
            except ValueError:
                pass

    rows = list(queryset[: limit + 1])
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    media_items: list[MediaItem] = []
    seen: set[int] = set()
    auto_state = {key: key == interaction_type for key in _AUTO_STATE_KEYS}
    for row in rows:
        item = row.media_item
        if item.id in seen:
            continue
        seen.add(item.id)
        item._user_interactions = auto_state
        media_items.append(item)

    enrich_media_items(media_items)
    next_cursor = None
    if has_more and rows:
        last_row = rows[-1]
        next_cursor = f"{last_row.created_at.isoformat()}__{last_row.media_item_id}"
    return media_items, has_more, next_cursor
