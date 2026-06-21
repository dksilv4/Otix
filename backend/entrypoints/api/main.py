from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from otix.api.router import api_router
from otix.infrastructure.config import settings
from otix.infrastructure.database import dispose_engine
from otix.infrastructure.http_client import close_http_client
from otix.infrastructure.logging import setup_logging
from otix.infrastructure.redis import close_redis, get_redis


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    setup_logging()
    import structlog

    logger = structlog.get_logger()
    logger.info("otix api starting", env=settings.app_env)

    # Run pending database migrations before accepting requests.
    # Alembic acquires an advisory lock so concurrent API containers don't race.
    # The CMD entrypoint script (start-api.sh) also runs migrations before the
    # process starts — this is a second safety net for dev/`--reload` mode where
    # the script is skipped.
    try:
        import asyncio

        from alembic.config import Config

        from alembic import command

        alembic_cfg = Config("alembic.ini")
        alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url_sync)
        await asyncio.to_thread(command.upgrade, alembic_cfg, "head")
        setup_logging()
        logger.info("migrations applied")
    except Exception:
        setup_logging()
        logger.exception("lifespan migration failed — check your database connection and run 'alembic upgrade head' manually")

    await get_redis()

    # Pre-warm query embedding service in the background
    async def pre_warm_embedding():
        try:
            from otix.api.media._utils import _embed_query
            logger.info("pre-warming embedding service...")
            await _embed_query("warmup")
            logger.info("embedding service warmed up successfully")
        except Exception:
            logger.exception("failed to pre-warm embedding service")

    asyncio.create_task(pre_warm_embedding())

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

    @app.exception_handler(Exception)
    async def cors_safe_exception_handler(request: Request, exc: Exception):
        """Translate unhandled exceptions into JSON with CORS headers.

        Starlette's CORSMiddleware only adds CORS headers to responses that
        pass through the normal middleware chain — 500s raised at the ASGI
        layer bypass this entirely, causing confusing "CORS" errors in the
        browser when the real issue is a server-side crash.
        """
        import structlog
        logger = structlog.get_logger()
        logger.exception("unhandled exception", exc_info=exc)
        origin = request.headers.get("origin")
        headers: dict[str, str] = {}
        if origin and settings.cors_origin_regex and __import__("re").match(settings.cors_origin_regex, origin):
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal Server Error"},
            headers=headers,
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
