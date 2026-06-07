from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.domain.user import User
from otix.lib.badges import BADGES
from otix.lib.levels import compute_level_info
from otix.schemas.user import UserSearchListResponse, UserSearchResult
from otix.schemas.user_badge import BadgeDefOut

logger = structlog.get_logger()

router = APIRouter()


@router.get("/search", response_model=UserSearchListResponse)
async def search_users(
    request: Request,
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> UserSearchListResponse:
    """Search users by username."""
    ip = request.client.host if request.client else None

    try:
        stmt = (
            select(User)
            .where(User.username.ilike(f"%{q}%"), User.is_active == True)  # noqa: E712
            .order_by(User.username)
            .limit(limit)
        )
        result = await db.scalars(stmt)
        users = list(result)
    except Exception:
        await db.rollback()
        logger.exception("failed to search users", ip=ip)
        raise

    items: list[UserSearchResult] = []
    for user in users:
        gamification = compute_level_info(user.total_xp)
        items.append(
            UserSearchResult(
                id=user.id,
                username=user.username,
                avatar_url=user.avatar_url,
                bio=user.bio,
                level=gamification["level"],
                level_title=gamification["level_title"],
                is_admin=user.is_admin,
            )
        )

    logger.info("users searched", query=q, count=len(items), ip=ip)
    return UserSearchListResponse(items=items, has_more=False)


@router.get("/achievements", response_model=list[BadgeDefOut])
async def get_achievement_defs(request: Request) -> list[BadgeDefOut]:
    """List all available achievement definitions."""
    logger.info("achievement defs listed", ip=request.client.host if request.client else None)
    return [
        BadgeDefOut(
            badge_key=b.key,
            label=b.label,
            description=b.description,
            icon=b.icon,
            tier=b.tier,
            target=float(b.target),
            xp_reward=b.xp_reward,
        )
        for b in BADGES.values()
    ]
