from __future__ import annotations

import urllib.parse

from fastapi import status
from fastapi.responses import RedirectResponse

from otix.api.schemas.auth import UserResponse
from otix.domain.user import User
from otix.infrastructure.config import settings


def _gravatar_url(avatar_hash: str | None) -> str | None:
    if not avatar_hash:
        return None
    return f"https://www.gravatar.com/avatar/{avatar_hash}?s=200"


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        is_admin=user.is_admin,
        is_verified=user.is_verified,
        two_factor_enabled=user.two_factor_enabled,
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
        avatar_url=user.avatar_url,
        bio=user.bio,
        background_url=user.background_url,
        integration_visibility=user.integration_visibility if user.integration_visibility else None,
        total_xp=user.total_xp,
        profile_sections=user.profile_sections if user.profile_sections else None,
        profile_card_sections=user.profile_card_sections if user.profile_card_sections else None,
        daily_mood_checkins_enabled=user.daily_mood_checkins_enabled,
        hall_of_fame_media_ids=user.hof_ids,
        onboarding_completed=user.onboarding_completed,
        preferred_media_types=user.preferred_media_types if user.preferred_media_types else [],
        preferred_genres=user.preferred_genres if user.preferred_genres else [],
        preferred_languages=user.preferred_languages if user.preferred_languages else [],
        discover_emphases=user.discover_emphases if user.discover_emphases else [],
        date_of_birth=user.date_of_birth,
        show_adult_content=user.show_adult_content,
        country=user.country,
        notification_preferences=user.notification_preferences if user.notification_preferences else None,
    )


def _tmdb_frontend_redirect(status_value: str, message: str | None = None) -> RedirectResponse:
    query = {"tmdb_link": status_value}
    if message:
        query["message"] = message
    url = f"{settings.frontend_base_url.rstrip('/')}/?{urllib.parse.urlencode(query)}"
    return RedirectResponse(url, status_code=status.HTTP_303_SEE_OTHER)
