from __future__ import annotations

from fastapi import APIRouter

from otix.api.auth import auth_router
from otix.api.media import media_router
from otix.api.metrics import metrics_router
from otix.api.people import people_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(media_router)
api_router.include_router(people_router)
api_router.include_router(metrics_router)


@api_router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
