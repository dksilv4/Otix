# TODO: Review this file
from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

MoodValue = Literal["bad", "low", "okay", "good", "great"]
FeelingValue = Literal[
    "heartbroken",
    "stressed",
    "anxious",
    "tired",
    "lonely",
    "bored",
    "calm",
    "focused",
    "excited",
    "grateful",
]
MoodStatus = Literal["submitted", "dismissed"]


class MoodCheckInCreate(BaseModel):
    mood: MoodValue
    feeling: FeelingValue | None = None
    note: str | None = Field(default=None, max_length=280)


class MoodCheckInOut(BaseModel):
    id: str
    user_id: str
    checkin_date: date
    status: MoodStatus
    mood: MoodValue | None = None
    feeling: FeelingValue | None = None
    note: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MoodCheckInTodayResponse(BaseModel):
    due: bool
    checkin: MoodCheckInOut | None = None
