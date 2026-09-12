from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.user import User


class Blueprint(Base, TimestampMixin):
    __tablename__ = "blueprints"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    blueprint_string: Mapped[str] = mapped_column(Text)
    parsed_data: Mapped[dict | None] = mapped_column(JSON)
    tags: Mapped[list | None] = mapped_column(JSON)
    downloads: Mapped[int] = mapped_column(Integer, default=0)

    user: Mapped[User] = relationship("User", back_populates="blueprints")
    likes: Mapped[list[BlueprintLike]] = relationship(
        "BlueprintLike", back_populates="blueprint", cascade="all, delete-orphan"
    )


class BlueprintLike(Base):
    __tablename__ = "blueprint_likes"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    blueprint_id: Mapped[otix_fk] = mapped_column(ForeignKey("blueprints.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship("User")
    blueprint: Mapped[Blueprint] = relationship("Blueprint", back_populates="likes")

    __table_args__ = (UniqueConstraint("user_id", "blueprint_id", name="uq_blueprint_like"),)
