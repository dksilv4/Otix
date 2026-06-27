from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.api.deps import get_db
from otix.domain.interaction import UserMediaInteraction
from otix.domain.list import UserList
from otix.domain.media import MediaItem
from otix.domain.media_rating import MediaItemRating
from otix.domain.review import Review
from otix.domain.user import User
from otix.domain.workout import Workout
from otix.schemas.user import HallOfFameItem, LibraryStatsOut
from otix.services.episode_interaction_service import EpisodeInteractionService
from otix.services.media_service import MediaService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/{username}/stats")
async def get_user_stats(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get a user's aggregate stats."""
    ip = request.client.host if request.client else None

    try:
        user = await db.scalar(select(User).where(User.username == username))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        counts = (
            await db.execute(
                select(
                    func.coalesce(
                        select(func.count())
                        .select_from(Review)
                        .where(Review.user_id == user.id, Review.content.isnot(None), Review.is_private == False)  # noqa: E712
                        .scalar_subquery(),
                        0,
                    ).label("review_count"),
                    func.coalesce(
                        select(func.count())
                        .select_from(UserMediaInteraction)
                        .where(UserMediaInteraction.user_id == user.id)
                        .scalar_subquery(),
                        0,
                    ).label("interaction_count"),
                    func.coalesce(
                        select(func.count()).select_from(Workout).where(Workout.user_id == user.id).scalar_subquery(),
                        0,
                    ).label("workout_count"),
                    func.coalesce(
                        select(func.count()).select_from(UserList).where(UserList.user_id == user.id).scalar_subquery(),
                        0,
                    ).label("list_count"),
                )
            )
        ).one()
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch user stats", username=username, ip=ip)
        raise

    logger.info("user stats fetched", username=username, ip=ip)
    return {
        "review_count": counts.review_count,
        "interaction_count": counts.interaction_count,
        "workout_count": counts.workout_count,
        "list_count": counts.list_count,
        "total_xp": user.total_xp,
    }


@router.get("/{username}/top-rated")
async def get_user_top_rated(
    username: str,
    request: Request,
    limit: int = Query(12, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Get a user's top-rated media items."""
    ip = request.client.host if request.client else None

    try:
        user = await db.scalar(select(User).where(User.username == username))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        result = await db.execute(
            select(MediaItemRating, MediaItem)
            .join(MediaItem, MediaItemRating.media_item_id == MediaItem.id)
            .where(MediaItemRating.user_id == user.id)
            .order_by(MediaItemRating.score.desc(), MediaItemRating.created_at.desc())
            .limit(limit)
        )
        rows = result.all()
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch user top rated", username=username, ip=ip)
        raise

    logger.info("user top rated fetched", username=username, count=len(rows), ip=ip)
    return [
        {
            "rating": {"score": rating.score, "created_at": rating.created_at.isoformat()},
            "media_item": {
                "id": media.id,
                "title": media.title,
                "media_type": media.media_type,
                "poster_url": media.poster_url,
                "release_year": media.release_year,
            },
        }
        for rating, media in rows
    ]


@router.get("/{username}/hall-of-fame", response_model=list[HallOfFameItem])
async def get_user_hall_of_fame(
    username: str,
    request: Request,
    media_type: str | None = Query(None, description="Filter by media type"),
    db: AsyncSession = Depends(get_db),
) -> list[HallOfFameItem]:
    """Get a user's hall of fame (top media picks)."""
    ip = request.client.host if request.client else None

    try:
        user = await db.scalar(select(User).where(User.username == username))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        hof = user.hof_ids
        if media_type:
            media_ids = hof.get(media_type, [])
        else:
            media_ids = []
            for ids in hof.values():
                if isinstance(ids, list):
                    media_ids.extend(ids)

        if not media_ids:
            return []

        service = MediaService(db)
        items = await service.get_media_items_by_ids(media_ids)
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch hall of fame", username=username, ip=ip)
        raise

    logger.info("hall of fame fetched", username=username, ip=ip)
    return [
        HallOfFameItem(
            id=item.id,
            title=item.title,
            media_type=item.media_type,
            poster_url=item.poster_url,
            release_year=item.release_date.year if item.release_date else None,
        )
        for item in items
    ]


@router.get("/{username}/library-stats", response_model=LibraryStatsOut)
async def get_user_library_stats(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> LibraryStatsOut:
    """Get a user's library statistics."""
    ip = request.client.host if request.client else None

    try:
        user = await db.scalar(select(User).where(User.username == username))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        type_result = await db.execute(
            select(MediaItem.media_type, UserMediaInteraction.interaction_type, func.count())
            .join(UserMediaInteraction, UserMediaInteraction.media_item_id == MediaItem.id)
            .where(UserMediaInteraction.user_id == user.id)
            .group_by(MediaItem.media_type, UserMediaInteraction.interaction_type)
        )
        by_media_type: dict[str, int] = {}
        total = 0
        watched_played = 0
        started = 0
        for media_type, interaction_type, cnt in type_result:
            by_media_type[media_type] = by_media_type.get(media_type, 0) + cnt
            total += cnt
            if interaction_type in ("watched", "played", "listened"):
                watched_played += cnt
            elif interaction_type == "started":
                started += cnt
        completed_total = watched_played + started
        completion_rate = watched_played / completed_total if completed_total > 0 else 0.0

        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        day_hour = await db.execute(
            select(
                select(func.extract("dow", UserMediaInteraction.created_at))
                .where(UserMediaInteraction.user_id == user.id)
                .group_by(func.extract("dow", UserMediaInteraction.created_at))
                .order_by(func.count().desc())
                .limit(1)
                .scalar_subquery(),
                select(func.extract("hour", UserMediaInteraction.created_at))
                .where(UserMediaInteraction.user_id == user.id)
                .group_by(func.extract("hour", UserMediaInteraction.created_at))
                .order_by(func.count().desc())
                .limit(1)
                .scalar_subquery(),
            )
        )
        day_val, hour_val = day_hour.one()
        most_active_day = day_names[int(day_val)] if day_val is not None else None
        most_active_hour = int(hour_val) if hour_val is not None else None

        episode_service = EpisodeInteractionService(db)
        total_watch_time_minutes = await episode_service.get_user_watch_time_minutes(user.id)
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch library stats", username=username, ip=ip)
        raise

    logger.info("library stats fetched", username=username, ip=ip)
    return LibraryStatsOut(
        total_items=total,
        by_media_type=by_media_type,
        total_watch_time_minutes=total_watch_time_minutes,
        completion_rate=round(completion_rate, 2),
        most_active_day=most_active_day,
        most_active_hour=most_active_hour,
    )
