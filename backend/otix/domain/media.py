from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, gen_otix_id, otix_fk, otix_pk
from otix.domain.genre import MediaGenre, MediaKeyword
from otix.domain.asset import MediaAsset, MediaVideo, MediaRelease, ExternalRating
from otix.domain.interaction import UserMediaInteraction

if TYPE_CHECKING:
    from otix.domain.people import MediaCredit
    from otix.domain.collection import CollectionItem


class MediaItem(Base, TimestampMixin):
    __tablename__ = "media_items"

    id: Mapped[otix_pk]
    media_type: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(1000), nullable=False)
    overview: Mapped[str | None] = mapped_column(Text)
    slug: Mapped[str] = mapped_column(String(1000), nullable=False, unique=True)
    poster_url: Mapped[str | None] = mapped_column(String(2000))
    backdrop_url: Mapped[str | None] = mapped_column(String(2000))
    release_date: Mapped[date | None] = mapped_column()
    popularity: Mapped[float] = mapped_column(Float, default=0.0)
    original_language: Mapped[str | None] = mapped_column(String(10))
    completeness_score: Mapped[float] = mapped_column(Float, default=0.0)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("media_type IN ('movie', 'show', 'game')", name="ck_media_type"),
        CheckConstraint("completeness_score >= 0 AND completeness_score <= 1", name="ck_completeness_score"),
    )

    # Type-specific backrefs
    movie: Mapped[Movie | None] = relationship("Movie", back_populates="media_item", uselist=False)
    show: Mapped[Show | None] = relationship("Show", back_populates="media_item", uselist=False)
    game: Mapped[Game | None] = relationship("Game", back_populates="media_item", uselist=False)

    # Relations
    genres: Mapped[list[MediaGenre]] = relationship("MediaGenre", back_populates="media_item")
    keywords: Mapped[list[MediaKeyword]] = relationship("MediaKeyword", back_populates="media_item")
    assets: Mapped[list[MediaAsset]] = relationship("MediaAsset", back_populates="media_item")
    videos: Mapped[list[MediaVideo]] = relationship("MediaVideo", back_populates="media_item")
    releases: Mapped[list[MediaRelease]] = relationship("MediaRelease", back_populates="media_item")
    external_ratings: Mapped[list[ExternalRating]] = relationship("ExternalRating", back_populates="media_item")
    credits: Mapped[list[MediaCredit]] = relationship("MediaCredit", back_populates="media_item")
    interactions: Mapped[list[UserMediaInteraction]] = relationship("UserMediaInteraction", back_populates="media_item")
    collection_items: Mapped[list[CollectionItem]] = relationship("CollectionItem", back_populates="media_item")
    external_ids: Mapped[list[ExternalID]] = relationship("ExternalID", back_populates="media_item")


class Movie(Base):
    __tablename__ = "movies"

    media_item_id: Mapped[otix_pk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"))
    runtime: Mapped[int | None] = mapped_column(Integer)
    budget: Mapped[int | None] = mapped_column()
    revenue: Mapped[int | None] = mapped_column()
    tagline: Mapped[str | None] = mapped_column(String(1000))
    is_anime: Mapped[bool] = mapped_column(default=False)
    collection_id: Mapped[str | None] = mapped_column(String(16), ForeignKey("collections.id"))

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="movie")
    collection: Mapped["Collection | None"] = relationship("Collection", back_populates="movies")


class Show(Base):
    __tablename__ = "shows"

    media_item_id: Mapped[otix_pk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"))
    status: Mapped[str | None] = mapped_column(String(50))
    first_air_date: Mapped[date | None] = mapped_column()
    last_air_date: Mapped[date | None] = mapped_column()
    number_of_seasons: Mapped[int | None] = mapped_column(Integer)
    number_of_episodes: Mapped[int | None] = mapped_column(Integer)

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="show")
    seasons: Mapped[list["Season"]] = relationship("Season", back_populates="show")


class Season(Base):
    __tablename__ = "seasons"

    id: Mapped[otix_pk]
    show_id: Mapped[otix_fk] = mapped_column(ForeignKey("shows.media_item_id", ondelete="CASCADE"))
    season_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str | None] = mapped_column(String(1000))
    overview: Mapped[str | None] = mapped_column(Text)
    poster_url: Mapped[str | None] = mapped_column(String(2000))

    show: Mapped[Show] = relationship("Show", back_populates="seasons")
    episodes: Mapped[list["Episode"]] = relationship("Episode", back_populates="season")


class Episode(Base):
    __tablename__ = "episodes"

    id: Mapped[otix_pk]
    season_id: Mapped[otix_fk] = mapped_column(ForeignKey("seasons.id", ondelete="CASCADE"))
    episode_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str | None] = mapped_column(String(1000))
    overview: Mapped[str | None] = mapped_column(Text)
    runtime: Mapped[int | None] = mapped_column(Integer)
    air_date: Mapped[date | None] = mapped_column()

    season: Mapped[Season] = relationship("Season", back_populates="episodes")


class Game(Base):
    __tablename__ = "games"

    media_item_id: Mapped[otix_pk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"))
    release_status: Mapped[str | None] = mapped_column(String(50))
    website: Mapped[str | None] = mapped_column(String(2000))
    steam_app_id: Mapped[int | None] = mapped_column(Integer, unique=True)
    current_players: Mapped[int | None] = mapped_column(Integer)
    platforms: Mapped[dict | None] = mapped_column(JSONB)
    modes: Mapped[dict | None] = mapped_column(JSONB)
    is_free: Mapped[bool] = mapped_column(default=False)
    has_multiplayer: Mapped[bool] = mapped_column(default=False)

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="game")


class ExternalID(Base):
    __tablename__ = "external_ids"

    id: Mapped[otix_pk]
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    external_id: Mapped[str] = mapped_column(String(100), nullable=False)
    media_item_id: Mapped[otix_fk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hash_match_count: Mapped[int] = mapped_column(Integer, default=0)

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="external_ids")
