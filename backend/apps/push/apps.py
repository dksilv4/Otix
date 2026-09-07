from django.apps import AppConfig


class PushConfig(AppConfig):
    name = "apps.push"
    verbose_name = "Push"
    # Label defaults to "push" (last component of name).
    default_auto_field = "django.db.models.BigAutoField"
