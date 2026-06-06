# TODO: Review this file
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.domain.user_streak import UserStreak
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
        app.send_task("streak.update", args=[user_id])
        app.send_task("gamification.check_badges", args=[user_id])

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

    async def get_today_status(self, user_id: str) -> dict:
        """Check if the user has already logged a workout today."""
        from datetime import date, timedelta

        today = date.today()
        today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
        tomorrow = today_start + timedelta(days=1)

        workout = await self.session.scalar(
            select(Workout)
            .options(
                joinedload(Workout.workout_exercises).joinedload(WorkoutExercise.exercise)
            )
            .where(
                Workout.user_id == user_id,
                Workout.started_at >= today_start,
                Workout.started_at < tomorrow,
            )
            .order_by(Workout.started_at.desc())
            .limit(1)
        )

        streak_result = await self.session.execute(
            select(UserStreak).where(UserStreak.user_id == user_id)
        )
        streak = streak_result.scalar_one_or_none()

        return {
            "checked_in": workout is not None,
            "workout": workout,
            "current_streak": streak.current_workout_streak if streak else 0,
            "longest_streak": streak.longest_workout_streak if streak else 0,
        }

    async def check_in_today(self, user_id: str) -> Workout:
        """Log a simple 'I worked out today' entry. Idempotent within a day."""
        from datetime import date, timedelta

        today = date.today()
        today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
        tomorrow = today_start + timedelta(days=1)

        existing = await self.session.scalar(
            select(Workout).where(
                Workout.user_id == user_id,
                Workout.started_at >= today_start,
                Workout.started_at < tomorrow,
            )
        )

        if existing:
            return await self.get_workout(existing.id)

        workout = Workout(
            user_id=user_id,
            started_at=datetime.now(timezone.utc),
        )
        self.session.add(workout)
        await self.session.flush()

        app.send_task("xp.award", args=[user_id, WORKOUT_COMPLETE])
        app.send_task("streak.update_workout", args=[user_id])
        app.send_task("gamification.check_badges", args=[user_id])

        return await self.get_workout(workout.id)

    async def undo_check_in(self, user_id: str) -> bool:
        """Remove today's workout check-in."""
        from datetime import date, timedelta

        today = date.today()
        today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
        tomorrow = today_start + timedelta(days=1)

        result = await self.session.execute(
            delete(Workout).where(
                Workout.user_id == user_id,
                Workout.started_at >= today_start,
                Workout.started_at < tomorrow,
            )
        )
        if result.rowcount > 0:
            from otix.services.gamification_service import GamificationService

            gam = GamificationService(self.session)
            await gam.recalculate_workout_streak(user_id)
            return True
        return False

    async def get_heatmap(self, user_id: str, weeks: int = 12) -> dict:
        """Return workout counts per day for the past N weeks."""
        from datetime import date, timedelta

        today = date.today()
        start_date = today - timedelta(days=weeks * 7 - 1)

        start_dt = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=timezone.utc)

        workout_date = func.date(Workout.started_at)
        result = await self.session.execute(
            select(workout_date.label("date"), func.count(Workout.id).label("count"))
            .where(
                Workout.user_id == user_id,
                Workout.started_at >= start_dt,
            )
            .group_by(workout_date)
            .order_by(workout_date)
        )

        date_map: dict[str, dict] = {}
        for row in result:
            d = row.date.isoformat()
            date_map[d] = {"count": row.count, "volume_kg": None}

        # Build the full date range (every day in the window)
        dates: list[dict] = []
        cursor_date = start_date
        while cursor_date <= today:
            key = cursor_date.isoformat()
            if key in date_map:
                dates.append({"date": key, "count": date_map[key]["count"], "volume_kg": date_map[key]["volume_kg"]})
            else:
                dates.append({"date": key, "count": 0, "volume_kg": None})
            cursor_date += timedelta(days=1)

        return {"weeks": weeks, "dates": dates}

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
