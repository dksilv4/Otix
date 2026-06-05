from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.karma import VoteCountsOut, VoteCreate
from otix.domain.user import User
from otix.services.karma_service import KarmaService

review_vote_router = APIRouter(prefix="/reviews", tags=["review_votes"])


@review_vote_router.post(
    "/{review_user_id}/{media_item_id}/vote",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def vote_review(
    review_user_id: str,
    media_item_id: str,
    body: VoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if current_user.id == review_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot vote on your own review",
        )
    if body.vote_type not in ("up", "down"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="vote_type must be 'up' or 'down'",
        )

    service = KarmaService(db)
    await service.vote(current_user.id, review_user_id, media_item_id, body.vote_type)
    await db.commit()


@review_vote_router.delete(
    "/{review_user_id}/{media_item_id}/vote",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_vote(
    review_user_id: str,
    media_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = KarmaService(db)
    deleted = await service.remove_vote(current_user.id, review_user_id, media_item_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vote not found")
    await db.commit()


@review_vote_router.get(
    "/{review_user_id}/{media_item_id}/vote",
    response_model=VoteCountsOut,
)
async def get_vote_counts(
    review_user_id: str,
    media_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> VoteCountsOut:
    service = KarmaService(db)
    counts = await service.get_vote_counts(review_user_id, media_item_id)
    my_vote = await service.get_my_vote(current_user.id, review_user_id, media_item_id)
    return VoteCountsOut(up=counts["up"], down=counts["down"], my_vote=my_vote)
