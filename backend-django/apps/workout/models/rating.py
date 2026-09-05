"""Per-user ratings: a rater scores another user 1-10.

Ported from ``UserRating`` in legacy ``backend/otix/domain/user.py``
(``user_ratings``). Both FKs point at the user model, so each carries a
distinct reverse ``related_name``.
"""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class UserRating(TimestampedModel):
    """A 1-10 rating a user gives another user."""

    rater = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ratings_given",
    )
    rated_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ratings_received",
    )
    score = models.IntegerField()

    class Meta(TimestampedModel.Meta):
        db_table = "user_ratings"
        constraints = [
            # Legacy composite PK (rater_id, rated_user_id) => surrogate id + unique.
            models.UniqueConstraint(
                fields=["rater", "rated_user"],
                name="uq_user_rating_rater_rated_user",
            ),
            models.CheckConstraint(
                condition=models.Q(score__gte=1, score__lte=10),
                name="ck_user_rating_score_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.rater_id}:{self.rated_user_id}={self.score}"
