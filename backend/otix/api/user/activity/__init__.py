from __future__ import annotations

import asyncio

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.api._utils import get_db
from otix.domain.episode_interaction import UserEpisodeInteraction
from otix.domain.interaction import UserMediaInteraction
from otix.domain.media import Episode, MediaItem, Season
from otix.domain.mood import UserMoodCheckIn
from otix.domain.review import Review
from otix.domain.user import User
from otix.infrastructure.database import async_session
from otix.schemas.user import MoodCheckinOut, MoodTimelineOut

logger = structlog.get_logger()

router = APIRouter()


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

    user_id = user.id

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
    logger.info("user activity fetched", username=username, count=len(events), ip=ip)
    return events[:limit]


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
