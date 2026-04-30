from __future__ import annotations

from fastapi import APIRouter

from otix.lib.metrics import get_registry

metrics_router = APIRouter(prefix="/metrics", tags=["metrics"])


@metrics_router.get("")
async def get_metrics() -> dict:
    return get_registry().snapshot()
