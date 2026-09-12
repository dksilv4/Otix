from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends

from otix.api.deps import get_current_user
from otix.domain.user import User
from otix.schemas.auth import MePreferencesResponse

logger = structlog.get_logger()
router = APIRouter()


def _preferences_response(user: User) -> MePreferencesResponse:
    return MePreferencesResponse(
        preferred_media_types=user.preferred_media_types if user.preferred_media_types else [],
        preferred_genres=user.preferred_genres if user.preferred_genres else [],
        preferred_languages=user.preferred_languages if user.preferred_languages else [],
        discover_emphases=user.discover_emphases if user.discover_emphases else [],
        daily_mood_checkins_enabled=user.daily_mood_checkins_enabled,
        hall_of_fame_media_ids=user.hof_ids,
        profile_sections=user.profile_sections if user.profile_sections else None,
        profile_card_sections=user.profile_card_sections if user.profile_card_sections else None,
        integration_visibility=user.integration_visibility if user.integration_visibility else None,
        notification_preferences=user.notification_preferences if user.notification_preferences else None,
    )


@router.get("/me/preferences", response_model=MePreferencesResponse)
async def my_preferences(
    current_user: User = Depends(get_current_user),
) -> MePreferencesResponse:
    """Return the authenticated user's preferences."""
    logger.info("user preferences fetched", user_id=current_user.id)
    return _preferences_response(current_user)
