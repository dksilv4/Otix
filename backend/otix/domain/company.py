# TODO: Review this file
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from otix.domain.base import Base, ExternalIDDescriptor, HasExternalIDs, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.media import ExternalID, MediaItem
    from otix.domain.user import User


class Company(Base, HasExternalIDs):
    __tablename__ = "companies"
    __external_id_entity_type__ = "company"

    id: Mapped[otix_pk]
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    slug: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)

    igdb_id = ExternalIDDescriptor("igdb", cast_type=int)
    tmdb_id = ExternalIDDescriptor("tmdb", cast_type=int)

    logo_url: Mapped[str | None] = mapped_column(String(2000))
    origin_country: Mapped[str | None] = mapped_column(String(10))
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1024), nullable=True)

    __table_args__ = (
        Index(
            "ix_companies_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    _external_ids: Mapped[list[ExternalID]] = relationship(
        "ExternalID",
        primaryjoin="and_(foreign(ExternalID.entity_id) == Company.id, "
                    "ExternalID.entity_type == 'company')",
        lazy="raise",
        viewonly=True,
    )

    involved_companies: Mapped[list[InvolvedCompany]] = relationship(
        "InvolvedCompany", back_populates="company"
    )
    followers: Mapped[list[UserCompanyFollow]] = relationship("UserCompanyFollow", back_populates="company")
    ratings: Mapped[list[CompanyRating]] = relationship("CompanyRating", back_populates="company")


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
    production: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    media_item: Mapped[MediaItem] = relationship(
        "MediaItem", back_populates="involved_companies"
    )
    company: Mapped[Company] = relationship(
        "Company", back_populates="involved_companies"
    )


class UserCompanyFollow(Base):
    __tablename__ = "user_company_follows"

    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    company_id: Mapped[otix_fk] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship("User", back_populates="company_follows")
    company: Mapped[Company] = relationship("Company", back_populates="followers")


class CompanyRating(Base):
    __tablename__ = "company_ratings"

    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    company_id: Mapped[otix_fk] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True)
    score: Mapped[int] = mapped_column(Integer, nullable=False)

    company: Mapped[Company] = relationship("Company", back_populates="ratings")
    user: Mapped[User] = relationship("User")

    __table_args__ = (
        CheckConstraint("score >= 1 AND score <= 10", name="ck_company_rating_score_range"),
    )
