from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db
from otix.schemas.workout import CategoryOut, ExerciseOut
from otix.services.workout_service import WorkoutService

logger = structlog.get_logger()

router = APIRouter(prefix="/exercises", tags=["exercises"])


@router.get("", response_model=list[ExerciseOut])
async def list_exercises(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseOut]:
    """List all available exercises."""
    ip = request.client.host if request.client else None
    service = WorkoutService(db)

    exercises = await service.get_exercises()

    logger.info("exercises listed", count=len(exercises), ip=ip)
    return [ExerciseOut.model_validate(e) for e in exercises]


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> list[CategoryOut]:
    """List all exercise categories."""
    ip = request.client.host if request.client else None
    service = WorkoutService(db)

    categories = await service.get_categories()

    logger.info("categories listed", count=len(categories), ip=ip)
    return [CategoryOut(**c) for c in categories]
