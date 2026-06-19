"""POST /integrations/epic/library/push — receive Epic library from plugin."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.domain.user import User
from otix.schemas.epic import EpicLibraryPushRequest, EpicLibraryPushResponse
from otix.services.epic_library_service import ingest_epic_library

logger = structlog.get_logger()
router = APIRouter()


@router.post(
    "/integrations/epic/library/push",
    response_model=EpicLibraryPushResponse,
)
async def epic_library_push(
    payload: EpicLibraryPushRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EpicLibraryPushResponse:
    """Receive a full Epic Games library snapshot from the legendary plugin.

    The plugin pushes the user's owned + installed games. This endpoint
    processes them through the 3-stage matching pipeline:
    1. Local ExternalID check
    2. IGDB title search & sync
    3. Store as unmatched for later resolution
    """
    logger.info(
        "epic library push received",
        user_id=current_user.id,
        game_count=len(payload.games),
    )

    try:
        result = await ingest_epic_library(
            db=db,
            user=current_user,
            account_id=payload.account_id,
            display_name=payload.display_name,
            games=payload.games,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("epic library push failed")
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to process Epic library. Please try again.",
        )

    logger.info(
        "epic library push complete",
        user_id=current_user.id,
        matched=result.matched,
        created=result.created,
        unmatched=result.unmatched,
    )
    return result
