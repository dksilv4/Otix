from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.user import User
from otix.schemas.calendar import CalendarResponse
from otix.services.calendar_service import CalendarService

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("", response_model=CalendarResponse)
async def get_calendar(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CalendarResponse:
    """Get upcoming releases from the user's watchlist, watched shows, and franchises."""
    service = CalendarService(db, current_user.id)
    return await service.get_events()
