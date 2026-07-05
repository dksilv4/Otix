"""Auth-related OAuth endpoints ONLY (link, unlink, callbacks).

Data-retrieval, sync, and webhook endpoints have been moved to
otix.api.integrations.
"""

from __future__ import annotations

import asyncio

import structlog
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.auth.me._utils import _gravatar_url
from otix.api.auth.oauth.google import router as google_router
from otix.api.auth.oauth.google.callback import router as google_callback_router
from otix.api.auth.oauth.google.disconnect import router as google_disconnect_router
from otix.api.auth.oauth.plex import router as plex_router
from otix.api.auth.oauth.plex.callback import router as plex_callback_router
from otix.api.auth.oauth.plex.disconnect import router as plex_disconnect_router
from otix.api.auth.oauth.spotify import _spotify_stats
from otix.api.auth.oauth.spotify import router as spotify_router
from otix.api.auth.oauth.spotify.callback import router as spotify_callback_router
from otix.api.auth.oauth.spotify.disconnect import router as spotify_disconnect_router
from otix.api.auth.oauth.steam import router as steam_router
from otix.api.auth.oauth.steam.callback import router as steam_callback_router
from otix.api.auth.oauth.steam.disconnect import router as steam_disconnect_router
from otix.api.auth.oauth.tmdb import _tmdb_stats
from otix.api.auth.oauth.tmdb import router as tmdb_router
from otix.api.auth.oauth.tmdb.callback import router as tmdb_callback_router
from otix.api.auth.oauth.tmdb.disconnect import router as tmdb_disconnect_router
from otix.api.auth.oauth.tmdb.redirect import router as tmdb_redirect_router
from otix.api.deps import get_current_user, get_db
from otix.domain.user import User
from otix.schemas.auth import IntegrationProviderResponse, IntegrationsResponse, SteamProfileResponse
from otix.services.steam_auth_service import get_steam_user_info
from otix.services.tmdb_auth_service import get_tmdb_account

logger = structlog.get_logger()
integrations_router = APIRouter()


@integrations_router.get("/oauth", response_model=IntegrationsResponse)
async def list_integrations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IntegrationsResponse:
    async def fetch_steam():
        if current_user.steam_id is None:
            return None
        profile = await get_steam_user_info(current_user.steam_id)
        if not profile:
            return None
        return SteamProfileResponse(
            personaname=profile.get("personaname"),
            avatarfull=profile.get("avatarfull"),
            profileurl=profile.get("profileurl"),
            realname=profile.get("realname"),
            loccountrycode=profile.get("loccountrycode"),
            timecreated=profile.get("timecreated"),
            personastate=profile.get("personastate"),
            lastlogoff=profile.get("lastlogoff"),
        )

    async def backfill_tmdb_avatar():
        if current_user.tmdb_session_id is None or current_user.tmdb_avatar_hash is not None:
            return
        try:
            account = await get_tmdb_account(current_user.tmdb_session_id)
            if account:
                avatar_data = account.get("avatar")
                if isinstance(avatar_data, dict):
                    gravatar = avatar_data.get("gravatar")
                    if isinstance(gravatar, dict):
                        current_user.tmdb_avatar_hash = gravatar.get("hash")
        except Exception:
            logger.exception("failed to backfill tmdb avatar", user_id=current_user.id)

    steam_profile, _, tmdb_stats, spotify_stats = await asyncio.gather(
        fetch_steam(),
        backfill_tmdb_avatar(),
        _tmdb_stats(current_user),
        _spotify_stats(current_user, db),
    )

    providers = [
        IntegrationProviderResponse(
            name="steam",
            connected=current_user.steam_id is not None,
            steam_id=current_user.steam_id,
            steam_profile=steam_profile,
        ),
        IntegrationProviderResponse(
            name="plex",
            connected=current_user.plex_id is not None,
            plex_id=current_user.plex_id,
            plex_username=current_user.plex_username,
            plex_email=current_user.plex_email,
            plex_thumb=current_user.plex_thumb,
        ),
        IntegrationProviderResponse(
            name="tmdb",
            connected=current_user.tmdb_session_id is not None,
            tmdb_username=current_user.tmdb_username,
            tmdb_avatar_url=_gravatar_url(current_user.tmdb_avatar_hash),
            tmdb_stats=tmdb_stats,
            tmdb_rating_sync_direction=current_user.tmdb_rating_sync_direction,
        ),
        IntegrationProviderResponse(
            name="spotify",
            connected=current_user.spotify_id is not None,
            spotify_username=current_user.spotify_username,
            spotify_avatar_url=current_user.spotify_avatar_url,
            spotify_stats=spotify_stats,
        ),
        IntegrationProviderResponse(
            name="google",
            connected=current_user.google_id is not None,
            google_email=current_user.google_email,
            google_name=current_user.google_name,
            google_avatar_url=current_user.google_avatar_url,
        ),
    ]
    return IntegrationsResponse(providers=providers)


integrations_router.include_router(spotify_router)
integrations_router.include_router(spotify_callback_router)
integrations_router.include_router(spotify_disconnect_router)

integrations_router.include_router(steam_router)
integrations_router.include_router(steam_callback_router)
integrations_router.include_router(steam_disconnect_router)

integrations_router.include_router(plex_router)
integrations_router.include_router(plex_callback_router)
integrations_router.include_router(plex_disconnect_router)

integrations_router.include_router(tmdb_router)
integrations_router.include_router(tmdb_redirect_router)
integrations_router.include_router(tmdb_callback_router)
integrations_router.include_router(tmdb_disconnect_router)

integrations_router.include_router(google_router)
integrations_router.include_router(google_callback_router)
integrations_router.include_router(google_disconnect_router)
