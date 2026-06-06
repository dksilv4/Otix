# TODO: Review this file
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db, get_optional_user
from otix.schemas.media_rating import MediaRatingAggregateOut, MediaRatingCreate, MediaRatingOut
from otix.schemas.review import (
    ReviewCreate,
    ReviewOut,
    ReviewUpdate,
    ReviewWithUserOut,
)
from otix.domain.user import User
from otix.services.media_rating_service import MediaRatingService
from otix.services.review_service import ReviewService

review_router = APIRouter(prefix="/media", tags=["review"])


# ── Review CRUD ──


@review_router.get("/{media_id}/review", response_model=ReviewOut | None)
async def get_my_review(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReviewOut | None:
    service = ReviewService(db)
    return await service.get_my_review(user_id=current_user.id, media_item_id=media_id)


@review_router.put("/{media_id}/review", response_model=ReviewOut)
async def upsert_review(
    media_id: str,
    body: ReviewCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReviewOut:
    service = ReviewService(db)
    return await service.upsert_review(
        user_id=current_user.id,
        media_item_id=media_id,
        title=body.title,
        content=body.content,
        is_spoiler=body.is_spoiler,
        is_private=body.is_private,
    )


@review_router.patch("/{media_id}/review", response_model=ReviewOut)
async def update_review(
    media_id: str,
    body: ReviewUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReviewOut:
    service = ReviewService(db)
    existing = await service.update_review(
        user_id=current_user.id,
        media_item_id=media_id,
        update_data=body.model_dump(exclude_unset=True),
    )
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    return existing


@review_router.delete("/{media_id}/review", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = ReviewService(db)
    deleted = await service.delete_review(user_id=current_user.id, media_item_id=media_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")


@review_router.get("/{media_id}/reviews", response_model=list[ReviewWithUserOut])
async def list_reviews(
    media_id: str,
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> list[ReviewWithUserOut]:
    service = ReviewService(db)
    items, _ = await service.get_reviews_for_media_with_ratings(
        media_item_id=media_id,
        cursor=cursor,
        limit=limit,
        current_user_id=current_user.id if current_user else None,
    )
    return [
        ReviewWithUserOut(
            user_id=review.user_id,
            media_item_id=review.media_item_id,
            title=review.title,
            content=review.content,
            is_spoiler=review.is_spoiler,
            created_at=review.created_at,
            updated_at=review.updated_at,
            cooldown_until=review.cooldown_until,
            user=review.user,  # type: ignore
            rating=MediaRatingOut.model_validate(rating) if rating else None,
        )
        for review, rating in items
    ]


# ── Rating CRUD ──


@review_router.get("/{media_id}/rating", response_model=MediaRatingOut | None)
async def get_my_rating(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaRatingOut | None:
    service = MediaRatingService(db)
    return await service.get_my_rating(user_id=current_user.id, media_item_id=media_id)


@review_router.put("/{media_id}/rating", response_model=MediaRatingAggregateOut)
async def upsert_rating(
    media_id: str,
    body: MediaRatingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaRatingAggregateOut:
    service = MediaRatingService(db)
    rating, avg_rating, rating_count = await service.upsert_rating(
        user_id=current_user.id,
        media_item_id=media_id,
        score=body.score,
    )
    return MediaRatingAggregateOut(
        score=rating.score,
        avg_rating=avg_rating,
        rating_count=rating_count,
    )


@review_router.delete("/{media_id}/rating", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rating(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = MediaRatingService(db)
    deleted = await service.delete_rating(user_id=current_user.id, media_item_id=media_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rating not found")
