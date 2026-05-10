from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, gen_otix_id, otix_fk, otix_pk
from otix.domain.genre import MediaGenre, MediaKeyword
from otix.domain.asset import MediaAsset, MediaVideo, MediaRelease, ExternalRating
from otix.domain.interaction import UserMediaInteraction

if TYPE_CHECKING:
    from otix.domain.collection import CollectionItem
    from otix.domain.company import InvolvedCompany
    from otix.domain.people import MediaCredit
    from otix.domain.review import Review


class MediaItem(Base, TimestampMixin):
    __tablename__ = "media_items"

    id: Mapped[otix_pk]
    media_type: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(1000), nullable=False)
    overview: Mapped[str | None] = mapped_column(Text)
    slug: Mapped[str] = mapped_column(String(1000), nullable=False)
    poster_url: Mapped[str | None] = mapped_column(String(2000))
    textless_poster_url: Mapped[str | None] = mapped_column(String(2000))
    backdrop_url: Mapped[str | None] = mapped_column(String(2000))
    logo_url: Mapped[str | None] = mapped_column(String(2000))
    release_date: Mapped[date | None] = mapped_column()
    popularity: Mapped[float] = mapped_column(Float, default=0.0)
    original_language: Mapped[str | None] = mapped_column(String(10))
    completeness_score: Mapped[float] = mapped_column(Float, default=0.0)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)
    avg_rating: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    watchlist_count: Mapped[int] = mapped_column(Integer, default=0)
    watched_count: Mapped[int] = mapped_column(Integer, default=0)
    played_count: Mapped[int] = mapped_column(Integer, default=0)
    started_count: Mapped[int] = mapped_column(Integer, default=0)

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
    involved_companies: Mapped[list[InvolvedCompany]] = relationship("InvolvedCompany", back_populates="media_item")
    interactions: Mapped[list[UserMediaInteraction]] = relationship("UserMediaInteraction", back_populates="media_item")
    reviews: Mapped[list[Review]] = relationship("Review", back_populates="media_item")
    collection_items: Mapped[list[CollectionItem]] = relationship("CollectionItem", back_populates="media_item")
    external_ids: Mapped[list[ExternalID]] = relationship("ExternalID", back_populates="media_item")
    platforms: Mapped[list[MediaPlatform]] = relationship("MediaPlatform", back_populates="media_item")
    game_modes: Mapped[list[MediaGameMode]] = relationship("MediaGameMode", back_populates="media_item")


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
    is_anime: Mapped[bool] = mapped_column(default=False)
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
    still_url: Mapped[str | None] = mapped_column(String(2000))

    season: Mapped[Season] = relationship("Season", back_populates="episodes")


class Game(Base):
    __tablename__ = "games"

    media_item_id: Mapped[otix_pk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"))
    release_status: Mapped[str | None] = mapped_column(String(50))
    website: Mapped[str | None] = mapped_column(String(2000))
    steam_app_id: Mapped[int | None] = mapped_column(Integer, unique=True)
    store_ids: Mapped[dict | None] = mapped_column(JSONB)
    current_players: Mapped[int | None] = mapped_column(Integer)
    price_json: Mapped[dict | None] = mapped_column(JSONB)
    recommendations: Mapped[int | None] = mapped_column(Integer)
    review_summary: Mapped[str | None] = mapped_column(String(200))
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


class Platform(Base):
    __tablename__ = "platforms"

    id: Mapped[otix_pk]
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    igdb_id: Mapped[int | None] = mapped_column(Integer, unique=True)
    logo_image_id: Mapped[str | None] = mapped_column(String(100))


class MediaPlatform(Base):
    __tablename__ = "media_platforms"

    id: Mapped[otix_pk]
    media_item_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("media_items.id", ondelete="CASCADE"), nullable=False
    )
    platform_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("platforms.id", ondelete="CASCADE"), nullable=False
    )

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="platforms")
    platform: Mapped[Platform] = relationship("Platform")

    __table_args__ = (
        UniqueConstraint("media_item_id", "platform_id", name="uq_media_platform"),
    )


class GameMode(Base):
    __tablename__ = "game_modes"

    id: Mapped[otix_pk]
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)


