"""Shared Django settings for every environment.

Environment-driven knobs (read from ``os.environ`` / ``.env``):
- ``SECRET_KEY``
- ``DEBUG``
- ``ALLOWED_HOSTS`` (comma-separated)
- ``DATABASE_URL`` (defaults to a local Postgres URL; platform runs Postgres +
  pgvector). Override to ``sqlite:///./<file>.db`` only for throwaway local runs.
- ``CORS_ALLOWED_ORIGINS`` (comma-separated) and ``CORS_ALLOW_ALL_ORIGINS``
- ``CELERY_BROKER_URL`` / ``CELERY_RESULT_BACKEND`` (Redis)
"""

import os
from pathlib import Path
from urllib.parse import urlparse

import dotenv

# backend-django/config/settings/base.py -> backend-django/
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Load .env from the project root if present. Real values (never checked in)
# come from the process environment / deployment secrets.
dotenv.load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: list[str]) -> list[str]:
    raw = os.environ.get(name)
    if raw is None:
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def parse_database_url(url: str) -> dict:
    """Translate a single DATABASE_URL into Django DATABASES settings.

    Supports ``postgresql://``/``postgres://`` and ``sqlite:///<path>``. This
    hand-rolled parser keeps the dependency footprint small; if more schemes
    are ever needed, swap it for ``dj-database-url``.
    """
    parsed = urlparse(url)
    if parsed.scheme in {"sqlite", "sqlite3"}:
        name = parsed.path.lstrip("/") or ":memory:"
        return {"ENGINE": "django.db.backends.sqlite3", "NAME": name}
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ValueError(f"Unsupported DATABASE_URL scheme: {parsed.scheme!r}")
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": parsed.path.lstrip("/") or "otix",
        "USER": parsed.username or "",
        "PASSWORD": parsed.password or "",
        "HOST": parsed.hostname or "",
        "PORT": parsed.port or "",
    }


# ---------------------------------------------------------------------------
# Core Django
# ---------------------------------------------------------------------------

DEBUG = env_bool("DEBUG", default=False)

# Dev-only fallback; production settings require an explicit env SECRET_KEY.
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure-secret-change-before-deploy")

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

DATABASES = {
    "default": parse_database_url(
        os.environ.get(
            "DATABASE_URL",
            "postgresql://otix:otix@127.0.0.1:5432/otix",
        )
    )
}

INSTALLED_APPS = [
    # Django contrib
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework.authtoken",  # Placeholder auth tokens; see ARCHITECTURE.md
    "corsheaders",
    # Local apps. Dependency order matters for auto-discovery/migrations:
    # media is the catalog hub; people/company FK back to it by string.
    # Satellite apps (below) FK only media + accounts.User, never each other,
    # so they can be ported in parallel without cross-app migration coupling.
    "apps.accounts.apps.AccountsConfig",
    "apps.media.apps.MediaConfig",
    "apps.people.apps.PeopleConfig",
    "apps.company.apps.CompanyConfig",
    "apps.lists.apps.ListsConfig",
    "apps.social.apps.SocialConfig",
    "apps.proposals.apps.ProposalsConfig",
    "apps.push.apps.PushConfig",
    "apps.search.apps.SearchConfig",
    "apps.integrations.apps.IntegrationsConfig",
    "apps.library.apps.LibraryConfig",
    "apps.track.apps.TrackConfig",
    "apps.workout.apps.WorkoutConfig",
    "apps.blueprint.apps.BlueprintConfig",
    "apps.discover.apps.DiscoverConfig",
    # Plugin framework host (no legacy-parity counterpart; see plugins/README.md)
    "plugins.apps.PluginsConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Greenfield data model: standard integer auto-increment PKs (not legacy ULIDs).
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# API routes are declared without trailing slashes (FastAPI parity).
APPEND_SLASH = False

# ---------------------------------------------------------------------------
# i18n / timezone
# ---------------------------------------------------------------------------

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

CORS_ALLOW_ALL_ORIGINS = env_bool("CORS_ALLOW_ALL_ORIGINS", default=DEBUG)
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", default=[])

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        # JWT bearer access tokens are primary. DRF Token stays as a secondary
        # authenticator for admin/internal tooling and older clients until the
        # FastAPI cutover is complete. See ARCHITECTURE.md §6.
        "apps.accounts.authentication.JWTAuthentication",
        "rest_framework.authentication.TokenAuthentication",
    ],
    # Every API endpoint is private by default; opt out per-view (e.g. register).
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "core.pagination.DefaultPagination",
    "PAGE_SIZE": 50,
}

# ---------------------------------------------------------------------------
# Auth / tokens (JWT access + rotating refresh cookie; see ARCHITECTURE §6)
# ---------------------------------------------------------------------------

# Independent of SECRET_KEY so the long-lived JWT signer can be rotated without
# invalidating Django password hashes/sessions. Defaults to SECRET_KEY for dev.
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", SECRET_KEY)
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_LIFETIME_MINUTES = int(os.environ.get("ACCESS_TOKEN_LIFETIME_MINUTES", 15))
REFRESH_TOKEN_LIFETIME_DAYS = int(os.environ.get("REFRESH_TOKEN_LIFETIME_DAYS", 7))
CHALLENGE_TOKEN_LIFETIME_MINUTES = int(os.environ.get("CHALLENGE_TOKEN_LIFETIME_MINUTES", 5))

