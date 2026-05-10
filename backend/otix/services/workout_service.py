from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.domain.workout import Exercise, Workout, WorkoutExercise
from otix.infrastructure.celery import app
from otix.lib.xp import WORKOUT_COMPLETE


class WorkoutService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_workout(
        self,
        user_id: str,
        raw_input: str,
        exercises: list[dict],
        notes: str | None = None,
        started_at: datetime | None = None,
    ) -> Workout:
        import secrets
        from otix.domain.workout import Exercise

        workout = Workout(
            user_id=user_id,
            raw_input=raw_input,
            notes=notes,
            started_at=started_at or datetime.now(timezone.utc),
        )
        self.session.add(workout)
        await self.session.flush()

        for i, ex_data in enumerate(exercises):
            exercise_id = ex_data.get("exercise_id")

            # Resolve by name if no ID provided
            if not exercise_id:
                name = (ex_data.get("exercise_name") or "").strip()
                if name:
                    existing = await self.session.scalar(
                        select(Exercise).where(
                            func.lower(Exercise.name) == name.lower()
                        )
                    )
                    if existing:
                        exercise_id = existing.id
                    else:
                        ex = Exercise(
                            id=f"oti_{secrets.token_hex(6)}",
                            name=name,
                            category=None,
                            aliases=[],
                        )
                        self.session.add(ex)
                        await self.session.flush()
                        exercise_id = ex.id

            if not exercise_id:
                continue

            we = WorkoutExercise(
                workout_id=workout.id,
                exercise_id=exercise_id,
                sort_order=i,
                sets=ex_data["sets"],
            )
            self.session.add(we)

        await self.session.flush()

        app.send_task("xp.award", args=[user_id, WORKOUT_COMPLETE])

        # Reload with relationships
        return await self.get_workout(workout.id)

    async def get_workouts(
        self, user_id: str, cursor: str | None = None, limit: int = 20
    ) -> tuple[list[Workout], bool]:
        query = (
            select(Workout)
            .options(
                joinedload(Workout.workout_exercises).joinedload(WorkoutExercise.exercise)
            )
            .where(Workout.user_id == user_id)
        )

        if cursor:
            query = query.where(Workout.started_at < cursor)

        query = query.order_by(Workout.started_at.desc()).limit(limit + 1)

        result = await self.session.scalars(query)
        items = list(result.unique())

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        return items, has_more

    async def get_workout(self, workout_id: str) -> Workout | None:
        return await self.session.scalar(
            select(Workout)
            .options(
                joinedload(Workout.workout_exercises).joinedload(WorkoutExercise.exercise)
            )
            .where(Workout.id == workout_id)
        )

    async def update_workout(
        self, workout_id: str, notes: str | None = None, completed_at: datetime | None = None
    ) -> Workout | None:
        workout = await self.session.scalar(select(Workout).where(Workout.id == workout_id))
        if not workout:
            return None

        if notes is not None:
            workout.notes = notes
        if completed_at is not None:
            workout.completed_at = completed_at

        await self.session.flush()
        return await self.get_workout(workout_id)

    async def delete_workout(self, workout_id: str) -> bool:
        result = await self.session.execute(
            delete(Workout).where(Workout.id == workout_id)
        )
        return result.rowcount > 0

    async def get_exercises(self) -> list[Exercise]:
        result = await self.session.scalars(
            select(Exercise).order_by(Exercise.category, Exercise.name)
        )
        return list(result)

    async def get_categories(self) -> list[dict]:
        result = await self.session.execute(
            select(
                Exercise.category, func.count(Exercise.id).label("count")
            )
            .where(Exercise.category.isnot(None))
            .group_by(Exercise.category)
            .order_by(Exercise.category)
        )
        return [{"category": row.category, "count": row.count} for row in result]
