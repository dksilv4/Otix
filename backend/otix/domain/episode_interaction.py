from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk

if TYPE_CHECKING:
    from otix.domain.media import Episode
    from otix.domain.user import User


class UserEpisodeInteraction(Base, TimestampMixin):
    __tablename__ = "user_episode_interactions"

    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    episode_id: Mapped[otix_fk] = mapped_column(ForeignKey("episodes.id", ondelete="CASCADE"), primary_key=True)

    user: Mapped[User] = relationship("User", back_populates="episode_interactions")
    episode: Mapped[Episode] = relationship("Episode", back_populates="episode_interactions")
