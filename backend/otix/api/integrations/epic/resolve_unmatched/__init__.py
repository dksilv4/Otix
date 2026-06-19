"""POST /integrations/epic/resolve-unmatched — trigger IGDB resolution."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.domain.user import User
from otix.services.epic_library_service import _enqueue_igdb_resolution

logger = structlog.get_logger()
router = APIRouter()


@router.post("/integrations/epic/resolve-unmatched")
async def epic_resolve_unmatched(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Trigger asynchronous IGDB resolution for unmatched Epic games.

    Unmatched games (those not yet linked to a canonical Otix game record)
    will be looked up in IGDB via a background Celery task. The response
    only confirms the task was enqueued; check status for results.
    """
    if not current_user.epic_id:
        raise HTTPException(status_code=400, detail="No Epic account linked")

    try:
        _enqueue_igdb_resolution.delay(current_user.id)
    except Exception:
        logger.exception("failed to enqueue epic IGDB resolution")
        raise HTTPException(status_code=500, detail="Failed to start resolution")

    return {
        "status": "enqueued",
        "message": "IGDB resolution started. Check back for results.",
    }
