from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from otix.infrastructure.config import settings
from otix.infrastructure.database import engine
from otix.infrastructure.logging import setup_logging
from otix.infrastructure.redis import close_redis, get_redis
from otix.api.router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    setup_logging()
    import structlog

    logger = structlog.get_logger()
    logger.info("otix api starting", env=settings.app_env)

    await get_redis()

    yield

    await close_redis()
    await engine.dispose()
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
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api")

    return app


app = create_app()
