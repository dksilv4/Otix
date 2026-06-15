from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, func, union
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.media._utils import _embed_query

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
        query_embedding = await _embed_query(q)

        fts_stmt = (
            select(User.id)
            .where(User.username.ilike(f"%{q}%"), User.is_active == True, User.embedding.isnot(None))
        )
        branches = [fts_stmt]
        if query_embedding is not None and isinstance(query_embedding, list) and len(query_embedding) == 1024:
            vector_stmt = (
                select(User.id)
                .where(User.is_active == True, User.embedding.isnot(None))
                .order_by(User.embedding.cosine_distance(query_embedding))
                .limit(limit)
            )
            branches.append(vector_stmt)

        matched_ids = union(*branches).subquery()

        stmt = (
            select(User)
            .where(
                User.id.in_(select(matched_ids)),
                User.is_active == True,
                User.embedding.isnot(None),
            )
        )

        sim = func.similarity(User.username, q)
        if query_embedding is not None and isinstance(query_embedding, list) and len(query_embedding) == 1024:
            vector_sim = func.coalesce(1 - User.embedding.cosine_distance(query_embedding), 0)
        else:
            vector_sim = 0

        order = (sim * 5 + vector_sim * 5).desc()
        stmt = stmt.order_by(order).limit(limit)

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
