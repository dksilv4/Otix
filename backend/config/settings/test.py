"""Test settings.

Forces an in-memory SQLite test database so the suite runs anywhere without a
Postgres instance. Production/CI may override ``DATABASE_URL`` per-job; running
against real Postgres should instead use the dev/prod settings with the
postgres URL and rely on the runner creating a ``test_`` database.

Run: ``DJANGO_SETTINGS_MODULE=config.settings.test manage.py test``
"""

from django.core.cache import cache
from django.test import SimpleTestCase

from config.settings.base import *  # noqa: F403  (inherited shared settings)

DEBUG = False

# Neutralize external service API keys so unit tests run hermetically isolated
TMDB_API_KEY = ""
TMDB_RAT = ""
STEAMGRID_API_KEY = ""
STEAM_GRID_API_KEY = ""
OMDB_API_KEY = ""
FANART_API_KEY = ""
STEAM_API_KEY = ""
IGDB_CLIENT_ID = ""
IGDB_CLIENT_SECRET = ""

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# Captures auth emails in ``django.core.mail.outbox`` instead of sending.
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Run Celery tasks inline (no broker/worker) so job lifecycles can be asserted
# with ``.delay()`` in the suite; ``_EAGER_PROPAGATES`` keeps task exceptions
# raising into the test instead of being swallowed into the result backend.
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

_orig_setup_and_call = SimpleTestCase._setup_and_call


def _setup_and_call_with_cache_clear(self, result, debug=False):
    cache.clear()
    return _orig_setup_and_call(self, result, debug=debug)


SimpleTestCase._setup_and_call = _setup_and_call_with_cache_clear



