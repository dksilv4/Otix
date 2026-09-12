from django.apps import AppConfig


class PeopleConfig(AppConfig):
    name = "apps.people"
    verbose_name = "People"
    # Label defaults to "people" (last component of ``name``).
    default_auto_field = "django.db.models.BigAutoField"
