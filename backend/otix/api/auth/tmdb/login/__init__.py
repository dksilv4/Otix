from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status

from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.schemas.auth import TmdbInitiateResponse
from otix.services.tmdb_auth_service import build_tmdb_login_url

logger = structlog.get_logger()

router = APIRouter()


@router.post("/tmdb/initiate", response_model=TmdbInitiateResponse)
async def tmdb_login_initiate(
    request: Request,
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> TmdbInitiateResponse:
    ip = client_ip(request)
    await limiter.check_tmdb_initiate(ip)

    try:
        url, state = await build_tmdb_login_url()
    except HTTPException:
        raise
    except Exception:
        logger.exception("tmdb login initiate failed", ip=ip)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start TMDb login. Please try again.",
        )

    logger.info("tmdb login initiated", ip=ip)
    return TmdbInitiateResponse(auth_url=url, state=state)
