"""Game save-path read + suggestion logic (legacy ``saves.py`` locations).

Both handlers are DB-backed only; the Google-Drive cloud-sync handlers are
deferred. A suggestion is upserted per user/game/platform; the read route
aggregates every user's suggestions into consensus buckets. When a
platform+pattern bucket reaches ``CONSENSUS_THRESHOLD`` distinct users, the
pattern is promoted to (or overwrites) the verified official path.
"""

from __future__ import annotations

from django.contrib.auth.models import AbstractBaseUser
from django.db.models import Count

from apps.media.models import MediaItem
from apps.track.models import GameSaveOfficialPath, GameSavePathSuggestion

CONSENSUS_THRESHOLD = 3

GAME_NOT_FOUND = "Game not found."


def _game_or_none(media_item_id: int) -> MediaItem | None:
    return MediaItem.objects.filter(pk=media_item_id).first()


def get_save_locations(media_item_id: int) -> dict | None:
    """Return the verified/suggested location buckets for a game.

    ``None`` when the media item does not exist so the view can 404 with the
    legacy detail string.
    """
    if _game_or_none(media_item_id) is None:
        return None

    verified = list(
        GameSaveOfficialPath.objects.filter(game_id=media_item_id).values(
            "platform", "path_pattern", "is_verified"
        )
    )
    suggested = list(
        GameSavePathSuggestion.objects.filter(game_id=media_item_id)
        .values("platform", "path_pattern")
        .annotate(count=Count("id"))
        .order_by("-count")
    )
    return {
        "game_id": media_item_id,
        "verified": verified,
        "suggested": suggested,
    }


def suggest_save_location(
    user: AbstractBaseUser, media_item_id: int, platform: str, path_pattern: str
) -> dict | None:
    """Upsert the user's suggestion and promote it once consensus is reached.

    Returns ``None`` when the media item is missing (view 404s).
    """
    if _game_or_none(media_item_id) is None:
        return None

    GameSavePathSuggestion.objects.update_or_create(
        user=user,
        game_id=media_item_id,
        platform=platform,
        defaults={"path_pattern": path_pattern},
    )
    suggestion_count = GameSavePathSuggestion.objects.filter(
        game_id=media_item_id,
        platform=platform,
        path_pattern=path_pattern,
    ).count()

    promoted = False
    if suggestion_count >= CONSENSUS_THRESHOLD:
        GameSaveOfficialPath.objects.update_or_create(
            game_id=media_item_id,
            platform=platform,
            defaults={"path_pattern": path_pattern, "is_verified": True},
        )
        promoted = True

    return {
        "status": "success",
        "suggestion_count": suggestion_count,
        "promoted_to_official": promoted,
    }
