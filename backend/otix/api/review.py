from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.review import (
    ReviewCreate,
    ReviewOut,
    ReviewUpdate,
    ReviewWithUserOut,
    ScoreOnlyOut,
)
from otix.domain.media import MediaItem
from otix.domain.user import User
from otix.services.review_service import ReviewService

review_router = APIRouter(prefix="/media", tags=["review"])


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
        score=body.score,
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
    existing = await service.get_my_review(user_id=current_user.id, media_item_id=media_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(existing, field, value)

    await db.flush()
    if "score" in update_data:
        await service._recalc_rating_aggregates(media_id)
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
) -> list[ReviewWithUserOut]:
    service = ReviewService(db)
    items, _ = await service.get_reviews_for_media(
        media_item_id=media_id,
        cursor=cursor,
        limit=limit,
    )
    return [ReviewWithUserOut.model_validate(r) for r in items]


@review_router.put("/{media_id}/rating", response_model=ScoreOnlyOut)
async def quick_rate(
    media_id: str,
    body: ReviewCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScoreOnlyOut:
    if body.score is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Score is required")

    service = ReviewService(db)
    review = await service.upsert_review(
        user_id=current_user.id,
        media_item_id=media_id,
        score=body.score,
        title=None,
        content=None,
        is_spoiler=False,
    )
    media = await db.get(MediaItem, media_id)
    return ScoreOnlyOut(
        score=review.score,
        avg_rating=media.avg_rating if media else None,
        rating_count=media.rating_count if media else 0,
    )
