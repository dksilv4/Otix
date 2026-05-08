from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.media import MediaItem
    from otix.domain.user import User


class UserList(Base, TimestampMixin):
    __tablename__ = "user_list"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped[User] = relationship("User", back_populates="lists")
    items: Mapped[list[UserListItem]] = relationship(
        "UserListItem", back_populates="list", order_by="UserListItem.sort_order"
    )


class UserListItem(Base):
    __tablename__ = "user_list_item"

    id: Mapped[otix_pk]
    list_id: Mapped[otix_fk] = mapped_column(ForeignKey("user_list.id", ondelete="CASCADE"))
    media_item_id: Mapped[otix_fk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    list: Mapped[UserList] = relationship("UserList", back_populates="items")
    media_item: Mapped[MediaItem] = relationship("MediaItem")

    __table_args__ = (
        UniqueConstraint("list_id", "media_item_id"),
    )
