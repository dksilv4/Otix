"""Workout serializers: request bodies and response shapes.

Field-listed read serializers mirror the legacy FastAPI payloads
(``old-backend/otix/schemas/workout.py``): the full ``WorkoutOut`` shape for
create/get/patch, the lighter ``WorkoutListOut`` shape for list/today, plus the
exercise catalog and set/category shapes. A link's ``sets`` is stored as raw
JSON (legacy JSONB) and echoed back verbatim.
"""

from rest_framework import serializers

from apps.workout.models import Exercise, Workout, WorkoutExercise


class ExerciseOutSerializer(serializers.ModelSerializer):
    """Reference exercise (legacy ``ExerciseOut``)."""

    class Meta:
        model = Exercise
        fields = ("id", "name", "category", "aliases")
        read_only_fields = fields


class WorkoutExerciseOutSerializer(serializers.ModelSerializer):
    """A workout's exercise link (legacy ``WorkoutExerciseOut``)."""

    exercise = ExerciseOutSerializer(read_only=True)

    class Meta:
        model = WorkoutExercise
        fields = ("exercise_id", "exercise", "sort_order", "sets")
        read_only_fields = fields


class WorkoutDetailSerializer(serializers.ModelSerializer):
    """Full workout payload (legacy ``WorkoutOut``)."""

    exercises = WorkoutExerciseOutSerializer(
        many=True, source="workout_exercises", read_only=True
    )

    class Meta:
        model = Workout
        fields = (
            "id",
            "user_id",
            "raw_input",
            "notes",
            "started_at",
            "completed_at",
            "created_at",
            "updated_at",
            "exercises",
        )
        read_only_fields = fields


class WorkoutExerciseSummarySerializer(serializers.ModelSerializer):
    """Light exercise link used by list/today payloads (legacy summary)."""

    exercise_name = serializers.CharField(source="exercise.name", read_only=True)

    class Meta:
        model = WorkoutExercise
        fields = ("exercise_name", "sets")
        read_only_fields = fields


class WorkoutListSerializer(serializers.ModelSerializer):
    """List/today workout shape (legacy ``WorkoutListOut``)."""

    exercise_count = serializers.SerializerMethodField()
    total_sets = serializers.SerializerMethodField()
    exercises = WorkoutExerciseSummarySerializer(
        many=True, source="workout_exercises", read_only=True
    )

    class Meta:
        model = Workout
        fields = (
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
        )
        read_only_fields = fields

    def _links(self, obj: Workout) -> list[WorkoutExercise]:
        return list(obj.workout_exercises.all())

    def get_exercise_count(self, obj: Workout) -> int:
        return len(self._links(obj))

    def get_total_sets(self, obj: Workout) -> int:
        return sum(len(link.sets) for link in self._links(obj))


class SetDataInputSerializer(serializers.Serializer):
    """Set payload on a create body (legacy ``SetData`` request validation)."""

    reps = serializers.IntegerField(min_value=0)
    weight_kg = serializers.FloatField(min_value=0, allow_null=True, required=False, default=None)


class WorkoutExerciseInputSerializer(serializers.Serializer):
    """One exercise entry on a create body (legacy ``WorkoutExerciseCreate``).

    Legacy accepts an entry that carries neither ``exercise_id`` nor a usable
    ``exercise_name`` and then silently skips it, so no cross-field requirement
    is enforced here.
    """

    exercise_id = serializers.IntegerField(required=False, allow_null=True)
    exercise_name = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, trim_whitespace=False
    )
    sets = SetDataInputSerializer(many=True, allow_empty=False)


class WorkoutCreateSerializer(serializers.Serializer):
    """Create-workout request body (legacy ``WorkoutCreate``)."""

    raw_input = serializers.CharField(allow_blank=True)
    exercises = WorkoutExerciseInputSerializer(many=True, allow_empty=False)
    notes = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    started_at = serializers.DateTimeField(required=False, allow_null=True)


class WorkoutUpdateSerializer(serializers.Serializer):
    """Update-workout request body (legacy ``WorkoutUpdate``)."""

    notes = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    completed_at = serializers.DateTimeField(required=False, allow_null=True)


class CategoryOutSerializer(serializers.Serializer):
    """Exercise category with its exercise count (legacy ``CategoryOut``)."""

    category = serializers.CharField()
    count = serializers.IntegerField()


class HeatmapQuerySerializer(serializers.Serializer):
    """Query parameters for ``GET /api/v1/workout/heatmap``."""

    weeks = serializers.IntegerField(required=False, default=12, min_value=4, max_value=52)
