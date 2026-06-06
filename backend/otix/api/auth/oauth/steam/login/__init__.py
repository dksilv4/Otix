from __future__ import annotations

import structlog
from fastapi import APIRouter, Body, Depends, Request

from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.schemas.auth import SteamInitiateResponse
from otix.services.steam_auth_service import build_steam_login_url

logger = structlog.get_logger()

router = APIRouter()


@router.post("/steam/initiate", response_model=SteamInitiateResponse)
async def steam_initiate(
    request: Request,
    source: str | None = Body(None),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> SteamInitiateResponse:
    ip = client_ip(request)
    await limiter.check_steam_initiate(ip)

    url, state = await build_steam_login_url(source=source)
    logger.info("steam login initiated", ip=ip, source=source)
    return SteamInitiateResponse(auth_url=url, state=state)
