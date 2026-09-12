"""Match proposal domain model — admin-reviewed game match proposals."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from otix.domain.base import Base, TimestampMixin, gen_otix_id


class MatchProposal(Base, TimestampMixin):
    __tablename__ = "match_proposals"

    id: Mapped[str] = mapped_column(String(16), primary_key=True, default=gen_otix_id)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    source_game_id: Mapped[str] = mapped_column(String(200), nullable=False)
    source_title: Mapped[str] = mapped_column(String(1000), nullable=False)
    developer: Mapped[str | None] = mapped_column(String(500))
    release_year: Mapped[int | None]
    poster_url: Mapped[str | None] = mapped_column(String(2000))
    otix_media_id: Mapped[str] = mapped_column(String(16), nullable=False)
    otix_title: Mapped[str] = mapped_column(String(1000), nullable=False)
    otix_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    match_type: Mapped[str] = mapped_column(String(50), nullable=False)
    proposed_by: Mapped[str] = mapped_column(String(50), nullable=False, default="auto")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    reviewed_by: Mapped[str | None] = mapped_column(String(50))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=func.now(), onupdate=func.now()
    )
