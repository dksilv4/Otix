"""Per-user media interaction logic (media-item and episode touchpoints).

Port of the legacy ``InteractionService``/``EpisodeInteractionService``.
Ownership is a private interaction type (``owned``) with no public count column,
mirroring ``_TYPE_TO_COLUMN`` in the legacy service.
"""

from __future__ import annotations

from django.contrib.auth.models import AbstractBaseUser

from apps.media.models import MediaItem
from apps.social.models import UserMediaInteraction

STATE_TYPES = ("liked", "watchlisted", "watched", "played", "started", "listened", "owned")
TOGGLE_TYPES = ("liked", "watchlisted", "watched", "played", "started", "listened")

_TYPE_TO_COLUMN = {
    "liked": "like_count",
    "watchlisted": "watchlist_count",
    "watched": "watched_count",
    "played": "played_count",
    "started": "started_count",
    "listened": "listened_count",
    "owned": None,
}


def user_interaction_state(user_id: int, media_item_id: int) -> dict[str, bool]:
    """Boolean state flags for a single user+item (all interaction types)."""
    types = set(
        UserMediaInteraction.objects.filter(
            user_id=user_id, media_item_id=media_item_id
        ).values_list("interaction_type", flat=True)
    )
    return {key: key in types for key in STATE_TYPES}


def attach_user_interactions(items: list[MediaItem], user: AbstractBaseUser) -> None:
    """Attach ``user_interactions`` state dicts to each item (batch query)."""
    ids = [item.id for item in items]
    if not ids:
        return
    rows = UserMediaInteraction.objects.filter(user=user, media_item_id__in=ids).values_list(
        "media_item_id", "interaction_type"
    )
    state: dict[int, set[str]] = {item_id: set() for item_id in ids}
    for media_item_id, interaction_type in rows:
        state[media_item_id].add(interaction_type)
    for item in items:
        present = state[item.id]
        item.user_interactions = {key: key in present for key in STATE_TYPES}


def _recalc_count(media_item_id: int, interaction_type: str) -> None:
    """Keep the MediaItem public count column in sync for one interaction type."""
    column = _TYPE_TO_COLUMN.get(interaction_type)
    if column is None:
        return
    count = UserMediaInteraction.objects.filter(
        media_item_id=media_item_id, interaction_type=interaction_type
    ).count()
    MediaItem.objects.filter(pk=media_item_id).update(**{column: count})


def set_interaction(
    user: AbstractBaseUser,
    media_item_id: int,
    interaction_type: str,
    extra_data: dict | None = None,
) -> UserMediaInteraction:
    """Create or update one interaction row and refresh its public count."""
    extra_data = extra_data or {}
    interaction, created = UserMediaInteraction.objects.get_or_create(
        user=user,
        media_item_id=media_item_id,
        interaction_type=interaction_type,
        defaults={"extra_data": extra_data},
    )
    if not created and extra_data:
        if interaction.extra_data != extra_data:
            interaction.extra_data = extra_data
            interaction.save(update_fields=("extra_data", "updated_at"))
    _recalc_count(media_item_id, interaction_type)
    return interaction


def remove_interaction(user: AbstractBaseUser, media_item_id: int, interaction_type: str) -> bool:
    """Delete one interaction row; returns whether a row was removed."""
    deleted, _ = UserMediaInteraction.objects.filter(
        user=user, media_item_id=media_item_id, interaction_type=interaction_type
    ).delete()
    if deleted:
        _recalc_count(media_item_id, interaction_type)
    return bool(deleted)


def interaction_counts(media_item_id: int) -> dict[str, int]:
    """Public per-type counts for one media item."""
    media = MediaItem.objects.filter(pk=media_item_id).first()
    if media is None:
        names = ("like", "watchlist", "watched", "played", "started", "listened")
        return {f"{name}_count": 0 for name in names}
    return {
        "like_count": media.like_count,
        "watchlist_count": media.watchlist_count,
        "watched_count": media.watched_count,
        "played_count": media.played_count,
        "started_count": media.started_count,
        "listened_count": media.listened_count,
    }
