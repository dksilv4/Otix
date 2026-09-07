from django.apps import AppConfig


class BlueprintConfig(AppConfig):
    name = "apps.blueprint"
    verbose_name = "Blueprint"
    # Label defaults to "blueprint" (last component of name).
    default_auto_field = "django.db.models.BigAutoField"
