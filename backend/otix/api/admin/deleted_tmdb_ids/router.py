from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_admin_user, get_db
from otix.domain.user import User
from otix.schemas.admin import TMDBDeletedIDListResponse
from otix.services.admin_service import AdminService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/deleted-tmdb-ids", response_model=TMDBDeletedIDListResponse)
async def get_deleted_tmdb_ids(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    media_type: str | None = Query(None, description="Filter by media type"),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> TMDBDeletedIDListResponse:
    """List deleted TMDB IDs for audit purposes. Admin only."""
    ip = request.client.host if request.client else None
    result = await AdminService(db).get_deleted_tmdb_ids(page=page, page_size=page_size, media_type=media_type)
    logger.info("deleted tmdb ids fetched", page=page, total=result.total, ip=ip)
    return result
