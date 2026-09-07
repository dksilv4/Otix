from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status

from otix.api.deps import get_current_user
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.providers.tmdb.client import TMDBProvider
from otix.schemas.auth import TmdbInitiateResponse
from otix.services.tmdb_auth_service import build_tmdb_link_url_for_user
from otix.services.tmdb_rating_service import get_tmdb_account_stats

logger = structlog.get_logger()
router = APIRouter()


async def _tmdb_stats(user: User) -> dict | None:
    if user.tmdb_session_id is None:
        return None
    try:
        redis = await get_redis()
        provider = TMDBProvider(redis)
        return await get_tmdb_account_stats(provider, user)
    except Exception:
        return None


@router.post("/oauth/tmdb", response_model=TmdbInitiateResponse)
async def tmdb_connect_initiate(
    request: Request,
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> TmdbInitiateResponse:
    """Initiate the TMDb OAuth link flow.

    Returns an authorization URL and state token. The client should
    redirect the user to *auth_url* and then the user will be sent to
    the redirect endpoint after TMDb authentication.
    """
    ip = client_ip(request)
    await limiter.check_tmdb_initiate(ip)

    if current_user.tmdb_session_id is not None:
        logger.warning("tmdb already linked", user_id=current_user.id, ip=ip)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TMDb account already linked",
        )
    redirect_url = str(request.url_for("tmdb_connect_redirect"))
    url, state = await build_tmdb_link_url_for_user(current_user.id, redirect_url)

    logger.info("tmdb linking initiated", user_id=current_user.id, ip=ip)
    return TmdbInitiateResponse(auth_url=url, state=state)
