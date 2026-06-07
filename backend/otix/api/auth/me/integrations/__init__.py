from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends

from otix.api._utils import get_current_user
from otix.api.auth.me._utils import _gravatar_url
from otix.domain.user import User
from otix.schemas.auth import MeIntegrationsResponse

logger = structlog.get_logger()
router = APIRouter()


def _integrations_response(user: User) -> MeIntegrationsResponse:
    return MeIntegrationsResponse(
        steam_id=user.steam_id,
        plex_id=user.plex_id,
        tmdb_account_id=user.tmdb_account_id,
        tmdb_username=user.tmdb_username,
        tmdb_avatar_url=_gravatar_url(user.tmdb_avatar_hash),
        tmdb_rating_sync_direction=user.tmdb_rating_sync_direction,
        spotify_id=user.spotify_id,
        spotify_username=user.spotify_username,
        spotify_email=user.spotify_email,
        spotify_avatar_url=user.spotify_avatar_url,
        google_id=user.google_id,
        google_email=user.google_email,
        google_name=user.google_name,
        google_avatar_url=user.google_avatar_url,
        plex_watch_history_enabled=user.plex_watch_history_enabled,
    )


@router.get("/me/integrations", response_model=MeIntegrationsResponse)
async def my_integrations(
    current_user: User = Depends(get_current_user),
) -> MeIntegrationsResponse:
    """Return the authenticated user's connected integration details."""
    logger.info("user integrations fetched", user_id=current_user.id)
    return _integrations_response(current_user)
