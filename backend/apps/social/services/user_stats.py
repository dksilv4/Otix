"""User aggregate stats, hall-of-fame and library statistics.

Port of ``old-backend/otix/api/user/stats/router.py``. ``hall-of-fame`` reads the
legacy ``User.hof_ids`` JSON column which has no greenfield model home, so it
returns an empty list (the picks a user curates are not portable without that
column). Library statistics reproduce the legacy interaction join plus episode
watch-time aggregation.
"""

from __future__ import annotations

from collections import Counter

from django.contrib.auth import get_user_model
from django.db.models import Count, Sum

from apps.lists.models import UserList
from apps.media.models import Episode, MediaItem, Movie
from apps.social.models import Review, UserMediaInteraction
from apps.workout.models import Workout

_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_COMPLETION_TYPES = ("watched", "played", "listened")


def get_user_stats(user_id: int) -> dict:
    """Aggregate review/interaction/workout/list counts for a user."""
    user = get_user_model().objects.filter(pk=user_id).first()
    return {
        "review_count": Review.objects.filter(
            user_id=user_id, content__isnull=False, is_private=False
        ).count(),
        "interaction_count": UserMediaInteraction.objects.filter(user_id=user_id).count(),
        "workout_count": Workout.objects.filter(user_id=user_id).count(),
        "list_count": UserList.objects.filter(user_id=user_id).count(),
        "total_xp": user.total_xp if user else 0,
    }


def get_hall_of_fame(user_id: int, media_type: str | None = None) -> list[dict]:
    """The user's curated hall-of-fame or top-5 favorite picks."""
    user = get_user_model().objects.filter(pk=user_id).first()
    if not user:
        return []
    hof_data = user.hall_of_fame_media_ids or {}

    target_ids = []
    if media_type and isinstance(hof_data, dict) and media_type in hof_data:
        target_ids = hof_data[media_type]
    elif isinstance(hof_data, dict) and "top_5" in hof_data:
        target_ids = hof_data["top_5"]
    elif isinstance(hof_data, list):
        target_ids = hof_data
    elif isinstance(hof_data, dict):
        for val in hof_data.values():
            if isinstance(val, list):
                target_ids.extend(val)

    if not target_ids or not isinstance(target_ids, list):
        return []

    clean_ids = [str(x) for x in target_ids if x]
    if not clean_ids:
        return []

    media_items = {
        str(m.id): m for m in MediaItem.objects.filter(id__in=clean_ids).prefetch_related("assets")
    }
    user_reviews = {
        str(r.media_item_id): r.score
        for r in Review.objects.filter(user_id=user_id, media_item_id__in=clean_ids)
    }

    results = []
    for mid in clean_ids:
        item = media_items.get(mid)
        if not item:
            continue
        assets = {a.asset_type.lower(): a.url for a in item.assets.all()}
        release_year = item.release_date.year if item.release_date else None
        results.append(
            {
                "id": item.id,
                "title": item.title,
                "media_type": item.media_type,
                "poster_url": assets.get("poster"),
                "backdrop_url": assets.get("backdrop"),
                "release_year": release_year,
                "score": user_reviews.get(mid),
            }
        )
    return results


def _movie_watch_time_minutes(user_id: int) -> int:
    total = Movie.objects.filter(
        media_item__interactions__user_id=user_id,
        media_item__interactions__interaction_type="watched",
    ).aggregate(total=Sum("runtime"))["total"]
    return total or 0


def _episode_watch_time_minutes(user_id: int) -> int:
    total = Episode.objects.filter(episode_interactions__user_id=user_id).aggregate(
        total=Sum("runtime")
    )["total"]
    return total or 0


def get_library_stats(user_id: int) -> dict:
    """Interaction-derived library statistics for a user."""
    rows = (
        UserMediaInteraction.objects.filter(user_id=user_id)
        .values("media_item__media_type", "interaction_type")
        .annotate(cnt=Count("id"))
    )
    by_media_type: dict[str, int] = {}
    total = 0
    watched_played = 0
    started = 0
    timestamps = []
    for row in rows:
        media_type = row["media_item__media_type"] or "other"
        interaction_type = row["interaction_type"]
        cnt = row["cnt"]
        by_media_type[media_type] = by_media_type.get(media_type, 0) + cnt
        total += cnt
        if interaction_type in _COMPLETION_TYPES:
            watched_played += cnt
        elif interaction_type == "started":
            started += cnt
    completed_total = watched_played + started
    completion_rate = watched_played / completed_total if completed_total > 0 else 0.0

    for interaction in UserMediaInteraction.objects.filter(user_id=user_id).only("created_at"):
        timestamps.append(interaction.created_at)

    most_active_day = None
    most_active_hour = None
    if timestamps:
        most_active_day = _DAY_NAMES[
            Counter(dt.weekday() for dt in timestamps).most_common(1)[0][0]
        ]
        most_active_hour = Counter(dt.hour for dt in timestamps).most_common(1)[0][0]

    return {
        "total_items": total,
        "by_media_type": by_media_type,
        "total_watch_time_minutes": _movie_watch_time_minutes(user_id)
        + _episode_watch_time_minutes(user_id),
        "completion_rate": round(completion_rate, 2),
        "most_active_day": most_active_day,
        "most_active_hour": most_active_hour,
    }
