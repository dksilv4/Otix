from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_admin_user, get_db
from otix.domain.user import User
from otix.schemas.admin import AdminMetricsResponse
from otix.services.admin_service import AdminService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/metrics", response_model=AdminMetricsResponse)
async def get_admin_metrics(
    request: Request,
    metric: str = Query(..., description="Metric name: 'stubs' or 'media_<type>'"),
    hours: float = Query(336, ge=0.0167, le=8760, description="Lookback window in hours"),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> AdminMetricsResponse:
    """Get admin metrics for the dashboard. Admin only."""
    ip = request.client.host if request.client else None
    data = await AdminService(db).get_metrics(metric=metric, hours=hours)
    logger.info("admin metrics fetched", metric=metric, hours=hours, ip=ip)
    return AdminMetricsResponse(metric=metric, hours=hours, data=data)
