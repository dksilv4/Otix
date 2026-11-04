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

