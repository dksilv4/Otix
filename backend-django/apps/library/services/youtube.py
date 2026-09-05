"""YouTube liked-video library read (``GET /api/v1/library/youtube``).

Raw liked videos for the current user, newest first, keyset-paginated by the
descending integer id (the legacy cursor shape).
"""

from django.contrib.auth.models import AbstractBaseUser

from apps.integrations.models import UserYoutubeLikedVideo


def get_youtube_library(
    user: AbstractBaseUser,
    *,
    cursor: str | None = None,
    limit: int = 50,
) -> tuple[list[UserYoutubeLikedVideo], bool, str | None]:
    """Return ``(videos, has_more, next_cursor)`` ordered newest-first."""
    queryset = UserYoutubeLikedVideo.objects.filter(user=user).order_by("-id")
    if cursor:
        try:
            queryset = queryset.filter(id__lt=int(cursor))
        except (TypeError, ValueError):
            pass

    rows = list(queryset[: limit + 1])
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]
    next_cursor = str(rows[-1].id) if has_more and rows else None
    return rows, has_more, next_cursor
