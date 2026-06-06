# TODO: Review this file
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, foreign, mapped_column, relationship

from otix.domain.base import Base, ExternalIDDescriptor, HasExternalIDs, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.media import ExternalID, MediaItem


class Genre(Base):
    __tablename__ = "genres"

    id: Mapped[otix_pk]
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)

    media_items: Mapped[list[MediaGenre]] = relationship("MediaGenre", back_populates="genre")


class Keyword(Base, HasExternalIDs):
    __tablename__ = "keywords"
    __external_id_entity_type__ = "keyword"

    id: Mapped[otix_pk]
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)

    tmdb_id = ExternalIDDescriptor("tmdb", cast_type=int)

    _external_ids: Mapped[list[ExternalID]] = relationship(
        "ExternalID",
        primaryjoin="and_(foreign(ExternalID.entity_id) == Keyword.id, "
                    "ExternalID.entity_type == 'keyword')",
        lazy="raise",
        viewonly=True,
    )

    media_items: Mapped[list[MediaKeyword]] = relationship("MediaKeyword", back_populates="keyword")


class MediaGenre(Base):
    __tablename__ = "media_genres"

    media_item_id: Mapped[otix_fk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"), primary_key=True)
    genre_id: Mapped[otix_fk] = mapped_column(ForeignKey("genres.id", ondelete="CASCADE"), primary_key=True)

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="genres")
    genre: Mapped[Genre] = relationship("Genre", back_populates="media_items")


class MediaKeyword(Base):
    __tablename__ = "media_keywords"

    media_item_id: Mapped[otix_fk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"), primary_key=True)
    keyword_id: Mapped[otix_fk] = mapped_column(ForeignKey("keywords.id", ondelete="CASCADE"), primary_key=True)

    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="keywords")
    keyword: Mapped[Keyword] = relationship("Keyword", back_populates="media_items")
