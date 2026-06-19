"""GET /epic — Epic Games library tab."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.domain.user import User
from otix.schemas.epic import UserEpicGameListResponse, UserEpicGameSummary
from otix.services.epic_library_service import get_epic_library

logger = structlog.get_logger()
router = APIRouter()


@router.get("/epic", response_model=UserEpicGameListResponse)
async def get_epic_library_tab(
    request: Request,
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(48, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserEpicGameListResponse:
    """Get the authenticated user's Epic Games library with pagination."""
    ip = request.client.host if request.client else None

    if not current_user.epic_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Epic library is only available when Epic is connected",
        )

    try:
        rows, has_more, next_cursor = await get_epic_library(
            db, current_user.id, cursor=cursor, limit=limit,
        )
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch epic library", user_id=current_user.id, ip=ip)
        raise

    summaries = [UserEpicGameSummary.model_validate(g) for g in rows]
    logger.info("epic library fetched", user_id=current_user.id, count=len(summaries), ip=ip)
    return UserEpicGameListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )
