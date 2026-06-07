from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_db, get_optional_user
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.auth import SteamCallbackRequest, SteamCallbackResponse
from otix.services.steam_auth_service import link_steam_to_user, validate_steam_link_callback

logger = structlog.get_logger()

router = APIRouter()


@router.post("/oauth/steam/callback", response_model=SteamCallbackResponse)
async def steam_connect_callback(
    body: SteamCallbackRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> SteamCallbackResponse:
    ip = client_ip(request)
    await limiter.check_steam_callback(ip)

    try:
        steam_id, state_user_id = await validate_steam_link_callback(body.params, body.raw_query)
        await link_steam_to_user(db, current_user, steam_id, state_user_id)
    except Exception:
        user_id = current_user.id if current_user else "unknown"
        logger.exception("steam link callback failed", user_id=user_id, ip=ip)
        raise

    logger.info("steam account linked", ip=ip)
    return SteamCallbackResponse()
