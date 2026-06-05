from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.common import PaginatedResponse
from otix.api.schemas.workout import (
    CategoryOut,
    ExerciseOut,
    WorkoutCreate,
    WorkoutHeatmapResponse,
    WorkoutListOut,
    WorkoutOut,
    WorkoutTodayResponse,
    WorkoutUpdate,
)
from otix.domain.user import User
from otix.services.workout_service import WorkoutService

workout_router = APIRouter(prefix="/workout", tags=["workout"])
exercise_router = APIRouter(prefix="/exercises", tags=["exercises"])


# ── Workout endpoints ──

@workout_router.post("", response_model=WorkoutOut, status_code=status.HTTP_201_CREATED)
async def create_workout(
    body: WorkoutCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkoutOut:
    service = WorkoutService(db)
    exercises_data = [
        {
            "exercise_id": ex.exercise_id,
            "exercise_name": ex.exercise_name,
            "sets": [s.model_dump() for s in ex.sets],
        }
        for ex in body.exercises
    ]
    workout = await service.create_workout(
        user_id=current_user.id,
        raw_input=body.raw_input,
        exercises=exercises_data,
        notes=body.notes,
        started_at=body.started_at,
    )
    return WorkoutOut.model_validate(workout)


@workout_router.get("", response_model=PaginatedResponse)
async def list_workouts(
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    service = WorkoutService(db)
    items, has_more = await service.get_workouts(
        user_id=current_user.id,
        cursor=cursor,
        limit=limit,
    )
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

    return {
        "items": workout_list,
        "next_cursor": next_cursor,
        "has_more": has_more,
    }


# ── Today check-in endpoints (before /{workout_id} to avoid path shadowing) ──


@workout_router.get("/today", response_model=WorkoutTodayResponse)
async def get_today_workout(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    service = WorkoutService(db)
    status = await service.get_today_status(current_user.id)

    workout_out = None
    if status["workout"]:
        w = status["workout"]
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

    return {
        "checked_in": status["checked_in"],
        "workout": workout_out,
        "current_streak": status["current_streak"],
        "longest_streak": status["longest_streak"],
    }


@workout_router.post("/today", response_model=WorkoutTodayResponse, status_code=status.HTTP_201_CREATED)
async def check_in_today(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    service = WorkoutService(db)
    workout = await service.check_in_today(current_user.id)

    status_result = await service.get_today_status(current_user.id)

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

    return {
        "checked_in": True,
        "workout": workout_out,
        "current_streak": status_result["current_streak"],
        "longest_streak": status_result["longest_streak"],
    }


@workout_router.delete("/today", status_code=status.HTTP_204_NO_CONTENT)
async def undo_check_in(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = WorkoutService(db)
    await service.undo_check_in(current_user.id)


# ── Heatmap endpoint (before /{workout_id} to avoid path shadowing) ──


@workout_router.get("/heatmap", response_model=WorkoutHeatmapResponse)
async def get_heatmap(
    weeks: int = Query(12, ge=4, le=52),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    service = WorkoutService(db)
    return await service.get_heatmap(current_user.id, weeks=weeks)


# ── Parameterized workout_id routes (after all explicit paths) ──


@workout_router.get("/{workout_id}", response_model=WorkoutOut)
async def get_workout(
    workout_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkoutOut:
    service = WorkoutService(db)
    workout = await service.get_workout(workout_id)
    if not workout:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")
    if workout.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your workout")
    return WorkoutOut.model_validate(workout)


@workout_router.patch("/{workout_id}", response_model=WorkoutOut)
async def update_workout(
    workout_id: str,
    body: WorkoutUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkoutOut:
    service = WorkoutService(db)
    workout = await service.get_workout(workout_id)
    if not workout:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")
    if workout.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your workout")

    updated = await service.update_workout(
        workout_id=workout_id,
        notes=body.notes,
        completed_at=body.completed_at,
    )
    return WorkoutOut.model_validate(updated)


@workout_router.delete("/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workout(
    workout_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = WorkoutService(db)
    workout = await service.get_workout(workout_id)
    if not workout:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")
    if workout.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your workout")
    await service.delete_workout(workout_id)


# ── Exercise endpoints (public) ──

@exercise_router.get("", response_model=list[ExerciseOut])
async def list_exercises(
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseOut]:
    service = WorkoutService(db)
    exercises = await service.get_exercises()
    return [ExerciseOut.model_validate(e) for e in exercises]


@exercise_router.get("/categories", response_model=list[CategoryOut])
async def list_categories(
    db: AsyncSession = Depends(get_db),
) -> list[CategoryOut]:
    service = WorkoutService(db)
    categories = await service.get_categories()
    return [CategoryOut(**c) for c in categories]
