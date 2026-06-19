"""GET /integrations/epic/status — Epic integration status."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.domain.user import User
from otix.schemas.epic import EpicIntegrationStatus
from otix.services.epic_library_service import get_epic_library_stats

logger = structlog.get_logger()
router = APIRouter()


@router.get("/integrations/epic/status", response_model=EpicIntegrationStatus)
async def epic_integration_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EpicIntegrationStatus:
    """Get the authenticated user's Epic integration status."""
    if not current_user.epic_id:
        return EpicIntegrationStatus(connected=False)

    stats = await get_epic_library_stats(db, current_user.id)

    return EpicIntegrationStatus(
        connected=True,
        epic_id=current_user.epic_id,
        epic_display_name=current_user.epic_display_name,
        game_count=stats["game_count"],
        matched_count=stats["matched_count"],
        unmatched_count=stats["unmatched_count"],
        last_scanned_at=stats["last_scanned_at"],
    )
