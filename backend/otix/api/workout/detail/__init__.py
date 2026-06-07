from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.workout import WorkoutOut, WorkoutUpdate
from otix.services.workout_service import WorkoutService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/{workout_id}", response_model=WorkoutOut)
async def get_workout(
    workout_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkoutOut:
    """Get a single workout by ID."""
    ip = client_ip(request)
    service = WorkoutService(db)

    try:
        workout = await service.get_workout(workout_id)
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch workout", workout_id=workout_id, ip=ip)
        raise

    if not workout:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found"
        )
    if workout.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not your workout"
        )

    logger.info("workout fetched", workout_id=workout_id, user_id=current_user.id, ip=ip)
    return WorkoutOut.model_validate(workout)


@router.patch("/{workout_id}", response_model=WorkoutOut)
async def update_workout(
    workout_id: str,
    body: WorkoutUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> WorkoutOut:
    """Update a workout's notes or completion status.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_workout_write(ip)

    service = WorkoutService(db)
    try:
        workout = await service.get_workout(workout_id)
        if not workout:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found"
            )
        if workout.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Not your workout"
            )

        updated = await service.update_workout(
            workout_id=workout_id,
            notes=body.notes,
            completed_at=body.completed_at,
        )
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to update workout",
            workout_id=workout_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    logger.info("workout updated", workout_id=workout_id, user_id=current_user.id, ip=ip)
    return WorkoutOut.model_validate(updated)


@router.delete("/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workout(
    workout_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    """Delete a workout.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_workout_write(ip)

    service = WorkoutService(db)
    try:
        workout = await service.get_workout(workout_id)
        if not workout:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found"
            )
        if workout.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Not your workout"
            )

        await service.delete_workout(workout_id)
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to delete workout",
            workout_id=workout_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    logger.info("workout deleted", workout_id=workout_id, user_id=current_user.id, ip=ip)
