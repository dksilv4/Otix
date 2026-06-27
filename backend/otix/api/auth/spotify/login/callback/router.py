from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status

from otix.api.deps import get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.infrastructure.config import settings
from otix.lib.tokens import create_access_token, create_refresh_token, get_refresh_cookie_config
from otix.schemas.auth import TokenResponse
from otix.services.spotify_auth_service import (
    consume_state,
    exchange_code_for_tokens,
    find_or_create_spotify_user,
    get_spotify_user_profile,
)

logger = structlog.get_logger()
router = APIRouter()


@router.post("/spotify/callback", response_model=TokenResponse)
async def spotify_login_callback(
    body: dict,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> TokenResponse:
    ip = client_ip(request)
    await limiter.check_spotify_callback(ip)

    if not settings.spotify_client_id or not settings.spotify_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Spotify authentication is not configured.",
        )

    code = body.get("code")
    state = body.get("state")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state parameter.")

    try:
        await consume_state(state)

        tokens = await exchange_code_for_tokens(code)

        access_token_val = tokens.get("access_token")
        if not access_token_val:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Spotify returned an invalid response. Please try again.",
            )

        profile = await get_spotify_user_profile(access_token_val)
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to fetch Spotify profile. Please try again.",
            )

        spotify_id = profile.get("id")
        if not spotify_id:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Spotify returned an invalid profile. Please try again.",
            )

        images = profile.get("images", [])
        avatar_url = images[0].get("url") if images and isinstance(images[0], dict) else None

        user = await find_or_create_spotify_user(
            session=db,
            spotify_id=spotify_id,
            display_name=profile.get("display_name", ""),
            email=profile.get("email", ""),
            avatar_url=avatar_url,
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
        logger.exception("spotify login callback failed", ip=ip)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to sign in with Spotify. Please try again.",
        ) from None

    response.set_cookie(value=refresh_token, **get_refresh_cookie_config())
    logger.info("spotify login succeeded", user_id=user.id, spotify_id=spotify_id, ip=ip)
    return TokenResponse(access_token=access_token)
