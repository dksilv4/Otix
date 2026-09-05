"""Episode/season/show watched-state logic.

Port of the legacy ``EpisodeInteractionService``. Watched episodes are rows in
``UserEpisodeInteraction``; the show-level ``watched`` media interaction row is
removed when a whole show is unmarked (mirroring legacy ``remove_show_watched``).
"""

from __future__ import annotations

from datetime import date

from django.contrib.auth.models import AbstractBaseUser
from django.db.models import Q

from apps.media.models import Episode, MediaItem, Season, Show
from apps.social.models import UserEpisodeInteraction, UserMediaInteraction

_SHOW_NOT_FOUND = "Show not found"
_EPISODE_NOT_FOUND = "Episode not found"
_SEASON_NOT_FOUND = "Season not found"
_EPISODE_NOT_IN_SHOW = "Episode does not belong to this show"


def get_show(media_id: int) -> Show | None:
    try:
        return Show.objects.get(pk=media_id)
    except Show.DoesNotExist:
        return None


def get_episode(episode_id: int) -> Episode | None:
    try:
        return Episode.objects.get(pk=episode_id)
    except Episode.DoesNotExist:
        return None


def get_season(show_id: int, season_number: int) -> Season | None:
    return Season.objects.filter(show_id=show_id, season_number=season_number).first()


def validate_episode_in_show(episode_id: int, show_id: int) -> Episode:
    """Return the episode or raise ValueError with the legacy detail strings."""
    episode = get_episode(episode_id)
    if episode is None:
        raise ValueError(_EPISODE_NOT_FOUND)
    if episode.season.show_id != show_id:
        raise ValueError(_EPISODE_NOT_IN_SHOW)
    return episode


def episode_interactions(user_id: int, show_id: int) -> dict[int, dict]:
    """Map of episode id -> {watched, watched_at} for every episode of a show."""
    rows = (
        Episode.objects.filter(season__show_id=show_id)
        .order_by("season__season_number", "episode_number")
        .values("id", "season__season_number", "episode_number")
    )
    episode_ids = [row["id"] for row in rows]
    watched_at = dict(
        UserEpisodeInteraction.objects.filter(user_id=user_id, episode_id__in=episode_ids)
        .values_list("episode_id", "created_at")
    )
    return {
        episode_id: {
            "watched": episode_id in watched_at,
            "watched_at": watched_at[episode_id].isoformat() if episode_id in watched_at else None,
        }
        for episode_id in episode_ids
    }


def set_episode_watched(user: AbstractBaseUser, episode_id: int) -> bool:
    _, created = UserEpisodeInteraction.objects.get_or_create(
        user=user, episode_id=episode_id
    )
    return created


def remove_episode_watched(user: AbstractBaseUser, episode_id: int) -> bool:
    deleted, _ = UserEpisodeInteraction.objects.filter(
        user=user, episode_id=episode_id
    ).delete()
    return bool(deleted)


def set_season_watched(user: AbstractBaseUser, season_id: int) -> int:
    episode_ids = list(Episode.objects.filter(season_id=season_id).values_list("id", flat=True))
    existing = set(
        UserEpisodeInteraction.objects.filter(
            user=user, episode_id__in=episode_ids
        ).values_list("episode_id", flat=True)
    )
    new_ids = [eid for eid in episode_ids if eid not in existing]
    if new_ids:
        UserEpisodeInteraction.objects.bulk_create(
            [UserEpisodeInteraction(user=user, episode_id=eid) for eid in new_ids]
        )
    return len(new_ids)


def remove_season_watched(user: AbstractBaseUser, season_id: int) -> int:
    episode_ids = list(Episode.objects.filter(season_id=season_id).values_list("id", flat=True))
    if not episode_ids:
        return 0
    deleted, _ = UserEpisodeInteraction.objects.filter(
        user=user, episode_id__in=episode_ids
    ).delete()
    return deleted


def set_show_watched(user: AbstractBaseUser, show_id: int) -> int:
    """Mark every released, non-special episode of a show watched."""
    today = date.today()
    episode_ids = list(
        Episode.objects.filter(
            season__show_id=show_id,
            season__season_number__gt=0,
        )
        .filter(Q(air_date__isnull=True) | Q(air_date__lte=today))
        .values_list("id", flat=True)
    )
    existing = set(
        UserEpisodeInteraction.objects.filter(
            user=user, episode_id__in=episode_ids
        ).values_list("episode_id", flat=True)
    )
    new_ids = [eid for eid in episode_ids if eid not in existing]
    if new_ids:
        UserEpisodeInteraction.objects.bulk_create(
            [UserEpisodeInteraction(user=user, episode_id=eid) for eid in new_ids]
        )
    return len(new_ids)


def remove_show_watched(user: AbstractBaseUser, show_id: int) -> int:
    episode_ids = list(Episode.objects.filter(season__show_id=show_id).values_list("id", flat=True))
    if episode_ids:
        deleted, _ = UserEpisodeInteraction.objects.filter(
            user=user, episode_id__in=episode_ids
        ).delete()
    else:
        deleted = 0
    UserMediaInteraction.objects.filter(
        user=user, media_item_id=show_id, interaction_type="watched"
    ).delete()
    return deleted


def show_progress(user_id: int, show_id: int) -> dict:
    """Watch progress across released non-special seasons."""
    today = date.today()
    rows = list(
        Episode.objects.filter(
            season__show_id=show_id,
            season__season_number__gt=0,
        )
        .filter(Q(air_date__isnull=True) | Q(air_date__lte=today))
        .values_list("id", "season__season_number")
    )
    total_episodes = len(rows)
    if total_episodes == 0:
        return {
            "watched_episodes": 0,
            "total_episodes": 0,
            "progress_pct": 0.0,
            "completed_seasons": [],
        }
    episode_ids = [eid for eid, _ in rows]
    watched_ids = set(
        UserEpisodeInteraction.objects.filter(user_id=user_id, episode_id__in=episode_ids)
        .values_list("episode_id", flat=True)
    )
    season_episodes: dict[int, int] = {}
    season_watched: dict[int, int] = {}
    for ep_id, season_num in rows:
        season_episodes[season_num] = season_episodes.get(season_num, 0) + 1
        if ep_id in watched_ids:
            season_watched[season_num] = season_watched.get(season_num, 0) + 1
    completed_seasons = sorted(
        sn for sn, total in season_episodes.items() if season_watched.get(sn, 0) == total
    )
    return {
        "watched_episodes": len(watched_ids),
        "total_episodes": total_episodes,
        "progress_pct": round(len(watched_ids) / total_episodes * 100, 1),
        "completed_seasons": completed_seasons,
    }


def media_item_show_exists(media_id: int) -> bool:
    return MediaItem.objects.filter(pk=media_id, media_type="show").exists()
