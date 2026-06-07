from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.workout import WorkoutListOut, WorkoutTodayResponse
from otix.services.workout_service import WorkoutService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/today", response_model=WorkoutTodayResponse)
async def get_today_workout(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkoutTodayResponse:
    """Get the authenticated user's workout status for today."""
    ip = client_ip(request)
    service = WorkoutService(db)

    try:
        status_result = await service.get_today_status(current_user.id)
    except Exception:
        await db.rollback()
        logger.exception("failed to get today status", user_id=current_user.id, ip=ip)
        raise

    workout_out = None
    if status_result["workout"]:
        w = status_result["workout"]
        total_sets = sum(len(we.sets) for we in w.workout_exercises)
        workout_out = WorkoutListOut(
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

    logger.info("today workout status fetched", user_id=current_user.id, ip=ip)
    return WorkoutTodayResponse(
        checked_in=status_result["checked_in"],
        workout=workout_out,
        current_streak=status_result["current_streak"],
        longest_streak=status_result["longest_streak"],
    )


@router.post("/today", response_model=WorkoutTodayResponse, status_code=status.HTTP_201_CREATED)
async def check_in_today(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> WorkoutTodayResponse:
    """Check in for today's workout.

    Creates or updates today's check-in. Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_workout_checkin(ip)

    service = WorkoutService(db)
    try:
        workout = await service.check_in_today(current_user.id)
        status_result = await service.get_today_status(current_user.id)
    except Exception:
        await db.rollback()
        logger.exception("failed to check in today", user_id=current_user.id, ip=ip)
        raise

    w = workout
    total_sets = sum(len(we.sets) for we in w.workout_exercises)
    workout_out = WorkoutListOut(
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

    logger.info("today check-in created", workout_id=workout.id, user_id=current_user.id, ip=ip)
    return WorkoutTodayResponse(
        checked_in=True,
        workout=workout_out,
        current_streak=status_result["current_streak"],
        longest_streak=status_result["longest_streak"],
    )


@router.delete("/today", status_code=status.HTTP_204_NO_CONTENT)
async def undo_check_in(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    """Undo today's check-in.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_workout_checkin(ip)

    service = WorkoutService(db)
    try:
        await service.undo_check_in(current_user.id)
    except Exception:
        await db.rollback()
        logger.exception("failed to undo check-in", user_id=current_user.id, ip=ip)
        raise

    logger.info("today check-in undone", user_id=current_user.id, ip=ip)
