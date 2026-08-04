# TODO: Review this file
from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.asset import ExternalRating, MediaAsset, MediaRelease, MediaVideo
from otix.domain.base import Base, ExternalIDDescriptor, HasExternalIDs, TimestampMixin, otix_fk, otix_pk
from otix.domain.genre import MediaGenre, MediaKeyword
from otix.domain.interaction import UserMediaInteraction

if TYPE_CHECKING:
    from otix.domain.collection import Collection, CollectionItem
    from otix.domain.company import InvolvedCompany
    from otix.domain.episode_interaction import UserEpisodeInteraction
    from otix.domain.franchise import Franchise, FranchiseItem
    from otix.domain.media_rating import MediaItemRating
    from otix.domain.people import MediaCredit
    from otix.domain.review import Review
    from otix.domain.user import User
    from otix.domain.watch_provider import MediaWatchProvider


class MediaItem(Base, TimestampMixin):
    __tablename__ = "media_items"

    id: Mapped[otix_pk]
    media_type: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(1000), nullable=False)
    overview: Mapped[str | None] = mapped_column(Text)
    slug: Mapped[str] = mapped_column(String(1000), nullable=False)
    @hybrid_property
    def poster_url(self) -> str | None:
        """Best poster URL, attached at query time by asset_selection."""
        return getattr(self, "_resolved_poster_url", None)

    @hybrid_property
    def textless_poster_url(self) -> str | None:
        """Best textless poster URL (falls back to backdrop_url for a clean textless canvas), attached at query time by asset_selection."""
        return getattr(self, "_resolved_textless_poster_url", None) or getattr(self, "_resolved_backdrop_url", None)

    @hybrid_property
    def backdrop_url(self) -> str | None:
        """Best backdrop URL, attached at query time by asset_selection."""
        return getattr(self, "_resolved_backdrop_url", None)

    @hybrid_property
    def logo_url(self) -> str | None:
        """Best logo URL, attached at query time by asset_selection."""
        return getattr(self, "_resolved_logo_url", None)

    @hybrid_property
    def icon_url(self) -> str | None:
        """Best icon URL, attached at query time by asset_selection."""
        return getattr(self, "_resolved_icon_url", None)
    release_date: Mapped[date | None] = mapped_column()
    popularity: Mapped[float] = mapped_column(Float, default=0.0)
    original_language: Mapped[str | None] = mapped_column(String(10))
    completeness_score: Mapped[float] = mapped_column(Float, default=0.0)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(384), nullable=True)
    avg_rating: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    overall_rating: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    overall_rating_source: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    watchlist_count: Mapped[int] = mapped_column(Integer, default=0)
    watched_count: Mapped[int] = mapped_column(Integer, default=0)
    played_count: Mapped[int] = mapped_column(Integer, default=0)
    started_count: Mapped[int] = mapped_column(Integer, default=0)
    listened_count: Mapped[int] = mapped_column(Integer, default=0)
    view_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_adult: Mapped[bool] = mapped_column(Boolean, default=False)

    @property
    def new_season_released(self) -> bool:
        if self.media_type != "show":
            return False
        if "show" not in self.__dict__ or self.show is None:
            return False
        show = self.show
        if not show.last_air_date or not show.number_of_seasons or show.number_of_seasons <= 1:
            return False
        delta = date.today() - show.last_air_date
        return delta.days <= 60

    @property
    def new_season_release_date(self) -> date | None:
        if not self.new_season_released:
            return None
        return self.show.last_air_date

    __table_args__ = (
        CheckConstraint("media_type IN ('movie', 'show', 'game', 'music')", name="ck_media_type"),
        CheckConstraint("completeness_score >= 0 AND completeness_score <= 1", name="ck_completeness_score"),
        Index(
            "ix_media_items_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    # Type-specific backrefs
    movie: Mapped[Movie | None] = relationship("Movie", back_populates="media_item", uselist=False)
    show: Mapped[Show | None] = relationship("Show", back_populates="media_item", uselist=False)
    game: Mapped[Game | None] = relationship("Game", back_populates="media_item", uselist=False, foreign_keys="[Game.media_item_id]")
    album: Mapped[Album | None] = relationship("Album", back_populates="media_item", uselist=False)

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
    ratings: Mapped[list[MediaItemRating]] = relationship("MediaItemRating", back_populates="media_item")
    collection_items: Mapped[list[CollectionItem]] = relationship("CollectionItem", back_populates="media_item")
    franchise_items: Mapped[list[FranchiseItem]] = relationship("FranchiseItem", back_populates="media_item")
    external_ids: Mapped[list[ExternalID]] = relationship(
        "ExternalID",
        back_populates="media_item",
        primaryjoin="and_(foreign(ExternalID.entity_id) == MediaItem.id, ExternalID.entity_type == 'media_item')",
    )
    platforms: Mapped[list[MediaPlatform]] = relationship("MediaPlatform", back_populates="media_item")
    game_modes: Mapped[list[MediaGameMode]] = relationship("MediaGameMode", back_populates="media_item")
    watch_providers: Mapped[list[MediaWatchProvider]] = relationship("MediaWatchProvider", back_populates="media_item")


class Movie(Base):
    __tablename__ = "movies"

    media_item_id: Mapped[otix_pk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"))
    runtime: Mapped[int | None] = mapped_column(Integer)
    budget: Mapped[int | None] = mapped_column(BigInteger)
    revenue: Mapped[int | None] = mapped_column(BigInteger)
    tagline: Mapped[str | None] = mapped_column(String(1000))
    is_anime: Mapped[bool] = mapped_column(default=False)
    collection_id: Mapped[str | None] = mapped_column(String(16), ForeignKey("collections.id"))

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="movie")
    collection: Mapped[Collection | None] = relationship("Collection", back_populates="movies")


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
    seasons: Mapped[list[Season]] = relationship("Season", back_populates="show")


class Season(Base):
    __tablename__ = "seasons"

    id: Mapped[otix_pk]
    show_id: Mapped[otix_fk] = mapped_column(ForeignKey("shows.media_item_id", ondelete="CASCADE"))
    season_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str | None] = mapped_column(String(1000))
    overview: Mapped[str | None] = mapped_column(Text)
    poster_url: Mapped[str | None] = mapped_column(String(2000))

    show: Mapped[Show] = relationship("Show", back_populates="seasons")
    episodes: Mapped[list[Episode]] = relationship("Episode", back_populates="season")


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
    external_ratings: Mapped[list[ExternalRating]] = relationship("ExternalRating", back_populates="episode")
    episode_interactions: Mapped[list[UserEpisodeInteraction]] = relationship(
        "UserEpisodeInteraction", back_populates="episode"
    )


class Game(Base, HasExternalIDs):
    __tablename__ = "games"
    __external_id_entity_type__ = "media_item"

    media_item_id: Mapped[otix_pk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"))
    release_status: Mapped[str | None] = mapped_column(String(50))
    website: Mapped[str | None] = mapped_column(String(2000))

    steam_app_id = ExternalIDDescriptor("steam", cast_type=int, entity_id_attr="media_item_id")

    current_players: Mapped[int | None] = mapped_column(Integer)
    price_json: Mapped[dict | None] = mapped_column(JSONB)
    recommendations: Mapped[int | None] = mapped_column(Integer)
    review_summary: Mapped[str | None] = mapped_column(String(200))
    is_free: Mapped[bool] = mapped_column(default=False)
    has_multiplayer: Mapped[bool] = mapped_column(default=False)
    franchise_id: Mapped[str | None] = mapped_column(ForeignKey("franchises.id", ondelete="SET NULL"), nullable=True)
    game_type: Mapped[str | None] = mapped_column(String(50), nullable=True, default="main_game")
    parent_game_id: Mapped[str | None] = mapped_column(ForeignKey("media_items.id", ondelete="SET NULL"), nullable=True)
    parent_game_title: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    _external_ids: Mapped[list[ExternalID]] = relationship(
        "ExternalID",
        primaryjoin="and_(foreign(ExternalID.entity_id) == Game.media_item_id, ExternalID.entity_type == 'media_item')",
        lazy="raise",
        viewonly=True,
    )

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="game", foreign_keys="Game.media_item_id")
    franchise: Mapped[Franchise | None] = relationship("Franchise", back_populates="games")

    @property
    def is_dlc(self) -> bool:
        return self.game_type in ("dlc_addon", "expansion", "standalone_expansion", "pack")

    @property
    def is_beta(self) -> bool:
        return self.game_type == "beta" or self.release_status in ("alpha", "beta", "early_access")

    @property
    def is_demo(self) -> bool:
        return self.game_type == "demo"

    @property
    def is_expansion(self) -> bool:
        return self.game_type in ("expansion", "standalone_expansion")

    @property
    def is_mod(self) -> bool:
        return self.game_type == "mod"

    @property
    def is_soundtrack(self) -> bool:
        return self.game_type == "soundtrack"

    @property
    def is_bundle(self) -> bool:
        return self.game_type in ("bundle", "pack")

    @property
    def store_ids(self) -> dict | None:
        """Reconstruct store IDs from ExternalID entries for non-steam store providers."""
        store_providers = {
            "steam",
            "gog",
            "origin",
            "uplay",
            "bnet",
            "eshop",
            "xbox",
            "playstation",
            "nintendo",
            "itchio",
            "stadia",
        }
        result: dict[str, str] = {}
        for eid in self._external_ids:
            if eid.provider in store_providers:
                result[eid.provider] = eid.external_id
        return result or None


class Album(Base, HasExternalIDs):
    __tablename__ = "albums"
    __external_id_entity_type__ = "media_item"

    media_item_id: Mapped[otix_pk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"))
    release_type: Mapped[str] = mapped_column(String(20), default="album")
    format: Mapped[str | None] = mapped_column(String(50))
    catalog_number: Mapped[str | None] = mapped_column(String(100))
    barcode: Mapped[str | None] = mapped_column(String(50))
    track_count: Mapped[int] = mapped_column(Integer, default=0)
    disc_count: Mapped[int] = mapped_column(Integer, default=0)
    duration_ms: Mapped[int | None] = mapped_column(Integer)

    spotify_id = ExternalIDDescriptor("spotify", cast_type=str, entity_id_attr="media_item_id")
    musicbrainz_id = ExternalIDDescriptor("musicbrainz", cast_type=str, entity_id_attr="media_item_id")
    musicbrainz_release_group_id = ExternalIDDescriptor(
        "musicbrainz_release_group", cast_type=str, entity_id_attr="media_item_id"
    )

    spotify_url: Mapped[str | None] = mapped_column(String(500))
    spotify_popularity: Mapped[int | None] = mapped_column(Integer)
    preview_url: Mapped[str | None] = mapped_column(String(500))
    audio_features: Mapped[dict | None] = mapped_column(JSONB)

    _external_ids: Mapped[list[ExternalID]] = relationship(
        "ExternalID",
        primaryjoin="and_(foreign(ExternalID.entity_id) == Album.media_item_id, ExternalID.entity_type == 'media_item')",
        lazy="raise",
        viewonly=True,
    )

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="album")
    tracks: Mapped[list[Track]] = relationship("Track", back_populates="album")


class Track(Base, TimestampMixin, HasExternalIDs):
    __tablename__ = "tracks"
    __external_id_entity_type__ = "track"

    id: Mapped[otix_pk]
    album_id: Mapped[otix_fk] = mapped_column(ForeignKey("albums.media_item_id", ondelete="CASCADE"), nullable=False)
    track_number: Mapped[int] = mapped_column(Integer, nullable=False)
    disc_number: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    preview_url: Mapped[str | None] = mapped_column(String(500))

    spotify_id = ExternalIDDescriptor("spotify", cast_type=str)
    musicbrainz_recording_id = ExternalIDDescriptor("musicbrainz_recording", cast_type=str)
    isrc = ExternalIDDescriptor("isrc", cast_type=str)

    audio_features: Mapped[dict | None] = mapped_column(JSONB)
    lyrics: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    avg_rating: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    rating_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    _external_ids: Mapped[list[ExternalID]] = relationship(
        "ExternalID",
        primaryjoin="and_(foreign(ExternalID.entity_id) == Track.id, ExternalID.entity_type == 'track')",
        lazy="raise",
        viewonly=True,
    )

    album: Mapped[Album] = relationship("Album", back_populates="tracks")
    ratings: Mapped[list[TrackRating]] = relationship("TrackRating", back_populates="track")


class TrackRating(Base, TimestampMixin):
    __tablename__ = "track_ratings"

    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    track_id: Mapped[otix_fk] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"), primary_key=True)
    score: Mapped[int] = mapped_column(Integer, nullable=False)

    track: Mapped[Track] = relationship("Track", back_populates="ratings")
    user: Mapped[User] = relationship("User")

    __table_args__ = (CheckConstraint("score >= 1 AND score <= 10", name="ck_track_rating_score_range"),)


class ExternalID(Base):
    __tablename__ = "external_ids"

    id: Mapped[otix_pk]
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    external_id: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    media_item_id: Mapped[otix_fk | None] = mapped_column(
        ForeignKey("media_items.id", ondelete="CASCADE"), nullable=True
    )
    media_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    is_adult: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hash_match_count: Mapped[int] = mapped_column(Integer, default=0)
    confirmed_count: Mapped[int] = mapped_column(Integer, default=0)
    confirmed_by: Mapped[list[str]] = mapped_column(ARRAY(String(30)), default=list)
    last_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    media_item: Mapped[MediaItem | None] = relationship(
        "MediaItem",
        back_populates="external_ids",
        primaryjoin="and_(foreign(ExternalID.entity_id) == MediaItem.id, ExternalID.entity_type == 'media_item')",
        viewonly=True,
    )

    __table_args__ = (
        UniqueConstraint("provider", "external_id", "entity_type", name="uq_external_id_provider_ext"),
        Index("ix_external_ids_stubs", "provider", "media_item_id", "is_adult", "created_at"),
        Index("ix_external_id_entity", "entity_type", "entity_id"),
    )


class MatchSkip(Base):
    """Track rejected match suggestions so they aren't re-suggested on re-scan.

    When a user permanently rejects all match candidates for a game,
    a row is inserted here. Phase 1 of the matching pipeline checks
    this table and skips known-rejected external IDs.
    """

    __tablename__ = "match_skips"

    id: Mapped[otix_pk]
    provider: Mapped[str] = mapped_column(String(30), nullable=False)  # "epic", "steam", etc.
    external_id: Mapped[str] = mapped_column(String(100), nullable=False)
    skipped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    user_id: Mapped[otix_fk | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )  # None = global skip across all users

    __table_args__ = (
        UniqueConstraint("provider", "external_id", name="uq_match_skip_provider_ext"),
        Index("ix_match_skip_provider_ext", "provider", "external_id"),
    )


class TMDBDeletedID(Base):
    __tablename__ = "tmdb_deleted_ids"

    id: Mapped[otix_pk]
    tmdb_id: Mapped[int] = mapped_column(Integer, nullable=False)
    media_type: Mapped[str] = mapped_column(String(10), nullable=False)
    media_item_id: Mapped[otix_fk | None] = mapped_column(
        ForeignKey("media_items.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str | None] = mapped_column(String(1000))
    detection_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    media_item: Mapped[MediaItem | None] = relationship("MediaItem")

    __table_args__ = (UniqueConstraint("tmdb_id", "media_type", name="uq_tmdb_deleted_id"),)


class Platform(Base, HasExternalIDs):
    __tablename__ = "platforms"
    __external_id_entity_type__ = "platform"

    id: Mapped[otix_pk]
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)

    igdb_id = ExternalIDDescriptor("igdb", cast_type=int)

    logo_image_id: Mapped[str | None] = mapped_column(String(100))

    _external_ids: Mapped[list[ExternalID]] = relationship(
        "ExternalID",
        primaryjoin="and_(foreign(ExternalID.entity_id) == Platform.id, ExternalID.entity_type == 'platform')",
        lazy="raise",
        viewonly=True,
    )


class MediaPlatform(Base):
    __tablename__ = "media_platforms"

    id: Mapped[otix_pk]
    media_item_id: Mapped[otix_fk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"), nullable=False)
    platform_id: Mapped[otix_fk] = mapped_column(ForeignKey("platforms.id", ondelete="CASCADE"), nullable=False)

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="platforms")
    platform: Mapped[Platform] = relationship("Platform")

    __table_args__ = (UniqueConstraint("media_item_id", "platform_id", name="uq_media_platform"),)


class GameMode(Base):
    __tablename__ = "game_modes"

    id: Mapped[otix_pk]
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)


class MediaGameMode(Base):
    __tablename__ = "media_game_modes"

    id: Mapped[otix_pk]
    media_item_id: Mapped[otix_fk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"), nullable=False)
    game_mode_id: Mapped[otix_fk] = mapped_column(ForeignKey("game_modes.id", ondelete="CASCADE"), nullable=False)

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="game_modes")
    game_mode: Mapped[GameMode] = relationship("GameMode")

    __table_args__ = (UniqueConstraint("media_item_id", "game_mode_id", name="uq_media_game_mode"),)


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

    __table_args__ = (UniqueConstraint("user_id", "steam_app_id", name="uq_user_steam_game"),)


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

    __table_args__ = (UniqueConstraint("user_id", "steam_app_id", name="uq_user_steam_wishlist"),)


class UserPlexServer(Base, TimestampMixin):
    __tablename__ = "user_plex_servers"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    machine_identifier: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    product: Mapped[str | None] = mapped_column(String(100))
    platform: Mapped[str | None] = mapped_column(String(100))
    base_url: Mapped[str | None] = mapped_column(String(2048))
    fallback_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    access_token: Mapped[str | None] = mapped_column(Text)
    owned: Mapped[bool] = mapped_column(default=False)
    selected: Mapped[bool] = mapped_column(default=True)

    __table_args__ = (UniqueConstraint("user_id", "machine_identifier", name="uq_user_plex_server"),)


class UserPlexLibrary(Base, TimestampMixin):
    __tablename__ = "user_plex_libraries"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    server_id: Mapped[otix_fk] = mapped_column(ForeignKey("user_plex_servers.id", ondelete="CASCADE"), nullable=False)
    section_key: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    library_type: Mapped[str] = mapped_column(String(20), nullable=False)
    selected: Mapped[bool] = mapped_column(default=True)

    __table_args__ = (UniqueConstraint("server_id", "section_key", name="uq_user_plex_library"),)


class UserPlexItem(Base, TimestampMixin):
    __tablename__ = "user_plex_items"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    server_id: Mapped[otix_fk] = mapped_column(ForeignKey("user_plex_servers.id", ondelete="CASCADE"), nullable=False)
    library_id: Mapped[otix_fk | None] = mapped_column(
        ForeignKey("user_plex_libraries.id", ondelete="SET NULL"), nullable=True
    )
    media_item_id: Mapped[otix_fk | None] = mapped_column(
        ForeignKey("media_items.id", ondelete="SET NULL"), nullable=True
    )
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

    __table_args__ = (UniqueConstraint("server_id", "rating_key", name="uq_user_plex_item"),)


class UserLocalGame(Base, TimestampMixin):
    """Games detected on the user's desktop machine via the game scanner.

    Synced from the Electron app after each scan. Used to persist match state
    server-side so it survives client-side storage clears.
    """

    __tablename__ = "user_local_games"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(1000), nullable=False)
    platform: Mapped[str] = mapped_column(String(50), nullable=False)
    media_item_id: Mapped[otix_fk | None] = mapped_column(
        ForeignKey("media_items.id", ondelete="SET NULL"), nullable=True
    )
    match_suggestion_media_id: Mapped[otix_fk | None] = mapped_column(
        ForeignKey("media_items.id", ondelete="SET NULL"), nullable=True
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (UniqueConstraint("user_id", "title", "platform", name="uq_user_local_game"),)


class GameSavePathSuggestion(Base, TimestampMixin):
    __tablename__ = "game_save_path_suggestions"

    id: Mapped[otix_pk]
    game_id: Mapped[otix_fk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    platform: Mapped[str] = mapped_column(String(50), nullable=False)
    path_pattern: Mapped[str] = mapped_column(String(2000), nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "game_id", "platform", name="uq_user_game_platform_suggestion"),)


class GameSaveOfficialPath(Base, TimestampMixin):
    __tablename__ = "game_save_official_paths"

    id: Mapped[otix_pk]
    game_id: Mapped[otix_fk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"), nullable=False)
    platform: Mapped[str] = mapped_column(String(50), nullable=False)
    path_pattern: Mapped[str] = mapped_column(String(2000), nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (UniqueConstraint("game_id", "platform", name="uq_game_platform_official_path"),)
