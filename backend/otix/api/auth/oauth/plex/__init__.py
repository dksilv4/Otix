from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request

from otix.api._utils import get_current_user
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.schemas.auth import PlexInitiateResponse
from otix.domain.user import User
from otix.services.plex_auth_service import build_plex_link_url

logger = structlog.get_logger()
router = APIRouter()


@router.post("/oauth/plex", response_model=PlexInitiateResponse)
async def plex_connect_initiate(
    request: Request,
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> PlexInitiateResponse:
    """Initiate the Plex OAuth link flow.

    Returns an authorization URL, state token, and PIN ID. The client
    should redirect the user to *auth_url* and then POST the callback
    to ``/auth/oauth/plex/callback``.
    """
    ip = client_ip(request)
    await limiter.check_plex_initiate(ip)

    if current_user.plex_id is not None:
        logger.warning("plex already linked", user_id=current_user.id, ip=ip)
        raise HTTPException(status_code=400, detail="Plex account already linked")
    url, state, pin_id = await build_plex_link_url(user_id=current_user.id)
    logger.info("plex linking initiated", user_id=current_user.id, ip=ip)
    return PlexInitiateResponse(auth_url=url, state=state, pin_id=pin_id)
