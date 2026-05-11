from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.media import Episode, MediaItem


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id: Mapped[otix_pk]
    media_item_id: Mapped[otix_fk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"))
    asset_type: Mapped[str] = mapped_column(String(20), nullable=False)
    url: Mapped[str] = mapped_column(String(2000), nullable=False, unique=True)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    lang: Mapped[str | None] = mapped_column(String(10))
    style: Mapped[str | None] = mapped_column(String(20))
    score: Mapped[int | None] = mapped_column(Integer)
    provider: Mapped[str | None] = mapped_column(String(20))

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="assets")


class MediaVideo(Base):
    __tablename__ = "media_videos"

    id: Mapped[otix_pk]
    media_item_id: Mapped[otix_fk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"))
    video_type: Mapped[str | None] = mapped_column(String(50))
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    provider: Mapped[str | None] = mapped_column(String(20))
    provider_id: Mapped[str | None] = mapped_column(String(100))

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="videos")


class MediaRelease(Base):
    __tablename__ = "media_releases"

    id: Mapped[otix_pk]
    media_item_id: Mapped[otix_fk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"))
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    release_date: Mapped[str | None] = mapped_column(Date)
    certification: Mapped[str | None] = mapped_column(String(20))

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="releases")


class ExternalRating(Base):
    __tablename__ = "external_ratings"
    __table_args__ = (
        CheckConstraint(
            "media_item_id IS NOT NULL OR episode_id IS NOT NULL",
            name="ck_external_rating_target",
        ),
    )

    id: Mapped[otix_pk]
    media_item_id: Mapped[otix_fk | None] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"), nullable=True)
    episode_id: Mapped[otix_fk | None] = mapped_column(ForeignKey("episodes.id", ondelete="CASCADE"), nullable=True)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    max_score: Mapped[float] = mapped_column(Float, default=10.0)
    vote_count: Mapped[int | None] = mapped_column(Integer)

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="external_ratings")
    episode: Mapped[Episode] = relationship("Episode", back_populates="external_ratings")
