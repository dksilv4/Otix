from django.apps import AppConfig


class SocialConfig(AppConfig):
    name = "apps.social"
    verbose_name = "Social"
    # Label defaults to "social" (last component of name).
    default_auto_field = "django.db.models.BigAutoField"
