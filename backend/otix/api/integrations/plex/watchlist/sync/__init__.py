# TODO: Review this file
from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.domain.user import User

logger = structlog.get_logger()
router = APIRouter()

@router.post("/integrations/plex/watchlist/sync")
async def plex_watchlist_sync(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not current_user.plex_id:
        raise HTTPException(status_code=400, detail="No Plex account linked")
    from otix.services.plex_sync_service import sync_plex_watchlist
    try:
        result = await sync_plex_watchlist(db, current_user)
        await db.commit()
    except Exception:
        logger.exception("plex watchlist sync failed unexpectedly")
        raise HTTPException(status_code=500, detail="Failed to sync Plex watchlist. Please try again.")
    return result
