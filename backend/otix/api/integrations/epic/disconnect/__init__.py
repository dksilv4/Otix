"""DELETE /integrations/epic/disconnect — unlink Epic integration."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.domain.epic_integration import UserEpicGame
from otix.domain.user import User
from otix.schemas.epic import EpicDisconnectResponse

logger = structlog.get_logger()
router = APIRouter()


@router.delete("/integrations/epic/disconnect", response_model=EpicDisconnectResponse)
async def epic_disconnect(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EpicDisconnectResponse:
    """Unlink Epic Games Store and remove all synced games."""
    logger.info("disconnecting epic integration", user_id=current_user.id)

    # Remove all epic game entries
    await db.execute(
        delete(UserEpicGame).where(UserEpicGame.user_id == current_user.id),
    )

    # Clear Epic fields on User
    current_user.epic_id = None
    current_user.epic_display_name = None
    current_user.epic_access_token = None
    current_user.epic_refresh_token = None
    current_user.epic_token_expires_at = None

    await db.flush()
    await db.commit()

    logger.info("epic integration disconnected", user_id=current_user.id)
    return EpicDisconnectResponse(success=True, message="Epic Games account unlinked")
