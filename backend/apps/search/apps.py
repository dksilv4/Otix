from django.apps import AppConfig


class SearchConfig(AppConfig):
    name = "apps.search"
    verbose_name = "Search"
    # Label defaults to "search" (last component of name).
    default_auto_field = "django.db.models.BigAutoField"
