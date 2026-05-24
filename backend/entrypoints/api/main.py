from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from otix.infrastructure.config import settings
from otix.infrastructure.database import dispose_engine
from otix.infrastructure.logging import setup_logging
from otix.infrastructure.http_client import close_http_client
from otix.infrastructure.redis import close_redis, get_redis
from otix.api.router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    setup_logging()
    import structlog

    logger = structlog.get_logger()
    logger.info("otix api starting", env=settings.app_env)

    # Run pending database migrations before accepting requests.
    # Alembic acquires an advisory lock so concurrent API containers don't race.
    try:
        from alembic.config import Config
        from alembic import command

        alembic_cfg = Config("alembic.ini")
        alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url_sync)
        command.upgrade(alembic_cfg, "head")
        logger.info("migrations applied")
    except Exception:
        logger.exception("migrations failed — continuing startup")

    await get_redis()

    yield

    await close_redis()
    await close_http_client()
    await dispose_engine()
    logger.info("otix api stopped")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Otix",
        description="Media tracking and discovery platform API",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api")

    # Root-level health and readiness probes (no /api prefix for load balancers).
    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/healthz")
    async def healthz():
        from otix.infrastructure.database import _get_engine
        try:
            engine = _get_engine()
            async with engine.connect() as conn:
                await conn.execute(select(1))
        except Exception:
            return JSONResponse(
                status_code=503,
                content={"status": "unhealthy", "detail": "database unreachable"},
            )
        return {"status": "ok"}

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

    return app


app = create_app()
