from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.schemas.auth import SteamCallbackRequest, TokenResponse
from otix.lib.tokens import create_access_token, create_refresh_token, get_refresh_cookie_config
from otix.services.steam_auth_service import find_or_create_steam_user, validate_steam_callback

logger = structlog.get_logger()
router = APIRouter()


@router.post("/steam/callback", response_model=TokenResponse)
async def steam_callback(
    body: SteamCallbackRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> TokenResponse:
    ip = client_ip(request)
    await limiter.check_steam_callback(ip)

    try:
        steam_id = await validate_steam_callback(body.params, body.raw_query)
        user = await find_or_create_steam_user(db, steam_id)

        from otix.services.session_service import SessionService

        session_svc = SessionService(db)
        session_key = await session_svc.create_session(
            user,
            ip_address=ip,
            user_agent=request.headers.get("User-Agent"),
        )

        access_token = create_access_token(user.id)
        refresh_token, jti, exp = create_refresh_token(user.id, session_key)

        await session_svc.store_refresh_token(user.id, jti, exp)
    except Exception:
        logger.exception("steam login callback failed", ip=ip)
        raise

    response.set_cookie(value=refresh_token, **get_refresh_cookie_config())
    logger.info("steam login succeeded", user_id=user.id, steam_id=steam_id, ip=ip)
    return TokenResponse(access_token=access_token)
