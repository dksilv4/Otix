from __future__ import annotations

import structlog
from fastapi import APIRouter, Request

from otix.lib.metrics import get_registry

logger = structlog.get_logger()

router = APIRouter(prefix="/metric", tags=["metric"])


@router.get("")
async def get_metrics(request: Request) -> dict:
    """Return internal application metrics."""
    ip = request.client.host if request.client else None
    logger.info("metrics fetched", ip=ip)
    return get_registry().snapshot()
