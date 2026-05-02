from __future__ import annotations

from pathlib import Path

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
    db_pool_size: int = 10
    db_max_overflow: int = 20
    run_migrations: bool = True

    # Redis
    redis_url: str = "redis://localhost:6379/1"
    redis_ignore_exceptions: bool = True

    # Auth / JWT
    jwt_secret_key: str = "change-me-in-production"
    access_token_lifetime_minutes: int = 15
    refresh_token_lifetime_days: int = 7
    rotate_refresh_tokens: bool = True
    auth_refresh_cookie_name: str = "otix_refresh"
    auth_refresh_cookie_path: str = "/auth/"
    auth_refresh_cookie_domain: str = ""
    auth_refresh_cookie_secure: bool = False
    auth_refresh_cookie_httponly: bool = True
    auth_refresh_cookie_samesite: str = "lax"

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
    igdb_client_id: str = ""
    igdb_client_secret: str = ""
    igdb_request_timeout_seconds: int = 20
    igdb_global_rps_limit: int = 4

    # Email
    resend_api_key: str = ""
    email_from: str = "admin@diogodasilva.com"

    # Rate limiting
    auth_login_rate_limit_max_attempts: int = 20
    auth_refresh_rate_limit_max_attempts: int = 30

    # Celery
    celery_broker_url: str = ""
    celery_worker_concurrency: str = ""
    celery_worker_prefetch_multiplier: int = 1
    celery_worker_fast_concurrency: int = 6
    celery_worker_slow_concurrency: int = 2
    celery_worker_ccu_concurrency: int = 1

    @property
    def celery_broker(self) -> str:
        return self.celery_broker_url or self.redis_url.replace("redis://", "redis://", 1).replace("/1", "/0")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]


settings = Settings()
