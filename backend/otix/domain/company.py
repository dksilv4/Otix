from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.media import MediaItem


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[otix_pk]
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    slug: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    igdb_id: Mapped[int | None] = mapped_column(Integer, unique=True)
    tmdb_id: Mapped[int | None] = mapped_column(Integer, unique=True)
    logo_url: Mapped[str | None] = mapped_column(String(2000))
    origin_country: Mapped[str | None] = mapped_column(String(10))

    involved_companies: Mapped[list[InvolvedCompany]] = relationship(
        "InvolvedCompany", back_populates="company"
    )


class InvolvedCompany(Base):
    __tablename__ = "involved_companies"

    id: Mapped[otix_pk]
    media_item_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("media_items.id", ondelete="CASCADE"), nullable=False
    )
    company_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )

    developer: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    publisher: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    porting: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    supporting: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    media_item: Mapped[MediaItem] = relationship(
        "MediaItem", back_populates="involved_companies"
    )
    company: Mapped[Company] = relationship(
        "Company", back_populates="involved_companies"
    )
