from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, foreign, mapped_column, relationship

from otix.domain.base import Base, ExternalIDDescriptor, HasExternalIDs, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.media import ExternalID


class WatchProvider(Base, HasExternalIDs):
    """Streaming / rental / purchase provider (Netflix, Prime, Hulu, etc.)."""

    __tablename__ = "watch_providers"
    __external_id_entity_type__ = "watch_provider"

    id: Mapped[otix_pk]
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(2000))
    display_priority: Mapped[int] = mapped_column(Integer, default=0)

    tmdb_provider_id = ExternalIDDescriptor("tmdb", cast_type=int)

    _external_ids: Mapped[list[ExternalID]] = relationship(
        "ExternalID",
        primaryjoin="and_(foreign(ExternalID.entity_id) == WatchProvider.id, "
                    "ExternalID.entity_type == 'watch_provider')",
        lazy="raise",
        viewonly=True,
    )

    __table_args__ = (
        UniqueConstraint("slug", name="uq_watch_provider_slug"),
    )


class MediaWatchProvider(Base):
    """Join table: a media item is available on a watch provider in a country.

    offering_type is one of: flatrate, rent, buy, free, ads.
    """

    __tablename__ = "media_watch_providers"

    id: Mapped[otix_pk]
    media_item_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("media_items.id", ondelete="CASCADE"), nullable=False
    )
    watch_provider_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("watch_providers.id", ondelete="CASCADE"), nullable=False
    )
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    offering_type: Mapped[str] = mapped_column(String(20), nullable=False)
    url: Mapped[str | None] = mapped_column(String(2000))
    display_priority: Mapped[int] = mapped_column(Integer, default=0)

    watch_provider: Mapped[WatchProvider] = relationship("WatchProvider")
    media_item: Mapped["MediaItem"] = relationship("MediaItem", back_populates="watch_providers")

    __table_args__ = (
        UniqueConstraint(
            "media_item_id",
            "watch_provider_id",
            "country_code",
            "offering_type",
            name="uq_media_watch_provider",
        ),
    )
