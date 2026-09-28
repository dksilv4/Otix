"""Local development settings.

Dev runs against whatever ``DATABASE_URL`` points at. Postgres is the platform
default; override to sqlite for quick throwaway runs (e.g. ``DATABASE_URL=
sqlite:///./dev.db``).
"""

import os

from config.settings.base import *  # noqa: F403  (inherited shared settings)
from config.settings.base import env_bool, env_list

DEBUG = True

# "api" is the compose service name — the bots load-test sim and other
# containers call the API over the docker network as http://api:8000.
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1", "0.0.0.0", "api"])

# Browsable/verbose error pages and permissive CORS are acceptable in dev.
CORS_ALLOW_ALL_ORIGINS = env_bool("CORS_ALLOW_ALL_ORIGINS", default=True)

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure-secret-change-before-deploy")
