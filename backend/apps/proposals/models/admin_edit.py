"""Community/admin catalog editing (legacy ``admin_edit.py``).

Three models work together: a :class:`MediaEditProposal` proposes a field
change (or image override) on a catalog item, :class:`MediaImageOverride` is
the active override row once approved, and :class:`ProposalVote` records
community up/down votes on an edit proposal.
"""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel

EDIT_STATUS_VALUES = ["pending", "approved", "rejected"]
IMAGE_OVERRIDE_TYPE_VALUES = ["poster", "backdrop", "logo", "textless_poster"]
VOTE_TYPE_VALUES = ["up", "down"]


class MediaEditProposal(TimestampedModel):
    """Proposed field changes (or image overrides) for a catalog item."""

    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.CASCADE,
        related_name="edit_proposals",
    )
    proposer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="edit_proposals_created",
    )
    approver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edit_proposals_reviewed",
    )
    status = models.CharField(max_length=20, default="pending")
    changes = models.JSONField(default=dict)
    image_overrides = models.JSONField(null=True, blank=True)
    rejection_reason = models.TextField(null=True, blank=True)
    original_values = models.JSONField(null=True, blank=True)
    upvote_count = models.IntegerField(default=0)
    downvote_count = models.IntegerField(default=0)

    class Meta(TimestampedModel.Meta):
        db_table = "media_edit_proposals"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=EDIT_STATUS_VALUES),
                name="ck_edit_proposal_status",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.media_item_id}:{self.status}"


class MediaImageOverride(TimestampedModel):
    """An active image override on a catalog item."""

    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.CASCADE,
        related_name="image_overrides",
    )
    image_type = models.CharField(max_length=20)
    language_code = models.CharField(max_length=10)
    url = models.CharField(max_length=2000)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="media_image_overrides",
    )

    class Meta(TimestampedModel.Meta):
        db_table = "media_image_overrides"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(image_type__in=IMAGE_OVERRIDE_TYPE_VALUES),
                name="ck_image_override_type",
            ),
        ]
        indexes = [
            # Legacy composite index, shortened to fit Django's 30-char cap.
            models.Index(
                fields=["media_item", "image_type", "language_code"],
                name="ix_media_image_type_lang",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.media_item_id}:{self.image_type}:{self.language_code}"


class ProposalVote(TimestampedModel):
    """A user's up/down vote on a :class:`MediaEditProposal`.

    Legacy composite-PK join row; ported with a surrogate ``id`` plus a
    uniqueness constraint over the same key columns.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="media_edit_proposal_votes",
    )
    proposal = models.ForeignKey(
        MediaEditProposal,
        on_delete=models.CASCADE,
        related_name="votes",
    )
    vote_type = models.CharField(max_length=20)

    class Meta(TimestampedModel.Meta):
        db_table = "proposal_votes"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "proposal"],
                name="uq_proposal_vote_user_proposal",
            ),
            models.CheckConstraint(
                condition=models.Q(vote_type__in=VOTE_TYPE_VALUES),
                name="ck_proposal_vote_type",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.proposal_id}:{self.vote_type}"
