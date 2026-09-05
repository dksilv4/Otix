"""Test settings.

Forces an in-memory SQLite test database so the suite runs anywhere without a
Postgres instance. Production/CI may override ``DATABASE_URL`` per-job; running
against real Postgres should instead use the dev/prod settings with the
postgres URL and rely on the runner creating a ``test_`` database.

Run: ``DJANGO_SETTINGS_MODULE=config.settings.test manage.py test``
"""

from config.settings.base import *  # noqa: F403  (inherited shared settings)

DEBUG = False

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}
