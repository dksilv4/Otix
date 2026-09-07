# TODO: Review this file
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.media import MediaItem
    from otix.domain.user import User


class MediaEditProposal(Base, TimestampMixin):
    __tablename__ = "media_edit_proposals"

    id: Mapped[otix_pk]
    media_item_id: Mapped[otix_fk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"))
    proposer_user_id: Mapped[otix_fk | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    approver_user_id: Mapped[otix_fk | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    changes: Mapped[dict] = mapped_column(JSONB, nullable=False)
    image_overrides: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_values: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    upvote_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    downvote_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="ck_edit_proposal_status"),
    )

    media_item: Mapped[MediaItem] = relationship("MediaItem")
    proposer: Mapped[User | None] = relationship("User", foreign_keys=[proposer_user_id])
    approver: Mapped[User | None] = relationship("User", foreign_keys=[approver_user_id])
    votes: Mapped[list[ProposalVote]] = relationship("ProposalVote", back_populates="proposal")


class MediaImageOverride(Base, TimestampMixin):
    __tablename__ = "media_image_overrides"

    id: Mapped[otix_pk]
    media_item_id: Mapped[otix_fk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"))
    image_type: Mapped[str] = mapped_column(String(20), nullable=False)
    language_code: Mapped[str] = mapped_column(String(10), nullable=False)
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by_user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))

    __table_args__ = (
        CheckConstraint(
            "image_type IN ('poster', 'backdrop', 'logo', 'textless_poster')",
            name="ck_image_override_type",
        ),
        Index("ix_image_overrides_media", "media_item_id"),
        Index("ix_image_overrides_media_type_lang", "media_item_id", "image_type", "language_code"),
    )

    media_item: Mapped[MediaItem] = relationship("MediaItem")
    created_by: Mapped[User] = relationship("User")


class ProposalVote(Base, TimestampMixin):
    __tablename__ = "proposal_votes"

    user_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    proposal_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("media_edit_proposals.id", ondelete="CASCADE"), primary_key=True
    )
    vote_type: Mapped[str] = mapped_column(nullable=False)

    voter: Mapped[User] = relationship("User")
    proposal: Mapped[MediaEditProposal] = relationship("MediaEditProposal", back_populates="votes")

    __table_args__ = (
        CheckConstraint("vote_type IN ('up', 'down')", name="ck_proposal_vote_type"),
    )
