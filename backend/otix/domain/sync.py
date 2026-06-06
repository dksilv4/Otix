# TODO: Review this file
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from otix.domain.base import Base, otix_fk, otix_pk


class SyncJob(Base):
    __tablename__ = "sync_jobs"

    id: Mapped[otix_pk]
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)
    external_id: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    priority: Mapped[int] = mapped_column(Integer, default=5)
    phase: Mapped[str] = mapped_column(String(20), nullable=False, default="core")
    parent_id: Mapped[otix_fk | None] = mapped_column(ForeignKey("sync_jobs.id"))
    error_message: Mapped[str | None] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProviderState(Base):
    __tablename__ = "provider_state"

    provider: Mapped[str] = mapped_column(String(20), primary_key=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cursor_value: Mapped[str | None] = mapped_column(String(500))
    rate_limit_remaining: Mapped[int | None] = mapped_column(Integer)
    rate_limit_reset: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
