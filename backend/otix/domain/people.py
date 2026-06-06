# TODO: Review this file
from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, foreign, mapped_column, relationship

from otix.domain.base import Base, ExternalIDDescriptor, HasExternalIDs, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.media import ExternalID, MediaItem
    from otix.domain.user import User


class Person(Base, HasExternalIDs):
    __tablename__ = "people"
    __external_id_entity_type__ = "person"

    id: Mapped[otix_pk]
    name: Mapped[str] = mapped_column(String(500), nullable=False)

    tmdb_id = ExternalIDDescriptor("tmdb", cast_type=int)
    imdb_id = ExternalIDDescriptor("imdb", cast_type=str)
    musicbrainz_artist_id = ExternalIDDescriptor("musicbrainz_artist", cast_type=str)
    spotify_artist_id = ExternalIDDescriptor("spotify", cast_type=str)
    wikidata_id = ExternalIDDescriptor("wikidata", cast_type=str)
    youtube_channel_id = ExternalIDDescriptor("youtube_channel", cast_type=str)

    youtube_channel_title: Mapped[str | None] = mapped_column(String(500))
    spotify_follower_count: Mapped[int | None] = mapped_column(Integer)
    spotify_popularity: Mapped[int | None] = mapped_column(Integer)
    spotify_genres: Mapped[list | None] = mapped_column(JSONB)
    spotify_image_url: Mapped[str | None] = mapped_column(String(2000))
    photo_url: Mapped[str | None] = mapped_column(String(2000))
    logo_url: Mapped[str | None] = mapped_column(String(2000))
    biography: Mapped[str | None] = mapped_column(Text)
    birthday: Mapped[date | None] = mapped_column(Date)
    deathday: Mapped[date | None] = mapped_column(Date)
    place_of_birth: Mapped[str | None] = mapped_column(String(500))
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    spotify_related_crawled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hash_match_count: Mapped[int] = mapped_column(Integer, default=0)

    _external_ids: Mapped[list[ExternalID]] = relationship(
        "ExternalID",
        primaryjoin="and_(foreign(ExternalID.entity_id) == Person.id, "
                    "ExternalID.entity_type == 'person')",
        lazy="raise",
        viewonly=True,
    )

    credits: Mapped[list[MediaCredit]] = relationship("MediaCredit", back_populates="person")
    assets: Mapped[list[PersonAsset]] = relationship("PersonAsset", back_populates="person")
    followers: Mapped[list[UserPersonFollow]] = relationship("UserPersonFollow", back_populates="person")
    ratings: Mapped[list[PersonRating]] = relationship("PersonRating", back_populates="person")


class PersonAsset(Base):
    __tablename__ = "person_assets"

    id: Mapped[otix_pk]
    person_id: Mapped[otix_fk] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"), nullable=False)
    url: Mapped[str] = mapped_column(String(2000), nullable=False, unique=True)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    provider: Mapped[str | None] = mapped_column(String(20))

    person: Mapped[Person] = relationship("Person", back_populates="assets")


class MediaCredit(Base):
    __tablename__ = "media_credits"

    id: Mapped[otix_pk]
    media_item_id: Mapped[otix_fk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"))
    person_id: Mapped[otix_fk] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    character_name: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="credits")
    person: Mapped[Person] = relationship("Person", back_populates="credits")


class UserPersonFollow(Base):
    __tablename__ = "user_person_follows"

    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    person_id: Mapped[otix_fk] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship("User", back_populates="person_follows")
    person: Mapped[Person] = relationship("Person", back_populates="followers")


class PersonRating(Base):
    __tablename__ = "person_ratings"

    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    person_id: Mapped[otix_fk] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    score: Mapped[int] = mapped_column(Integer, nullable=False)

    person: Mapped[Person] = relationship("Person", back_populates="ratings")
    user: Mapped[User] = relationship("User")

    __table_args__ = (
        CheckConstraint("score >= 1 AND score <= 10", name="ck_person_rating_score_range"),
    )
