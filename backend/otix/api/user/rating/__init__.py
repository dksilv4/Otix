from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db, get_optional_user
from otix.domain.media import MediaItem
from otix.domain.media_rating import MediaItemRating
from otix.domain.notification import Notification
from otix.domain.user import User, UserRating
from otix.schemas.user import RatingDistributionItem, RatingDistributionOut
from otix.schemas.user_rating import UserRatingCreate, UserRatingOut, UserReputationOut
from otix.services.user_rating_service import UserRatingService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/{username}/rating", response_model=UserRatingOut | None)
async def get_my_user_rating(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserRatingOut | None:
    """Get the authenticated user's rating of another user."""
    ip = request.client.host if request.client else None

    try:
        user = await db.scalar(select(User).where(User.username == username))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if user.id == current_user.id:
            return None

        service = UserRatingService(db)
        rating = await service.get_my_rating(current_user.id, user.id)
    except HTTPException:
        raise
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch user rating", username=username, ip=ip)
        raise

    return UserRatingOut.model_validate(rating) if rating else None


@router.put("/{username}/rating", response_model=UserRatingOut)
async def rate_user(
    username: str,
    body: UserRatingCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserRatingOut:
    """Rate another user on a 1–10 scale."""
    ip = request.client.host if request.client else None

    try:
        user = await db.scalar(select(User).where(User.username == username))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if user.id == current_user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot rate yourself")

        existing = await db.scalar(
            select(UserRating).where(
                UserRating.rater_id == current_user.id, UserRating.rated_user_id == user.id,
            )
        )

        service = UserRatingService(db)
        rating = await service.upsert_rating(current_user.id, user.id, body.score)

        notification = Notification(
            user_id=user.id,
            type="user_rating",
            title="New Rating",
            body=f"{current_user.username} rated you {body.score}/10",
            metadata_json={
                "rater_id": current_user.id,
                "rater_username": current_user.username,
                "score": body.score,
                "is_new": existing is None,
                "prev_score": existing.score if existing else None,
            },
        )
        db.add(notification)
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception("failed to rate user", username=username, rater_id=current_user.id, ip=ip)
        raise

    logger.info("user rated", username=username, rater_id=current_user.id, score=body.score, ip=ip)
    return UserRatingOut.model_validate(rating)


@router.delete("/{username}/rating", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_rating(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Remove the authenticated user's rating of another user."""
    ip = request.client.host if request.client else None

    try:
        user = await db.scalar(select(User).where(User.username == username))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        service = UserRatingService(db)
        deleted = await service.delete_rating(current_user.id, user.id)
        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rating not found")
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception("failed to delete user rating", username=username, user_id=current_user.id, ip=ip)
        raise

    logger.info("user rating deleted", username=username, user_id=current_user.id, ip=ip)


@router.get("/{username}/reputation", response_model=UserReputationOut)
async def get_user_reputation(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> UserReputationOut:
    """Get a user's composite reputation score."""
    ip = request.client.host if request.client else None

    try:
        user = await db.scalar(select(User).where(User.username == username))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        service = UserRatingService(db)
        result = await service.compute_composite_score(user.id)
    except Exception:
        await db.rollback()
        logger.exception("failed to compute user reputation", username=username, ip=ip)
        raise

    logger.info("user reputation fetched", username=username, ip=ip)
    return UserReputationOut(
        avg_user_rating=user.avg_user_rating,
        user_rating_count=user.user_rating_count,
        composite_score=result.get("composite_score"),
        components=result.get("components", {}),
    )


@router.get("/{username}/rating-distribution", response_model=RatingDistributionOut)
async def get_user_rating_distribution(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> RatingDistributionOut:
    """Get a user's rating distribution by score and media type."""
    ip = request.client.host if request.client else None

    try:
        user = await db.scalar(select(User).where(User.username == username))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        rows = await db.execute(
            select(MediaItemRating.score, MediaItem.media_type, func.count().label("cnt"))
            .join(MediaItem, MediaItemRating.media_item_id == MediaItem.id)
            .where(MediaItemRating.user_id == user.id)
            .group_by(MediaItemRating.score, MediaItem.media_type)
            .order_by(MediaItemRating.score)
        )
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch rating distribution", username=username, ip=ip)
        raise

    by_score: dict[int, dict[str, int]] = {
        score: {"movie": 0, "show": 0, "game": 0, "music": 0} for score in range(1, 11)
    }
    total = 0
    for score, media_type, cnt in rows:
        by_score[score][media_type] = cnt
        total += cnt

    distribution = [RatingDistributionItem(score=s, **by_score[s]) for s in range(1, 11)]
    logger.info("rating distribution fetched", username=username, total_ratings=total, ip=ip)
    return RatingDistributionOut(distribution=distribution, total_ratings=total)
