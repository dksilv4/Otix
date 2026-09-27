from django.apps import AppConfig


class IntegrationsConfig(AppConfig):
    name = "apps.integrations"
    verbose_name = "Integrations"
    # Label defaults to "integrations" (last component of name).
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        # Import provider sync engines so their @register_sync_engine decorators
        # register handlers for both web-process on-demand sync and Celery workers.
        try:
            from apps.integrations.services import (  # noqa: F401
                igdb_sync,
                plex_sync,
                steamgrid_sync,
                tmdb_sync,
                youtube_sync,
            )
        except Exception:
            pass
