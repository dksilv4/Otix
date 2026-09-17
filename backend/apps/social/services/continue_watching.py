"""Continue-watching rollup for the authenticated user.

Port of ``old-backend/otix/api/user/continue_watching/router.py``: recent episode
interactions first (they signal an in-progress show) then recent
watched/played/listened/started media interactions, deduplicated by media item.
Asset URLs are resolved from the generic ``MediaAsset`` rows because the legacy
``poster_url``/``backdrop_url``/``logo_url`` media columns are not ported.
"""

from __future__ import annotations

from apps.media.models import MediaItem
from apps.social.models import UserEpisodeInteraction, UserMediaInteraction


def _asset_urls(media: MediaItem) -> dict[str, str | None]:
    urls: dict[str, str | None] = {"poster_url": None, "backdrop_url": None, "logo_url": None}
    for asset in media.assets.all():
        key = f"{asset.asset_type.lower()}_url"
        if key in urls and urls[key] is None:
            urls[key] = asset.url
    return urls


def _continue_item(
    media: MediaItem, interaction_type: str, interacted_at, episode_context=None
) -> dict:
    urls = _asset_urls(media)
    return {
        "id": media.id,
        "media_type": media.media_type,
        "title": media.title,
        "slug": media.slug,
        "poster_url": urls["poster_url"],
        "backdrop_url": urls["backdrop_url"],
        "logo_url": urls["logo_url"],
        "release_date": media.release_date,
        "popularity": media.popularity,
        "interaction_type": interaction_type,
        "interacted_at": interacted_at.isoformat(),
        "episode_context": episode_context,
    }


def get_continue_watching(user_id: int, limit: int = 10) -> list[dict]:
    """Recent in-progress media, episode interactions ranked first."""
    episode_interactions = list(
        UserEpisodeInteraction.objects.filter(user_id=user_id)
        .select_related("episode__season__show__media_item")
        .prefetch_related("episode__season__show__media_item__assets")
        .order_by("-created_at", "-id")[:limit]
    )
    media_interactions = list(
        UserMediaInteraction.objects.filter(
            user_id=user_id,
            interaction_type__in=("watched", "played", "listened", "started"),
        )
        .select_related("media_item")
        .prefetch_related("media_item__assets")
        .order_by("-created_at", "-id")[: limit * 2]
    )

    seen_ids: set[int] = set()
    items: list[dict] = []
    for interaction in episode_interactions:
        media = interaction.episode.season.show.media_item
        if media.id in seen_ids:
            continue
        seen_ids.add(media.id)
        episode = interaction.episode
        items.append(
            _continue_item(
                media,
                "episode_watched",
                interaction.created_at,
                episode_context=f"S{episode.season.season_number}E{episode.episode_number}",
            )
        )
        if len(items) >= limit:
            return items

    for interaction in media_interactions:
        media = interaction.media_item
        if media.id in seen_ids:
            continue
        if len(items) >= limit:
            break
        seen_ids.add(media.id)
        items.append(_continue_item(media, interaction.interaction_type, interaction.created_at))
    return items
