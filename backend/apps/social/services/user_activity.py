"""User activity timeline, mood timeline, heatmap and daily-activity rollups.

Port of ``old-backend/otix/api/user/activity/router.py`` and the shared
``_fetch_user_activity_events`` helper. Activity events merge review,
media-interaction and episode-interaction rows newest-first. Aggregations are
computed in Python (over the small per-user window) so they behave identically
on the sqlite test backend and Postgres.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta

from django.utils import timezone as dj_timezone

from apps.media.models import MediaItem
from apps.social.models import (
    Review,
    UserEpisodeInteraction,
    UserMediaInteraction,
    UserMoodCheckIn,
)
from apps.workout.models import Workout

_PAST_TENSE = {
    "like": "Liked",
    "liked": "Liked",
    "watched": "Watched",
    "played": "Played",
    "watchlist": "Added to watchlist",
    "watchlisted": "Added to watchlist",
    "started": "Started",
    "completed": "Completed",
    "dropped": "Dropped",
}


def _media_slice(media: MediaItem) -> dict:
    assets = {a.asset_type.lower(): a.url for a in media.assets.all()}
    return {
        "id": media.id,
        "title": media.title,
        "media_type": media.media_type,
        "poster_url": assets.get("poster"),
    }


def _review_events(user_id: int, limit: int) -> list[dict]:
    rows = (
        Review.objects.filter(user_id=user_id, content__isnull=False, is_private=False)
        .select_related("media_item")
        .prefetch_related("media_item__assets")
        .order_by("-created_at", "-id")[:limit]
    )
    events = []
    for review in rows:
        events.append(
            {
                "type": "review",
                "timestamp": review.created_at.isoformat(),
                "summary": f"Reviewed {review.media_item.title}",
                "score": None,
                "content": review.content[:200] if review.content else None,
                "media_item": _media_slice(review.media_item),
            }
        )
    return events


def _interaction_events(user_id: int, limit: int) -> list[dict]:
    rows = (
        UserMediaInteraction.objects.filter(user_id=user_id)
        .select_related("media_item")
        .prefetch_related("media_item__assets")
        .order_by("-created_at", "-id")[:limit]
    )
    events = []
    for interaction in rows:
        action = interaction.interaction_type
        past_tense = _PAST_TENSE.get(action, action.capitalize())
        events.append(
            {
                "type": "interaction",
                "timestamp": interaction.created_at.isoformat(),
                "summary": f"{past_tense} {interaction.media_item.title}",
                "interaction_type": action,
                "media_item": _media_slice(interaction.media_item),
            }
        )
    return events


def _episode_events(user_id: int, limit: int) -> list[dict]:
    rows = (
        UserEpisodeInteraction.objects.filter(user_id=user_id)
        .select_related("episode__season__show__media_item")
        .prefetch_related("episode__season__show__media_item__assets")
        .order_by("-created_at", "-id")[:limit]
    )
    events = []
    for interaction in rows:
        episode = interaction.episode
        season = episode.season
        media = season.show.media_item
        events.append(
            {
                "type": "episode_watched",
                "timestamp": interaction.created_at.isoformat(),
                "summary": (
                    f"Watched S{season.season_number}E{episode.episode_number} of {media.title}"
                ),
                "media_item": _media_slice(media),
            }
        )
    return events


def get_user_activity(user_id: int, limit: int = 20) -> list[dict]:
    """A user's recent activity timeline (review/interaction/episode mix)."""
    events = (
        _review_events(user_id, limit)
        + _interaction_events(user_id, limit)
        + _episode_events(user_id, limit)
    )
    events.sort(key=lambda e: e["timestamp"], reverse=True)
    return events[:limit]


