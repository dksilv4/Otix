from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.api.deps import get_current_user, get_db
from otix.domain.episode_interaction import UserEpisodeInteraction
from otix.domain.interaction import UserMediaInteraction
from otix.domain.media import Episode, MediaItem, Season
from otix.domain.mood import UserMoodCheckIn
from otix.domain.review import Review
from otix.domain.user import User
from otix.domain.workout import Workout
from otix.infrastructure.database import async_session
from otix.schemas.user import MoodCheckinOut, MoodTimelineOut

logger = structlog.get_logger()

router = APIRouter()


async def _fetch_user_activity_events(
    user_id: str,
    limit: int = 20,
) -> list[dict]:
    """Fetch activity events for a given user. Shared by activity and friend-feed endpoints."""
    async def _fetch_reviews():
        async with async_session() as s:
            result = await s.execute(
                select(Review, MediaItem)
                .join(MediaItem, Review.media_item_id == MediaItem.id)
                .where(Review.user_id == user_id, Review.content.isnot(None), Review.is_private == False)  # noqa: E712
                .order_by(Review.created_at.desc()).limit(limit)
            )
            return result.all()

    async def _fetch_interactions():
        async with async_session() as s:
            result = await s.execute(
                select(UserMediaInteraction, MediaItem)
                .join(MediaItem, UserMediaInteraction.media_item_id == MediaItem.id)
                .where(UserMediaInteraction.user_id == user_id)
                .order_by(UserMediaInteraction.created_at.desc()).limit(limit)
            )
            return result.all()

    async def _fetch_episode_interactions():
        async with async_session() as s:
            result = await s.execute(
                select(UserEpisodeInteraction, Episode, Season, MediaItem)
                .join(Episode, Episode.id == UserEpisodeInteraction.episode_id)
                .join(Season, Season.id == Episode.season_id)
                .join(MediaItem, MediaItem.id == Season.show_id)
                .where(UserEpisodeInteraction.user_id == user_id)
                .order_by(UserEpisodeInteraction.created_at.desc()).limit(limit)
            )
            return result.all()

    review_rows, interaction_rows, episode_rows = await asyncio.gather(
        _fetch_reviews(), _fetch_interactions(), _fetch_episode_interactions(),
    )

    events: list[dict] = []
    for review, media in review_rows:
        events.append({
            "type": "review",
            "timestamp": review.created_at.isoformat(),
            "summary": f"Reviewed {media.title}",
            "score": review.score,
            "content": review.content[:200] if review.content else None,
            "media_item": {"id": media.id, "title": media.title, "media_type": media.media_type, "poster_url": media.poster_url},
        })

    for interaction, media in interaction_rows:
        action = interaction.interaction_type
        past_tense = {"like": "Liked", "watched": "Watched", "played": "Played", "watchlist": "Added to watchlist",
                       "started": "Started", "completed": "Completed", "dropped": "Dropped"}.get(action, action.capitalize())
        events.append({
            "type": "interaction",
            "timestamp": interaction.created_at.isoformat(),
            "summary": f"{past_tense} {media.title}",
            "interaction_type": action,
            "media_item": {"id": media.id, "title": media.title, "media_type": media.media_type, "poster_url": media.poster_url},
        })

    for ei, episode, season, media in episode_rows:
        events.append({
            "type": "episode_watched",
            "timestamp": ei.created_at.isoformat(),
            "summary": f"Watched S{season.season_number}E{episode.episode_number} of {media.title}",
            "media_item": {"id": media.id, "title": media.title, "media_type": media.media_type, "poster_url": media.poster_url},
        })

    events.sort(key=lambda e: e["timestamp"], reverse=True)
    return events[:limit]


