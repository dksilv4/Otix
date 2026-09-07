"""Local installed-game read model (``GET /api/v1/library/installed``).

Mirrors the legacy ``local_games`` router: the user's detected desktop games,
ordered most-recently-seen first, with the linked catalog title enriched.
"""

from django.contrib.auth.models import AbstractBaseUser

from apps.library.models import UserLocalGame
from apps.library.services.summaries import enrich_media_items


def get_installed_games(
    user: AbstractBaseUser,
    limit: int,
    offset: int,
) -> tuple[list[UserLocalGame], int]:
    """Return ``(games, total)`` for the current user.

    Only rows within ``[offset, offset + limit)`` are fetched; ``total`` is the
    full row count so the client can page.
    """
    base = UserLocalGame.objects.filter(user=user).order_by("-last_seen_at", "id")
    total = base.count()
    rows = list(base.select_related("media_item")[offset : offset + limit])
    catalog_items = [row.media_item for row in rows if row.media_item_id is not None]
    enrich_media_items(catalog_items)
    return rows, total
