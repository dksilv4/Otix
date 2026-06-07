from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.api.workout.detail import router as detail_router
from otix.api.workout.exercises import router as exercise_router
from otix.api.workout.heatmap import router as heatmap_router
from otix.api.workout.today import router as today_router
from otix.domain.user import User
from otix.schemas.common import PaginatedResponse
from otix.schemas.workout import WorkoutCreate, WorkoutListOut, WorkoutOut
from otix.services.workout_service import WorkoutService

logger = structlog.get_logger()

workout_router = APIRouter(prefix="/workout", tags=["workout"])


@workout_router.post("", response_model=WorkoutOut, status_code=status.HTTP_201_CREATED)
async def create_workout(
    body: WorkoutCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> WorkoutOut:
    """Create a new workout.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_workout_write(ip)

    service = WorkoutService(db)
    exercises_data = [
        {
            "exercise_id": ex.exercise_id,
            "exercise_name": ex.exercise_name,
            "sets": [s.model_dump() for s in ex.sets],
        }
        for ex in body.exercises
    ]

    try:
        workout = await service.create_workout(
            user_id=current_user.id,
            raw_input=body.raw_input,
            exercises=exercises_data,
            notes=body.notes,
            started_at=body.started_at,
        )
    except Exception:
        await db.rollback()
        logger.exception("failed to create workout", user_id=current_user.id, ip=ip)
        raise

    logger.info("workout created", workout_id=workout.id, user_id=current_user.id, ip=ip)
    return WorkoutOut.model_validate(workout)


@workout_router.get("", response_model=PaginatedResponse)
async def list_workouts(
    request: Request,
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedResponse:
    """List the authenticated user's workouts with cursor pagination."""
    ip = client_ip(request)
    service = WorkoutService(db)

    try:
        items, has_more = await service.get_workouts(
            user_id=current_user.id,
            cursor=cursor,
            limit=limit,
        )
    except Exception:
        await db.rollback()
        logger.exception("failed to list workouts", user_id=current_user.id, ip=ip)
        raise

    next_cursor = items[-1].started_at.isoformat() if items and has_more else None

    workout_list = []
    for w in items:
        total_sets = sum(len(we.sets) for we in w.workout_exercises)
        workout_list.append(
            WorkoutListOut(
                id=w.id,
                user_id=w.user_id,
                raw_input=w.raw_input,
                notes=w.notes,
                started_at=w.started_at,
                completed_at=w.completed_at,
                created_at=w.created_at,
                updated_at=w.updated_at,
                exercise_count=len(w.workout_exercises),
                total_sets=total_sets,
                exercises=[
                    {"exercise_name": we.exercise.name, "sets": we.sets}
                    for we in w.workout_exercises
                ],
            )
        )

    logger.info("workouts listed", count=len(items), user_id=current_user.id, ip=ip)
    return PaginatedResponse(
        items=workout_list,
        next_cursor=next_cursor,
        has_more=has_more,
    )


workout_router.include_router(detail_router)
workout_router.include_router(today_router)
workout_router.include_router(heatmap_router)

__all__ = ["workout_router", "exercise_router"]