def get_friends_activity(user_id: int, friends, limit: int = 20) -> list[dict]:
    """Aggregated activity across accepted friends, newest first."""
    if not friends:
        return []

    friend_map = {friend.id: friend for friend in friends}
    friend_ids = list(friend_map.keys())

    all_events: list[dict] = []

    # 1. Bulk reviews
    reviews = (
        Review.objects.filter(user_id__in=friend_ids, content__isnull=False, is_private=False)
        .select_related("user", "media_item")
        .prefetch_related("media_item__assets")
        .order_by("-created_at", "-id")[:limit]
    )
    for review in reviews:
        friend = friend_map.get(review.user_id) or review.user
        all_events.append(
            {
                "type": "review",
                "timestamp": review.created_at.isoformat(),
                "summary": f"Reviewed {review.media_item.title}",
                "score": None,
                "content": review.content[:200] if review.content else None,
                "media_item": _media_slice(review.media_item),
                "user": {
                    "id": friend.id,
                    "username": friend.username,
                    "avatar_url": getattr(friend, "avatar_url", None),
                },
            }
        )

    # 2. Bulk media interactions
    interactions = (
        UserMediaInteraction.objects.filter(user_id__in=friend_ids)
        .select_related("user", "media_item")
        .prefetch_related("media_item__assets")
        .order_by("-created_at", "-id")[:limit]
    )
    for interaction in interactions:
        friend = friend_map.get(interaction.user_id) or interaction.user
        action = interaction.interaction_type
        past_tense = _PAST_TENSE.get(action, action.capitalize())
        all_events.append(
            {
                "type": "interaction",
                "timestamp": interaction.created_at.isoformat(),
                "summary": f"{past_tense} {interaction.media_item.title}",
                "interaction_type": action,
                "media_item": _media_slice(interaction.media_item),
                "user": {
                    "id": friend.id,
                    "username": friend.username,
                    "avatar_url": getattr(friend, "avatar_url", None),
                },
            }
        )

    # 3. Bulk episode interactions
    episodes = (
        UserEpisodeInteraction.objects.filter(user_id__in=friend_ids)
        .select_related("user", "episode__season__show__media_item")
        .prefetch_related("episode__season__show__media_item__assets")
        .order_by("-created_at", "-id")[:limit]
    )
    for interaction in episodes:
        friend = friend_map.get(interaction.user_id) or interaction.user
        episode = interaction.episode
        season = episode.season
        media = season.show.media_item
        all_events.append(
            {
                "type": "episode_watched",
                "timestamp": interaction.created_at.isoformat(),
                "summary": (
                    f"Watched S{season.season_number}E{episode.episode_number} of {media.title}"
                ),
                "media_item": _media_slice(media),
                "user": {
                    "id": friend.id,
                    "username": friend.username,
                    "avatar_url": getattr(friend, "avatar_url", None),
                },
            }
        )

    all_events.sort(key=lambda e: e["timestamp"], reverse=True)
    return all_events[:limit]


def get_mood_timeline(user_id: int) -> dict:
    """A user's most recent 30 submitted mood check-ins (legacy ``MoodTimelineOut``)."""
    checkins = UserMoodCheckIn.objects.filter(user_id=user_id, status="submitted").order_by(
        "-checkin_date", "-id"
    )[:30]
    return {
        "checkins": [
            {
                "date": checkin.checkin_date.isoformat(),
                "mood": checkin.mood,
                "feeling": checkin.feeling,
                "note": checkin.note,
            }
            for checkin in checkins
        ]
    }


def get_activity_heatmap(user_id: int, weeks: int) -> dict:
    """Daily workout/movie/show/music/game/review counts for the past N weeks."""
    from apps.library.models import UserGameSession

    today = dj_timezone.localdate()
    start_date = today - timedelta(days=weeks * 7 - 1)
    date_map: dict[date, dict[str, int]] = defaultdict(
        lambda: {"workout": 0, "movie": 0, "show": 0, "music": 0, "game": 0, "review": 0}
    )

    for workout in Workout.objects.filter(user_id=user_id, started_at__date__gte=start_date).only(
        "started_at"
    ):
        date_map[workout.started_at.date()]["workout"] += 1

    for interaction in (
        UserMediaInteraction.objects.filter(user_id=user_id, created_at__date__gte=start_date)
        .select_related("media_item")
        .only("created_at", "media_item__media_type")
    ):
        media_type = interaction.media_item.media_type
        key = date_map[interaction.created_at.date()]
        if media_type == "movie":
            key["movie"] += 1
        elif media_type == "show":
            key["show"] += 1
        elif media_type == "music":
            key["music"] += 1
        elif media_type == "game":
            key["game"] += 1

    for episode_interaction in UserEpisodeInteraction.objects.filter(
        user_id=user_id, created_at__date__gte=start_date
    ).only("created_at"):
        date_map[episode_interaction.created_at.date()]["show"] += 1

    for session in UserGameSession.objects.filter(
        user_id=user_id, start_time__date__gte=start_date
    ).only("start_time"):
        date_map[session.start_time.date()]["game"] += 1

    for review in Review.objects.filter(user_id=user_id, created_at__date__gte=start_date).only(
        "created_at"
    ):
        date_map[review.created_at.date()]["review"] += 1

    dates_list = []
    cursor = start_date
    total_active_days = 0
    while cursor <= today:
        counts = date_map[cursor]
        total_count = sum(counts.values())
        if total_count > 0:
            total_active_days += 1
        dates_list.append({"date": cursor.isoformat(), "total": total_count, **counts})
        cursor += timedelta(days=1)
    return {"weeks": weeks, "dates": dates_list, "total_active_days": total_active_days}


