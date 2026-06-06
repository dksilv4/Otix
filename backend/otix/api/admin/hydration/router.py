from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_admin_user, get_db
from otix.schemas.admin import MediaHydrationResponse
from otix.domain.user import User
from otix.services.admin_service import AdminService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/hydration", response_model=MediaHydrationResponse)
async def get_media_hydration(
    request: Request,
    media_type: str | None = Query(None, description="Filter by media type: movie, show, game, music"),
    search: str | None = Query(None, description="Search by title substring"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    sort_by: str = Query("completeness_score", description="Sort column"),
    sort_dir: str = Query("asc", description="Sort direction: asc or desc"),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> MediaHydrationResponse:
    """Get media hydration status for the admin panel. Admin only."""
    ip = request.client.host if request.client else None
    result = await AdminService(db).get_hydration_status(
        media_type=media_type, search=search, page=page, per_page=per_page,
        sort_by=sort_by, sort_dir=sort_dir,
    )
    logger.info("hydration status fetched", media_type=media_type, page=page, total=result.total, ip=ip)
    return result
