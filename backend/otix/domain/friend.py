from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.user import User


class FriendRequest(Base, TimestampMixin):
    __tablename__ = "friend_requests"

    id: Mapped[otix_pk]
    sender_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    receiver_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(default="pending")

    sender: Mapped[User] = relationship("User", foreign_keys=[sender_id], back_populates="sent_requests")
    receiver: Mapped[User] = relationship("User", foreign_keys=[receiver_id], back_populates="received_requests")

    __table_args__ = (
        UniqueConstraint("sender_id", "receiver_id"),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected')",
            name="ck_friend_request_status",
        ),
    )
