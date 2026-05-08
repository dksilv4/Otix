from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.api.deps import get_db
from otix.api.schemas.review import ReviewWithUserOut
from otix.api.schemas.user import UserProfileOut
from otix.domain.review import Review
from otix.domain.user import User
from otix.services.review_service import ReviewService

user_router = APIRouter(prefix="/users", tags=["users"])


@user_router.get("/{username}", response_model=UserProfileOut)
async def get_user_profile(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> UserProfileOut:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    review_count = await db.scalar(
        select(func.count()).select_from(Review).where(
            Review.user_id == user.id,
            Review.content.isnot(None),
            Review.is_private == False,  # noqa: E712
        )
    )

    return UserProfileOut(
        id=user.id,
        username=user.username,
        avatar_url=user.avatar_url,
        bio=user.bio,
        background_url=user.background_url,
        created_at=user.created_at,
        review_count=review_count or 0,
    )


@user_router.get("/{username}/reviews", response_model=list[ReviewWithUserOut])
async def get_user_reviews(
    username: str,
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[ReviewWithUserOut]:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    service = ReviewService(db)
    items, _ = await service.get_reviews_by_user(user.id, cursor=cursor, limit=limit)
    return [ReviewWithUserOut.model_validate(item) for item in items]
