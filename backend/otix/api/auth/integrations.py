from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from otix.api.auth.helpers import _gravatar_url
from otix.api.auth.spotify import _spotify_stats
from otix.api.auth.tmdb import _tmdb_stats
from otix.api.deps import get_current_user
from otix.api.schemas.auth import (
    IntegrationProviderResponse,
    IntegrationsResponse,
    SteamProfileResponse,
)
from otix.domain.user import User
from otix.services.steam_auth_service import get_steam_user_info
from otix.services.tmdb_auth_service import get_tmdb_account

auth_router = APIRouter()


@auth_router.get("/integrations", response_model=IntegrationsResponse)
async def list_integrations(
    current_user: User = Depends(get_current_user),
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
            pass

    # Run all external provider calls in parallel
    steam_profile, _, tmdb_stats, spotify_stats = await asyncio.gather(
        fetch_steam(),
        backfill_tmdb_avatar(),
        _tmdb_stats(current_user),
        _spotify_stats(current_user),
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
