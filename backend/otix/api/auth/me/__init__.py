from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.auth.me.integrations import router as integrations_router
from otix.api.auth.me.preferences import router as preferences_router
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.auth import MeResponse, UserUpdateRequest

logger = structlog.get_logger()

router = APIRouter()

# ── Security: only these fields may be set via PATCH /me ──────────
# If a new field is added to UserUpdateRequest, it MUST be explicitly
# listed here to take effect on the ORM model. This prevents
# accidental privilege escalation.
_UPDATABLE_FIELDS: frozenset[str] = frozenset({
    "email",
    "username",
    "bio",
    "avatar_url",
    "background_url",
    "integration_visibility",
    "profile_sections",
    "profile_card_sections",
    "daily_mood_checkins_enabled",
    "hall_of_fame_media_ids",
    "onboarding_completed",
    "preferred_media_types",
    "preferred_genres",
    "preferred_languages",
    "discover_emphases",
    "show_adult_content",
    "country",
    "is_private",
    "is_bot",
    "notification_preferences",
})

_SENTINEL = object()  # sentinel to distinguish "not set" from "set to None"


def _me_response(user: User) -> MeResponse:
    return MeResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        is_admin=user.is_admin,
        is_verified=user.is_verified,
        two_factor_enabled=user.two_factor_enabled,
        avatar_url=user.avatar_url,
        bio=user.bio,
        background_url=user.background_url,
        total_xp=user.total_xp,
        onboarding_completed=user.onboarding_completed,
        date_of_birth=user.date_of_birth,
        show_adult_content=user.show_adult_content,
        country=user.country,
        is_bot=user.is_bot,
    )


@router.get("/me", response_model=MeResponse)
async def me(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> MeResponse:
    """Return the authenticated user's core profile."""
    logger.info("user profile fetched", user_id=current_user.id, ip=client_ip(request))
    return _me_response(current_user)


@router.patch("/me", response_model=MeResponse)
async def update_me(
    body: UserUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> MeResponse:
    """Update the authenticated user's profile.

    Only fields listed in ``_UPDATABLE_FIELDS`` are accepted.
    Unrecognised or non-updatable fields are silently ignored.
    """
    ip = client_ip(request)
    await limiter.check_update_me(ip)

    updates = body.model_dump(exclude_unset=True)

    changed: dict[str, object] = {}
    for field, value in updates.items():
        if field not in _UPDATABLE_FIELDS:
            continue
        old = getattr(current_user, field, _SENTINEL)
        if value != old or old is _SENTINEL:
            setattr(current_user, field, value)
            changed[field] = value

    if not changed:
        return _me_response(current_user)

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to update user profile",
            user_id=current_user.id,
            fields=list(changed),
            ip=ip,
        )
        raise

    logger.info(
        "user profile updated",
        user_id=current_user.id,
        fields=list(changed),
        ip=ip,
    )
    return _me_response(current_user)


# ── Sub-routers ──────────────────────────────────────────────────

router.include_router(preferences_router)
router.include_router(integrations_router)
