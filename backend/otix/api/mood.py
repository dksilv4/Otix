from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.mood import MoodCheckInCreate, MoodCheckInOut, MoodCheckInTodayResponse
from otix.domain.mood import UserMoodCheckIn
from otix.domain.user import User
from otix.infrastructure.celery import app
from otix.lib.xp import MOOD_CHECKIN

mood_router = APIRouter(prefix="/mood-checkins", tags=["mood-checkins"])
DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUserDep = Annotated[User, Depends(get_current_user)]


def _today_utc():
    return datetime.now(UTC).date()


async def _get_today_checkin(db: AsyncSession, user_id: str) -> UserMoodCheckIn | None:
    return await db.scalar(
        select(UserMoodCheckIn).where(
            UserMoodCheckIn.user_id == user_id,
            UserMoodCheckIn.checkin_date == _today_utc(),
        )
    )


@mood_router.get("/today", response_model=MoodCheckInTodayResponse)
async def get_today_mood_checkin(
    db: DbDep,
    current_user: CurrentUserDep,
) -> MoodCheckInTodayResponse:
    if not current_user.daily_mood_checkins_enabled:
        return MoodCheckInTodayResponse(due=False, checkin=None)

    checkin = await _get_today_checkin(db, current_user.id)
    return MoodCheckInTodayResponse(due=checkin is None, checkin=checkin)


@mood_router.post("", response_model=MoodCheckInOut)
async def submit_mood_checkin(
    payload: MoodCheckInCreate,
    db: DbDep,
    current_user: CurrentUserDep,
) -> UserMoodCheckIn:
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
    return checkin


@mood_router.post("/dismiss", response_model=MoodCheckInOut)
async def dismiss_mood_checkin(
    db: DbDep,
    current_user: CurrentUserDep,
) -> UserMoodCheckIn:
    checkin = await _get_today_checkin(db, current_user.id)

    if checkin is None:
        checkin = UserMoodCheckIn(
            user_id=current_user.id,
            checkin_date=_today_utc(),
            status="dismissed",
            mood=None,
            feeling=None,
            note=None,
        )
        db.add(checkin)
    else:
        checkin.status = "dismissed"
        checkin.mood = None
        checkin.feeling = None
        checkin.note = None

    await db.flush()
    await db.refresh(checkin)
    return checkin
