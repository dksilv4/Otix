from django.apps import AppConfig


class IntegrationsConfig(AppConfig):
    name = "apps.integrations"
    verbose_name = "Integrations"
    # Label defaults to "integrations" (last component of name).
    default_auto_field = "django.db.models.BigAutoField"
