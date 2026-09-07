# TODO: Review this file
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.schema import UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from otix.domain.base import Base, otix_fk


class UserYoutubeLikedVideo(Base):
    """Raw YouTube liked video for a user — stores all music videos from sync."""

    __tablename__ = "user_youtube_liked_videos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    video_id: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False, default="")
    channel_id: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    channel_title: Mapped[str] = mapped_column(Text, nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    matched_media_item_id: Mapped[otix_fk | None] = mapped_column(
        ForeignKey("media_items.id", ondelete="SET NULL")
    )
    matched_title: Mapped[str | None] = mapped_column(Text)
    matched_artist: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "video_id", name="uq_user_youtube_video"),
    )
