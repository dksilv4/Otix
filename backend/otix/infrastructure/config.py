# TODO: Review this file
from __future__ import annotations

from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_env: str = "local"
    debug: bool = False
    log_level: str = "INFO"
    otix_process: str = "api"

    # Database
    database_url: str = "postgresql+asyncpg://otium:password@localhost:5432/otium_prod_v1"
    database_url_sync: str = "postgresql://otium:password@localhost:5432/otium_prod_v1"
    db_conn_max_age: int = 0
    db_connect_timeout: int = 5
    db_pool_size: int = 20
    db_max_overflow: int = 15
    run_migrations: bool = True

    # Redis
    redis_url: str = "redis://localhost:6379/1"
    redis_ignore_exceptions: bool = True

    # Auth / JWT — must be set via environment in production
    jwt_secret_key: str = ""
    jwt_signing_algorithm: str = "HS256"
    access_token_lifetime_minutes: int = 15
    refresh_token_lifetime_days: int = 7
    rotate_refresh_tokens: bool = True
    auth_refresh_cookie_name: str = "otix_refresh"
    auth_refresh_cookie_path: str = "/api/v1/auth/"
    auth_refresh_cookie_domain: str = ""
    auth_refresh_cookie_secure: bool = False
    auth_refresh_cookie_httponly: bool = True
    auth_refresh_cookie_samesite: str = "lax"

    # Plex
    plex_webhook_secret: str = ""

    # Uploads
    upload_dir: str = "./uploads"
    upload_max_size_mb: int = 5

    # CORS
    frontend_base_url: str = "http://localhost:5173"
    cors_allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    cors_allow_credentials: bool = True

    # Provider API keys
    tmdb_api_key: str = ""
    tmdb_rat: str = ""
    tmdb_request_timeout_seconds: int = 20
    tmdb_global_rps_limit: int = 40
    tmdb_max_retries: int = 4
    tmdb_sync_max_escalation_days: int = 90
    omdb_api_key: str = ""
    omdb_request_timeout_seconds: int = 15
    omdb_global_rps_limit: int = 5
    fanart_api_key: str = ""
    fanart_client_key: str = ""
    fanart_request_timeout_seconds: int = 15
    fanart_global_rps_limit: int = 1
    rawg_api_key: str = ""
    steam_api_key: str = ""
    steam_request_timeout_seconds: int = 15
    steam_global_rps_limit: int = 20
    plex_client_identifier: str = "otix-web"
    plex_product: str = "Otix"
    plex_version: str = "0.1.0"
    igdb_client_id: str = ""
    igdb_client_secret: str = ""
    igdb_request_timeout_seconds: int = 20
    igdb_global_rps_limit: int = 4

    # SteamGridDB
    steamgrid_api_key: str = Field(default="", validation_alias="STEAM_GRID_API_KEY")
    steamgrid_request_timeout_seconds: int = 15
    steamgrid_global_rps_limit: int = 2

    # MusicBrainz
    musicbrainz_request_timeout_seconds: int = 15
    musicbrainz_global_rps_limit: int = 1

    # Spotify
    spotify_client_id: str = ""
    spotify_client_secret: str = ""
    spotify_request_timeout_seconds: int = 15
    spotify_global_rps_limit: int = 3

    # Google
    google_client_id: str = ""
    google_client_secret: str = ""

    # Last.fm
    lastfm_api_key: str = ""
    lastfm_request_timeout_seconds: int = 15
    lastfm_global_rps_limit: int = 5

    # Deezer
    deezer_request_timeout_seconds: int = 15
    deezer_global_rps_limit: int = 10

    # TheAudioDB
    theaudiodb_api_key: str = "2"
    theaudiodb_request_timeout_seconds: int = 15
    theaudiodb_global_rps_limit: int = 5

    # LRCLIB — free lyrics API, no auth
    lrclib_request_timeout_seconds: int = 10
    lrclib_global_rps_limit: int = 5

    # API response cache (local dev/test only)
    api_cache_enabled: bool = True
    api_cache_dir: str = "./.api_cache"
    api_cache_ttl_hours: int = 24

    # Embeddings
    # Default CPU model via FastEmbed. Set OTIX_EMBEDDING_API_URL to use a GPU
    # embedding server instead (e.g. Ollama, TEI).
    # all-MiniLM-L6-v2 chosen over bge-small for ~2-3x faster CPU inference.
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dimension: int = 384
    embedding_api_url: str = ""

    # Email
    resend_api_key: str = ""
    email_from: str = "admin@diogodasilva.com"

    # Proposals
    proposal_min_xp: int = Field(default=500, description="Minimum XP required to submit proposals")

    # Rate limiting
    auth_login_rate_limit_max_attempts: int = 20
    auth_refresh_rate_limit_max_attempts: int = 30

    # Celery
    celery_broker_url: str = ""
    celery_worker_concurrency: str = ""
    celery_worker_prefetch_multiplier: int = 1
    celery_worker_fast_concurrency: int = 6
    celery_worker_user_concurrency: int = 2
    celery_worker_control_concurrency: int = 2
    celery_worker_provider_concurrency: int = 3
    celery_worker_ccu_concurrency: int = 1
    celery_fast_queue_max_backlog: int = 1000

    @property
    def celery_broker(self) -> str:
        return self.celery_broker_url or self.redis_url.replace("redis://", "redis://", 1).replace("/1", "/0")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def cors_origin_regex(self) -> str:
        return r"https?://(localhost|127\.0\.0\.1):\d+"

    @property
    def EMAIL_TEMPLATES_DIR(self) -> Path:
        return Path(__file__).parents[1] / "templates" / "emails"

    def __getattr__(self, name: str):
        try:
            return super().__getattr__(name)
        except AttributeError:
            if name.isupper():
                lower_name = name.lower()
                if hasattr(self, lower_name):
                    return getattr(self, lower_name)
            raise

    @model_validator(mode="after")
    def _validate_jwt_secret(self) -> "Settings":
        if not self.jwt_secret_key:
            if self.app_env == "production":
                raise ValueError(
                    "JWT_SECRET_KEY must be set in production. "
                    "Generate one: openssl rand -hex 64"
                )
            import warnings
            warnings.warn(
                "JWT_SECRET_KEY is empty — using an insecure default for development. "
                "Set JWT_SECRET_KEY in your .env or environment.",
                stacklevel=2,
            )
            self.jwt_secret_key = "dev-insecure-jwt-secret-do-not-use-in-production"
        return self


settings = Settings()
