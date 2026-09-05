"""Per-user 1-10 ratings of media items.

Ported from the legacy ``media_rating.py`` domain module (table
``media_item_ratings``). The composite key (``user_id``, ``media_item_id``)
becomes a surrogate id plus a uniqueness constraint, matching the frozen
``people.PersonRating`` / ``company.CompanyRating`` convention.
"""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class MediaItemRating(TimestampedModel):
    """A user's 1-10 rating of a media item (one per user per item)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="media_ratings"
    )
    media_item = models.ForeignKey(
        "media.MediaItem", on_delete=models.CASCADE, related_name="ratings"
    )
    score = models.IntegerField()

    class Meta(TimestampedModel.Meta):
        db_table = "media_item_ratings"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "media_item"], name="uq_media_item_rating_user_media_item"
            ),
            models.CheckConstraint(
                condition=models.Q(score__gte=1, score__lte=10),
                name="ck_media_item_rating_score_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.media_item_id}={self.score}"
