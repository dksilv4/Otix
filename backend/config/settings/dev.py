"""Local development settings.

Dev runs against whatever ``DATABASE_URL`` points at. Postgres is the platform
default; override to sqlite for quick throwaway runs (e.g. ``DATABASE_URL=
sqlite:///./dev.db``).
"""

import os

from config.settings.base import *  # noqa: F403  (inherited shared settings)
from config.settings.base import env_bool, env_list

DEBUG = True

# In development, accept all hosts (localhost, 127.0.0.1, LAN IPs, Tailscale, Docker host-gateway)
# to prevent DisallowedHost connection errors during local multi-device testing.
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", default=["*"])

# Browsable/verbose error pages and permissive CORS are acceptable in dev.
CORS_ALLOW_ALL_ORIGINS = env_bool("CORS_ALLOW_ALL_ORIGINS", default=True)

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure-secret-change-before-deploy")


class QueryResetMiddleware:
    """Resets django.db.connection.queries on every request in development to prevent memory leak."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        try:
            from django.db import reset_queries
            reset_queries()
        except Exception:
            pass
        return response


MIDDLEWARE = [*MIDDLEWARE, "config.settings.dev.QueryResetMiddleware"]
