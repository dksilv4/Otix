# TODO: Review this file
from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.schemas.auth import SteamResolveResponse

logger = structlog.get_logger()
router = APIRouter()

@router.post("/integrations/steam/resolve-unmatched", response_model=SteamResolveResponse)
async def steam_resolve_unmatched(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not current_user.steam_id:
        raise HTTPException(status_code=400, detail="No Steam account linked")
    if not settings.igdb_client_id:
        raise HTTPException(status_code=503, detail="IGDB not configured")
    from otix.services.steam_igdb_resolver import resolve_unmatched_steam_games
    try:
        result = await resolve_unmatched_steam_games(db, current_user.id)
    except Exception:
        logger.exception("steam-igdb resolve failed")
        raise HTTPException(status_code=500, detail="Failed to resolve unmatched game. Please try again.")
    return {
        "resolved": result.resolved,
        "synced": result.synced,
        "failed": result.failed,
        "total": result.total,
    }
