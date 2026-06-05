from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.discover import OnboardingRequest
from otix.domain.user import User

onboarding_router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@onboarding_router.post("", response_model=dict)
async def submit_onboarding(
    body: OnboardingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    current_user.preferred_media_types = body.preferred_media_types
    current_user.preferred_genres = body.preferred_genres
    current_user.preferred_languages = body.preferred_languages
    current_user.onboarding_completed = True
    await db.commit()
    return {"status": "ok"}
