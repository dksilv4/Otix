"""Endpoint tests for the workout API area (DRF).

Covers collection list/create, detail get/patch/delete, today check-in,
heatmap and the public exercise catalog, mirroring legacy FastAPI status codes,
the 404/403 ``detail`` strings, and response key shapes.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APITestCase

from apps.social.models import UserStreak
from apps.workout.models import Exercise, Workout, WorkoutExercise

User = get_user_model()

DETAIL_KEYS = {
    "id",
    "user_id",
    "raw_input",
    "notes",
    "started_at",
    "completed_at",
    "created_at",
    "updated_at",
    "exercises",
}

LIST_KEYS = {
    "id",
    "user_id",
    "raw_input",
    "notes",
    "started_at",
    "completed_at",
    "created_at",
    "updated_at",
    "exercise_count",
    "total_sets",
    "exercises",
}

TODAY_KEYS = {"checked_in", "workout", "current_streak", "longest_streak"}


def _payload(exercise_id: int | None = None, name: str | None = None, sets=None) -> dict:
    """A minimal create-body exercise entry."""
    entry: dict = {"sets": [{"reps": 5, "weight_kg": 100}] if sets is None else sets}
    if exercise_id is not None:
        entry["exercise_id"] = exercise_id
    if name is not None:
        entry["exercise_name"] = name
    return entry


class WorkoutApiTests(APITestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="alice", password="pw")
        self.other = User.objects.create_user(username="bob", password="pw")
        self.token = Token.objects.create(user=self.user)

        self.squat = Exercise.objects.create(name="Squat", category="Legs", aliases=["Back squat"])
        self.bench = Exercise.objects.create(name="Bench Press", category="Push")

        self.client = APIClient()  # anonymous
        self.auth = APIClient()
        self.auth.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def _workout(self, user=None, raw_input: str = "5x5") -> Workout:
        workout = Workout.objects.create(
            user=user or self.user, raw_input=raw_input, started_at=timezone.now()
        )
        WorkoutExercise.objects.create(
            workout=workout, exercise=self.squat, sort_order=0, sets=[{"reps": 5, "weight_kg": 100}]
        )
        return workout

    def _create_body(self, **overrides) -> dict:
        body = {
            "raw_input": "squat 5x5",
            "exercises": [_payload(exercise_id=self.squat.pk)],
            "notes": "felt good",
        }
        body.update(overrides)
        return body

    # --- collection list ---
    def test_list_requires_authentication(self) -> None:
        response = self.client.get("/api/v1/workout/")
        self.assertEqual(response.status_code, 401)

    def test_list_returns_only_own_paginated_workouts(self) -> None:
        self._workout()
        self._workout()
        self._workout(user=self.other)

        response = self.auth.get("/api/v1/workout/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertIn("results", response.data)
        results = response.data["results"]
        self.assertEqual(len(results), 2)
        self.assertEqual(set(results[0]), LIST_KEYS)
        self.assertEqual(results[0]["user_id"], self.user.pk)
        self.assertEqual(results[0]["exercise_count"], 1)
        self.assertEqual(results[0]["total_sets"], 1)
        self.assertEqual(
            results[0]["exercises"],
            [{"exercise_name": "Squat", "sets": [{"reps": 5, "weight_kg": 100}]}],
        )

    # --- collection create ---
    def test_create_requires_authentication(self) -> None:
        response = self.client.post("/api/v1/workout/", self._create_body(), format="json")
        self.assertEqual(response.status_code, 401)

    def test_create_returns_full_201_shape(self) -> None:
        response = self.auth.post("/api/v1/workout/", self._create_body(), format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(set(response.data), DETAIL_KEYS)
        self.assertEqual(response.data["user_id"], self.user.pk)
        self.assertEqual(response.data["raw_input"], "squat 5x5")
        self.assertEqual(response.data["notes"], "felt good")
        self.assertEqual(len(response.data["exercises"]), 1)
        exercise = response.data["exercises"][0]
        self.assertEqual(exercise["exercise_id"], self.squat.pk)
        self.assertEqual(exercise["exercise"]["id"], self.squat.pk)
        self.assertEqual(exercise["exercise"]["name"], "Squat")
        self.assertEqual(exercise["sort_order"], 0)
        self.assertEqual(exercise["sets"], [{"reps": 5, "weight_kg": 100}])

        workout = Workout.objects.get(pk=response.data["id"])
        self.assertEqual(workout.workout_exercises.count(), 1)
        # A new workout does not duplicate an existing exercise catalog row.
        self.assertEqual(Exercise.objects.filter(name="Squat").count(), 1)

    def test_create_resolves_exercise_name_to_catalog_row(self) -> None:
        body = self._create_body(exercises=[_payload(name="Squat")])
        response = self.auth.post("/api/v1/workout/", body, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["exercises"][0]["exercise_id"], self.squat.pk)
        self.assertEqual(Exercise.objects.filter(name="Squat").count(), 1)

    def test_create_autocreates_unknown_exercise_name(self) -> None:
        body = self._create_body(exercises=[_payload(name="Deadlift")])
        response = self.auth.post("/api/v1/workout/", body, format="json")
        self.assertEqual(response.status_code, 201)
        exercise = Exercise.objects.get(name="Deadlift")
        self.assertIsNone(exercise.category)
        self.assertEqual(exercise.aliases, [])
        self.assertEqual(response.data["exercises"][0]["exercise_id"], exercise.pk)

    def test_create_requires_at_least_one_exercise(self) -> None:
        response = self.auth.post(
            "/api/v1/workout/", self._create_body(exercises=[]), format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_create_rejects_empty_sets(self) -> None:
        body = self._create_body(exercises=[_payload(exercise_id=self.squat.pk, sets=[])])
        response = self.auth.post("/api/v1/workout/", body, format="json")
        self.assertEqual(response.status_code, 400)

    # --- detail ---
    def test_get_requires_authentication(self) -> None:
        workout = self._workout()
        response = self.client.get(f"/api/v1/workout/{workout.pk}")
        self.assertEqual(response.status_code, 401)

    def test_get_returns_full_workout(self) -> None:
        workout = self._workout()
        response = self.auth.get(f"/api/v1/workout/{workout.pk}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), DETAIL_KEYS)
        self.assertEqual(response.data["id"], workout.pk)
        self.assertEqual(response.data["exercises"][0]["exercise"]["name"], "Squat")

    def test_get_unknown_workout_is_404(self) -> None:
        response = self.auth.get("/api/v1/workout/999999")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Workout not found")

    def test_get_other_users_workout_is_403(self) -> None:
        workout = self._workout(user=self.other)
        response = self.auth.get(f"/api/v1/workout/{workout.pk}")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["detail"], "Not your workout")

    def test_patch_updates_notes_and_completed_at(self) -> None:
        workout = self._workout()
        completed = timezone.now() + timedelta(hours=1)
        response = self.auth.patch(
            f"/api/v1/workout/{workout.pk}",
            {"notes": "updated", "completed_at": completed.isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        workout.refresh_from_db()
        self.assertEqual(workout.notes, "updated")
        self.assertIsNotNone(workout.completed_at)

    def test_patch_other_users_workout_is_403(self) -> None:
        workout = self._workout(user=self.other)
        response = self.auth.patch(
            f"/api/v1/workout/{workout.pk}", {"notes": "nope"}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["detail"], "Not your workout")

    def test_patch_unknown_workout_is_404(self) -> None:
        response = self.auth.patch("/api/v1/workout/999999", {"notes": "x"}, format="json")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Workout not found")

    def test_delete_removes_workout_and_links(self) -> None:
        workout = self._workout()
        response = self.auth.delete(f"/api/v1/workout/{workout.pk}")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Workout.objects.filter(pk=workout.pk).exists())
        self.assertFalse(WorkoutExercise.objects.filter(workout=workout).exists())

    def test_delete_other_users_workout_is_403(self) -> None:
        workout = self._workout(user=self.other)
        response = self.auth.delete(f"/api/v1/workout/{workout.pk}")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["detail"], "Not your workout")

    def test_delete_unknown_workout_is_404(self) -> None:
        response = self.auth.delete("/api/v1/workout/999999")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Workout not found")

    # --- today ---
    def test_today_get_requires_authentication(self) -> None:
        response = self.client.get("/api/v1/workout/today")
        self.assertEqual(response.status_code, 401)

    def test_today_get_empty_status(self) -> None:
        response = self.auth.get("/api/v1/workout/today")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), TODAY_KEYS)
        self.assertFalse(response.data["checked_in"])
        self.assertIsNone(response.data["workout"])
        self.assertEqual(response.data["current_streak"], 0)
        self.assertEqual(response.data["longest_streak"], 0)

    def test_today_post_checks_in_and_is_idempotent(self) -> None:
        first = self.auth.post("/api/v1/workout/today")
        self.assertEqual(first.status_code, 201)
        self.assertTrue(first.data["checked_in"])
        self.assertEqual(set(first.data["workout"]), LIST_KEYS)
        self.assertEqual(Workout.objects.filter(user=self.user).count(), 1)

        second = self.auth.post("/api/v1/workout/today")
        self.assertEqual(second.status_code, 201)
        self.assertTrue(second.data["checked_in"])
        self.assertEqual(Workout.objects.filter(user=self.user).count(), 1)

    def test_today_post_requires_authentication(self) -> None:
        response = self.client.post("/api/v1/workout/today")
        self.assertEqual(response.status_code, 401)

    def test_today_delete_removes_check_in(self) -> None:
        self.auth.post("/api/v1/workout/today")
        response = self.auth.delete("/api/v1/workout/today")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(Workout.objects.filter(user=self.user).count(), 0)

        status = self.auth.get("/api/v1/workout/today")
        self.assertFalse(status.data["checked_in"])

    def test_today_reads_streak_ledger(self) -> None:
        UserStreak.objects.create(
            user=self.user, current_workout_streak=3, longest_workout_streak=7
        )
        response = self.auth.get("/api/v1/workout/today")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["current_streak"], 3)
        self.assertEqual(response.data["longest_streak"], 7)

    # --- heatmap ---
    def test_heatmap_requires_authentication(self) -> None:
        response = self.client.get("/api/v1/workout/heatmap")
        self.assertEqual(response.status_code, 401)

    def test_heatmap_returns_day_window_with_counts(self) -> None:
        workout = self._workout()
        response = self.auth.get("/api/v1/workout/heatmap")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["weeks"], 12)
        self.assertEqual(len(response.data["dates"]), 12 * 7)
        today = timezone.localdate().isoformat()
        entry = next(d for d in response.data["dates"] if d["date"] == today)
        self.assertEqual(entry["count"], 1)
        self.assertIsNone(entry["volume_kg"])
        self.assertEqual(Workout.objects.filter(pk=workout.pk).count(), 1)

    def test_heatmap_respects_weeks_query_param(self) -> None:
        response = self.auth.get("/api/v1/workout/heatmap", {"weeks": 4})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["weeks"], 4)
        self.assertEqual(len(response.data["dates"]), 28)

    def test_heatmap_rejects_weeks_out_of_range(self) -> None:
        for weeks in (2, 53):
            response = self.auth.get("/api/v1/workout/heatmap", {"weeks": weeks})
            self.assertEqual(response.status_code, 400)

    # --- exercises (public) ---
    def test_exercise_list_is_public(self) -> None:
        response = self.client.get("/api/v1/exercises/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        names = {exercise["name"] for exercise in response.data}
        self.assertEqual(names, {"Squat", "Bench Press"})
        self.assertEqual(set(response.data[0]), {"id", "name", "category", "aliases"})

    def test_exercise_categories_is_public(self) -> None:
        response = self.client.get("/api/v1/exercises/categories")
        self.assertEqual(response.status_code, 200)
        categories = {item["category"]: item["count"] for item in response.data}
        self.assertEqual(categories, {"Legs": 1, "Push": 1})

    def test_exercise_categories_excludes_null_category(self) -> None:
        Exercise.objects.create(name="Yoga", category=None)
        response = self.client.get("/api/v1/exercises/categories")
        self.assertEqual(response.status_code, 200)
        categories = {item["category"] for item in response.data}
        self.assertEqual(categories, {"Legs", "Push"})
