from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.media import MediaItem, Movie


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[otix_pk]
    tmdb_id: Mapped[int | None] = mapped_column(Integer, unique=True)
    name: Mapped[str] = mapped_column(String(1000), nullable=False)
    overview: Mapped[str | None] = mapped_column(Text)
    poster_url: Mapped[str | None] = mapped_column(String(2000))
    backdrop_url: Mapped[str | None] = mapped_column(String(2000))

    movies: Mapped[list[Movie]] = relationship("Movie", back_populates="collection")
    items: Mapped[list[CollectionItem]] = relationship("CollectionItem", back_populates="collection")


class CollectionItem(Base):
    __tablename__ = "collection_items"

    collection_id: Mapped[otix_fk] = mapped_column(ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True)
    media_item_id: Mapped[otix_fk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"), primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    collection: Mapped[Collection] = relationship("Collection", back_populates="items")
    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="collection_items")
