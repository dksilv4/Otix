# TODO: Review this file
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.user import User


class FollowRequestStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"


class FollowRequest(Base, TimestampMixin):
    __tablename__ = "follow_requests"

    id: Mapped[otix_pk]
    requester_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    target_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), default=FollowRequestStatus.PENDING.value, nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    requester: Mapped[User] = relationship("User", foreign_keys=[requester_id])
    target: Mapped[User] = relationship("User", foreign_keys=[target_id])

    __table_args__ = (
        Index("ix_follow_requests_target_status", "target_id", "status"),
        Index("ix_follow_requests_requester", "requester_id"),
        CheckConstraint("requester_id != target_id", name="ck_follow_req_no_self"),
    )


class Follow(Base, TimestampMixin):
    __tablename__ = "follows"

    follower_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    followed_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    follower: Mapped[User] = relationship("User", foreign_keys=[follower_id], back_populates="following")
    followed: Mapped[User] = relationship("User", foreign_keys=[followed_id], back_populates="followers")

    __table_args__ = (
        Index("ix_follows_follower", "follower_id"),
        Index("ix_follows_followed", "followed_id"),
        CheckConstraint("follower_id != followed_id", name="ck_follow_no_self"),
    )
