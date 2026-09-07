"""Unified proposal domain model — replaces match_proposal and media_edit_proposals.

All proposal types (match, edit, future) share this single table.
Type-specific data lives in the JSONB ``payload`` column.
Type-specific behavior is handled by registered handlers (strategy pattern).
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.user import User


class Proposal(Base, TimestampMixin):
    """Unified proposal — one table for all proposal types."""

    __tablename__ = "proposals"

    id: Mapped[otix_pk]

    # ── Discrimination ──────────────────────────────────────────────
    proposal_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # 'match' | 'edit' | future types
    target_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # 'media_item' | 'external_id' | …
    target_id: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # otix_id of the target entity

    # ── User relationships ──────────────────────────────────────────
    proposer_id: Mapped[otix_fk | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reviewer_id: Mapped[otix_fk | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # ── Status machine ──────────────────────────────────────────────
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", index=True
    )

    # ── Type-specific payload ───────────────────────────────────────
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # ── Review outcome ──────────────────────────────────────────────
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Undo support ────────────────────────────────────────────────
    snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # ── Community curation ──────────────────────────────────────────
    upvote_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    downvote_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Relationships ───────────────────────────────────────────────
    proposer: Mapped[User | None] = relationship(
        "User", foreign_keys=[proposer_id], lazy="joined"
    )
    reviewer: Mapped[User | None] = relationship(
        "User", foreign_keys=[reviewer_id], lazy="joined"
    )
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name="ck_proposal_status",
        ),
        CheckConstraint(
            "proposal_type IN ('match', 'edit')",
            name="ck_proposal_type",
        ),
    )

    @property
    def is_pending(self) -> bool:
        return self.status == "pending"

    @property
    def is_approved(self) -> bool:
        return self.status == "approved"

    @property
    def is_rejected(self) -> bool:
        return self.status == "rejected"
