from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.lib.tokens import create_access_token, create_refresh_token, get_refresh_cookie_config
from otix.schemas.auth import TokenResponse
from otix.services.tmdb_auth_service import (
    _consume_request_token,
    _create_session,
    find_or_create_tmdb_user,
    get_tmdb_account,
)

logger = structlog.get_logger()
router = APIRouter()


@router.post("/tmdb/callback", response_model=TokenResponse)
async def tmdb_login_callback(
    body: dict,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> TokenResponse:
    ip = client_ip(request)
    await limiter.check_tmdb_callback(ip)

    state = body.get("state")
    request_token = body.get("request_token")
    if not state and not request_token:
        raise HTTPException(status_code=400, detail="Missing state or request_token parameter.")

    try:
        stored_token, _ = await _consume_request_token(state, request_token)
        session_id = await _create_session(stored_token)
        account = await get_tmdb_account(session_id)
        if not account:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to fetch TMDb account details. Please try again.",
            )

        account_id = account.get("id")
        if not account_id:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="TMDb returned an invalid account profile. Please try again.",
            )

        user = await find_or_create_tmdb_user(
            session=db,
            session_id=session_id,
            account_id=int(account_id),
            username=account.get("username") or account.get("name", ""),
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
        logger.exception("tmdb login callback failed", ip=ip)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to sign in with TMDb. Please try again.",
        )

    response.set_cookie(value=refresh_token, **get_refresh_cookie_config())
    logger.info("tmdb login succeeded", user_id=user.id, tmdb_account_id=account_id, ip=ip)
    return TokenResponse(access_token=access_token)
