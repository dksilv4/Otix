# TODO: Review this file
from __future__ import annotations
import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from otix.api._utils import get_current_user, get_db
from otix.domain.user import User
from otix.infrastructure.config import settings

logger = structlog.get_logger()
router = APIRouter()

@router.post("/integrations/steam/scan")
async def steam_scan_library(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not current_user.steam_id:
        raise HTTPException(status_code=400, detail="No Steam account linked")
    if not settings.steam_api_key:
        raise HTTPException(status_code=503, detail="Steam API key not configured")
    from otix.providers.base import ProviderError
    from otix.providers.steam.client import SteamError
    from otix.services.steam_library_service import scan_steam_library
    try:
        result = await scan_steam_library(db, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (SteamError, ProviderError) as e:
        logger.exception("steam library scan failed")
        raise HTTPException(status_code=502, detail=f"Steam API error: {e}")
    except Exception:
        logger.exception("steam library scan failed unexpectedly")
        raise HTTPException(status_code=500, detail="Failed to scan Steam library. Please try again.")
    return result
