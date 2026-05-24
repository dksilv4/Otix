"""Tests for WorkoutService — creating, retrieving, updating, and deleting workouts/exercises with mocked DB session."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from datetime import datetime, timezone

from otix.domain.workout import Exercise, Workout, WorkoutExercise
from otix.services.workout_service import WorkoutService


@pytest.fixture(autouse=True)
def mock_celery_app():
    with patch("otix.services.workout_service.app.send_task") as mock_send:
        yield mock_send


@pytest.fixture
def service(mock_db_session: AsyncMock) -> WorkoutService:
    return WorkoutService(mock_db_session)


def _make_workout(workout_id: str, user_id: str) -> Workout:
    w = Workout(
        user_id=user_id,
        raw_input="Bench press 3x10",
        notes="Felt good",
        started_at=datetime.now(timezone.utc),
    )
    w.id = workout_id
    w.workout_exercises = []
    return w


def _make_exercise(exercise_id: str, name: str, category: str = "chest") -> Exercise:
    e = Exercise(
        id=exercise_id,
        name=name,
        category=category,
        aliases=[],
    )
    return e


class TestWorkoutCreate:
    async def test_create_workout_with_exercise_id(self, service: WorkoutService, mock_db_session: AsyncMock):
        workout = _make_workout("work-1", "user-123")
        mock_db_session.scalar.side_effect = [
            workout,  # reload at end
        ]

        exercises = [{"exercise_id": "ex-1", "sets": [{"reps": 10, "weight": 60}]}]
        result = await service.create_workout("user-123", "raw input text", exercises)

        assert result == workout
        assert mock_db_session.add.call_count >= 2  # Workout and WorkoutExercise
        assert mock_db_session.flush.call_count >= 1

    async def test_create_workout_resolve_exercise_by_name_exists(self, service: WorkoutService, mock_db_session: AsyncMock):
        workout = _make_workout("work-1", "user-123")
        existing_exercise = _make_exercise("ex-1", "Bench Press")

        mock_db_session.scalar.side_effect = [
            existing_exercise,  # resolve by name
            workout,  # reload at end
        ]

        exercises = [{"exercise_name": "Bench Press", "sets": [{"reps": 10, "weight": 60}]}]
        result = await service.create_workout("user-123", "raw input text", exercises)

        assert result == workout
        assert mock_db_session.add.call_count >= 2

    async def test_create_workout_resolve_exercise_by_name_new(self, service: WorkoutService, mock_db_session: AsyncMock):
        workout = _make_workout("work-1", "user-123")

        mock_db_session.scalar.side_effect = [
            None,  # resolve by name not found
            workout,  # reload at end
        ]

        exercises = [{"exercise_name": "New Exercise", "sets": [{"reps": 10, "weight": 60}]}]
        result = await service.create_workout("user-123", "raw input text", exercises)

        assert result == workout
        assert mock_db_session.add.call_count >= 3  # Workout, new Exercise, WorkoutExercise

    async def test_create_workout_empty_exercise_ignored(self, service: WorkoutService, mock_db_session: AsyncMock):
        workout = _make_workout("work-1", "user-123")
        mock_db_session.scalar.side_effect = [
            workout,  # reload at end
        ]

        exercises = [{"exercise_name": "", "sets": []}]
        result = await service.create_workout("user-123", "raw input text", exercises)

        assert result == workout
        # Only workout added, empty exercise/sets ignored
        assert mock_db_session.add.call_count == 1


class TestWorkoutGetQueries:
    async def test_get_workout(self, service: WorkoutService, mock_db_session: AsyncMock):
        workout = _make_workout("work-1", "user-123")
        mock_db_session.scalar.return_value = workout
        result = await service.get_workout("work-1")
        assert result == workout

    async def test_get_workouts_basic(self, service: WorkoutService, mock_db_session: AsyncMock):
        workout = _make_workout("work-1", "user-123")
        # scalars() returns an object with a unique() method in SQLAlchemy AsyncSession mock if mocked correctly
        mock_unique = MagicMock()
        mock_unique.unique.return_value = [workout]
        mock_db_session.scalars.return_value = mock_unique

        result, has_more = await service.get_workouts("user-123", limit=10)

        assert len(result) == 1
        assert has_more is False

    async def test_get_workouts_has_more(self, service: WorkoutService, mock_db_session: AsyncMock):
        w1 = _make_workout("work-1", "user-123")
        w2 = _make_workout("work-2", "user-123")
        
        mock_unique = MagicMock()
        mock_unique.unique.return_value = [w1, w2]
        mock_db_session.scalars.return_value = mock_unique

        result, has_more = await service.get_workouts("user-123", limit=1)

        assert len(result) == 1
        assert has_more is True

    async def test_get_workouts_with_cursor(self, service: WorkoutService, mock_db_session: AsyncMock):
        w1 = _make_workout("work-1", "user-123")
        
        mock_unique = MagicMock()
        mock_unique.unique.return_value = [w1]
        mock_db_session.scalars.return_value = mock_unique

        result, has_more = await service.get_workouts("user-123", cursor="2026-05-24T12:00:00", limit=10)

        assert len(result) == 1
        assert has_more is False


class TestWorkoutUpdatesAndDeletion:
    async def test_update_workout_found(self, service: WorkoutService, mock_db_session: AsyncMock):
        workout = _make_workout("work-1", "user-123")
        mock_db_session.scalar.side_effect = [
            workout,  # find workout
            workout,  # reload at end
        ]

        completed = datetime.now(timezone.utc)
        result = await service.update_workout("work-1", notes="New notes", completed_at=completed)

        assert result == workout
        assert workout.notes == "New notes"
        assert workout.completed_at == completed
        mock_db_session.flush.assert_awaited_once()

    async def test_update_workout_not_found(self, service: WorkoutService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None
        result = await service.update_workout("work-99", notes="No effect")
        assert result is None

    async def test_delete_workout_success(self, service: WorkoutService, mock_db_session: AsyncMock):
        mock_res = MagicMock()
        mock_res.rowcount = 1
        mock_db_session.execute.return_value = mock_res

        result = await service.delete_workout("work-1")
        assert result is True

    async def test_delete_workout_not_found(self, service: WorkoutService, mock_db_session: AsyncMock):
        mock_res = MagicMock()
        mock_res.rowcount = 0
        mock_db_session.execute.return_value = mock_res

        result = await service.delete_workout("work-99")
        assert result is False


class TestExerciseQueries:
    async def test_get_exercises(self, service: WorkoutService, mock_db_session: AsyncMock):
        exs = [_make_exercise("ex-1", "Bench Press"), _make_exercise("ex-2", "Squat")]
        mock_db_session.scalars.return_value = iter(exs)

        result = await service.get_exercises()
        assert len(result) == 2
        assert result[0].name == "Bench Press"

    async def test_get_categories(self, service: WorkoutService, mock_db_session: AsyncMock):
        class Row:
            def __init__(self, category, count):
                self.category = category
                self.count = count

        mock_db_session.execute.return_value = [Row("chest", 5), Row("legs", 10)]

        categories = await service.get_categories()
        assert categories == [
            {"category": "chest", "count": 5},
            {"category": "legs", "count": 10},
        ]
