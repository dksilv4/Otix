import math

from django.apps import AppConfig
from django.db.backends.signals import connection_created


def register_sqlite_search_functions(sender, connection, **kwargs):
    """Register custom SQLite functions for similarity and math when using SQLite."""
    if connection.vendor == "sqlite" and connection.connection is not None:
        try:
            from apps.search.services.search import ensure_sqlite_search_functions

            ensure_sqlite_search_functions(connection)
        except Exception:
            pass
        try:
            connection.connection.create_function(
                "ln",
                1,
                lambda x: math.log(float(x)) if x is not None and float(x) > 0 else 0.0,
            )
        except Exception:
            pass


def invalidate_on_media_change(sender, **kwargs):
    try:
        from apps.search.services.search import invalidate_search_cache

        invalidate_search_cache()
    except Exception:
        pass


class SearchConfig(AppConfig):
    name = "apps.search"
    verbose_name = "Search"
    # Label defaults to "search" (last component of name).
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        connection_created.connect(register_sqlite_search_functions)
        try:
            from django.db import connection

            if connection.vendor == "sqlite" and connection.connection is not None:
                register_sqlite_search_functions(None, connection)
        except Exception:
            pass
        try:
            from django.db.models.signals import post_delete, post_save

            from apps.media.models import MediaItem

            post_save.connect(invalidate_on_media_change, sender=MediaItem)
            post_delete.connect(invalidate_on_media_change, sender=MediaItem)
        except Exception:
            pass