class MediaGameMode(Base):
    __tablename__ = "media_game_modes"

    id: Mapped[otix_pk]
    media_item_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("media_items.id", ondelete="CASCADE"), nullable=False
    )
    game_mode_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("game_modes.id", ondelete="CASCADE"), nullable=False
    )

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="game_modes")
    game_mode: Mapped[GameMode] = relationship("GameMode")

    __table_args__ = (
        UniqueConstraint("media_item_id", "game_mode_id", name="uq_media_game_mode"),
    )


class UserSteamGame(Base):
    __tablename__ = "user_steam_games"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    media_item_id: Mapped[otix_fk | None] = mapped_column(
        ForeignKey("media_items.id", ondelete="SET NULL"), nullable=True
    )
    steam_app_id: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    playtime_forever: Mapped[int] = mapped_column(Integer, default=0)
    playtime_2weeks: Mapped[int] = mapped_column(Integer, default=0)
    img_icon_url: Mapped[str | None] = mapped_column(String(256))
    img_logo_url: Mapped[str | None] = mapped_column(String(256))
    rtime_last_played: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("user_id", "steam_app_id", name="uq_user_steam_game"),
    )


class UserSteamWishlist(Base):
    __tablename__ = "user_steam_wishlist"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    media_item_id: Mapped[otix_fk | None] = mapped_column(
        ForeignKey("media_items.id", ondelete="SET NULL"), nullable=True
    )
    steam_app_id: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    added_date: Mapped[int | None] = mapped_column(Integer)
    is_free: Mapped[bool] = mapped_column(Boolean, default=False)
    img_icon_url: Mapped[str | None] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("user_id", "steam_app_id", name="uq_user_steam_wishlist"),
    )


class UserPlexServer(Base, TimestampMixin):
    __tablename__ = "user_plex_servers"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    machine_identifier: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    product: Mapped[str | None] = mapped_column(String(100))
    platform: Mapped[str | None] = mapped_column(String(100))
    base_url: Mapped[str | None] = mapped_column(String(2048))
    access_token: Mapped[str | None] = mapped_column(Text)
    owned: Mapped[bool] = mapped_column(default=False)
    selected: Mapped[bool] = mapped_column(default=True)

    __table_args__ = (
        UniqueConstraint("user_id", "machine_identifier", name="uq_user_plex_server"),
    )


class UserPlexLibrary(Base, TimestampMixin):
    __tablename__ = "user_plex_libraries"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    server_id: Mapped[otix_fk] = mapped_column(ForeignKey("user_plex_servers.id", ondelete="CASCADE"), nullable=False)
    section_key: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    library_type: Mapped[str] = mapped_column(String(20), nullable=False)
    selected: Mapped[bool] = mapped_column(default=True)

    __table_args__ = (
        UniqueConstraint("server_id", "section_key", name="uq_user_plex_library"),
    )


class UserPlexItem(Base, TimestampMixin):
    __tablename__ = "user_plex_items"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    server_id: Mapped[otix_fk] = mapped_column(ForeignKey("user_plex_servers.id", ondelete="CASCADE"), nullable=False)
    library_id: Mapped[otix_fk | None] = mapped_column(ForeignKey("user_plex_libraries.id", ondelete="SET NULL"), nullable=True)
    media_item_id: Mapped[otix_fk | None] = mapped_column(ForeignKey("media_items.id", ondelete="SET NULL"), nullable=True)
    rating_key: Mapped[str] = mapped_column(String(128), nullable=False)
    guid: Mapped[str | None] = mapped_column(String(512))
    media_type: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(1000), nullable=False)
    year: Mapped[int | None] = mapped_column(Integer)
    thumb_url: Mapped[str | None] = mapped_column(String(2048))
    viewed: Mapped[bool] = mapped_column(default=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    view_offset: Mapped[int | None] = mapped_column(Integer)
    duration: Mapped[int | None] = mapped_column(Integer)
    last_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    guids: Mapped[list | None] = mapped_column(JSONB)
    raw: Mapped[dict | None] = mapped_column(JSONB)

    __table_args__ = (
        UniqueConstraint("server_id", "rating_key", name="uq_user_plex_item"),
    )
