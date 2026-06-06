from __future__ import annotations

from fastapi import APIRouter

from otix.api.track.rating import router as rating_router

track_router = APIRouter(prefix="/tracks", tags=["tracks"])

track_router.include_router(rating_router)
