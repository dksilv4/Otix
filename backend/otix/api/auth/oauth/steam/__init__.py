from __future__ import annotations

import structlog
from fastapi import APIRouter, Body, Depends, HTTPException, Request

from otix.api._utils import get_current_user
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.auth import SteamInitiateResponse
from otix.services.steam_auth_service import build_steam_link_url

logger = structlog.get_logger()

router = APIRouter()


@router.post("/oauth/steam", response_model=SteamInitiateResponse)
async def steam_connect_initiate(
    request: Request,
    current_user: User = Depends(get_current_user),
    source: str | None = Body(None),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> SteamInitiateResponse:
    ip = client_ip(request)
    await limiter.check_steam_initiate(ip)

    if current_user.steam_id is not None:
        logger.warning("steam already linked", user_id=current_user.id, ip=ip)
        raise HTTPException(status_code=400, detail="Steam account already linked")

    url, state = await build_steam_link_url(source=source, user_id=current_user.id)
    logger.info("steam link initiated", user_id=current_user.id, ip=ip, source=source)
    return SteamInitiateResponse(auth_url=url, state=state)
