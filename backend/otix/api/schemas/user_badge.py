from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class BadgeOut(BaseModel):
    badge_key: str
    label: str
    description: str
    icon: str
    tier: str
    earned: bool = False
    earned_at: datetime | None = None