def _day_boundaries(day: date) -> tuple[datetime, datetime]:
    start_dt = datetime.combine(day, time.min).replace(tzinfo=UTC)
    end_dt = datetime.combine(day, time.max).replace(tzinfo=UTC)
    return start_dt, end_dt


def get_daily_activity(user_id: int, day: date | None = None) -> dict:
    """All activity a user logged on a single day (defaults to today)."""
    target_date = day or dj_timezone.localdate()
    start_dt, end_dt = _day_boundaries(target_date)

    reviews = []
    for review in (
        Review.objects.filter(user_id=user_id, created_at__range=(start_dt, end_dt))
        .select_related("media_item")
        .order_by("-created_at")
    ):
        reviews.append(
            {
                "id": review.media_item_id,
                "media_item_id": review.media_item_id,
                "media_title": review.media_item.title,
                "media_type": review.media_item.media_type,
                "poster_url": _media_slice(review.media_item)["poster_url"],
                "score": None,
                "content_preview": review.content[:200] if review.content else None,
                "created_at": review.created_at.isoformat(),
            }
        )

    interactions = []
    for interaction in (
        UserMediaInteraction.objects.filter(user_id=user_id, created_at__range=(start_dt, end_dt))
        .select_related("media_item")
        .order_by("-created_at")
    ):
        interactions.append(
            {
                "id": f"{interaction.media_item_id}_{interaction.interaction_type}",
                "media_item_id": interaction.media_item_id,
                "media_title": interaction.media_item.title,
                "media_type": interaction.media_item.media_type,
                "poster_url": _media_slice(interaction.media_item)["poster_url"],
                "interaction_type": interaction.interaction_type,
                "created_at": interaction.created_at.isoformat(),
            }
        )

    episodes = []
    for interaction in (
        UserEpisodeInteraction.objects.filter(user_id=user_id, created_at__range=(start_dt, end_dt))
        .select_related("episode__season__show__media_item")
        .order_by("-created_at")
    ):
        episode = interaction.episode
        media = episode.season.show.media_item
        episodes.append(
            {
                "id": str(interaction.episode_id),
                "show_id": media.id,
                "show_title": media.title,
                "poster_url": _media_slice(media)["poster_url"],
                "season_number": episode.season.season_number,
                "episode_number": episode.episode_number,
                "created_at": interaction.created_at.isoformat(),
            }
        )

    workouts = []
    for workout in (
        Workout.objects.filter(user_id=user_id, started_at__range=(start_dt, end_dt))
        .prefetch_related("workout_exercises")
        .order_by("-started_at")
    ):
        workouts.append(
            {
                "id": workout.id,
                "started_at": workout.started_at.isoformat(),
                "completed_at": workout.completed_at.isoformat() if workout.completed_at else None,
                "exercise_count": workout.workout_exercises.count(),
            }
        )

    mood = UserMoodCheckIn.objects.filter(
        user_id=user_id, checkin_date=target_date, status="submitted"
    ).first()
    mood_out = {"mood": mood.mood, "feeling": mood.feeling, "note": mood.note} if mood else None

    return {
        "date": target_date.isoformat(),
        "reviews": reviews,
        "interactions": interactions,
        "episodes": episodes,
        "workouts": workouts,
        "mood": mood_out,
    }
