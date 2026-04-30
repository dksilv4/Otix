from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
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
    photo_url: Mapped[str | None] = mapped_column(String(2000))

    credits: Mapped[list[MediaCredit]] = relationship("MediaCredit", back_populates="person")


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
