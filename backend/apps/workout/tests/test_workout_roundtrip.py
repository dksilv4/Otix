"""Model round-trip smoke tests for the workout app."""

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.workout.models import Exercise, UserRating, Workout, WorkoutExercise

User = get_user_model()


class WorkoutRoundTripTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="lifter", password="x")

    def test_exercise_workout_link_roundtrip(self) -> None:
        exercise = Exercise.objects.create(name="Squat", category="Legs", aliases=["Back squat"])
        workout = Workout.objects.create(user=self.user, raw_input="5x5", notes="felt good")
        link = WorkoutExercise.objects.create(
            workout=workout,
            exercise=exercise,
            sort_order=0,
            sets=[{"weight": 100, "reps": 5}],
        )

        self.assertEqual(link.workout, workout)
        self.assertEqual(link.exercise, exercise)
        # Reverse accessors on both sides of the link table.
        self.assertEqual(list(workout.workout_exercises.all()), [link])
        self.assertEqual(list(exercise.workout_exercises.all()), [link])
        # Ordering preserved from sort_order.
        self.assertEqual(workout.workout_exercises.first(), link)

    def test_user_rating_roundtrip(self) -> None:
        other = User.objects.create_user(username="spotter", password="x")
        rating = UserRating.objects.create(rater=self.user, rated_user=other, score=8)

        self.assertEqual(rating.rater, self.user)
        self.assertEqual(rating.rated_user, other)
        self.assertEqual(list(self.user.ratings_given.all()), [rating])
        self.assertEqual(list(other.ratings_received.all()), [rating])
        # Duplicate rater->rated_user pairing is rejected.
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                UserRating.objects.create(rater=self.user, rated_user=other, score=3)
        # Out-of-range score is rejected.
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                UserRating.objects.create(rater=self.user, rated_user=other, score=11)
