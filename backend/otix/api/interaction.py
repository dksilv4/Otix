from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.interaction import (
    InteractionCounts,
    InteractionCreate,
    InteractionOut,
    InteractionToggleResponse,
    UserInteractionState,
)
from otix.domain.user import User
from otix.services.interaction_service import InteractionService

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