@router.get("/{username}/activity")
async def get_user_activity(
    username: str,
    request: Request,
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Get a user's recent activity timeline."""
    ip = request.client.host if request.client else None

    try:
        user = await db.scalar(select(User).where(User.username == username))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch user for activity", username=username, ip=ip)
        raise

    events = await _fetch_user_activity_events(user.id, limit=limit)
    logger.info("user activity fetched", username=username, count=len(events), ip=ip)
    return events


@router.get("/{username}/mood-timeline", response_model=MoodTimelineOut)
async def get_user_mood_timeline(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MoodTimelineOut:
    """Get a user's recent mood check-in timeline."""
    ip = request.client.host if request.client else None

    try:
        user = await db.scalar(select(User).where(User.username == username))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        checkins_result = await db.scalars(
            select(UserMoodCheckIn)
            .where(UserMoodCheckIn.user_id == user.id, UserMoodCheckIn.status == "submitted")
            .order_by(UserMoodCheckIn.checkin_date.desc()).limit(30)
        )
        checkins = list(checkins_result)
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch mood timeline", username=username, ip=ip)
        raise

    logger.info("mood timeline fetched", username=username, count=len(checkins), ip=ip)
    return MoodTimelineOut(
        checkins=[
            MoodCheckinOut(date=c.checkin_date.isoformat(), mood=c.mood, feeling=c.feeling, note=c.note)
            for c in checkins
        ]
    )


class ActivityHeatmapEntry(BaseModel):
    date: str
    workout: int = 0
    movie: int = 0
    show: int = 0
    music: int = 0


class ActivityHeatmapResponse(BaseModel):
    weeks: int
    dates: list[ActivityHeatmapEntry]


@router.get("/me/activity-heatmap", response_model=ActivityHeatmapResponse)
async def get_my_activity_heatmap(
    request: Request,
    weeks: int = Query(12, ge=4, le=52),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ActivityHeatmapResponse:
    """Get combined activity heatmap data for the authenticated user.

    Returns daily counts for workout, movie, show, and music activity
    over the past N weeks.
    """
    ip = request.client.host if request.client else None
    today = date.today()
    start_date = today - timedelta(days=weeks * 7 - 1)
    start_dt = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=timezone.utc)

    user_id = current_user.id
    date_map: dict[str, dict[str, int]] = {}

    def _ensure(d: str) -> dict[str, int]:
        if d not in date_map:
            date_map[d] = {"workout": 0, "movie": 0, "show": 0, "music": 0}
        return date_map[d]

    # 1. Workouts
    workout_date = func.date(Workout.started_at)
    result = await db.execute(
        select(workout_date.label("date"), func.count(Workout.id).label("count"))
        .where(Workout.user_id == user_id, Workout.started_at >= start_dt)
        .group_by(workout_date)
        .order_by(workout_date)
    )
    for row in result:
        _ensure(row.date.isoformat())["workout"] = row.count

    # 2. Media interactions (movie, show, music)
    interaction_date = func.date(UserMediaInteraction.created_at)
    result = await db.execute(
        select(
            interaction_date.label("date"),
            MediaItem.media_type,
            func.count(UserMediaInteraction.media_item_id).label("count"),
        )
        .join(MediaItem, UserMediaInteraction.media_item_id == MediaItem.id)
        .where(
            UserMediaInteraction.user_id == user_id,
            UserMediaInteraction.created_at >= start_dt,
            MediaItem.media_type.in_(["movie", "show", "music"]),
        )
        .group_by(interaction_date, MediaItem.media_type)
        .order_by(interaction_date)
    )
    for row in result:
        key = row.media_type
        if key in ("movie", "show", "music"):
            _ensure(row.date.isoformat())[key] += row.count

    # 3. Episode interactions (counts as "show" activity)
    episode_date = func.date(UserEpisodeInteraction.created_at)
    result = await db.execute(
        select(episode_date.label("date"), func.count(UserEpisodeInteraction.episode_id).label("count"))
        .where(UserEpisodeInteraction.user_id == user_id, UserEpisodeInteraction.created_at >= start_dt)
        .group_by(episode_date)
        .order_by(episode_date)
    )
    for row in result:
        _ensure(row.date.isoformat())["show"] += row.count

    # Build full date range
    dates_list: list[ActivityHeatmapEntry] = []
    cursor = start_date
    while cursor <= today:
        key = cursor.isoformat()
        entry = date_map.get(key, {"workout": 0, "movie": 0, "show": 0, "music": 0})
        dates_list.append(ActivityHeatmapEntry(date=key, **entry))
        cursor += timedelta(days=1)

    logger.info("activity heatmap fetched", user_id=user_id, weeks=weeks, ip=ip)
    return ActivityHeatmapResponse(weeks=weeks, dates=dates_list)
