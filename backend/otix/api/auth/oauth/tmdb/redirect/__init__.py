from __future__ import annotations

import urllib.parse

import structlog
from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.infrastructure.config import settings
from otix.services.tmdb_auth_service import link_tmdb_state_to_user

logger = structlog.get_logger()
router = APIRouter()


@router.get("/oauth/tmdb/redirect", name="tmdb_connect_redirect")
async def tmdb_connect_redirect(
    request: Request,
    db: AsyncSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> RedirectResponse:
    ip = client_ip(request)
    await limiter.check_tmdb_callback(ip)  # reuse callback rate limit — same sensitivity

    approved = request.query_params.get("approved")
    state_value = request.query_params.get("state") or ""
    request_token = request.query_params.get("request_token")

    if approved == "false":
        logger.info("tmdb auth cancelled", ip=ip)
        return _tmdb_frontend_redirect("error", "TMDb authorization was cancelled.")
    if not state_value and not request_token:
        logger.warning("tmdb redirect missing params", ip=ip)
        return _tmdb_frontend_redirect("error", "TMDb did not return the expected authorization details.")

    try:
        await link_tmdb_state_to_user(db, state_value, request_token)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        logger.exception("tmdb connect redirect failed", ip=ip)
        return _tmdb_frontend_redirect("error", "Failed to link TMDb account. Please try again.")

    logger.info("tmdb account linked via redirect", ip=ip)
    return _tmdb_frontend_redirect("success")


def _tmdb_frontend_redirect(status_value: str, message: str | None = None) -> RedirectResponse:
    query = {"tmdb_link": status_value}
    if message:
        query["message"] = message
    url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/?{urllib.parse.urlencode(query)}"
    return RedirectResponse(url, status_code=status.HTTP_303_SEE_OTHER)
