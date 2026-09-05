"""Text reviews of media items and the up/down votes on them.

Ported from the legacy ``review.py`` / ``review_vote.py`` domain modules. The
legacy ``reviews`` composite key (``user_id``, ``media_item_id``) becomes a
surrogate id plus a uniqueness constraint; ``review_votes`` then FK the review
row by its surrogate id (legacy referenced the composite via two bare columns
without a foreign key).
"""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel

VOTE_TYPE_VALUES = ("up", "down")


class Review(TimestampedModel):
    """A user's text review of a single media item (one per user per item)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews"
    )
    media_item = models.ForeignKey(
        "media.MediaItem", on_delete=models.CASCADE, related_name="reviews"
    )
    title = models.CharField(max_length=200, null=True, blank=True)
    content = models.TextField(null=True, blank=True)
    is_spoiler = models.BooleanField(default=False)
    is_private = models.BooleanField(default=False)
    cooldown_until = models.DateTimeField(null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "reviews"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "media_item"], name="uq_reviews_user_media_item"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.media_item_id}"


class ReviewVote(TimestampedModel):
    """An up/down vote a user casts on a review (one vote per voter per review)."""

    voter = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="given_votes"
    )
    review = models.ForeignKey(Review, on_delete=models.CASCADE, related_name="votes")
    vote_type = models.CharField(max_length=10)

    class Meta(TimestampedModel.Meta):
        db_table = "review_votes"
        constraints = [
            models.UniqueConstraint(
                fields=["voter", "review"], name="uq_review_votes_voter_review"
            ),
            models.CheckConstraint(
                condition=models.Q(vote_type__in=VOTE_TYPE_VALUES),
                name="ck_review_vote_type",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.voter_id}:{self.review_id}={self.vote_type}"
