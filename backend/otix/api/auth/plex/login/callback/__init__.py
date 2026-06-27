from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.lib.tokens import create_access_token, create_refresh_token, get_refresh_cookie_config
from otix.schemas.auth import TokenResponse
from otix.services.plex_auth_service import (
    _consume_state,
    _get_pin_auth_token,
    find_or_create_plex_user,
    get_plex_user_info,
)

logger = structlog.get_logger()
router = APIRouter()


@router.post("/plex/callback", response_model=TokenResponse)
async def plex_login_callback(
    body: dict,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> TokenResponse:
    ip = client_ip(request)
    await limiter.check_plex_callback(ip)

    state = body.get("state")
    pin_id = body.get("pinId") or body.get("pin_id")
    if not state:
        raise HTTPException(status_code=400, detail="Missing state parameter.")

    try:
        resolved_pin_id, _ = await _consume_state(state, pin_id)
        auth_token = await _get_pin_auth_token(resolved_pin_id)
        profile = await get_plex_user_info(auth_token)
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to fetch Plex account details. Please try again.",
            )

        plex_id = str(profile.get("id") or profile.get("uuid") or "")
        if not plex_id:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Plex returned an invalid account profile. Please try again.",
            )

        user = await find_or_create_plex_user(
            session=db,
            plex_id=plex_id,
            username=profile.get("username") or profile.get("title", ""),
            email=profile.get("email", ""),
            thumb=profile.get("thumb"),
            auth_token=auth_token,
        )

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
    except HTTPException:
        raise
    except Exception:
        logger.exception("plex login callback failed", ip=ip)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to sign in with Plex. Please try again.",
        )

    response.set_cookie(value=refresh_token, **get_refresh_cookie_config())
    logger.info("plex login succeeded", user_id=user.id, plex_id=plex_id, ip=ip)
    return TokenResponse(access_token=access_token)
