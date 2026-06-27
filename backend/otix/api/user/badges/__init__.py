from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.user import User
from otix.schemas.user_badge import BadgeOut
from otix.services.gamification_service import GamificationService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/{username}/badges", response_model=list[BadgeOut])
async def get_user_badges(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[BadgeOut]:
    """Get a user's earned badges."""
    ip = request.client.host if request.client else None

    try:
        user = await db.scalar(select(User).where(User.username == username))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        service = GamificationService(db)
        badges = await service.get_user_badges(user.id)
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch user badges", username=username, ip=ip)
        raise

    logger.info("user badges fetched", username=username, count=len(badges), ip=ip)
    return [BadgeOut(**b) for b in badges]


@router.post("/me/badges/{badge_key}/claim")
async def claim_badge(
    badge_key: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Claim XP reward for an earned badge."""
    ip = request.client.host if request.client else None

    try:
        from otix.domain.user_badge import UserBadge
        from otix.infrastructure.celery import app
        from otix.lib.badges import BADGES

        badge_def = BADGES.get(badge_key)
        if not badge_def:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Badge definition not found")

        user_badge = await db.scalar(
            select(UserBadge).where(
                UserBadge.user_id == current_user.id, UserBadge.badge_key == badge_key,
            )
        )
        if not user_badge:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Badge not earned yet")
        if user_badge.claimed:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Badge reward already claimed")

        user_badge.claimed = True
        app.send_task("xp.award", args=[current_user.id, badge_def.xp_reward])
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception("failed to claim badge", badge_key=badge_key, user_id=current_user.id, ip=ip)
        raise

    logger.info("badge claimed", badge_key=badge_key, user_id=current_user.id, xp_awarded=badge_def.xp_reward, ip=ip)
    return {"status": "ok", "xp_awarded": badge_def.xp_reward}
