from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

import structlog
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
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

logger = structlog.get_logger()

router = APIRouter()


class DailyReviewItem(BaseModel):
    id: str
    media_item_id: str
    media_title: str
    media_type: str
    poster_url: str | None = None
    score: int | None = None
    content_preview: str | None = None
    created_at: str


class DailyInteractionItem(BaseModel):
    id: str
    media_item_id: str
    media_title: str
    media_type: str
    poster_url: str | None = None
    interaction_type: str
    created_at: str


class DailyEpisodeItem(BaseModel):
    id: str
    show_id: str
    show_title: str
    poster_url: str | None = None
    season_number: int
    episode_number: int
    created_at: str


class DailyWorkoutItem(BaseModel):
    id: str
    started_at: str
    completed_at: str | None = None
    exercise_count: int = 0


class DailyMoodItem(BaseModel):
    mood: str
    feeling: str | None = None
    note: str | None = None


class DailyActivityResponse(BaseModel):
    date: str
    reviews: list[DailyReviewItem] = []
    interactions: list[DailyInteractionItem] = []
    episodes: list[DailyEpisodeItem] = []
    workouts: list[DailyWorkoutItem] = []
    mood: DailyMoodItem | None = None


@router.get("/me/daily-activity", response_model=DailyActivityResponse)
async def get_daily_activity(
    request: Request,
    day: str = Query(default=None, description="Date in YYYY-MM-DD format, defaults to today"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DailyActivityResponse:
    ip = request.client.host if request.client else None
    target_date = date.fromisoformat(day) if day else date.today()
    start_dt = datetime.combine(target_date, time.min).replace(tzinfo=timezone.utc)
    end_dt = datetime.combine(target_date, time.max).replace(tzinfo=timezone.utc)

    user_id = current_user.id

    # Reviews
    reviews_result = await db.execute(
        select(Review, MediaItem)
        .join(MediaItem, Review.media_item_id == MediaItem.id)
        .where(
            Review.user_id == user_id,
            Review.created_at >= start_dt,
            Review.created_at <= end_dt,
        )
        .order_by(Review.created_at.desc())
    )
    reviews = [
        DailyReviewItem(
            id=r.media_item_id,
            media_item_id=m.id,
            media_title=m.title,
            media_type=m.media_type,
            poster_url=m.poster_url,
            score=r.score,
            content_preview=r.content[:200] if r.content else None,
            created_at=r.created_at.isoformat(),
        )
        for r, m in reviews_result
    ]

    # Media interactions
    interactions_result = await db.execute(
        select(UserMediaInteraction, MediaItem)
        .join(MediaItem, UserMediaInteraction.media_item_id == MediaItem.id)
        .where(
            UserMediaInteraction.user_id == user_id,
            UserMediaInteraction.created_at >= start_dt,
            UserMediaInteraction.created_at <= end_dt,
        )
        .order_by(UserMediaInteraction.created_at.desc())
    )
    interactions = [
        DailyInteractionItem(
            id=f"{inter.media_item_id}_{inter.interaction_type}",
            media_item_id=m.id,
            media_title=m.title,
            media_type=m.media_type,
            poster_url=m.poster_url,
            interaction_type=inter.interaction_type,
            created_at=inter.created_at.isoformat(),
        )
        for inter, m in interactions_result
    ]

    # Episode interactions
    episodes_result = await db.execute(
        select(UserEpisodeInteraction, Episode, Season, MediaItem)
        .join(Episode, Episode.id == UserEpisodeInteraction.episode_id)
        .join(Season, Season.id == Episode.season_id)
        .join(MediaItem, MediaItem.id == Season.show_id)
        .where(
            UserEpisodeInteraction.user_id == user_id,
            UserEpisodeInteraction.created_at >= start_dt,
            UserEpisodeInteraction.created_at <= end_dt,
        )
        .order_by(UserEpisodeInteraction.created_at.desc())
    )
    episodes = [
        DailyEpisodeItem(
            id=str(ei.episode_id),
            show_id=m.id,
            show_title=m.title,
            poster_url=m.poster_url,
            season_number=s.season_number,
            episode_number=ep.episode_number,
            created_at=ei.created_at.isoformat(),
        )
        for ei, ep, s, m in episodes_result
    ]

    # Workouts
    workouts_result = await db.execute(
        select(Workout)
        .options(joinedload(Workout.workout_exercises))
        .where(
            Workout.user_id == user_id,
            Workout.started_at >= start_dt,
            Workout.started_at <= end_dt,
        )
        .order_by(Workout.started_at.desc())
    )
    workouts = [
        DailyWorkoutItem(
            id=w.id,
            started_at=w.started_at.isoformat(),
            completed_at=w.completed_at.isoformat() if w.completed_at else None,
            exercise_count=len(w.workout_exercises),
        )
        for w in workouts_result.unique().scalars()
    ]

    # Mood check-in
    mood_result = await db.execute(
        select(UserMoodCheckIn).where(
            UserMoodCheckIn.user_id == user_id,
            UserMoodCheckIn.checkin_date == target_date,
            UserMoodCheckIn.status == "submitted",
        )
    )
    mood_checkin = mood_result.scalar_one_or_none()
    mood = (
        DailyMoodItem(mood=mood_checkin.mood, feeling=mood_checkin.feeling, note=mood_checkin.note)
        if mood_checkin
        else None
    )

    logger.info(
        "daily activity fetched",
        user_id=user_id,
        date=target_date.isoformat(),
        reviews=len(reviews),
        interactions=len(interactions),
        episodes=len(episodes),
        workouts=len(workouts),
        has_mood=mood is not None,
        ip=ip,
    )

    return DailyActivityResponse(
        date=target_date.isoformat(),
        reviews=reviews,
        interactions=interactions,
        episodes=episodes,
        workouts=workouts,
        mood=mood,
    )
