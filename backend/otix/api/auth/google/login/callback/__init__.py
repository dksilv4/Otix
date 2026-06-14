from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.infrastructure.config import settings
from otix.lib.tokens import create_access_token, create_refresh_token, get_refresh_cookie_config
from otix.schemas.auth import GoogleCallbackRequest, TokenResponse
from otix.services.google_auth_service import (
    consume_state,
    exchange_code_for_tokens,
    find_or_create_google_user,
    get_google_user_profile,
)

logger = structlog.get_logger()
router = APIRouter()


@router.post("/google/callback", response_model=TokenResponse)
async def google_login_callback(
    body: GoogleCallbackRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> TokenResponse:
    ip = client_ip(request)
    await limiter.check_google_callback(ip)

    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google authentication is not configured.",
        )

    try:
        await consume_state(body.state)

        tokens = await exchange_code_for_tokens(body.code)

        access_token_val = tokens.get("access_token")
        if not access_token_val:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Google returned an invalid response. Please try again.",
            )

        profile = await get_google_user_profile(access_token_val)
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to fetch Google profile. Please try again.",
            )

        google_id = profile.get("sub")
        if not google_id:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Google returned an invalid profile. Please try again.",
            )

        user = await find_or_create_google_user(
            session=db,
            google_id=google_id,
            email=profile.get("email", ""),
            name=profile.get("name", ""),
            avatar_url=profile.get("picture"),
            access_token=access_token_val,
            refresh_token=tokens.get("refresh_token"),
            expires_in=tokens.get("expires_in", 3600),
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
        logger.exception("google login callback failed", ip=ip)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to sign in with Google. Please try again.",
        )

    response.set_cookie(value=refresh_token, **get_refresh_cookie_config())
    logger.info("google login succeeded", user_id=user.id, google_id=google_id, ip=ip)
    return TokenResponse(access_token=access_token)
