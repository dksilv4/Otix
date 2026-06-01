from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Integer, String, Text, ForeignKey
from sqlalchemy.orm import Mapped, foreign, mapped_column, relationship

from otix.domain.base import Base, ExternalIDDescriptor, HasExternalIDs, TimestampMixin, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.collection import Collection
    from otix.domain.media import ExternalID, Game, MediaItem


class Franchise(Base, TimestampMixin, HasExternalIDs):
    __tablename__ = "franchises"
    __external_id_entity_type__ = "franchise"

    id: Mapped[otix_pk]
    name: Mapped[str] = mapped_column(String(1000), nullable=False)
    slug: Mapped[str] = mapped_column(String(1000), nullable=False)
    overview: Mapped[str | None] = mapped_column(Text)

    igdb_franchise_id = ExternalIDDescriptor("igdb_franchise", cast_type=int)
    tmdb_collection_id = ExternalIDDescriptor("tmdb_collection", cast_type=int)

    _external_ids: Mapped[list[ExternalID]] = relationship(
        "ExternalID",
        primaryjoin="and_(foreign(ExternalID.entity_id) == Franchise.id, "
                    "ExternalID.entity_type == 'franchise')",
        lazy="raise",
        viewonly=True,
    )

    collections: Mapped[list[Collection]] = relationship(
        "Collection", back_populates="franchise"
    )
    games: Mapped[list[Game]] = relationship("Game", back_populates="franchise")
    items: Mapped[list[FranchiseItem]] = relationship(
        "FranchiseItem", back_populates="franchise"
    )


class FranchiseItem(Base):
    __tablename__ = "franchise_items"

    franchise_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("franchises.id", ondelete="CASCADE"), primary_key=True
    )
    media_item_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("media_items.id", ondelete="CASCADE"), primary_key=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    franchise: Mapped[Franchise] = relationship("Franchise", back_populates="items")
    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="franchise_items")
