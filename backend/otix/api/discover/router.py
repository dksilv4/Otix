from __future__ import annotations

from fastapi import APIRouter

from otix.api.discover.free_games import router as free_games_router
from otix.api.discover.hero.router import router as hero_router
from otix.api.discover.media_type.list_type.router import router as media_list_router
from otix.api.discover.sections.router import router as sections_router
from otix.api.discover.trailers.router import router as trailers_router

discover_router = APIRouter(prefix="/discover", tags=["discover"])

discover_router.include_router(hero_router)
discover_router.include_router(sections_router)
discover_router.include_router(trailers_router)
discover_router.include_router(media_list_router)
discover_router.include_router(free_games_router)
