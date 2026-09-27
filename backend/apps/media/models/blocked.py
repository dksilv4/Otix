"""Blocked recommendation model.

Allows users to block specific media items from appearing in "Decide for me"
and "For You" recommendations.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class BlockedRecommendation(TimestampedModel):
    """A media item blocked by a user from recommendations."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blocked_recommendations",
    )
    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.CASCADE,
        related_name="blocked_recommendations",
    )

    class Meta(TimestampedModel.Meta):
        db_table = "blocked_recommendations"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "media_item"],
                name="uq_blocked_recommendation_user_media",
            )
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.media_item_id}"
