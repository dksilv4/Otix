# TODO: Review this file
from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.schemas.interaction import (
    InteractionCounts,
    InteractionCreate,
    InteractionOut,
    InteractionToggleResponse,
    UserInteractionState,
)
from otix.services.interaction_service import InteractionService

logger = structlog.get_logger()

interaction_router = APIRouter(prefix="/media", tags=["interaction"])

VALID_TYPES = {"liked", "watchlisted", "watched", "played", "started", "listened"}


@interaction_router.get("/{media_id}/interactions", response_model=UserInteractionState)
async def get_user_interactions(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserInteractionState:
    service = InteractionService(db)
    state = await service.get_user_interactions(
        user_id=current_user.id, media_item_id=media_id
    )
    return UserInteractionState(**state)


@interaction_router.put(
    "/{media_id}/interactions/{interaction_type}",
    response_model=InteractionToggleResponse,
)
async def set_interaction(
    media_id: str,
    interaction_type: str,
    body: InteractionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InteractionToggleResponse:
    if interaction_type not in VALID_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid interaction type. Must be one of: {', '.join(sorted(VALID_TYPES))}",
        )
    service = InteractionService(db)
    interaction = await service.set_interaction(
        user_id=current_user.id,
        media_item_id=media_id,
        interaction_type=interaction_type,
        extra_data=body.extra_data or None,
    )
    counts = await service.get_counts(media_id)

    # Invalidate the media-detail cache so the next GET returns fresh user_interactions
    redis = await get_redis()
    await redis.delete(f"media:detail:{media_id}:{current_user.id}")

    return InteractionToggleResponse(
        interaction=InteractionOut.model_validate(interaction),
        counts=InteractionCounts(**counts),
    )


@interaction_router.delete(
    "/{media_id}/interactions/{interaction_type}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_interaction(
    media_id: str,
    interaction_type: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if interaction_type not in VALID_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid interaction type. Must be one of: {', '.join(sorted(VALID_TYPES))}",
        )
    service = InteractionService(db)
    deleted = await service.remove_interaction(
        user_id=current_user.id,
        media_item_id=media_id,
        interaction_type=interaction_type,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Interaction not found"
        )

    # Invalidate the media-detail cache so the next GET returns fresh user_interactions
    redis = await get_redis()
    await redis.delete(f"media:detail:{media_id}:{current_user.id}")


# ── Claim / unclaim (owned games) ─────────────────────────────────────


@interaction_router.post(
    "/{media_id}/claim",
    status_code=status.HTTP_201_CREATED,
)
async def claim_game(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Record that the current user owns this game."""
    from sqlalchemy import select

    from otix.domain.media import MediaItem

    # Ensure the media item exists before claiming
    existing = await db.execute(select(MediaItem).where(MediaItem.id == media_id))
    if not existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Media item '{media_id}' not found. Try re-scanning or syncing your library first.",
        )

    service = InteractionService(db)
    await service.set_interaction(
        user_id=current_user.id,
        media_item_id=media_id,
        interaction_type="owned",
    )

    # Invalidate the media-detail cache so the next GET returns fresh user_interactions
    redis = await get_redis()
    await redis.delete(f"media:detail:{media_id}:{current_user.id}")

    logger.info("game claimed", user_id=current_user.id, media_item_id=media_id)
    return {"status": "claimed"}


@interaction_router.delete(
    "/{media_id}/claim",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unclaim_game(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Remove ownership of a game."""
    service = InteractionService(db)
    deleted = await service.remove_interaction(
        user_id=current_user.id,
        media_item_id=media_id,
        interaction_type="owned",
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Game not claimed",
        )

    # Invalidate the media-detail cache so the next GET returns fresh user_interactions
    redis = await get_redis()
    await redis.delete(f"media:detail:{media_id}:{current_user.id}")

    logger.info("game unclaimed", user_id=current_user.id, media_item_id=media_id)
