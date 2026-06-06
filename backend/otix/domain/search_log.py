# TODO: Review this file
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.user import User


class SearchLog(Base, TimestampMixin):
    __tablename__ = "search_logs"

    id: Mapped[otix_pk]
    query: Mapped[str] = mapped_column(String(500), nullable=False)
    media_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    sort_by: Mapped[str | None] = mapped_column(String(20), nullable=True)
    page: Mapped[int] = mapped_column(Integer, nullable=False)
    page_size: Mapped[int] = mapped_column(Integer, nullable=False)
    result_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    items_returned: Mapped[int] = mapped_column(Integer, nullable=False)
    tracks_returned: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    backfill_triggered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cache_hit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    query_embedding_available: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    user_id: Mapped[otix_fk | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_bot: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user: Mapped[User | None] = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        # Index for text search on query field (gap analysis queries)
        # index on user_id already created above inline
        # index on result_count for zero/low-result analysis
    )
