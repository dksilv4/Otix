from django.apps import AppConfig


class MediaConfig(AppConfig):
    name = "apps.media"
    verbose_name = "Media"
    # Label defaults to "media" (last component of ``name``).
    default_auto_field = "django.db.models.BigAutoField"
