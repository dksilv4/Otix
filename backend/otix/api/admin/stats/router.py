from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_admin_user, get_db
from otix.domain.user import User
from otix.schemas.admin import AdminStatsResponse
from otix.services.admin_service import AdminService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> AdminStatsResponse:
    """Get admin dashboard statistics. Admin only."""
    ip = request.client.host if request.client else None
    result = await AdminService(db).get_stats()
    logger.info("admin stats fetched", ip=ip)
    return result
