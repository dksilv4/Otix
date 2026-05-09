from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SetData(BaseModel):
    reps: int = Field(..., ge=0)
    weight_kg: float | None = Field(None, ge=0)


class WorkoutExerciseCreate(BaseModel):
    exercise_id: str | None = None
    exercise_name: str | None = None
    sets: list[SetData] = Field(..., min_length=1)


class WorkoutCreate(BaseModel):
    raw_input: str
    exercises: list[WorkoutExerciseCreate] = Field(..., min_length=1)
    notes: str | None = None
    started_at: datetime | None = None


class WorkoutUpdate(BaseModel):
    notes: str | None = None
    completed_at: datetime | None = None


class ExerciseOut(BaseModel):
    id: str
    name: str
    category: str | None = None
    aliases: list[str] = []

    model_config = {"from_attributes": True}


class WorkoutExerciseOut(BaseModel):
    exercise_id: str
    exercise: ExerciseOut
    sort_order: int
    sets: list[SetData]

    model_config = {"from_attributes": True}


class WorkoutOut(BaseModel):
    id: str
    user_id: str
    raw_input: str | None = None
    notes: str | None = None
    started_at: datetime
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    exercises: list[WorkoutExerciseOut] = Field(default=[], validation_alias="workout_exercises")

    model_config = {"from_attributes": True}


class WorkoutExerciseSummary(BaseModel):
    exercise_name: str
    sets: list[SetData]


class WorkoutListOut(BaseModel):
    id: str
    user_id: str
    raw_input: str | None = None
    notes: str | None = None
    started_at: datetime
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    exercise_count: int = 0
    total_sets: int = 0
    exercises: list[WorkoutExerciseSummary] = []

    model_config = {"from_attributes": True}


class CategoryOut(BaseModel):
    category: str
    count: int
