from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class VoteCreate(BaseModel):
    vote_type: str  # "up" or "down"


class VoteCountsOut(BaseModel):
    up: int = 0
    down: int = 0
    my_vote: str | None = None


class KarmaOut(BaseModel):
    balance: int


class KarmaTransactionOut(BaseModel):
    amount: int
    reason: str
    created_at: datetime
