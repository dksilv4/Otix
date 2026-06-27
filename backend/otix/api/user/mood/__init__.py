from __future__ import annotations

from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.mood import UserMoodCheckIn
from otix.domain.user import User
from otix.infrastructure.celery import app
from otix.lib.xp import MOOD_CHECKIN
from otix.schemas.mood import MoodCheckInCreate, MoodCheckInOut, MoodCheckInTodayResponse

logger = structlog.get_logger()

router = APIRouter(prefix="/mood-checkins", tags=["mood-checkins"])


def _today_utc():
    return datetime.now(UTC).date()


async def _get_today_checkin(db: AsyncSession, user_id: str) -> UserMoodCheckIn | None:
    return await db.scalar(
        select(UserMoodCheckIn).where(
            UserMoodCheckIn.user_id == user_id,
            UserMoodCheckIn.checkin_date == _today_utc(),
        )
    )


@router.get("/today", response_model=MoodCheckInTodayResponse)
async def get_today_mood_checkin(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MoodCheckInTodayResponse:
    """Get today's mood check-in status."""
    ip = request.client.host if request.client else None
    if not current_user.daily_mood_checkins_enabled:
        return MoodCheckInTodayResponse(due=False, checkin=None)

    checkin = await _get_today_checkin(db, current_user.id)
    logger.info("today mood checkin fetched", user_id=current_user.id, ip=ip)
    return MoodCheckInTodayResponse(due=checkin is None, checkin=checkin)


@router.post("", response_model=MoodCheckInOut)
async def submit_mood_checkin(
    payload: MoodCheckInCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserMoodCheckIn:
    """Submit today's mood check-in."""
    ip = request.client.host if request.client else None
    checkin = await _get_today_checkin(db, current_user.id)
    note = payload.note.strip() if payload.note else None
    if note == "":
        note = None
    should_award_xp = checkin is None or checkin.status != "submitted"

    if checkin is None:
        checkin = UserMoodCheckIn(
            user_id=current_user.id,
            checkin_date=_today_utc(),
            status="submitted",
            mood=payload.mood,
            feeling=payload.feeling,
            note=note,
        )
        db.add(checkin)
    else:
        checkin.status = "submitted"
        checkin.mood = payload.mood
        checkin.feeling = payload.feeling
        checkin.note = note

    await db.flush()
    await db.refresh(checkin)
    if should_award_xp:
        app.send_task("xp.award", args=[current_user.id, MOOD_CHECKIN])

    logger.info("mood checkin submitted", user_id=current_user.id, mood=payload.mood, ip=ip)
    return checkin


@router.post("/dismiss", response_model=MoodCheckInOut)
async def dismiss_mood_checkin(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserMoodCheckIn:
    """Dismiss today's mood check-in prompt."""
    ip = request.client.host if request.client else None
    checkin = await _get_today_checkin(db, current_user.id)

    if checkin is None:
        checkin = UserMoodCheckIn(
            user_id=current_user.id,
            checkin_date=_today_utc(),
            status="dismissed",
            mood=None, feeling=None, note=None,
        )
        db.add(checkin)
    else:
        checkin.status = "dismissed"
        checkin.mood = None
        checkin.feeling = None
        checkin.note = None

    await db.flush()
    await db.refresh(checkin)

    logger.info("mood checkin dismissed", user_id=current_user.id, ip=ip)
    return checkin
