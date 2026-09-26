from django.apps import AppConfig


class SocialConfig(AppConfig):
    name = "apps.social"
    verbose_name = "Social"
    # Label defaults to "social" (last component of name).
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        # Register notification → Redis SSE fan-out.
        from apps.social import signals  # noqa: F401
