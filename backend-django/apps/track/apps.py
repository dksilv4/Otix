from django.apps import AppConfig


class TrackConfig(AppConfig):
    name = "apps.track"
    verbose_name = "Track"
    # Label defaults to "track" (last component of name).
    default_auto_field = "django.db.models.BigAutoField"
