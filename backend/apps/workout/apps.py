from django.apps import AppConfig


class WorkoutConfig(AppConfig):
    name = "apps.workout"
    verbose_name = "Workout"
    # Label defaults to "workout" (last component of name).
    default_auto_field = "django.db.models.BigAutoField"
