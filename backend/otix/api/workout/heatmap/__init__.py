from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.domain.user import User
from otix.schemas.workout import WorkoutHeatmapResponse
from otix.services.workout_service import WorkoutService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/heatmap", response_model=WorkoutHeatmapResponse)
async def get_heatmap(
    request: Request,
    weeks: int = Query(12, ge=4, le=52),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkoutHeatmapResponse:
    """Get workout heatmap data for the authenticated user."""
    ip = request.client.host if request.client else None
    service = WorkoutService(db)

    data = await service.get_heatmap(current_user.id, weeks=weeks)

    logger.info("heatmap fetched", user_id=current_user.id, weeks=weeks, ip=ip)
    return WorkoutHeatmapResponse(**data)
