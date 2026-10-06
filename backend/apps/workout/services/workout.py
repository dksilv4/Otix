"""Workout domain logic as plain callables over the models.

Port of the legacy ``WorkoutService`` (``old-backend/otix/services/workout_service.py``).
The legacy routers dispatched write side-effects (XP award, streak update, badge
checks) to Celery tasks owned by the social/gamification area; those are not
re-emitted here. Today-status reads the social ``UserStreak`` ledger row when one
exists and defaults the streak counters to 0 otherwise (that ledger is
maintained by the social area).
"""

from __future__ import annotations

from datetime import datetime, time, timedelta

from django.db import transaction
from django.db.models import Count, F, QuerySet
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.social.models import UserStreak
from apps.workout.models import Exercise, Workout, WorkoutExercise


def _today_window() -> tuple[datetime, datetime]:
    """UTC half-open [start of today, start of tomorrow) window (legacy today)."""
    today = timezone.localdate()
    start = timezone.make_aware(datetime.combine(today, time.min))
    return start, start + timedelta(days=1)


def _prefetch_exercises(queryset: QuerySet[Workout]) -> QuerySet[Workout]:
    """Attach each workout's links and their exercise rows for serializer reads."""
    return queryset.prefetch_related("workout_exercises__exercise")


def get_workout(workout_id: int | str) -> Workout | None:
    """Fetch a workout with its exercise links; ``None`` when unknown.

    ``workout_id`` arrives as a string route segment (FastAPI parity). Workout
    ids are integers here, so a segment that does not parse is simply not found.
    """
    try:
        pk = int(workout_id)
    except (TypeError, ValueError):
        return None
    return _prefetch_exercises(Workout.objects.filter(pk=pk)).first()


def get_workouts(user_id: int) -> QuerySet[Workout]:
    """The user's workouts, newest first, with links/exercises prefetched."""
    return _prefetch_exercises(Workout.objects.filter(user_id=user_id)).order_by(
        "-started_at", "-id"
    )


def create_workout(
    user_id: int,
    raw_input: str,
    exercises: list[dict],
    notes: str | None = None,
    started_at: datetime | None = None,
) -> Workout:
    """Create a workout and its exercise links (legacy name resolution).

    Each entry is stored at its list index as ``sort_order``. An entry that only
    names an exercise is resolved case-insensitively against the catalog and
    auto-created when absent; an entry carrying neither an id nor a name is
    skipped (legacy behaviour).
    """
    with transaction.atomic():
        workout = Workout.objects.create(
            user_id=user_id,
            raw_input=raw_input,
            notes=notes,
            started_at=started_at or timezone.now(),
        )
        for index, entry in enumerate(exercises):
            exercise_id = entry.get("exercise_id")
            if not exercise_id:
                name = (entry.get("exercise_name") or "").strip()
                if not name:
                    continue
                exercise = Exercise.objects.filter(name__iexact=name).first()
                if exercise is None:
                    exercise = Exercise.objects.create(name=name, category=None, aliases=[])
                exercise_id = exercise.pk
            WorkoutExercise.objects.create(
                workout=workout,
                exercise_id=exercise_id,
                sort_order=index,
                sets=entry.get("sets") or [],
            )

    from apps.social.services.streak import update_login_streak, update_workout_streak
    from apps.social.services.xp import WORKOUT_COMPLETE, award_xp

    award_xp(user_id, WORKOUT_COMPLETE, reason="workout_completed")
    update_workout_streak(user_id)
    update_login_streak(user_id)

    return get_workout(workout.pk)


def update_workout(
    workout: Workout,
    notes: str | None = None,
    completed_at: datetime | None = None,
) -> Workout:
    """Apply the legacy partial update; an explicit null leaves a field alone."""
    changed: list[str] = []
    if notes is not None:
        workout.notes = notes
        changed.append("notes")
    if completed_at is not None:
        workout.completed_at = completed_at
        changed.append("completed_at")
    if changed:
        workout.save(update_fields=[*changed, "updated_at"])
    return workout


def delete_workout(workout: Workout) -> None:
    """Delete a workout; link rows cascade."""
    workout.delete()


def get_exercises() -> QuerySet[Exercise]:
    """The full exercise catalog, ordered like the legacy list endpoint."""
    return Exercise.objects.order_by(F("category").asc(nulls_last=True), "name")


def get_categories() -> list[dict]:
    """Exercises grouped by non-null category with per-category counts."""
    rows = (
        Exercise.objects.filter(category__isnull=False)
        .values("category")
        .annotate(count=Count("id"))
        .order_by("category")
    )
    return [{"category": row["category"], "count": row["count"]} for row in rows]


def get_today_status(user_id: int) -> dict:
    """Today's latest workout and the user's streak counters."""
    start, end = _today_window()
    workout = (
        Workout.objects.filter(user_id=user_id, started_at__gte=start, started_at__lt=end)
        .order_by("-started_at")
        .first()
    )
    if workout is not None:
        workout = get_workout(workout.pk)
    streak = UserStreak.objects.filter(user_id=user_id).first()
    return {
        "checked_in": workout is not None,
        "workout": workout,
        "current_streak": streak.current_workout_streak if streak else 0,
        "longest_streak": streak.longest_workout_streak if streak else 0,
    }


def check_in_today(user_id: int) -> Workout:
    """Log a bare "worked out today" entry; idempotent within a day."""
    start, end = _today_window()
    existing = (
        Workout.objects.filter(user_id=user_id, started_at__gte=start, started_at__lt=end)
        .order_by("-started_at")
        .first()
    )
    if existing is not None:
        return get_workout(existing.pk)
    workout = Workout.objects.create(user_id=user_id, started_at=timezone.now())
    return get_workout(workout.pk)


def undo_check_in(user_id: int) -> None:
    """Remove today's check-in(s) for the user."""
    start, end = _today_window()
    Workout.objects.filter(user_id=user_id, started_at__gte=start, started_at__lt=end).delete()


def get_heatmap(user_id: int, weeks: int = 12) -> dict:
    """Per-day workout counts for the trailing ``weeks * 7`` days (inclusive)."""
    today = timezone.localdate()
    start_date = today - timedelta(days=weeks * 7 - 1)
    start_dt = timezone.make_aware(datetime.combine(start_date, time.min))
    rows = (
        Workout.objects.filter(user_id=user_id, started_at__gte=start_dt)
        .annotate(day=TruncDate("started_at"))
        .values("day")
        .annotate(count=Count("id"))
        .order_by("day")
    )
    counts = {row["day"].isoformat(): row["count"] for row in rows}
    dates: list[dict] = []
    cursor = start_date
    while cursor <= today:
        key = cursor.isoformat()
        dates.append({"date": key, "count": counts.get(key, 0), "volume_kg": None})
        cursor += timedelta(days=1)
    return {"weeks": weeks, "dates": dates}
