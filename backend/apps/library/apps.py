from django.apps import AppConfig


class LibraryConfig(AppConfig):
    name = "apps.library"
    verbose_name = "Library"
    # Label defaults to "library" (last component of name).
    default_auto_field = "django.db.models.BigAutoField"
