from __future__ import annotations

import structlog
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.api._utils import get_current_user, get_db
from otix.domain.user import User
from otix.domain.youtube_liked_video import UserYoutubeLikedVideo
from otix.schemas.media import YoutubeLikedVideoOut, YoutubeLibraryResponse

logger = structlog.get_logger()

router = APIRouter()


@router.get("/youtube", response_model=YoutubeLibraryResponse)
async def get_youtube_library(
    request: Request,
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> YoutubeLibraryResponse:
    """Get raw YouTube liked music videos for the current user (matched + unmatched)."""
    ip = request.client.host if request.client else None

    query = (
        select(UserYoutubeLikedVideo)
        .where(UserYoutubeLikedVideo.user_id == current_user.id)
        .order_by(UserYoutubeLikedVideo.id.desc())
    )

    # Cursor pagination by id (descending)
    if cursor:
        try:
            cursor_id = int(cursor)
            query = query.where(UserYoutubeLikedVideo.id < cursor_id)
        except ValueError:
            pass

    query = query.limit(limit + 1)
    result = await db.execute(query)
    rows = result.scalars().all()

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    next_cursor = str(rows[-1].id) if has_more and rows else None

    items = [YoutubeLikedVideoOut.model_validate(row) for row in rows]

    logger.info("youtube library fetched", user_id=current_user.id, count=len(items), ip=ip)
    return YoutubeLibraryResponse(
        items=items,
        next_cursor=next_cursor,
        has_more=has_more,
    )
