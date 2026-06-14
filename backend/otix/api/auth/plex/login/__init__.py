from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status

from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.services.plex_auth_service import build_plex_login_url

logger = structlog.get_logger()

router = APIRouter()


@router.post("/plex/initiate")
async def plex_login_initiate(
    request: Request,
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> dict:
    ip = client_ip(request)
    await limiter.check_plex_initiate(ip)

    try:
        url, state, pin_id = await build_plex_login_url()
    except HTTPException:
        raise
    except Exception:
        logger.exception("plex login initiate failed", ip=ip)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start Plex login. Please try again.",
        )

    logger.info("plex login initiated", ip=ip)
    return {"auth_url": url, "state": state, "pin_id": pin_id}
