from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.media import MediaItem


class Person(Base):
    __tablename__ = "people"

    id: Mapped[otix_pk]
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    tmdb_id: Mapped[int | None] = mapped_column(Integer, unique=True)
    imdb_id: Mapped[str | None] = mapped_column(String(20), unique=True)
    musicbrainz_artist_id: Mapped[str | None] = mapped_column(String(36), unique=True)
    spotify_artist_id: Mapped[str | None] = mapped_column(String(50), unique=True)
    photo_url: Mapped[str | None] = mapped_column(String(2000))
    logo_url: Mapped[str | None] = mapped_column(String(2000))
    biography: Mapped[str | None] = mapped_column(Text)
    birthday: Mapped[date | None] = mapped_column(Date)
    deathday: Mapped[date | None] = mapped_column(Date)
    place_of_birth: Mapped[str | None] = mapped_column(String(500))
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hash_match_count: Mapped[int] = mapped_column(Integer, default=0)

    credits: Mapped[list[MediaCredit]] = relationship("MediaCredit", back_populates="person")
    assets: Mapped[list[PersonAsset]] = relationship("PersonAsset", back_populates="person")


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