REFRESH_COOKIE_NAME = os.environ.get("REFRESH_COOKIE_NAME", "otix_refresh")
# Path-scoped so the cookie is only sent on /auth/* requests.
REFRESH_COOKIE_PATH = "/api/v1/auth/"
REFRESH_COOKIE_SAMESITE = "lax"
REFRESH_COOKIE_SECURE = env_bool("REFRESH_COOKIE_SECURE", default=False)

# Action-token links point at the browser client. Email delivery defaults to
# the console backend in dev; tests override to locmem; prod should set an
# SMTP backend via env.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
if DEBUG:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
else:
    EMAIL_BACKEND = os.environ.get(
        "EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend"
    )

# ---------------------------------------------------------------------------
# Celery (declarative only; workers/beat wired in a later task)
# ---------------------------------------------------------------------------

CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://127.0.0.1:6379/0")

# ---------------------------------------------------------------------------
# Plugins (server-side framework; see plugins/README.md)
# ---------------------------------------------------------------------------

# Root the host process scans for drop-in plugin folders. The Django API owns
# the registry rows (plugins/management commands + services); the separate host
# process loads the code. Only matters to the API for scan/enable metadata.
PLUGINS_ROOT = os.environ.get("PLUGINS_ROOT", str(BASE_DIR / "plugin-root"))

# First-party plugins that ship with the app (e.g. the reference Plex data
# source) live under the repo, NOT the operator's gitignored PLUGINS_ROOT. The
# host resolves a plugin's folder from either root; ``plugins_scan`` seeds these
# as system rows (auto-enabled, never disabled/uninstalled — the Nextcloud
# shipped-apps analog).
BUNDLED_PLUGINS_ROOT = os.environ.get(
    "BUNDLED_PLUGINS_ROOT", str(BASE_DIR / "bundled_plugins")
)

# Internal control API the plugin host serves on localhost; the Django API talks
# to the host (never imports plugin code) using this shared secret. Bind stays
# loopback-only.
PLUGIN_HOST_BIND = os.environ.get("PLUGIN_HOST_BIND", "127.0.0.1")
PLUGIN_HOST_PORT = int(os.environ.get("PLUGIN_HOST_PORT", "8347"))
PLUGIN_HOST_SECRET = os.environ.get(
    "PLUGIN_HOST_SECRET", "dev-plugin-host-secret-change-me"
)

# Plugin lifecycle events: when non-empty, the host publishes plugin.loaded /
# unloaded / error onto this Redis URL + channel as JSON. Fail-open — a down or
# unset Redis never blocks the host (DB rows stay the source of truth).
PLUGIN_EVENTS_URL = os.environ.get("PLUGIN_EVENTS_URL", "")
PLUGIN_EVENTS_CHANNEL = os.environ.get("PLUGIN_EVENTS_CHANNEL", "otix.plugins.lifecycle")

# OAuth provider credentials. Google + Google-Drive link/login share one OAuth
# client (Google identity); other providers (plex/steam/tmdb) read their own.
# Empty => the OAuth endpoints 503 "not configured" (never a silent success).
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")

# Browser base URL the OAuth redirect_uri + PIN forward-urls point back at.
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "http://localhost:5173")

# Plex PIN auth is public (no client secret). The Plex.tv endpoints are
# overridable so tests point them at a local fake instead of the live IdP.
PLEX_CLIENT_IDENTIFIER = os.environ.get("PLEX_CLIENT_IDENTIFIER", "otix-web")
PLEX_PRODUCT = os.environ.get("PLEX_PRODUCT", "Otix")
PLEX_VERSION = os.environ.get("PLEX_VERSION", "0.1.0")
PLEX_TV_BASE = os.environ.get("PLEX_TV_BASE", "https://plex.tv")
PLEX_AUTH_URL = os.environ.get("PLEX_AUTH_URL", "https://app.plex.tv/auth")
# Shared secret for inbound Plex webhook HMAC-SHA256 verification
# (X-Plex-Signature: sha256=...). Empty disables the webhook endpoint.
PLEX_WEBHOOK_SECRET = os.environ.get("PLEX_WEBHOOK_SECRET", "")

# Steam Web API key used by the library/wishlist scan routes (optional; unset →
# those routes answer 503 "Steam API key not configured").
STEAM_API_KEY = os.environ.get("STEAM_API_KEY", "")

# TMDb v3 API key used by the account-sync routes (rating-sync/watchlist-import)
# and the oauth link/login helpers in apps/accounts.services.oauth.
TMDB_API_KEY = os.environ.get("TMDB_API_KEY", "")

# Image upload route (/api/v1/upload): allowed content written under UPLOAD_DIR
# and served by the web tier from /uploads/<name>.
UPLOAD_MAX_SIZE_MB = int(os.environ.get("UPLOAD_MAX_SIZE_MB", "5"))
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", str(BASE_DIR / "uploads"))

